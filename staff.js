import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getAccess } from './authz.js';
import { debounce, populateYearSelect, renderFilterChips, updatePager, downloadCsv, downloadXlsx, downloadPdf, printRows, bindColumnMenu, bindExportMenu } from './list-tools.js?v=20260926-2';

const config = window.QURANER_ALO_CONFIG;
const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});
const $ = (id) => document.getElementById(id);

let mode = location.hash === '#helpers' ? 'helper' : 'teacher';
let rows = [];
let access = null;
let canManage = false;
let canManagePortal = false;
let page = 1;
let pageSize = 10;
let totalRows = 0;
let syncColumns = () => {};

function msg(text, type='') {
  $('message').textContent = text;
  $('message').className = `message-inline ${type}`.trim();
}

function formMsg(text, type='') {
  $('formMessage').textContent = text;
  $('formMessage').className = `message-inline ${type}`.trim();
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[c]));
}

function activationBadge(userId) {
  return userId
    ? '<span class="active-badge on">Activated</span>'
    : '<span class="active-badge off">Not activated</span>';
}

function portalAction(r) {
  if (!canManagePortal) return '—';
  if (!r.user_id) return '<span class="muted">Activates with ID + phone</span>';
  const id = mode === 'teacher' ? r.teacher_id : r.staff_id;
  return `<div class="action-stack"><button class="save-btn secondary portal-disable" data-id="${esc(id)}" type="button">Disable</button><button class="save-btn portal-reset" data-id="${esc(id)}" type="button">Reset access</button></div>`;
}

function genderLabel(value) {
  if (value === 'male') return 'পুরুষ';
  if (value === 'female') return 'নারী';
  return 'নির্ধারিত নয়';
}

function yearLabel(date) {
  return date ? String(date).slice(0,4) : '—';
}

