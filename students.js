import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getAccess } from './authz.js';
import { debounce, populateYearSelect, renderFilterChips, updatePager, downloadCsv, bindColumnMenu } from './list-tools.js';

const config = window.QURANER_ALO_CONFIG;
const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});

const $ = (id) => document.getElementById(id);
let currentStudents = [];
let canManage = false;
let canManagePortal = false;
let teacherMap = new Map();
let page = 1;
let pageSize = 10;
let totalRows = 0;
let syncColumns = () => {};
const courseStudentCache = new Map();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));
}

function redirectToLogin() { window.location.replace('./'); }

function setMessage(text, type = '') {
  $('message').textContent = text;
  $('message').style.color = type === 'error' ? '#b33b3b' : '';
}

function setFormMessage(text, type = '') {
  $('formMessage').textContent = text;
  $('formMessage').className = `message-inline ${type}`.trim();
}

function activationBadge(userId) {
  return userId
    ? '<span class="active-badge on">Activated</span>'
    : '<span class="active-badge off">Not activated</span>';
}

function portalAction(student) {
  if (!canManagePortal) return '—';
  if (student.user_id) {
    return `<div class="action-stack"><button class="save-btn secondary portal-disable" data-id="${escapeHtml(student.student_id)}" type="button">Disable</button><button class="save-btn portal-reset" data-id="${escapeHtml(student.student_id)}" type="button">Reset access</button></div>`;
  }
  return '<span class="muted">Activates with ID + phone</span>';
}

function genderLabel(value) {
  if (value === 'male') return 'পুরুষ';
  if (value === 'female') return 'নারী';
  return 'নির্ধারিত নয়';
}

function yearLabel(date) {
  return date ? String(date).slice(0, 4) : '—';
}

function selectedText(id) {
  return $(id)?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function filterItems() {
  const q = $('search').value.trim();
  return [
    { key:'search', label:'Search', value:q, text:q },
    { key:'year', label:'ভর্তি', value:$('yearFilter').value, text:selectedText('yearFilter') },
    { key:'gender', label:'লিঙ্গ', value:$('genderFilter').value, text:selectedText('genderFilter') },
    { key:'status', label:'Status', value:$('statusFilter').value, text:selectedText('statusFilter') },
    { key:'course', label:'Class', value:$('courseFilter').value, text:selectedText('courseFilter') },
    { key:'portal', label:'Portal', value:$('portalFilter').value, text:selectedText('portalFilter') },
    { key:'teacher', label:'Teacher', value:$('teacherFilter').value, text:selectedText('teacherFilter') },
    { key:'phone', label:'Phone', value:$('phoneFilter').value, text:selectedText('phoneFilter') }
  ];
}

function refreshFilterChips() {
  renderFilterChips($('activeFilters'), filterItems(), async (key) => {
    if (key === '*') {
      resetFilters(false);
    } else if (key === 'search') {
      $('search').value = '';
    } else {
      const map = {
        year:'yearFilter', gender:'genderFilter', status:'statusFilter', course:'courseFilter',
        portal:'portalFilter', teacher:'teacherFilter', phone:'phoneFilter'
      };
      if (map[key]) $(map[key]).value = '';
    }
    page = 1;
    await loadStudents();
  });
}

function resetFilters(load = true) {
  $('search').value = '';
  ['yearFilter','genderFilter','statusFilter','courseFilter','portalFilter','teacherFilter','phoneFilter']
    .forEach((id) => { $(id).value = ''; });
  page = 1;
  refreshFilterChips();
  if (load) void loadStudents();
}

async function loadFilterOptions() {
  populateYearSelect($('yearFilter'), 'সব বছর', 30);
  const [{ data: teachers, error: teacherError }, { data: enrollments, error: enrollmentError }] = await Promise.all([
    supabase.from('qa_teachers').select('teacher_id,teacher_code,full_name').eq('active', true).order('full_name'),
    supabase.from('qa_enrollments').select('course_code').eq('status', 'active').not('course_code', 'is', null).limit(1000)
  ]);
  if (teacherError) console.warn('Teacher filter options unavailable', teacherError);
  if (enrollmentError) console.warn('Course filter options unavailable', enrollmentError);

  teacherMap = new Map((teachers || []).map((teacher) => [teacher.teacher_id, `${teacher.teacher_code} · ${teacher.full_name}`]));
  $('teacherFilter').innerHTML = '<option value="">সব Teacher</option><option value="__unassigned">Unassigned</option>' +
    (teachers || []).map((teacher) => `<option value="${escapeHtml(teacher.teacher_id)}">${escapeHtml(teacher.teacher_code)} · ${escapeHtml(teacher.full_name)}</option>`).join('');

  const courses = [...new Set((enrollments || []).map((row) => row.course_code).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'en'));
  $('courseFilter').innerHTML = '<option value="">সব Class / Course</option>' +
    courses.map((course) => `<option value="${escapeHtml(course)}">${escapeHtml(course)}</option>`).join('');
}

async function courseStudentIds(course) {
  if (!course) return null;
  if (courseStudentCache.has(course)) return courseStudentCache.get(course);
  const ids = [];
  let from = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await supabase.from('qa_enrollments')
      .select('student_id').eq('status','active').eq('course_code', course)
      .range(from, from + size - 1);
    if (error) throw error;
    ids.push(...(data || []).map((row) => row.student_id).filter(Boolean));
    if (!data || data.length < size) break;
    from += size;
  }
  const unique = [...new Set(ids)];
  courseStudentCache.set(course, unique);
  return unique;
}

