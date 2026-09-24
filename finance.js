import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {getAccess} from './authz.js';

const c=window.QURANER_ALO_CONFIG;
const supabase=createClient(c.supabaseUrl,c.supabasePublishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
function esc(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));}
function money(v){return Number(v||0).toFixed(2)}
function msg(id,t,type=''){const el=$(id);if(!el)return;el.innerHTML=t;el.className='message-inline '+type;}
function today(){return new Date().toISOString().slice(0,10)}
function setFormEnabled(formId,enabled){const form=$(formId);if(!form)return;form.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(el=>el.disabled=!enabled)}
let access=null,canFinanceView=false,canFinanceManage=false,canVoucherView=false,canVoucherManage=false,currentView='income',voucherRecords=[];
function setAccordion(buttonId,bodyId,openLabel,closeLabel,open){const button=$(buttonId),body=$(bodyId);if(!button||!body)return;body.classList.toggle('hidden',!open);button.setAttribute('aria-expanded',String(open));button.innerHTML=(open?closeLabel:openLabel)+' <span aria-hidden="true">'+(open?'⌃':'⌄')+'</span>';}
function viewFromHash(){const hash=location.hash.replace('#','');return hash==='expense'?'expense':hash==='vouchers'?'vouchers':'income';}
function updateView(){
  currentView=viewFromHash();
  document.querySelectorAll('.finance-view').forEach(el=>el.classList.remove('is-active'));
  const target=currentView==='income'?'incomeView':currentView==='expense'?'expenseView':'vouchersView';
  $(target)?.classList.add('is-active');
  $('brandSubtitle').textContent=currentView==='income'?'আয় ব্যবস্থাপনা':currentView==='expense'?'ব্যয় ব্যবস্থাপনা':'ভাউচার ব্যবস্থাপনা';
  setFormEnabled('financeForm',currentView==='income'&&canFinanceManage);
  setFormEnabled('expenseForm',currentView==='expense'&&canFinanceManage);
  setFormEnabled('voucherForm',currentView==='vouchers'&&canVoucherManage);
  $('toggleManualVoucher')?.classList.toggle('hidden',!canVoucherManage);
}
async function findVoucher(sourceId){const {data,error}=await supabase.from('qa_vouchers').select('voucher_id,voucher_no,voucher_type').eq('source_type','finance_transaction').eq('source_id',sourceId).maybeSingle();if(error)throw error;return data;}
function voucherLink(v){return v?'<a class="quick-link" target="_blank" rel="noopener" href="receipt.html?type=voucher&id='+encodeURIComponent(v.voucher_id)+'">'+esc(v.voucher_no)+'</a>':'—';}
function sourceLabel(v){if(v.source_type==='finance_transaction')return v.voucher_type==='income'?'Income':'Expense';if(v.source_type==='fee_payment')return 'Fee';if(v.source_type==='payroll_payment')return 'Payroll';return 'Manual';}
async function loadTransactions(){
  if(!canFinanceView){$('incomeRows').innerHTML='<tr><td colspan="6">No permission.</td></tr>';$('expenseRows').innerHTML='<tr><td colspan="6">No permission.</td></tr>';return;}
  const {data,error}=await supabase.from('qa_finance_transactions').select('transaction_id,transaction_date,direction,category,amount,account_name,reference,description,created_by').order('transaction_date',{ascending:false}).order('created_at',{ascending:false}).limit(300);
  if(error)throw error;
  const txs=data||[],ids=txs.map(x=>x.transaction_id);
  let voucherRows=[];
  if(ids.length){const {data:v,error:ve}=await supabase.from('qa_vouchers').select('voucher_id,voucher_no,voucher_type,source_type,source_id').eq('source_type','finance_transaction').in('source_id',ids);if(ve)throw ve;voucherRows=v||[];}
  const vouchers=Object.fromEntries(voucherRows.map(v=>[v.source_id,v]));
  const income=txs.filter(x=>x.direction==='income'),expense=txs.filter(x=>x.direction==='expense');
  $('incomeCount').textContent=income.length+' records';$('expenseCount').textContent=expense.length+' records';
  const renderRows=rows=>rows.map(x=>'<tr><td>'+esc(x.transaction_date)+'</td><td>'+esc(x.category)+'</td><td>৳'+money(x.amount)+'</td><td>'+esc(x.account_name)+'</td><td>'+esc(x.reference||'—')+'</td><td>'+voucherLink(vouchers[x.transaction_id])+'</td></tr>').join('');
  $('incomeRows').innerHTML=renderRows(income)||'<tr><td colspan="6">কোনো Income record পাওয়া যায়নি।</td></tr>';
  $('expenseRows').innerHTML=renderRows(expense)||'<tr><td colspan="6">কোনো Expense record পাওয়া যায়নি।</td></tr>';
}
function voucherPrintHref(v){
  if(v.source_type==='fee_payment' || v.record_type==='fee_receipt')return 'receipt.html?type=fee&id='+encodeURIComponent(v.source_id);
  return 'receipt.html?type=voucher&id='+encodeURIComponent(v.voucher_id);
}
async function loadVouchers(){
  if(!canVoucherView){
    voucherRecords=[];
    $('voucherRows').innerHTML='<tr><td colspan="8">No permission.</td></tr>';
    $('voucherCount').textContent='—';
    $('voucherSearchSummary').textContent='Voucher view permission নেই।';
    return;
  }
  const feeViewAllowed=!!(access&&(access.can('payments.view')||access.can('payments.manage')));
  const [voucherResult,feeResult]=await Promise.all([
    supabase.from('qa_vouchers')
      .select('voucher_id,voucher_no,voucher_type,voucher_date,amount,account_name,party_name,reference,description,status,source_type,source_id,created_at')
      .order('created_at',{ascending:false}).limit(1000),
    feeViewAllowed
      ? supabase.from('qa_fee_payments').select('payment_id,receipt_no,student_id,paid_at,amount,payment_method,reference,notes').order('paid_at',{ascending:false}).limit(1000)
      : Promise.resolve({data:[],error:null})
  ]);
  if(voucherResult.error)throw voucherResult.error;
  if(feeResult.error)throw feeResult.error;
  const vouchers=voucherResult.data||[];
  const feePayments=feeResult.data||[];
  const existingFeeSources=new Set(vouchers.filter(v=>v.source_type==='fee_payment').map(v=>v.source_id));
  const studentIds=[...new Set(feePayments.map(p=>p.student_id).filter(Boolean))];
  let studentsById={};
  if(studentIds.length){
    const {data:students,error}=await supabase.from('qa_students').select('student_id,student_code,full_name').in('student_id',studentIds);
    if(error)throw error;
    studentsById=Object.fromEntries((students||[]).map(s=>[s.student_id,s]));
  }
  const feeRows=feePayments.filter(p=>!existingFeeSources.has(p.payment_id)).map(p=>{
    const s=studentsById[p.student_id]||{};
    return {
      record_type:'fee_receipt',
      voucher_id:null,
      voucher_no:p.receipt_no,
      voucher_type:'fee_receipt',
      voucher_date:p.paid_at,
      amount:p.amount,
      account_name:p.payment_method,
      party_name:s.full_name||s.student_code||'—',
      reference:p.reference,
      description:p.notes||'Monthly Fee',
      status:'posted',
      source_type:'fee_payment',
      source_id:p.payment_id,
      created_at:p.paid_at
    };
  });
  voucherRecords=[...vouchers,...feeRows].sort((a,b)=>new Date(b.created_at||b.voucher_date||0).getTime()-new Date(a.created_at||a.voucher_date||0).getTime());
  renderVoucherRows();
}
function renderVoucherRows(){
  const search=String($('voucherSearch')?.value||'').trim().toLowerCase();
  const typeFilter=$('voucherTypeFilter')?.value||'all';
  const dateFilter=$('voucherDateFilter')?.value||'';
  const sourceFilter=$('voucherSourceFilter')?.value||'all';
  const statusFilter=$('voucherStatusFilter')?.value||'all';

  const filtered=voucherRecords.filter(v=>{
    if(typeFilter!=='all'&&v.voucher_type!==typeFilter)return false;
    if(dateFilter&&v.voucher_date!==dateFilter)return false;
    if(statusFilter!=='all'&&v.status!==statusFilter)return false;
    const source=sourceLabel(v);
    if(sourceFilter!=='all'&&source!==sourceFilter)return false;
    if(!search)return true;
    const haystack=[
      v.voucher_no,v.voucher_type,v.voucher_date,v.party_name,v.account_name,
      v.reference,v.description,v.status,source
    ].map(x=>String(x??'').toLowerCase()).join(' ');
    return haystack.includes(search);
  });

  $('voucherCount').textContent=filtered.length+' of '+voucherRecords.length+' vouchers';
  $('voucherSearchSummary').textContent=filtered.length===voucherRecords.length
    ? 'সব Voucher দেখানো হচ্ছে'
    : filtered.length+'টি Voucher filter অনুযায়ী পাওয়া গেছে';

  $('voucherRows').innerHTML=filtered.map(v=>'<tr><td><strong>'+esc(v.voucher_no)+'</strong></td><td>'+esc(v.voucher_date)+'</td><td>'+esc(v.voucher_type)+'</td><td>৳'+money(v.amount)+'</td><td>'+esc(v.party_name||'—')+'</td><td><span class="voucher-source">'+esc(sourceLabel(v))+'</span></td><td>'+esc(v.status)+'</td><td><a class="quick-link" target="_blank" rel="noopener" href="'+voucherPrintHref(v)+'">Print</a></td></tr>').join('')||'<tr><td colspan="8">এই filter অনুযায়ী কোনো Voucher পাওয়া যায়নি।</td></tr>';
}
async function refresh(){await Promise.all([loadTransactions(),loadVouchers()]);updateView();}
$('financeForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!canFinanceManage){msg('financeMessage','Income manage permission নেই।','error');return;}msg('financeMessage','Income saving হচ্ছে…');
  const row={transaction_date:$('transactionDate').value,direction:'income',category:$('category').value.trim(),amount:+$('amount').value,account_name:$('accountName').value,reference:$('reference').value.trim()||null,description:$('description').value.trim()};
  const {data,error}=await supabase.from('qa_finance_transactions').insert(row).select('transaction_id').single();
  if(error){console.error(error);msg('financeMessage','Income save করা যায়নি।','error');return;}
  try{const v=await findVoucher(data.transaction_id);if(v)msg('financeMessage','Income সফলভাবে save হয়েছে। Voucher: <strong>'+esc(v.voucher_no)+'</strong> &nbsp; <a class="quick-link" target="_blank" rel="noopener" href="receipt.html?type=voucher&id='+encodeURIComponent(v.voucher_id)+'">Open Voucher</a>','success');else msg('financeMessage','Income save হয়েছে; Voucher এখনো পাওয়া যায়নি।','error');}catch(error){console.error(error);msg('financeMessage','Income save হয়েছে, কিন্তু Voucher link load হয়নি।','error');}
  e.target.reset();$('transactionDate').value=today();await refresh();
});
$('expenseForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!canFinanceManage){msg('expenseMessage','Expense manage permission নেই।','error');return;}msg('expenseMessage','Expense saving হচ্ছে…');
  const row={transaction_date:$('expenseDate').value,direction:'expense',category:$('expenseCategory').value.trim(),amount:+$('expenseAmount').value,account_name:$('expenseAccount').value,reference:$('expenseReference').value.trim()||null,description:$('expenseDescription').value.trim()};
  const {data,error}=await supabase.from('qa_finance_transactions').insert(row).select('transaction_id').single();
  if(error){console.error(error);msg('expenseMessage','Expense save করা যায়নি।','error');return;}
  try{const v=await findVoucher(data.transaction_id);if(v)msg('expenseMessage','Expense সফলভাবে save হয়েছে। Voucher: <strong>'+esc(v.voucher_no)+'</strong> &nbsp; <a class="quick-link" target="_blank" rel="noopener" href="receipt.html?type=voucher&id='+encodeURIComponent(v.voucher_id)+'">Open Voucher</a>','success');else msg('expenseMessage','Expense save হয়েছে; Voucher এখনো পাওয়া যায়নি।','error');}catch(error){console.error(error);msg('expenseMessage','Expense save হয়েছে, কিন্তু Voucher link load হয়নি।','error');}
  e.target.reset();$('expenseDate').value=today();await refresh();
});
$('voucherForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!canVoucherManage){msg('voucherMessage','Vouchers manage permission নেই।','error');return;}msg('voucherMessage','Creating voucher…');
  const row={voucher_type:$('voucherType').value,voucher_date:$('voucherDate').value,amount:+$('voucherAmount').value,account_name:$('voucherAccount').value,party_name:$('partyName').value.trim(),reference:$('voucherReference').value.trim()||null,description:$('voucherDescription').value.trim()};
  const {data,error}=await supabase.from('qa_vouchers').insert(row).select('voucher_id,voucher_no').single();
  if(error){console.error(error);msg('voucherMessage','Voucher save করা যায়নি।','error');return;}
  msg('voucherMessage','Voucher তৈরি হয়েছে: <strong>'+esc(data.voucher_no)+'</strong> &nbsp; <a class="quick-link" target="_blank" rel="noopener" href="receipt.html?type=voucher&id='+encodeURIComponent(data.voucher_id)+'">Open Voucher</a>','success');setAccordion('toggleManualVoucher','manualVoucherBody','Open Manual Voucher','Close Manual Voucher',false);
  e.target.reset();$('voucherDate').value=today();await refresh();
});
$('toggleIncomeEntry')?.addEventListener('click',()=>{const open=$('toggleIncomeEntry').getAttribute('aria-expanded')!=='true';setAccordion('toggleIncomeEntry','incomeEntryBody','Open New Income','Close New Income',open);});
$('toggleExpenseEntry')?.addEventListener('click',()=>{const open=$('toggleExpenseEntry').getAttribute('aria-expanded')!=='true';setAccordion('toggleExpenseEntry','expenseEntryBody','Open New Expense','Close New Expense',open);});
$('toggleManualVoucher')?.addEventListener('click',()=>{if(!canVoucherManage)return;const open=$('toggleManualVoucher').getAttribute('aria-expanded')!=='true';setAccordion('toggleManualVoucher','manualVoucherBody','Open Manual Voucher','Close Manual Voucher',open);if(open){$('voucherDate').value=today();setTimeout(()=>$('voucherAmount')?.focus(),0);}});
['voucherSearch','voucherTypeFilter','voucherDateFilter','voucherSourceFilter','voucherStatusFilter'].forEach(id=>{
  $(id)?.addEventListener('input',renderVoucherRows);
  $(id)?.addEventListener('change',renderVoucherRows);
});
$('clearVoucherSearch')?.addEventListener('click',()=>{
  if($('voucherSearch'))$('voucherSearch').value='';
  if($('voucherTypeFilter'))$('voucherTypeFilter').value='all';
  if($('voucherDateFilter'))$('voucherDateFilter').value='';
  if($('voucherSourceFilter'))$('voucherSourceFilter').value='all';
  if($('voucherStatusFilter'))$('voucherStatusFilter').value='all';
  renderVoucherRows();
});
$('signOut').addEventListener('click',async()=>{await supabase.auth.signOut();location.replace('./')});
window.addEventListener('hashchange',updateView);
async function init(){
  access=await getAccess(supabase);if(!access){await supabase.auth.signOut();location.replace('./');return;}
  canFinanceView=access.can('finance.view')||access.can('finance.manage');canFinanceManage=access.can('finance.manage');canVoucherView=access.can('vouchers.view')||access.can('vouchers.manage');canVoucherManage=access.can('vouchers.manage');
  $('transactionDate').value=today();$('expenseDate').value=today();$('voucherDate').value=today();
  if(!canFinanceView&&!canVoucherView){$('loading').textContent='Finance/Voucher module-এর permission আপনার account-এ নেই।';return;}
  $('loading').classList.add('hidden');$('app').classList.remove('hidden');setFormEnabled('financeForm',false);setFormEnabled('expenseForm',false);setFormEnabled('voucherForm',false);
  try{await refresh()}catch(error){console.error(error);msg('financeMessage','Finance/Voucher data load করা যায়নি।','error')}
}
init();