function selectedText(id) {
  return $(id)?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function setFormEnabled(enabled) {
  $('staffForm').querySelectorAll('input,select,textarea,button[type="submit"]').forEach(el => { el.disabled = !enabled; });
}

function resetForm() {
  $('staffForm').reset();
}

function updatePageContext() {
  const teacher = mode === 'teacher';
  $('brandSubtitle').textContent = teacher ? 'শিক্ষক ব্যবস্থাপনা' : 'হেল্পার ব্যবস্থাপনা';
  $('pageEyebrow').textContent = teacher ? 'শিক্ষক' : 'হেল্পার';
  $('pageTitle').textContent = teacher ? 'শিক্ষক ব্যবস্থাপনা' : 'হেল্পার ব্যবস্থাপনা';
  $('pageSubtitle').textContent = teacher
    ? 'Teacher profile, portal access এবং নতুন teacher যোগ করার ব্যবস্থাপনা।'
    : 'Helper profile, portal access এবং নতুন helper যোগ করার ব্যবস্থাপনা।';
  $('newRecord').textContent = teacher ? '+ নতুন Teacher' : '+ নতুন Helper';
  $('formTitle').textContent = teacher ? 'নতুন Teacher তথ্য' : 'নতুন Helper তথ্য';
  $('saveRecord').textContent = teacher ? 'Save Teacher' : 'Save Helper';
  $('listTitle').textContent = teacher ? 'Teacher List' : 'Helper List';
  $('searchLabel').textContent = teacher ? 'Teacher খুঁজুন' : 'Helper খুঁজুন';
  $('search').placeholder = teacher ? 'নাম / ID / ফোন / Email / Specialization…' : 'নাম / ID / ফোন / Email দিয়ে খুঁজুন…';
  $('detailHead').textContent = 'Specialization';
  $('specializationWrap').classList.toggle('hidden', !teacher);
  $('fullNameBn').closest('label').classList.toggle('hidden', !teacher);
  $('specializationFilterWrap').classList.toggle('hidden', !teacher);
  $('detailColumnOption').classList.toggle('hidden', !teacher);
  $('staffTable').classList.toggle('hide-detail-column', !teacher);
  $('recordFormPanel').classList.add('hidden');
  formMsg('');
  syncColumns();
}

function filterItems() {
  const q = $('search').value.trim();
  const items = [
    { key:'search', label:'Search', value:q, text:q },
    { key:'year', label:'Joining', value:$('yearFilter').value, text:selectedText('yearFilter') },
    { key:'gender', label:'লিঙ্গ', value:$('genderFilter').value, text:selectedText('genderFilter') },
    { key:'status', label:'Status', value:$('statusFilter').value, text:selectedText('statusFilter') },
    { key:'portal', label:'Portal', value:$('portalFilter').value, text:selectedText('portalFilter') },
    { key:'phone', label:'Phone', value:$('phoneFilter').value, text:selectedText('phoneFilter') }
  ];
  if (mode === 'teacher') {
    items.splice(4, 0, { key:'specialization', label:'Specialization', value:$('specializationFilter').value, text:selectedText('specializationFilter') });
  }
  return items;
}

function refreshFilterChips() {
  renderFilterChips($('activeFilters'), filterItems(), async (key) => {
    if (key === '*') {
      resetListFilters(false);
    } else if (key === 'search') {
      $('search').value = '';
    } else {
      const map = {
        year:'yearFilter', gender:'genderFilter', status:'statusFilter',
        specialization:'specializationFilter', portal:'portalFilter', phone:'phoneFilter'
      };
      if (map[key]) $(map[key]).value = '';
    }
    page = 1;
    await load();
  });
}

function resetListFilters(loadNow = true) {
  $('search').value = '';
  ['yearFilter','genderFilter','statusFilter','specializationFilter','portalFilter','phoneFilter']
    .forEach((id) => { $(id).value = ''; });
  page = 1;
  refreshFilterChips();
  if (loadNow) void load();
}

async function loadFilterOptions() {
  populateYearSelect($('yearFilter'), 'সব বছর', 30);
  if (mode !== 'teacher') {
    $('specializationFilter').innerHTML = '<option value="">সব Specialization</option>';
    return;
  }
  const { data, error } = await supabase.from('qa_teachers')
    .select('specialization').not('specialization','is',null).limit(1000);
  if (error) throw error;
  const values = [...new Set((data || []).map((row) => String(row.specialization || '').trim()).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, 'en'));
  $('specializationFilter').innerHTML = '<option value="">সব Specialization</option>' +
    values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
}

function applyStaffFilters(query) {
  const search = $('search').value.trim().replace(/[,()]/g, ' ');
  if (search) {
    const pattern = `%${search}%`;
    if (mode === 'teacher') {
      query = query.or(`teacher_code.ilike.${pattern},full_name.ilike.${pattern},full_name_bn.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},specialization.ilike.${pattern}`);
    } else {
      query = query.or(`staff_code.ilike.${pattern},full_name.ilike.${pattern},full_name_bn.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`);
    }
  }

  const year = $('yearFilter').value;
  if (year) query = query.gte('joining_date', `${year}-01-01`).lt('joining_date', `${Number(year) + 1}-01-01`);

  const gender = $('genderFilter').value;
  if (gender) query = query.eq('gender', gender);

  const status = $('statusFilter').value;
  if (status === 'active') query = query.eq('active', true);
  if (status === 'inactive') query = query.eq('active', false);

  if (mode === 'teacher') {
    const specialization = $('specializationFilter').value;
    if (specialization) query = query.eq('specialization', specialization);
  }

  const portal = $('portalFilter').value;
  if (portal === 'activated') query = query.not('user_id', 'is', null);
  if (portal === 'not_activated') query = query.is('user_id', null);

  const phone = $('phoneFilter').value;
  if (phone === 'yes') query = query.not('phone', 'is', null).neq('phone', '');
  if (phone === 'no') query = query.or('phone.is.null,phone.eq.""');

  if (mode === 'helper') query = query.eq('staff_type', 'helper');
  return query;
}

function staffFields() {
  return mode === 'teacher'
    ? 'teacher_id,teacher_code,full_name,full_name_bn,gender,phone,email,specialization,joining_date,active,user_id,created_at'
    : 'staff_id,staff_code,full_name,full_name_bn,gender,phone,email,joining_date,active,user_id,staff_type,created_at';
}

async function fetchRows(from, to, includeCount = false) {
  const table = mode === 'teacher' ? 'qa_teachers' : 'qa_staff';
  let query = supabase.from(table).select(staffFields(), includeCount ? { count:'exact' } : {});
  query = applyStaffFilters(query);
  return query.order('created_at', { ascending:false }).range(from, to);
}

function renderRows(list) {
  const teacher = mode === 'teacher';
  $('countLabel').textContent = teacher ? `${totalRows} জন শিক্ষক` : `${totalRows} জন হেল্পার`;
  $('staffRows').innerHTML = list.map((r) => {
    const id = teacher ? r.teacher_id : r.staff_id;
    const code = teacher ? r.teacher_code : r.staff_code;
    const subtitle = r.full_name_bn ? `<div class="muted">${esc(r.full_name_bn)}</div>` : '';
    const detail = teacher ? (r.specialization || '—') : '—';
    return `<tr>
      <td><a class="staff-id-link" href="staff-profile.html?type=${mode}&id=${encodeURIComponent(id)}"><strong>${esc(code)}</strong></a></td>
      <td>${esc(r.full_name)}${subtitle}</td>
      <td data-col="gender">${esc(genderLabel(r.gender))}</td>
      <td data-col="joining">${esc(yearLabel(r.joining_date))}</td>
      <td data-col="detail">${esc(detail)}</td>
      <td data-col="phone">${esc(r.phone || '—')}</td>
      <td data-col="email">${esc(r.email || '—')}</td>
      <td data-col="status"><span class="active-badge ${r.active ? 'on' : 'off'}">${r.active ? 'Active' : 'Inactive'}</span></td>
      <td data-col="portal">${activationBadge(r.user_id)}</td>
      <td data-col="access">${portalAction(r)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="10">এই filter অনুযায়ী কোনো ${teacher ? 'teacher' : 'helper'} পাওয়া যায়নি।</td></tr>`;
  bindPortalActions();
  syncColumns();
}

async function load() {
  const permission = mode === 'teacher' ? 'teachers' : 'staff';
  if (!access?.can(`${permission}.view`) && !access?.can(`${permission}.manage`)) {
    msg(`এই ${mode === 'teacher' ? 'Teacher' : 'Helper'} module-এর permission আপনার account-এ নেই।`, 'error');
    $('staffRows').innerHTML = '<tr><td colspan="10">No permission.</td></tr>';
    $('newRecord').classList.add('hidden');
    return;
  }

  canManage = access.can(`${permission}.manage`);
  setFormEnabled(canManage);
  $('newRecord').classList.toggle('hidden', !canManage);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await fetchRows(from, from + pageSize - 1, true);
  if (error) throw error;
  totalRows = Number(count || 0);

  const pager = updatePager({
    summaryEl:$('paginationSummary'), pageLabelEl:$('pageLabel'), prevEl:$('prevPage'), nextEl:$('nextPage'),
    page, pageSize, total:totalRows
  });
  if (pager.page !== page) {
    page = pager.page;
    return load();
  }

  rows = data || [];
  renderRows(rows);
  refreshFilterChips();
}

async function exportRows(format, actionButton) {
  const button = $('exportList');
  const exportMode = mode;
  button.disabled = true;
  if (actionButton) actionButton.disabled = true;
  try {
    const all = [];
    let from = 0;
    const size = 1000;
    while (true) {
      const { data, error } = await fetchRows(from, from + size - 1, false);
      if (error) throw error;
      const batch = data || [];
      all.push(...batch);
      if (batch.length < size) break;
      from += size;
    }

    const teacher = exportMode === 'teacher';
    const columns = [
      { label:teacher ? 'Teacher ID' : 'Helper ID', value:(row) => teacher ? row.teacher_code : row.staff_code },
      { label:'English Name', key:'full_name' },
      { label:'বাংলা নাম', key:'full_name_bn' },
      { label:'Gender', value:(row) => genderLabel(row.gender) },
      { label:'Joining Year', value:(row) => yearLabel(row.joining_date) }
    ];
    if (teacher) columns.push({ label:'Specialization', key:'specialization' });
    columns.push(
      { label:'Phone', key:'phone' },
      { label:'Email', key:'email' },
      { label:'Status', value:(row) => row.active ? 'Active' : 'Inactive' },
      { label:'Portal', value:(row) => row.user_id ? 'Activated' : 'Not Activated' }
    );

    const date = new Date().toISOString().slice(0,10);
    const entity = teacher ? 'Teachers' : 'Helpers';
    const base = `QuranerAlo_${entity}_${date}`;
    const note = filterItems().filter((item) => String(item.value || '').trim())
      .map((item) => `${item.label}: ${item.text}`).join(' · ') || `All ${entity.toLowerCase()}`;

    if (format === 'csv') {
      downloadCsv(base + '.csv', columns, all);
    } else if (format === 'xlsx') {
      await downloadXlsx(base + '.xlsx', entity, columns, all);
    } else if (format === 'pdf') {
      await downloadPdf(base + '.pdf', teacher ? 'Teacher List' : 'Helper List', columns, all, note);
    } else if (format === 'print') {
      printRows(teacher ? 'Teacher List' : 'Helper List', columns, all, note);
    } else {
      throw new Error('Unsupported export format');
    }

    const label = format === 'xlsx' ? 'Excel' : format === 'pdf' ? 'PDF' : format === 'print' ? 'Print' : 'CSV';
    msg(`${all.length} জন ${teacher ? 'teacher' : 'helper'}-এর filtered list ${label} এর জন্য প্রস্তুত হয়েছে।`, 'success');
  } catch (error) {
    console.error(error);
    msg(`${mode === 'teacher' ? 'Teacher' : 'Helper'} export করা যায়নি।`, 'error');
  } finally {
    button.disabled = false;
    if (actionButton) actionButton.disabled = false;
  }
}

async function portalAdminAction(action, entityId) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) { location.replace('./'); return; }
  const response = await fetch(`${config.supabaseUrl}/functions/v1/portal-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': config.supabasePublishableKey
    },
    body: JSON.stringify({ action, entityType: mode, entityId })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'PORTAL_ADMIN_FAILED');
  return body;
}

function bindPortalActions() {
  document.querySelectorAll('.portal-disable').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.id;
    const r = rows.find(x => (mode === 'teacher' ? x.teacher_id : x.staff_id) === id);
    if (!r || !confirm(`${mode === 'teacher' ? r.teacher_code : r.staff_code} portal access disable করবেন?`)) return;
    button.disabled = true;
    try {
      await portalAdminAction('disable', id);
      msg(`${mode === 'teacher' ? r.teacher_code : r.staff_code} portal access disabled.`, 'success');
      await load();
    } catch (error) {
      console.error(error);
      msg('Portal access disable করা যায়নি।', 'error');
      button.disabled = false;
    }
  }));

  document.querySelectorAll('.portal-reset').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.id;
    const r = rows.find(x => (mode === 'teacher' ? x.teacher_id : x.staff_id) === id);
    if (!r || !confirm(`${mode === 'teacher' ? r.teacher_code : r.staff_code} portal account reset করবেন? পুরনো login account বাতিল হবে এবং আবার registered phone দিয়ে activate করতে হবে।`)) return;
    button.disabled = true;
    try {
      await portalAdminAction('reset', id);
      msg(`${mode === 'teacher' ? r.teacher_code : r.staff_code} portal access reset হয়েছে।`, 'success');
      await load();
    } catch (error) {
      console.error(error);
      msg('Portal access reset করা যায়নি।', 'error');
      button.disabled = false;
    }
  }));
}

$('newRecord').addEventListener('click', () => {
  if (!canManage) return;
  $('recordFormPanel').classList.toggle('hidden');
  formMsg('');
  $('fullName').focus();
});

$('cancelRecord').addEventListener('click', () => {
  resetForm();
  $('recordFormPanel').classList.add('hidden');
  formMsg('');
});

const debouncedSearch = debounce(() => {
  page = 1;
  load().catch((error) => {
    console.error(error);
    msg('List filter করা যায়নি।', 'error');
  });
}, 350);
$('search').addEventListener('input', debouncedSearch);

['yearFilter','genderFilter','statusFilter','specializationFilter','portalFilter','phoneFilter'].forEach((id) => {
  $(id).addEventListener('change', () => {
    page = 1;
    load().catch((error) => {
      console.error(error);
      msg('List filter করা যায়নি।', 'error');
    });
  });
});

$('resetFilters').addEventListener('click', () => resetListFilters(true));
$('toggleFilters').addEventListener('click', () => {
  const open = $('advancedFilters').classList.toggle('is-open');
  $('toggleFilters').setAttribute('aria-expanded', String(open));
});
$('pageSize').addEventListener('change', () => {
  pageSize = Number($('pageSize').value || 10);
  page = 1;
  void load();
});
$('prevPage').addEventListener('click', () => { if (page > 1) { page -= 1; void load(); } });
$('nextPage').addEventListener('click', () => { page += 1; void load(); });
bindExportMenu({
  button:$('exportList'),
  menu:$('exportMenu'),
  onAction:(format, actionButton) => exportRows(format, actionButton)
});

$('staffForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!canManage) {
    formMsg(`এই ${mode === 'teacher' ? 'Teacher' : 'Helper'}-এর তথ্য সংযুক্ত করার permission নেই।`, 'error');
    return;
  }
  formMsg('Saving…');
  const form = new FormData(event.currentTarget);
  try {
    if (mode === 'teacher') {
      const { data, error } = await supabase.from('qa_teachers').insert({
        full_name: String(form.get('full_name') || '').trim(),
        full_name_bn: String(form.get('full_name_bn') || '').trim() || null,
        phone: String(form.get('phone') || '').trim(),
        email: String(form.get('email') || '').trim(),
        specialization: String(form.get('specialization') || '').trim() || null,
        father_name: String(form.get('father_name') || '').trim(),
        mother_name: String(form.get('mother_name') || '').trim(),
        nid_number: String(form.get('nid_number') || '').trim(),
        address: String(form.get('address') || '').trim(),
        joining_date: form.get('joining_date') || null,
        notes: String(form.get('notes') || '').trim()
      }).select('teacher_code,full_name').single();
      if (error) throw error;
      formMsg(`${data.teacher_code} — ${data.full_name} সফলভাবে যুক্ত হয়েছে।`, 'success');
    } else {
      const { data, error } = await supabase.from('qa_staff').insert({
        full_name: String(form.get('full_name') || '').trim(),
        staff_type: 'helper',
        phone: String(form.get('phone') || '').trim(),
        email: String(form.get('email') || '').trim(),
        father_name: String(form.get('father_name') || '').trim(),
        mother_name: String(form.get('mother_name') || '').trim(),
        nid_number: String(form.get('nid_number') || '').trim(),
        address: String(form.get('address') || '').trim(),
        joining_date: form.get('joining_date') || null,
        notes: String(form.get('notes') || '').trim()
      }).select('staff_code,full_name').single();
      if (error) throw error;
      formMsg(`${data.staff_code} — ${data.full_name} সফলভাবে যুক্ত হয়েছে।`, 'success');
    }
    resetForm();
    $('recordFormPanel').classList.add('hidden');
    msg(`${mode === 'teacher' ? 'Teacher' : 'Helper'} সফলভাবে যুক্ত হয়েছে।`, 'success');
    page = 1;
    await loadFilterOptions();
    await load();
  } catch (error) {
    console.error(error);
    formMsg(error?.code === '23505' ? 'এই ID/record আগেই আছে।' : `${mode === 'teacher' ? 'Teacher' : 'Helper'} তথ্য save করা যায়নি।`, 'error');
  }
});

$('signOut').addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.replace('./');
});

async function init() {
  access = await getAccess(supabase);
  if (!access) {
    await supabase.auth.signOut();
    location.replace('./');
    return;
  }

  syncColumns = bindColumnMenu({
    button:$('columnsButton'), menu:$('columnMenu'), table:$('staffTable')
  }) || (() => {});

  updatePageContext();
  $('loading').classList.add('hidden');
  $('app').classList.remove('hidden');
  canManagePortal = access.profile.role === 'owner';

  try {
    await loadFilterOptions();
    await load();
  } catch (error) {
    console.error(error);
    msg('Data load করা যায়নি।', 'error');
  }
}

window.addEventListener('hashchange', async () => {
  const next = location.hash === '#helpers' ? 'helper' : 'teacher';
  if (next === mode) return;
  mode = next;
  page = 1;
  resetListFilters(false);
  updatePageContext();
  try {
    await loadFilterOptions();
    await load();
  } catch (error) {
    console.error(error);
    msg('Data load করা যায়নি।', 'error');
  }
});

init().catch(error => {
  console.error(error);
  $('loading').textContent = 'Page load করা যায়নি।';
});