function applyStudentFilters(query, allowedStudentIds) {
  const search = $('search').value.trim().replace(/[,()]/g, ' ');
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(`student_code.ilike.${pattern},full_name.ilike.${pattern},full_name_bn.ilike.${pattern},phone.ilike.${pattern}`);
  }

  const year = $('yearFilter').value;
  if (year) query = query.gte('admission_date', `${year}-01-01`).lt('admission_date', `${Number(year) + 1}-01-01`);

  const gender = $('genderFilter').value;
  if (gender) query = query.eq('gender', gender);

  const status = $('statusFilter').value;
  if (status) query = query.eq('status', status);

  const portal = $('portalFilter').value;
  if (portal === 'activated') query = query.not('user_id', 'is', null);
  if (portal === 'not_activated') query = query.is('user_id', null);

  const teacher = $('teacherFilter').value;
  if (teacher === '__unassigned') query = query.is('teacher_id', null);
  else if (teacher) query = query.eq('teacher_id', teacher);

  const phone = $('phoneFilter').value;
  if (phone === 'yes') query = query.not('phone', 'is', null).neq('phone', '');
  if (phone === 'no') query = query.or('phone.is.null,phone.eq.""');

  if (allowedStudentIds) query = query.in('student_id', allowedStudentIds);
  return query;
}

async function fetchStudentRows(from, to, includeCount = false) {
  const course = $('courseFilter').value;
  const allowed = await courseStudentIds(course);
  if (course && (!allowed || !allowed.length)) return { data:[], count:0, error:null };

  const fields = 'student_id,student_code,full_name,full_name_bn,gender,phone,admission_date,status,user_id,teacher_id';
  let query = supabase.from('qa_students').select(fields, includeCount ? { count:'exact' } : {});
  query = applyStudentFilters(query, allowed);
  query = query.order('created_at', { ascending:false }).range(from, to);
  return query;
}

async function courseMapForStudents(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { data, error } = await supabase.from('qa_enrollments')
    .select('student_id,course_code').eq('status','active').in('student_id', ids);
  if (error) {
    console.warn('Course labels unavailable', error);
    return map;
  }
  (data || []).forEach((row) => {
    if (!row.course_code) return;
    if (!map.has(row.student_id)) map.set(row.student_id, []);
    map.get(row.student_id).push(row.course_code);
  });
  map.forEach((values, key) => map.set(key, [...new Set(values)].sort()));
  return map;
}

