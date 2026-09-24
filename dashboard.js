(() => {
  const config = window.QURANER_ALO_CONFIG;
  const $ = (id) => document.getElementById(id);
  const login = () => window.location.replace('./');
  const client = window.supabase?.createClient(config?.supabaseUrl, config?.supabasePublishableKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });
  const roles = ['admin', 'sub_admin', 'accounts', 'teacher', 'helper', 'parent', 'student', 'viewer'];
  const permissions = [
    ['students.view','Students view'],['students.manage','Students manage'],
    ['guardians.view','Guardians view'],['guardians.manage','Guardians manage'],
    ['teachers.view','Teachers view'],['teachers.manage','Teachers manage'],
    ['staff.view','Helpers view'],['staff.manage','Helpers manage'],
    ['fees.view','Fees view'],['fees.manage','Fees manage'],
    ['payments.view','Payments view'],['payments.manage','Payments manage'],
    ['payroll.view','Payroll view'],['payroll.manage','Payroll manage'],
    ['finance.view','Finance view'],['finance.manage','Finance manage'],
    ['accounting.view','Accounting view'],['accounting.manage','Accounting manage'],
    ['vouchers.view','Vouchers view'],['vouchers.manage','Vouchers manage'],
    ['reports.view','Reports view']
  ];
  const manageToView = {
    'students.manage':'students.view','guardians.manage':'guardians.view',
    'teachers.manage':'teachers.view','staff.manage':'staff.view',
    'fees.manage':'fees.view','payments.manage':'payments.view',
    'payroll.manage':'payroll.view','finance.manage':'finance.view','accounting.manage':'accounting.view',
    'vouchers.manage':'vouchers.view'
  };
  const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  let access = null;

  const show = (id) => $(id)?.classList.remove('hidden');
  const hide = (id) => $(id)?.classList.add('hidden');
  const message = (id, text, type = '') => {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = `message-inline${type ? ` ${type}` : ''}`;
  };

  async function profileFor(session) {
    const { data, error } = await client.from('qa_users')
      .select('user_id,email,full_name,role,active')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function buildAccess(session, profile) {
    if (profile.role === 'owner') {
      return { session, profile, permissions: new Set(), can: () => true };
    }
    const [u, r] = await Promise.all([
      client.from('qa_user_permissions').select('permission_code').eq('user_id', session.user.id).eq('allowed', true),
      client.from('qa_role_permissions').select('permission_code').eq('role', profile.role)
    ]);
    if (u.error) throw u.error;
    if (r.error) throw r.error;
    const perms = new Set([...(u.data || []), ...(r.data || [])].map((x) => x.permission_code));
    return { session, profile, permissions: perms, can: (p) => perms.has(p) };
  }

  function normalize(name) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      const viewCode = manageToView[input.value];
      if (input.checked && viewCode) {
        const view = document.querySelector(`input[name="${name}"][value="${viewCode}"]`);
        if (view) view.checked = true;
      }
      const manageCode = Object.keys(manageToView).find((k) => manageToView[k] === input.value);
      if (!input.checked && manageCode) {
        const manage = document.querySelector(`input[name="${name}"][value="${manageCode}"]`);
        if (manage) manage.checked = false;
      }
    });
  }

  function permissionCheckboxes(name, selected = []) {
    return permissions.map(([code, label]) =>
      `<label><input type="checkbox" name="${name}" value="${code}" ${selected.includes(code) ? 'checked' : ''}> ${label}</label>`
    ).join('');
  }

  function fillPermissionPanels() {
    $('subAdminPermissions').innerHTML = permissionCheckboxes('subPerm');
    document.querySelectorAll('input[name="subPerm"]').forEach((x) => x.addEventListener('change', () => normalize('subPerm')));
  }

  function selectedPermissions(name) {
    normalize(name);
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((x) => x.value);
  }

  async function countRows(table, fn) {
    let q = client.from(table).select('*', { count: 'exact', head: true });
    if (fn) q = fn(q);
    const { count, error } = await q;
    if (error) throw error;
    return count || 0;
  }

  function localDateISO(date = new Date()) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function money(value) {
    return `৳ ${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 0 })}`;
  }

  async function loadFinanceRows() {
    if (!access?.can('finance.view') && !access?.can('finance.manage')) return null;
    const rows = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await client.from('qa_finance_transactions')
        .select('transaction_date,direction,amount')
        .order('transaction_date', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  }

  async function loadMetrics() {
    const [s, sa, t, ta, h, ha] = await Promise.all([
      countRows('qa_students'),
      countRows('qa_students', (q) => q.not('user_id', 'is', null)),
      countRows('qa_teachers'),
      countRows('qa_teachers', (q) => q.not('user_id', 'is', null)),
      countRows('qa_staff', (q) => q.eq('staff_type', 'helper')),
      countRows('qa_staff', (q) => q.eq('staff_type', 'helper').not('user_id', 'is', null))
    ]);

    $('studentActivationSummary').textContent = sa + ' / ' + s;
    $('studentActivationHint').textContent = s ? (s - sa) + ' জন এখনো activate করেনি' : 'কোনো student নেই';
    $('teacherActivationSummary').textContent = ta + ' / ' + t;
    $('teacherActivationHint').textContent = t ? (t - ta) + ' জন এখনো activate করেনি' : 'কোনো teacher নেই';
    $('helperActivationSummary').textContent = ha + ' / ' + h;
    $('helperActivationHint').textContent = h ? (h - ha) + ' জন এখনো activate করেনি' : 'কোনো helper নেই';
  }

  async function loadOverviewReports() {
    const grid = $('overviewReportGrid');
    if (!grid) return;
    const card = (title, body) => `<section class="overview-report-card"><h3>${title}</h3>${body}</section>`;
    const moneyLocal = (v) => money(v);
    const sections = [];

    if (access.can('students.view') || access.can('students.manage')) {
      const [total, active, portal] = await Promise.all([
        countRows('qa_students'),
        countRows('qa_students', q => q.eq('status', 'active')),
        countRows('qa_students', q => q.not('user_id', 'is', null))
      ]);
      sections.push(card('Students', `<div class="big">${total}</div><table><tr><td>Active</td><td>${active}</td></tr><tr><td>Portal activated</td><td>${portal}</td></tr><tr><td>Not activated</td><td>${Math.max(0, total - portal)}</td></tr></table>`));
    }

    if (access.can('teachers.view') || access.can('teachers.manage')) {
      const [total, active, portal] = await Promise.all([
        countRows('qa_teachers'),
        countRows('qa_teachers', q => q.eq('active', true)),
        countRows('qa_teachers', q => q.not('user_id', 'is', null))
      ]);
      sections.push(card('Teacher', `<div class="big">${total}</div><table><tr><td>Active</td><td>${active}</td></tr><tr><td>Portal activated</td><td>${portal}</td></tr><tr><td>Not activated</td><td>${Math.max(0, total - portal)}</td></tr></table>`));
    }

    if (access.can('staff.view') || access.can('staff.manage')) {
      const [total, active, portal] = await Promise.all([
        countRows('qa_staff', q => q.eq('staff_type', 'helper')),
        countRows('qa_staff', q => q.eq('staff_type', 'helper').eq('active', true)),
        countRows('qa_staff', q => q.eq('staff_type', 'helper').not('user_id', 'is', null))
      ]);
      sections.push(card('Helper', `<div class="big">${total}</div><table><tr><td>Active</td><td>${active}</td></tr><tr><td>Portal activated</td><td>${portal}</td></tr><tr><td>Not activated</td><td>${Math.max(0, total - portal)}</td></tr></table>`));
    }

    if (access.can('fees.view') || access.can('fees.manage')) {
      const { data, error } = await client.from('qa_fee_charges').select('current_payable,status').neq('status', 'paid');
      if (error) throw error;
      const rows = data || [];
      const due = rows.reduce((sum, x) => sum + Number(x.current_payable || 0), 0);
      sections.push(card('Fees Due', `<div class="big">${moneyLocal(due)}</div><table><tr><td>Open charges</td><td>${rows.length}</td></tr></table>`));
    }

    if (access.can('finance.view') || access.can('finance.manage')) {
      const { data, error } = await client.from('qa_finance_transactions').select('direction,amount').limit(5000);
      if (error) throw error;
      const rows = data || [];
      const income = rows.filter(x => x.direction === 'income').reduce((sum, x) => sum + Number(x.amount || 0), 0);
      const expense = rows.filter(x => x.direction === 'expense').reduce((sum, x) => sum + Number(x.amount || 0), 0);
      sections.push(card('Finance', `<div class="big">${moneyLocal(income - expense)}</div><table><tr><td>Income</td><td>${moneyLocal(income)}</td></tr><tr><td>Expense</td><td>${moneyLocal(expense)}</td></tr></table>`));
    }

    if (access.can('payroll.view') || access.can('payroll.manage')) {
      const { data, error } = await client.from('qa_payroll_records').select('net_payable,status,payroll_month').order('payroll_month', { ascending: false }).limit(100);
      if (error) throw error;
      const rows = data || [];
      const total = rows.filter(x => x.status !== 'cancelled').reduce((sum, x) => sum + Number(x.net_payable || 0), 0);
      sections.push(card('Payroll', `<div class="big">${moneyLocal(total)}</div><table><tr><td>Recent records</td><td>${rows.length}</td></tr><tr><td>Latest month</td><td>${esc(rows[0]?.payroll_month || '—')}</td></tr></table>`));
    }

    grid.innerHTML = sections.length ? sections.join('') : '<p class="overview-report-muted" style="padding:16px">আপনার account-এর জন্য report-viewable module পাওয়া যায়নি।</p>';
  }

  let previewEntities = [];
  let selectedPreviewEntity = null;

  function previewRoleLabel(type) {
    return type === 'student' ? 'Student' : type === 'teacher' ? 'Teacher' : 'Helper';
  }

  function previewRoute(entity) {
    if (entity.type === 'student') return `student-portal.html?preview_student=${encodeURIComponent(entity.id)}`;
    if (entity.type === 'teacher') return `teacher-portal.html?preview_teacher=${encodeURIComponent(entity.id)}`;
    return `helper-portal.html?preview_helper=${encodeURIComponent(entity.id)}`;
  }

  function hidePreviewResults() {
    $('portalPreviewResults')?.classList.add('hidden');
    $('portalPreviewSearch')?.setAttribute('aria-expanded', 'false');
  }

  function renderPreviewResults(query = '') {
    const results = $('portalPreviewResults');
    const input = $('portalPreviewSearch');
    if (!results || !input) return;
    const q = String(query || '').trim().toLocaleLowerCase();
    const matches = previewEntities.filter((entity) => {
      if (!q) return true;
      return [entity.name, entity.code, previewRoleLabel(entity.type)]
        .some((value) => String(value || '').toLocaleLowerCase().includes(q));
    }).slice(0, 10);

    if (!matches.length) {
      results.innerHTML = '<div class="portal-preview-empty">কোনো matching profile পাওয়া যায়নি।</div>';
    } else {
      results.innerHTML = matches.map((entity) => `
        <button class="portal-preview-result" type="button" role="option" data-preview-key="${esc(entity.type + ':' + entity.id)}">
          <span class="portal-preview-result-main"><strong>${esc(entity.name)}</strong><small>${esc(entity.code)}</small></span>
          <span class="portal-preview-role ${esc(entity.type)}">${esc(previewRoleLabel(entity.type))}</span>
        </button>`).join('');
      results.querySelectorAll('[data-preview-key]').forEach((button) => {
        button.addEventListener('click', () => {
          const key = button.dataset.previewKey || '';
          selectedPreviewEntity = previewEntities.find((entity) => entity.type + ':' + entity.id === key) || null;
          if (!selectedPreviewEntity) return;
          input.value = `${selectedPreviewEntity.name} · ${selectedPreviewEntity.code} · ${previewRoleLabel(selectedPreviewEntity.type)}`;
          $('openPortalPreview').disabled = false;
          message('previewMessage', `${previewRoleLabel(selectedPreviewEntity.type)} selected · ${selectedPreviewEntity.code}`);
          hidePreviewResults();
        });
      });
    }
    results.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
  }

  async function loadPreview() {
    const box = $('portalPreview');
    if (!box || access.profile.role !== 'owner') return;
    box.classList.remove('hidden');
    const [students, teachers, helpers] = await Promise.all([
      client.from('qa_students').select('student_id,student_code,full_name').eq('status', 'active').order('student_code'),
      client.from('qa_teachers').select('teacher_id,teacher_code,full_name').eq('active', true).order('teacher_code'),
      client.from('qa_staff').select('staff_id,staff_code,full_name,staff_type').eq('staff_type', 'helper').eq('active', true).order('staff_code')
    ]);
    if (students.error) throw students.error;
    if (teachers.error) throw teachers.error;
    if (helpers.error) throw helpers.error;

    previewEntities = [
      ...(students.data || []).map((x) => ({ type:'student', id:x.student_id, code:x.student_code, name:x.full_name })),
      ...(teachers.data || []).map((x) => ({ type:'teacher', id:x.teacher_id, code:x.teacher_code, name:x.full_name })),
      ...(helpers.data || []).map((x) => ({ type:'helper', id:x.staff_id, code:x.staff_code, name:x.full_name }))
    ].filter((x) => x.id && x.code && x.name);

    selectedPreviewEntity = null;
    $('openPortalPreview').disabled = true;
    message('previewMessage', previewEntities.length ? '' : 'এখনো কোনো active Student, Teacher বা Helper পাওয়া যায়নি।');
  }

  function openPreview() {
    if (!selectedPreviewEntity) {
      message('previewMessage', 'প্রথমে একজন Student, Teacher বা Helper নির্বাচন করুন।', 'error');
      return;
    }
    window.location.href = previewRoute(selectedPreviewEntity);
  }

  function roleSelect(role) {
    return `<select data-role>${roles.map((r) => `<option value="${r}" ${r === role ? 'selected' : ''}>${r}</option>`).join('')}</select>`;
  }

  async function loadUsers() {
    const { data, error } = await client.from('qa_users').select('user_id,email,full_name,role,active').order('created_at');
    if (error) throw error;
    const body = $('userRows');
    body.innerHTML = (data || []).map((u) => `<tr data-id="${esc(u.user_id)}"><td>${esc(u.email)}</td><td><input data-name value="${esc(u.full_name)}"></td><td>${roleSelect(u.role)}</td><td><select data-active><option value="true" ${u.active ? 'selected' : ''}>Active</option><option value="false" ${!u.active ? 'selected' : ''}>Inactive</option></select></td><td><div class="action-stack"><button class="save-btn" data-save type="button">Save</button>${u.role === 'sub_admin' ? '<button class="save-btn secondary" data-permissions type="button">Permissions</button>' : ''}</div></td></tr>`).join('');
    body.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', saveUser));
    body.querySelectorAll('[data-permissions]').forEach((b) => b.addEventListener('click', editPermissions));
  }

  async function saveUser(event) {
    const row = event.currentTarget.closest('tr');
    const button = event.currentTarget;
    const id = row.dataset.id;
    const role = row.querySelector('[data-role]').value;
    const active = row.querySelector('[data-active]').value === 'true';
    const full_name = row.querySelector('[data-name]').value.trim();
    if (!full_name) { button.textContent = 'Name required'; setTimeout(() => button.textContent = 'Save', 1200); return; }
    if (id === access.profile.user_id && (role !== access.profile.role || !active)) {
      button.textContent = 'Use account safety';
      setTimeout(() => button.textContent = 'Save', 1400);
      return;
    }
    button.disabled = true;
    const { error } = await client.from('qa_users').update({ full_name, role, active, updated_at: new Date().toISOString() }).eq('user_id', id);
    button.disabled = false;
    button.textContent = error ? 'Failed' : 'Saved';
    setTimeout(() => { button.textContent = 'Save'; }, 1000);
    if (!error) await client.from('qa_audit_log').insert({ actor_user_id: access.profile.user_id, action: 'user.updated', entity_type: 'qa_users', entity_id: id, metadata: { role, active } });
  }

  async function editPermissions(event) {
    const row = event.currentTarget.closest('tr');
    const id = row.dataset.id;
    const { data, error } = await client.from('qa_user_permissions').select('permission_code').eq('user_id', id).eq('allowed', true);
    if (error) { message('existingPermissionMessage', 'Permissions load করা যায়নি।', 'error'); return; }
    $('existingPermissionTitle').textContent = `Sub Admin permissions — ${row.querySelector('[data-name]').value}`;
    $('existingPermissions').innerHTML = permissionCheckboxes('existingPerm', (data || []).map((x) => x.permission_code));
    $('existingPermissionPanel').dataset.userId = id;
    show('existingPermissionPanel');
    message('existingPermissionMessage', '');
    document.querySelectorAll('input[name="existingPerm"]').forEach((x) => x.addEventListener('change', () => normalize('existingPerm')));
  }

  async function saveExistingPermissions() {
    const panel = $('existingPermissionPanel');
    const userId = panel.dataset.userId;
    if (!userId) return;
    const button = $('saveExistingPermissions');
    const perms = selectedPermissions('existingPerm');
    button.disabled = true;
    message('existingPermissionMessage', 'Permissions saving হচ্ছে…');
    const del = await client.from('qa_user_permissions').delete().eq('user_id', userId);
    if (del.error) { button.disabled = false; message('existingPermissionMessage', 'Existing permissions clear করা যায়নি।', 'error'); return; }
    if (perms.length) {
      const ins = await client.from('qa_user_permissions').insert(perms.map((permission_code) => ({ user_id: userId, permission_code, allowed: true })));
      if (ins.error) { button.disabled = false; message('existingPermissionMessage', 'নতুন permissions save করা যায়নি।', 'error'); return; }
    }
    await client.from('qa_audit_log').insert({ actor_user_id: access.profile.user_id, action: 'subadmin.permissions_updated', entity_type: 'qa_users', entity_id: userId, metadata: { permissions: perms } });
    button.disabled = false;
    message('existingPermissionMessage', 'Permissions সফলভাবে save হয়েছে।', 'success');
    await loadUsers();
  }

  async function createSubAdmin(event) {
    event.preventDefault();
    if (access.profile.role !== 'owner') return;
    const email = $('subAdminEmail').value.trim().toLowerCase();
    const fullName = $('subAdminName').value.trim();
    const password = $('subAdminPassword').value;
    const password2 = $('subAdminPassword2').value;
    const perms = selectedPermissions('subPerm');
    if (!email || !fullName) { message('subAdminMessage', 'Email এবং Full Name দিন।', 'error'); return; }
    if (password.length < 10) { message('subAdminMessage', 'Password কমপক্ষে ১০ অক্ষরের হতে হবে।', 'error'); return; }
    if (password !== password2) { message('subAdminMessage', 'দুইটি password একই নয়।', 'error'); return; }
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    message('subAdminMessage', 'Sub Admin account তৈরি হচ্ছে…');
    try {
      const { data, error } = await client.functions.invoke('admin-provision', { body: { email, fullName, password, permissions: perms } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'PROVISION_FAILED');
      event.currentTarget.reset();
      document.querySelectorAll('input[name="subPerm"]').forEach((x) => { x.checked = false; });
      message('subAdminMessage', `Sub Admin তৈরি হয়েছে: ${data.email}`, 'success');
      await loadUsers();
    } catch (error) {
      console.error(error);
      message('subAdminMessage', error?.message === 'OWNER_ONLY' ? 'শুধু Super Admin এই account তৈরি করতে পারবেন।' : 'Sub Admin account তৈরি করা যায়নি। Email আগে থেকে ব্যবহৃত হতে পারে বা provisioning ব্যর্থ হয়েছে।', 'error');
    } finally {
      button.disabled = false;
    }
  }

  function bindUI() {
    const previewSearch = $('portalPreviewSearch');
    previewSearch?.addEventListener('focus', () => renderPreviewResults(previewSearch.value));
    previewSearch?.addEventListener('input', () => {
      selectedPreviewEntity = null;
      $('openPortalPreview').disabled = true;
      message('previewMessage', '');
      renderPreviewResults(previewSearch.value);
    });
    previewSearch?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hidePreviewResults();
      if (event.key === 'Enter') {
        event.preventDefault();
        if (selectedPreviewEntity) return openPreview();
        const first = $('portalPreviewResults')?.querySelector('[data-preview-key]');
        first?.click();
      }
    });
    $('openPortalPreview')?.addEventListener('click', openPreview);
    document.addEventListener('click', (event) => {
      if (!$('portalPreview')?.contains(event.target)) hidePreviewResults();
    });
    $('selectAllPermissions')?.addEventListener('click', () => {
      document.querySelectorAll('input[name="subPerm"]').forEach((x) => { x.checked = true; });
      normalize('subPerm');
    });
    $('closePermissionEditor')?.addEventListener('click', () => hide('existingPermissionPanel'));
    $('saveExistingPermissions')?.addEventListener('click', saveExistingPermissions);
    $('subAdminForm')?.addEventListener('submit', createSubAdmin);
    document.querySelectorAll('input[name="subPerm"]').forEach((x) => x.addEventListener('change', () => normalize('subPerm')));
    if (!window.__qaSignoutBound) {
      $('signOut')?.addEventListener('click', async () => { try { await client.auth.signOut(); } finally { login(); } });
    }
  }

  async function init() {
    if (!client) throw new Error('Supabase client initialize হয়নি।');
    const { data: { session } } = await client.auth.getSession();
    if (!session) return login();
    const profile = await profileFor(session);
    if (!profile || !profile.active) {
      await client.auth.signOut();
      return login();
    }

    access = await buildAccess(session, profile);
    $('rolePill').textContent = (profile.role || 'viewer').toUpperCase();
    if ($('userEmail')) $('userEmail').textContent = profile.email || session.user.email || '';
    hide('loading');
    show('app');
    bindUI();


    const renderView = () => {
      const view = location.hash.replace('#', '') === 'settings' ? 'settings' : 'overview';
      if (view === 'settings') {
        hide('overviewView');
        show('settingsView');
      } else {
        show('overviewView');
        hide('settingsView');
      }
    };

    renderView();
    window.addEventListener('hashchange', renderView);

    const optional = async (fn, target, label) => {
      try { await fn(); }
      catch (error) { console.error(label, error); if (target) message(target, `${label} load করা যায়নি।`, 'error'); }
    };

    void optional(loadMetrics, null, 'Dashboard metrics');
    void optional(loadOverviewReports, 'overviewReportMessage', 'Report summary');

    if (profile.role === 'owner') {
      show('userManagement');
      show('subAdminPanel');
      fillPermissionPanels();
      void optional(loadPreview, 'previewMessage', 'Portal preview');
      void optional(loadUsers, null, 'User management');
    } else if (profile.role === 'admin') {
      show('userManagement');
      void optional(loadUsers, null, 'User management');
    }
  }

  window.addEventListener('error', (event) => console.error('Dashboard runtime error', event.error || event.message));
  window.addEventListener('unhandledrejection', (event) => console.error('Dashboard promise error', event.reason));
  init().catch((error) => {
    console.error('Dashboard init failed', error);
    const loading = $('loading');
    if (loading) {
      loading.innerHTML = `Dashboard load করা যায়নি। ${esc(error?.message || 'অনুগ্রহ করে আবার login করুন।')}<br><a href="./">Login page-এ ফিরুন</a>`;
      loading.classList.add('error');
    }
  });
})();
