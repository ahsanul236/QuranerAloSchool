import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { mountDocumentsPanel, setProfileImage } from './documents-ui.js';

const c = window.QURANER_ALO_CONFIG;
const supabase = createClient(c.supabaseUrl, c.supabasePublishableKey, {
  auth: { autoRefreshToken: true, persistSession: true }
});
const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(window.location.search);

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[ch]));

function money(value) {
  return `৳${Number(value || 0).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDate(value) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB') : '—';
}

function statusClass(value) {
  const v = String(value || '').toLowerCase();
  if (['active', 'paid', 'completed'].includes(v)) return 'on';
  if (['inactive', 'cancelled', 'draft', 'unpaid'].includes(v)) return 'off';
  return '';
}

async function setSchoolWhatsApp() {
  const btn = $('whatsappBtn');
  if (!btn) return;
  const { data, error } = await supabase.from('qa_app_settings')
    .select('value').eq('key', 'school_profile').maybeSingle();
  if (error) throw error;
  const phone = data?.value?.phone || '';
  const digits = String(phone).replace(/[^0-9]/g, '').replace(/^00/, '');
  if (!digits) return;
  btn.href = 'https://wa.me/' + digits;
  btn.classList.remove('hidden');
}

async function getViewerProfile(session) {
  const { data, error } = await supabase.from('qa_users')
    .select('role,active').eq('user_id', session.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

async function resolveTeacher(session) {
  const previewId = qs.get('preview_teacher');
  const viewer = await getViewerProfile(session);

  if (previewId) {
    if (!viewer || !viewer.active || viewer.role !== 'owner') throw new Error('PREVIEW_NOT_ALLOWED');

    const { data, error } = await supabase.functions.invoke('portal-preview', {
      body: { entityType: 'teacher', entityId: previewId }
    });
    if (error) throw error;
    if (!data?.ok || data.entityType !== 'teacher' || !data.entity) {
      throw new Error(data?.error || 'PREVIEW_NOT_FOUND');
    }
    const teacher = data.entity;
    $('previewBanner').classList.remove('hidden');
    $('previewText').textContent =
      `Read-only preview · ${teacher.teacher_code} · ${teacher.full_name}`;
    $('signOut').textContent = 'Exit Preview';
    return teacher;
  }

  const { data, error } = await supabase.from('qa_teachers')
    .select('teacher_id,teacher_code,full_name,full_name_bn,phone,email,specialization,joining_date,active,user_id,father_name,mother_name,nid_number,address')
    .eq('user_id', session.user.id).maybeSingle();

  if (error || !data) throw error || new Error('TEACHER_PROFILE_NOT_FOUND');
  return data;
}

async function loadTeacherDetails(teacherId) {
  const { data, error } = await supabase.from('qa_teachers')
    .select('teacher_id,teacher_code,full_name,full_name_bn,phone,email,specialization,joining_date,active,user_id,father_name,mother_name,nid_number,address')
    .eq('teacher_id', teacherId).maybeSingle();
  if (error || !data) throw error || new Error('TEACHER_PROFILE_NOT_FOUND');
  return data;
}


async function loadAssignedStudents(previewTeacherId = ''){
  const {data,error}=await supabase.functions.invoke('portal-teacher-student',{
    body:{action:'teacher', ...(previewTeacherId ? {previewTeacherId} : {})}
  });
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.error||'ASSIGNED_STUDENTS_LOAD_FAILED');
  const students=data.students||[];
  $('assignedStudentRows').innerHTML=students.map((student)=> {
    const digits=String(student.phone||'').replace(/[^0-9]/g,'').replace(/^00/,'');
    const waDigits=digits ? (digits.startsWith('0')?'88'+digits:digits) : '';
    const wa=waDigits
      ? '<a class="whatsapp-btn" href="https://wa.me/'+waDigits+'" target="_blank" rel="noopener noreferrer">WhatsApp</a>'
      : '<span class="muted">ফোন নেই</span>';
    return '<tr><td><div class="assigned-person-inline"><img id="teacherAssignedStudentPhoto-'+esc(student.student_id)+'" class="portal-relationship-avatar small hidden" alt="Student profile"><div><strong>'+esc(student.full_name||student.student_code||'Student')+'</strong><br><span class="muted">'+esc(student.student_code||'—')+'</span></div></div></td><td>'+esc(student.phone||'—')+'</td><td><span class="active-badge '+statusClass(student.status)+'">'+esc(student.status||'—')+'</span></td><td>'+wa+'</td></tr>';
  }).join('') || '<tr><td colspan="4">এখনো কোনো Student assigned নেই।</td></tr>';
  await Promise.all(students.map((student) => setProfileImage({
    role:'student',
    personId:student.student_id,
    img:$('teacherAssignedStudentPhoto-'+student.student_id)
  })));
  return students;
}

async function loadPayroll(previewTeacherId = '') {
  const { data, error } = await supabase.functions.invoke('portal-self-payroll', {
    body: previewTeacherId ? { action: 'list', previewTeacherId } : { action: 'list' }
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'PAYROLL_LOAD_FAILED');
  return data;
}

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.replace('./');
    return;
  }

  const baseTeacher = await resolveTeacher(session);
  const teacher = await loadTeacherDetails(baseTeacher.teacher_id);

  if (!teacher.active) {
    await supabase.auth.signOut();
    location.replace('./');
    return;
  }

  const previewTeacherId = qs.get('preview_teacher') || '';
  await setProfileImage({role:'teacher',personId:teacher.teacher_id,img:$('teacherPortalProfileImage')});
  await mountDocumentsPanel({
    container:$('teacherPortalDocuments'),
    role:'teacher',
    personId:teacher.teacher_id,
    editable:!previewTeacherId,
    canDelete:false,
    title:'My Documents'
  });

  $('exitPreview')?.addEventListener('click', () => { location.href = 'dashboard.html'; });
  $('signOut').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.replace('./');
  });

  $('teacherCodeBadge').textContent = teacher.teacher_code || '—';
  $('teacherName').textContent = teacher.full_name_bn || teacher.full_name || '—';
  $('teacherSubtitle').textContent = `Teacher ID: ${teacher.teacher_code || '—'} · ${teacher.active ? 'Active' : 'Inactive'}`;
  $('teacherCodeHero').textContent = teacher.teacher_code || '—';
  $('teacherPhoneHero').textContent = teacher.phone || 'ফোন নম্বর দেওয়া নেই';
  $('statusHero').textContent = teacher.active ? 'Active' : 'Inactive';
  $('statusHero').className = `active-badge ${statusClass(teacher.active ? 'active' : 'inactive')}`;

  $('teacherCode').textContent = teacher.teacher_code || '—';
  $('teacherPhone').textContent = teacher.phone || '—';
  $('teacherEmail').textContent = teacher.email || '—';
  $('joiningDate').textContent = formatDate(teacher.joining_date);
  $('fatherName').textContent = teacher.father_name || '—';
  $('motherName').textContent = teacher.mother_name || '—';
  $('nidNumber').textContent = teacher.nid_number || '—';
  $('address').textContent = teacher.address || '—';
  $('specialization').textContent = teacher.specialization || '—';

  const [{ data: enrollmentData, error: enrollmentError }, payroll, assignedStudents] = await Promise.all([
    supabase.from('qa_enrollments')
      .select('student_id,course_code,start_date,end_date,status')
      .eq('teacher_user_id', teacher.user_id)
      .order('start_date', { ascending: false })
      .limit(100),
    loadPayroll(previewTeacherId),
    loadAssignedStudents(previewTeacherId)
  ]);

  if (enrollmentError) throw enrollmentError;

  const enrollments = enrollmentData || [];
  $('studentCount').textContent = String(assignedStudents.length);
  const studentIds = [...new Set(enrollments.map((item) => item.student_id).filter(Boolean))];
  let studentNames = {};
  if (studentIds.length) {
    const { data: students, error } = await supabase.from('qa_students')
      .select('student_id,student_code,full_name').in('student_id', studentIds);
    if (error) throw error;
    studentNames = Object.fromEntries((students || []).map((student) => [
      student.student_id, `${student.student_code} · ${student.full_name}`
    ]));
  }

  $('studentRows').innerHTML = enrollments.map((item) => `
    <tr>
      <td>${esc(studentNames[item.student_id] || item.student_id)}</td>
      <td>${esc(item.course_code)}</td>
      <td>${esc(formatDate(item.start_date))}</td>
      <td><span class="active-badge ${statusClass(item.status)}">${esc(item.status)}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="4">No assigned students.</td></tr>';

  const payrollRows = payroll.payrolls || [];
  $('latestPaidAmount').textContent = money(payroll.summary?.latestPaidAmount || 0);
  $('latestPaidMonth').textContent = payroll.summary?.latestPaidMonth
    ? `Latest paid month: ${formatDate(payroll.summary.latestPaidMonth)}`
    : 'কোনো paid record নেই';
  $('totalPaid').textContent = money(payroll.summary?.totalPaid || 0);
  $('paidCount').textContent = `${Number(payroll.summary?.paidCount || 0)} টি paid record`;

  $('payrollRows').innerHTML = payrollRows.map((item) => `
    <tr>
      <td>${esc(formatDate(item.payroll_month))}</td>
      <td><span class="active-badge ${statusClass(item.status)}">${esc(item.status || '—')}</span></td>
      <td><strong>${esc(money(item.net_payable))}</strong></td>
      <td>${esc(item.paid_at ? new Date(item.paid_at).toLocaleDateString('en-GB') : '—')}</td>
      <td>${esc(item.payment_method || '—')}</td>
      <td>${item.status === 'paid' ? `<a class="portal-action-link" href="receipt.html?type=payroll&id=${encodeURIComponent(item.payroll_id)}&portal=1${previewTeacherId ? '&preview_teacher=' + encodeURIComponent(previewTeacherId) : ''}" target="_blank" rel="noopener noreferrer">রিসিট দেখুন</a>` : '<span class="muted">পেমেন্ট হয়নি</span>'}</td>
    </tr>
  `).join('') || '<tr><td colspan="6">No payroll record.</td></tr>';

  try { await setSchoolWhatsApp(); } catch (error) { console.warn('school WhatsApp link unavailable', error); }

  $('loading').classList.add('hidden');
  $('app').classList.remove('hidden');
}

init().catch((error) => {
  console.error('teacher portal error', error);
  if (error.message === 'PREVIEW_NOT_ALLOWED') {
    location.replace('./');
    return;
  }
  $('loading').classList.add('hidden');
  $('errorBox').textContent = error.message || 'Portal load করা যায়নি।';
  $('errorBox').classList.remove('hidden');
});