function renderStudents(list, courseMap = new Map()) {
  $('countLabel').textContent = `${totalRows} জন শিক্ষার্থী`;
  $('studentRows').innerHTML = list.map((s) => {
    const courses = (courseMap.get(s.student_id) || []).join(', ') || '—';
    const teacher = s.teacher_id ? (teacherMap.get(s.teacher_id) || 'Assigned') : 'Unassigned';
    return `
    <tr>
      <td class="student-code"><a class="student-id-link" href="student-profile.html?id=${encodeURIComponent(s.student_id)}">${escapeHtml(s.student_code)}</a></td>
      <td>${escapeHtml(s.full_name)}${s.full_name_bn ? `<div class="muted">${escapeHtml(s.full_name_bn)}</div>` : ''}</td>
      <td data-col="gender">${escapeHtml(genderLabel(s.gender))}</td>
      <td data-col="course">${escapeHtml(courses)}</td>
      <td data-col="admission">${escapeHtml(yearLabel(s.admission_date))}</td>
      <td data-col="teacher">${escapeHtml(teacher)}</td>
      <td data-col="phone">${escapeHtml(s.phone || '—')}</td>
      <td data-col="status"><span class="active-badge ${s.status === 'active' ? 'on' : 'off'}">${escapeHtml(s.status || '—')}</span></td>
      <td data-col="portal">${activationBadge(s.user_id)}</td>
      <td data-col="access">${portalAction(s)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10">এই filter অনুযায়ী কোনো শিক্ষার্থী পাওয়া যায়নি।</td></tr>';
  bindPortalActions();
  syncColumns();
}

async function loadStudents() {
  const from = (page - 1) * pageSize;
  const { data, error, count } = await fetchStudentRows(from, from + pageSize - 1, true);
  if (error) throw error;

  totalRows = Number(count || 0);
  const pager = updatePager({
    summaryEl:$('paginationSummary'), pageLabelEl:$('pageLabel'), prevEl:$('prevPage'), nextEl:$('nextPage'),
    page, pageSize, total:totalRows
  });
  if (pager.page !== page) {
    page = pager.page;
    return loadStudents();
  }

  currentStudents = data || [];
  const courseMap = await courseMapForStudents(currentStudents.map((row) => row.student_id));
  renderStudents(currentStudents, courseMap);
  refreshFilterChips();
}

async function exportStudents() {
  const button = $('exportList');
  button.disabled = true;
  button.textContent = 'Exporting…';
  try {
    const exported = [];
    let from = 0;
    const size = 1000;
    while (true) {
      const { data, error } = await fetchStudentRows(from, from + size - 1, false);
      if (error) throw error;
      const batch = data || [];
      const courseMap = await courseMapForStudents(batch.map((row) => row.student_id));
      batch.forEach((row) => {
        exported.push({
          ...row,
          courses:(courseMap.get(row.student_id) || []).join(', '),
          teacher_name:row.teacher_id ? (teacherMap.get(row.teacher_id) || 'Assigned') : 'Unassigned'
        });
      });
      if (batch.length < size) break;
      from += size;
    }

    downloadCsv(`QuranerAlo_Students_${new Date().toISOString().slice(0,10)}.csv`, [
      { label:'Student ID', key:'student_code' },
      { label:'English Name', key:'full_name' },
      { label:'বাংলা নাম', key:'full_name_bn' },
      { label:'Gender', value:(row) => genderLabel(row.gender) },
      { label:'Class / Course', key:'courses' },
      { label:'Admission Year', value:(row) => yearLabel(row.admission_date) },
      { label:'Assigned Teacher', key:'teacher_name' },
      { label:'Phone', key:'phone' },
      { label:'Status', key:'status' },
      { label:'Portal', value:(row) => row.user_id ? 'Activated' : 'Not Activated' }
    ], exported);
    setMessage(`${exported.length} জন শিক্ষার্থীর filtered list export হয়েছে।`);
  } catch (error) {
    console.error(error);
    setMessage('Student export করা যায়নি।', 'error');
  } finally {
    button.disabled = false;
    button.textContent = '⇩ Export';
  }
}

function getGuardianFromForm(prefix) {
  return {
    full_name: $(prefix + 'Name').value.trim(),
    relation: $(prefix + 'Relation').value.trim(),
    phone: $(prefix + 'Phone').value.trim(),
    email: $(prefix + 'Email').value.trim(),
    address: $(prefix + 'Address').value.trim()
  };
}

function syncPrimaryGuardianName() {
  const relation = $('guardian1Relation').value;
  if (relation === 'Father') $('guardian1Name').value = $('fatherName').value.trim();
  if (relation === 'Mother') $('guardian1Name').value = $('motherName').value.trim();
}

function resetGuardianForm() {
  $('guardian1Name').value = '';
  $('guardian1Relation').value = '';
  $('guardian1Phone').value = '';
  $('guardian1Email').value = '';
  $('guardian1Address').value = '';
  $('guardian2Enabled').checked = false;
  $('guardian2Fields').classList.add('hidden');
  $('guardian2Name').value = '';
  $('guardian2Relation').value = '';
  $('guardian2Phone').value = '';
  $('guardian2Email').value = '';
  $('guardian2Address').value = '';
}

function friendlyRpcError(error) {
  const code = String(error?.message || '');
  if (code.includes('STUDENTS_MANAGE_REQUIRED')) return 'Student create permission নেই।';
  if (code.includes('STUDENT_NAME_REQUIRED')) return 'Student-এর নাম দিন।';
  if (code.includes('AT_LEAST_ONE_GUARDIAN_REQUIRED')) return 'কমপক্ষে একজন guardian-এর তথ্য দিন।';
  if (code.includes('GUARDIAN_NAME_REQUIRED')) return 'Guardian-এর নাম দিন।';
  if (code.includes('GUARDIAN_RELATION_REQUIRED')) return 'Guardian-এর সম্পর্ক নির্বাচন করুন।';
  return 'Student ও guardian তথ্য save করা যায়নি। আবার চেষ্টা করুন।';
}

async function portalAdminAction(action, entityId) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) { redirectToLogin(); return; }
  const response = await fetch(`${config.supabaseUrl}/functions/v1/portal-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': config.supabasePublishableKey
    },
    body: JSON.stringify({ action, entityType: 'student', entityId })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'PORTAL_ADMIN_FAILED');
  return body;
}

