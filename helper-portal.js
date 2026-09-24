import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { mountDocumentsPanel, setProfileImage } from './documents-ui.js?v=20260922-2';

const c = window.QURANER_ALO_CONFIG;
const supabase = createClient(c.supabaseUrl, c.supabasePublishableKey, {
  auth: { autoRefreshToken: true, persistSession: true }
});
const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(window.location.search);
const isVercelPreview = location.hostname.endsWith('.vercel.app');
const portalPreviewFunction = isVercelPreview ? 'portal-preview-compact-test' : 'portal-preview';
const portalPayrollFunction = isVercelPreview ? 'portal-self-payroll-compact-test' : 'portal-self-payroll';

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
  if (['active', 'paid'].includes(v)) return 'on';
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

async function resolveHelper(session) {
  const previewId = qs.get('preview_helper');
  const viewer = await getViewerProfile(session);

  if (previewId) {
    if (!viewer || !viewer.active || viewer.role !== 'owner') throw new Error('PREVIEW_NOT_ALLOWED');
    const { data, error } = await supabase.functions.invoke(portalPreviewFunction, {
      body: { entityType: 'helper', entityId: previewId }
    });
    if (error) throw error;
    if (!data?.ok || data.entityType !== 'helper' || !data.entity) {
      throw new Error(data?.error || 'PREVIEW_NOT_FOUND');
    }
    const helper = data.entity;
    $('previewBanner').classList.remove('hidden');
    $('previewText').textContent = `Read-only preview · ${helper.staff_code} · ${helper.full_name}`;
    $('signOut').textContent = 'Exit Preview';
    return helper;
  }

  const { data, error } = await supabase.from('qa_staff')
    .select('staff_id,staff_code,full_name,staff_type,phone,email,joining_date,active,father_name,mother_name,nid_number,address')
    .eq('user_id', session.user.id).maybeSingle();
  if (error || !data) throw error || new Error('HELPER_PROFILE_NOT_FOUND');
  return data;
}

async function loadHelperDetails(staffId) {
  const { data, error } = await supabase.from('qa_staff')
    .select('staff_id,staff_code,full_name,staff_type,phone,email,joining_date,active,father_name,mother_name,nid_number,address')
    .eq('staff_id', staffId)
    .eq('staff_type', 'helper')
    .maybeSingle();
  if (error || !data) throw error || new Error('HELPER_PROFILE_NOT_FOUND');
  return data;
}

async function loadPayroll(previewHelperId = '') {
  const { data, error } = await supabase.functions.invoke(portalPayrollFunction, {
    body: previewHelperId ? { action: 'list', previewHelperId } : { action: 'list' }
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

  const baseHelper = await resolveHelper(session);
  const p = await loadHelperDetails(baseHelper.staff_id);
  const previewHelperId = qs.get('preview_helper') || '';

  if (!p.active) {
    if (previewHelperId) throw new Error('HELPER_INACTIVE');
    await supabase.auth.signOut();
    location.replace('./');
    return;
  }

  const payroll = await loadPayroll(previewHelperId);

  $('staffCodeBadge').textContent = p.staff_code || '—';
  $('name').textContent = p.full_name || '—';
  $('subtitle').textContent = `Helper ID: ${p.staff_code || '—'} · ${p.active ? 'Active' : 'Inactive'}`;
  $('staffCodeHero').textContent = p.staff_code || '—';
  $('phoneHero').textContent = p.phone || 'ফোন নম্বর দেওয়া নেই';
  $('statusHero').textContent = p.active ? 'Active' : 'Inactive';
  $('statusHero').className = `active-badge ${statusClass(p.active ? 'active' : 'inactive')}`;

  $('staffCode').textContent = p.staff_code || '—';
  $('type').textContent = p.staff_type || 'Helper';
  $('phone').textContent = p.phone || '—';
  $('email').textContent = p.email || '—';
  $('joiningDate').textContent = formatDate(p.joining_date);
  $('joiningDateSummary').textContent = formatDate(p.joining_date);
  $('fatherName').textContent = p.father_name || '—';
  $('motherName').textContent = p.mother_name || '—';
  $('nidNumber').textContent = p.nid_number || '—';
  $('address').textContent = p.address || '—';

  await setProfileImage({role:'helper',personId:p.staff_id,img:$('helperPortalProfileImage')});
  await mountDocumentsPanel({
    container:$('helperPortalDocuments'),
    role:'helper',
    personId:p.staff_id,
    editable:!previewHelperId,
    canDelete:false,
    title:'My Documents'
  });

  $('latestPaidAmount').textContent = money(payroll.summary?.latestPaidAmount || 0);
  $('latestPaidMonth').textContent = payroll.summary?.latestPaidMonth
    ? `Latest paid month: ${formatDate(payroll.summary.latestPaidMonth)}`
    : 'কোনো paid record নেই';
  $('totalPaid').textContent = money(payroll.summary?.totalPaid || 0);
  $('paidCount').textContent = `${Number(payroll.summary?.paidCount || 0)} টি paid record`;

  const rows = payroll.payrolls || [];
  $('payrollRows').innerHTML = rows.map((item) => `
    <tr>
      <td>${esc(formatDate(item.payroll_month))}</td>
      <td><span class="active-badge ${statusClass(item.status)}">${esc(item.status || '—')}</span></td>
      <td><strong>${esc(money(item.net_payable))}</strong></td>
      <td>${esc(item.paid_at ? new Date(item.paid_at).toLocaleDateString('en-GB') : '—')}</td>
      <td>${esc(item.payment_method || '—')}</td>
      <td>${item.status === 'paid' ? `<a class="portal-action-link" href="receipt.html?type=payroll&id=${encodeURIComponent(item.payroll_id)}&portal=1${previewHelperId ? '&preview_helper=' + encodeURIComponent(previewHelperId) : ''}" target="_blank" rel="noopener noreferrer">রিসিট দেখুন</a>` : '<span class="muted">পেমেন্ট হয়নি</span>'}</td>
    </tr>
  `).join('') || '<tr><td colspan="6">No salary record.</td></tr>';

  $('exitPreview')?.addEventListener('click', () => { location.href = 'dashboard.html#settings'; });
  $('signOut').addEventListener('click', async () => {
    if (previewHelperId) {
      location.href = 'dashboard.html#settings';
      return;
    }
    await supabase.auth.signOut();
    location.replace('./');
  });

  try { await setSchoolWhatsApp(); } catch (error) { console.warn('school WhatsApp link unavailable', error); }

  $('loading').classList.add('hidden');
  $('app').classList.remove('hidden');
}

init().catch((error) => {
  console.error('helper portal error', error);
  if (error.message === 'PREVIEW_NOT_ALLOWED') { location.replace('./'); return; }
  $('loading').classList.add('hidden');
  $('errorBox').textContent = error.message || 'Portal load করা যায়নি।';
  $('errorBox').classList.remove('hidden');
});