function bindPortalActions() {
  document.querySelectorAll('.portal-disable').forEach((button) => button.addEventListener('click', async () => {
    const student = currentStudents.find((x) => x.student_id === button.dataset.id);
    if (!student || !confirm(`${student.student_code} portal access disable করবেন?`)) return;
    button.disabled = true;
    try {
      await portalAdminAction('disable', student.student_id);
      setMessage(`${student.student_code} portal access disabled.`);
      await loadStudents();
    } catch (error) {
      console.error(error);
      setMessage('Portal access disable করা যায়নি।', 'error');
      button.disabled = false;
    }
  }));

  document.querySelectorAll('.portal-reset').forEach((button) => button.addEventListener('click', async () => {
    const student = currentStudents.find((x) => x.student_id === button.dataset.id);
    if (!student || !confirm(`${student.student_code} portal account reset করবেন? এতে পুরনো login account বাতিল হবে এবং student আবার phone দিয়ে activate করতে পারবে।`)) return;
    button.disabled = true;
    try {
      await portalAdminAction('reset', student.student_id);
      setMessage(`${student.student_code} portal access reset হয়েছে।`);
      await loadStudents();
    } catch (error) {
      console.error(error);
      setMessage('Portal access reset করা যায়নি।', 'error');
      button.disabled = false;
    }
  }));
}

$('newStudent').addEventListener('click', () => {
  if (canManage) {
    $('studentFormPanel').classList.toggle('hidden');
    setFormMessage('');
  }
});

$('cancelStudent').addEventListener('click', () => {
  $('studentForm').reset();
  resetGuardianForm();
  $('studentFormPanel').classList.add('hidden');
  setFormMessage('');
});

$('guardian1Relation').addEventListener('change', syncPrimaryGuardianName);
$('fatherName').addEventListener('input', syncPrimaryGuardianName);
$('motherName').addEventListener('input', syncPrimaryGuardianName);
$('guardian2Enabled').addEventListener('change', () => {
  $('guardian2Fields').classList.toggle('hidden', !$('guardian2Enabled').checked);
});

const debouncedSearch = debounce(() => {
  page = 1;
  loadStudents().catch((error) => {
    console.error(error);
    setMessage('Student list filter করা যায়নি।', 'error');
  });
}, 350);
$('search').addEventListener('input', debouncedSearch);

['yearFilter','genderFilter','statusFilter','courseFilter','portalFilter','teacherFilter','phoneFilter'].forEach((id) => {
  $(id).addEventListener('change', () => {
    page = 1;
    loadStudents().catch((error) => {
      console.error(error);
      setMessage('Student list filter করা যায়নি।', 'error');
    });
  });
});

$('resetFilters').addEventListener('click', () => resetFilters(true));
$('toggleFilters').addEventListener('click', () => {
  const open = $('advancedFilters').classList.toggle('is-open');
  $('toggleFilters').setAttribute('aria-expanded', String(open));
});
$('pageSize').addEventListener('change', () => {
  pageSize = Number($('pageSize').value || 10);
  page = 1;
  void loadStudents();
});
$('prevPage').addEventListener('click', () => { if (page > 1) { page -= 1; void loadStudents(); } });
$('nextPage').addEventListener('click', () => { page += 1; void loadStudents(); });
$('exportList').addEventListener('click', exportStudents);

$('studentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!canManage) {
    setFormMessage('Student create permission নেই।', 'error');
    return;
  }

  setFormMessage('Student ও guardian তথ্য save হচ্ছে…');
  const form = new FormData(event.currentTarget);
  const guardians = [getGuardianFromForm('guardian1')];

  if ($('guardian2Enabled').checked) {
    const guardian2 = getGuardianFromForm('guardian2');
    if (!guardian2.full_name || !guardian2.relation) {
      setFormMessage('দ্বিতীয় guardian যোগ করলে নাম ও সম্পর্ক দিতে হবে।', 'error');
      return;
    }
    guardians.push(guardian2);
  }

  try {
    const { data, error } = await supabase.rpc('qa_create_student_with_guardian', {
      p_student: {
        full_name: String(form.get('full_name') || '').trim(),
        gender: String(form.get('gender') || 'unspecified'),
        date_of_birth: form.get('date_of_birth') || '',
        phone: String(form.get('phone') || '').trim(),
        admission_date: form.get('admission_date') || new Date().toISOString().slice(0, 10),
        status: String(form.get('status') || 'active'),
        notes: String(form.get('notes') || '').trim(),
        father_name: String(form.get('father_name') || '').trim(),
        father_nid: String(form.get('father_nid') || '').trim(),
        mother_name: String(form.get('mother_name') || '').trim(),
        mother_nid: String(form.get('mother_nid') || '').trim(),
        birth_registration_no: String(form.get('birth_registration_no') || '').trim()
      },
      p_guardians: guardians
    });

    if (error) throw error;
    event.currentTarget.reset();
    resetGuardianForm();
    $('studentFormPanel').classList.add('hidden');
    const guardianCount = Number(data?.guardians_created || guardians.length);
    setMessage(`শিক্ষার্থী ${data?.student_code || ''} সফলভাবে যুক্ত হয়েছে। ${guardianCount} জন guardian তথ্যও সংরক্ষণ করা হয়েছে।`);
    setFormMessage('');
    page = 1;
    await loadStudents();
  } catch (error) {
    console.error(error);
    setFormMessage(friendlyRpcError(error), 'error');
  }
});

$('signOut').addEventListener('click', async () => {
  await supabase.auth.signOut();
  redirectToLogin();
});

async function init() {
  const access = await getAccess(supabase);
  if (!access) {
    await supabase.auth.signOut();
    return redirectToLogin();
  }

  if (!access.can('students.view') && !access.can('students.manage')) {
    $('loading').textContent = 'এই module দেখার permission আপনার account-এ নেই।';
    return;
  }

  canManage = access.can('students.manage');
  canManagePortal = access.profile.role === 'owner';
  $('loading').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('newStudent').classList.toggle('hidden', !canManage);

  syncColumns = bindColumnMenu({
    button:$('columnsButton'), menu:$('columnMenu'), table:$('studentTable')
  }) || (() => {});

  try {
    await loadFilterOptions();
    await loadStudents();
  } catch (error) {
    console.error(error);
    setMessage('Student list load করা যায়নি।', 'error');
  }
}

init().catch((error) => {
  console.error(error);
  $('loading').textContent = 'Page load করা যায়নি।';
});
