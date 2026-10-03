import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {getAccess} from './authz.js';
import {readAll} from './ui-data.js?v=20261001-fixes2';
import {searchableSelect} from './ui-forms.js?v=20261001-fixes2';
import {locale,t} from './ui-i18n.js?v=20261001-fixes2';
const $=id=>document.getElementById(id),config=window.QURANER_ALO_CONFIG,db=createClient(config.supabaseUrl,config.supabasePublishableKey);
if(new URLSearchParams(location.search).get('embed')==='1')document.body.classList.add('qa-id-embedded');
const roles={student:['qa_students','student_id','student_code','students','Student'],teacher:['qa_teachers','teacher_id','teacher_code','teachers','Teacher'],helper:['qa_staff','staff_id','staff_code','staff','Helper']};
const kinds=[['completion','Course Completion Certificate','কোর্স সমাপ্তির সনদ'],['academic','Academic Achievement Certificate','শিক্ষাগত অর্জনের সনদ'],['testimonial','Testimonial','প্রশংসাপত্র'],['character','Character Certificate','চারিত্রিক সনদ'],['transfer','Transfer Certificate','ছাড়পত্র'],['status','Student Status Certificate','অধ্যয়নরত শিক্ষার্থীর প্রত্যয়নপত্র'],['attendance','Attendance Certificate','উপস্থিতির সনদ'],['participation','Participation Certificate','অংশগ্রহণের সনদ'],['appreciation','Certificate of Appreciation','সম্মাননা সনদ'],['experience','Experience Certificate','অভিজ্ঞতার সনদ'],['custom','Other Certificate','অন্যান্য সনদ']];
let people=[],school={},loadToken=0,access=null,rolesAllowed=[],previewData=null,numberRequest=0,numberIsAutomatic=true,recordsPage=0,recordsCount=0,recordsLoadToken=0,recordsTimer=null;
const bn=()=>$('certificateLanguage').value==='bn',name=p=>bn()?(p.full_name_bn||p.full_name):(p.full_name||p.full_name_bn),node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e};
function message(id,text,error=false){const e=$(id);e.textContent=text||'';e.classList.toggle('hidden',!text);e.classList.toggle('error-box',Boolean(text&&error))}
function canManageRole(value){const r=roles[value];return Boolean(r&&access?.can(r[3]+'.manage'))}
function clearPreviewState(){previewData=null;$('issueCertificate').classList.add('hidden');$('issueCertificate').disabled=false;message('certificateMessage','')}
function invalidate(){ $('printCertificate').disabled=true;$('certificatePreview').classList.add('hidden');clearPreviewState() }
async function getNextNumber(){
  const token=++numberRequest;
  const role=$('certificateRole').value,year=Number(($('certificateDate').value||'').slice(0,4));
  if(!canManageRole(role)||!Number.isInteger(year)||year<2000||year>9999){$('certificateNumber').value='';return}
  $('certificateNumber').value='';
  const {data,error}=await db.rpc('qa_next_certificate_number',{p_issue_year:year,p_recipient_type:role});
  if(token!==numberRequest)return;
  if(error){message('certificateMessage',t('Unable to generate certificate number.'),true);return}
  if(numberIsAutomatic)$('certificateNumber').value=data||'';
  message('certificateMessage','');
}
async function load(){
  const token=++loadToken;
  invalidate();
  $('certificatePerson').replaceChildren(node('option',''));
  const role=$('certificateRole').value,r=roles[role],fields=role==='student'?',gender,date_of_birth,admission_date,father_name,mother_name,birth_registration_no':'';
  if(!r)return;
  const {data,error}=await readAll(()=>db.from(r[0]).select(r[1]+','+r[2]+',full_name,full_name_bn'+fields).order(r[1]));
  if(token!==loadToken)return;
  if(error){message('errorBox',t('Unable to load students.'),true);return}
  people=data||[];
  for(const p of people){const o=node('option',(p.full_name||'')+' · '+(p.full_name_bn||'')+' · '+p[r[2]]);o.value=p[r[1]];$('certificatePerson').append(o)}
  $('certificatePerson').dispatchEvent(new Event('change'));
  updateTypes();
  if(numberIsAutomatic)await getNextNumber();
}
function schoolSnapshot(){return {name_bn:school.name_bn||'কোরআনের আলো',name_en:school.name_en||'QURANER ALO',address:school.address||'',phone:school.phone||'',logo_path:school.logo_path||'assets/quraner-alo-logo.jpg'}}
function renderCertificate(data){
  const box=$('certificatePreview'),snap=data.school_snapshot||schoolSnapshot(),isBn=data.language==='bn';
  box.replaceChildren();box.lang=isBn?'bn':'en';
  const head=node('header'),logo=node('img');logo.src=snap.logo_path||'assets/quraner-alo-logo.jpg';logo.alt='';
  const schoolText=node('div');schoolText.append(node('h2',isBn?(snap.name_bn||snap.name_en):(snap.name_en||snap.name_bn)),node('p',[snap.address,snap.phone].filter(Boolean).join(' · ')));
  head.append(logo,schoolText);
  const meta=node('div',null,'certificate-meta');
  meta.append(node('span',(isBn?'সনদ নম্বর: ':'Certificate No: ')+(data.certificate_number||'')),node('span',(isBn?'তারিখ: ':'Date: ')+data.issue_date));
  if(data.manual_reference)meta.append(node('span',(isBn?'রেফারেন্স: ':'Reference: ')+data.manual_reference));
  box.append(head,meta,node('h1',data.certificate_title),node('p',data.recipient_name,'certificate-name'),node('p',data.recipient_code||'','certificate-code'),node('p',data.certificate_text,'certificate-body'),node('footer',[data.authorized_signatory,isBn?'অনুমোদনকারী কর্তৃপক্ষ':'Authorized Signatory'].filter(Boolean).join('\n')));
  box.classList.remove('hidden');$('printCertificate').disabled=false;
}
function buildPreview(){
  const role=$('certificateRole').value,r=roles[role],p=people.find(x=>x[r[1]]===$('certificatePerson').value);
  if(!p)return null;
  return {
    certificate_number:$('certificateNumber').value.trim(),
    manual_reference:$('certificateReference').value.trim()||null,
    recipient_type:role,recipient_id:p[r[1]],recipient_code:p[r[2]],
    recipient_name:name(p),certificate_type:$('certificateType').value,
    certificate_title:$('certificateType').selectedOptions[0]?.textContent||$('certificateType').value,
    issue_date:$('certificateDate').value,certificate_text:$('certificateText').value.trim(),
    language:bn()?'bn':'en',authorized_signatory:$('certificateSigner').value.trim(),
    school_snapshot:schoolSnapshot()
  };
}
function setTab(which){
  const generate=which==='generate';
  $('generatePanel').classList.toggle('hidden',!generate);$('generatePanel').hidden=!generate;
  $('recordsPanel').classList.toggle('hidden',generate);$('recordsPanel').hidden=generate;
  $('generateTab').classList.toggle('active',generate);$('recordsTab').classList.toggle('active',!generate);
  $('generateTab').setAttribute('aria-selected',String(generate));$('recordsTab').setAttribute('aria-selected',String(!generate));
  if(!generate){invalidate();loadRecords()}
}
const pageSize=20;
function filterYearOptions(){
  const select=$('recordsYear'),today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Dhaka'}),current=Number(today.slice(0,4));
  for(let year=current;year>=2000;year--){const o=node('option',String(year));o.value=String(year);select.append(o)}
}
function filterTypeOptions(){
  const select=$('recordsType');
  for(const role of rolesAllowed){const o=node('option',t(roles[role][4]));o.value=role;select.append(o)}
}
function safeSearchValue(value){return '"%'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'%"'}
async function loadRecords(){
  const token=++recordsLoadToken,term=$('recordsSearch').value.trim(),role=$('recordsType').value,year=$('recordsYear').value;
  let query=db.from('qa_certificates').select('certificate_id,certificate_number,manual_reference,recipient_type,recipient_id,recipient_code,recipient_name,certificate_type,certificate_title,issue_date',{count:'exact'});
  if(role)query=query.eq('recipient_type',role);
  if(year)query=query.gte('issue_date',year+'-01-01').lt('issue_date',String(Number(year)+1)+'-01-01');
  if(term){const v=safeSearchValue(term);query=query.or(['certificate_number','manual_reference','recipient_name','recipient_code'].map(c=>c+'.ilike.'+v).join(','))}
  const from=recordsPage*pageSize;
  const {data,error,count}=await query.order('issue_date',{ascending:false}).order('created_at',{ascending:false}).range(from,from+pageSize-1);
  if(token!==recordsLoadToken)return;
  if(error){message('recordsMessage',t('Certificate records could not be loaded.'),true);$('recordsBody').replaceChildren();$('recordsSummary').textContent='';return}
  recordsCount=count||0;
  message('recordsMessage','');
  $('recordsSummary').textContent=String(recordsCount)+' · '+t('Certificate Records');
  const body=$('recordsBody');body.replaceChildren();
  if(!data?.length){const row=node('tr'),cell=node('td',t('No certificate records found.'));cell.colSpan=6;row.append(cell);body.append(row)}
  for(const record of data||[]){
    const row=node('tr');
    for(const value of [record.certificate_number,record.manual_reference||'—',record.recipient_name+' · '+record.recipient_code,t(roles[record.recipient_type]?.[4]||record.recipient_type)+' · '+record.certificate_title,displayDate(record.issue_date)])row.append(node('td',value));
    const actions=node('td',null,'certificate-row-actions');
    const view=node('button',t('View'),'secondary-btn');view.type='button';view.addEventListener('click',()=>viewRecord(record.certificate_id));
    const edit=node('button',t('Change number'),'secondary-btn');edit.type='button';edit.disabled=!canManageRole(record.recipient_type);edit.addEventListener('click',()=>changeNumber(record));
    actions.append(view,edit);row.append(actions);body.append(row);
  }
  const pages=Math.max(1,Math.ceil(recordsCount/pageSize));
  $('recordsPage').textContent=(recordsPage+1)+' / '+pages;
  $('recordsPrev').disabled=recordsPage===0;$('recordsNext').disabled=(recordsPage+1)>=pages;
}
async function viewRecord(certificateId){
  const {data,error}=await db.from('qa_certificates').select('certificate_number,manual_reference,recipient_type,recipient_id,recipient_code,recipient_name,certificate_type,certificate_title,issue_date,certificate_text,language,authorized_signatory,school_snapshot').eq('certificate_id',certificateId).maybeSingle();
  if(error||!data){message('recordsMessage',t('Certificate records could not be loaded.'),true);return}
  renderCertificate(data);
}
async function changeNumber(record){
  const next=window.prompt(t('Enter a new certificate number.'),record.certificate_number);
  if(next===null||!next.trim()||next.trim()===record.certificate_number)return;
  const {error}=await db.from('qa_certificates').update({certificate_number:next.trim()}).eq('certificate_id',record.certificate_id);
  if(error){message('recordsMessage',error.code==='23505'?t('Certificate Number already exists.'):t('Unable to save certificate record.'),true);return}
  message('recordsMessage',t('Certificate record saved.'));
  await loadRecords();
}
async function issueCertificate(){
  if(!previewData?.certificate_number||!canManageRole(previewData.recipient_type))return;
  const button=$('issueCertificate');button.disabled=true;
  const {data,error}=await db.from('qa_certificates').insert(previewData).select('certificate_id').single();
  if(error){button.disabled=false;message('certificateMessage',error.code==='23505'?t('Certificate Number already exists.'):t('Unable to save certificate record.'),true);return}
  button.classList.add('hidden');message('certificateMessage',t('Certificate record saved.'));
  previewData.certificate_id=data.certificate_id;
}
$('certificateRole').onchange=()=>{numberIsAutomatic=true;load()};
$('certificatePerson').addEventListener('change',template);
$('certificateType').onchange=template;
$('certificateLanguage').onchange=()=>{updateTypes();if(previewData){previewData=null}};
$('certificateDate').addEventListener('change',()=>{invalidate();if(numberIsAutomatic)getNextNumber()});
$('certificateNumber').addEventListener('input',()=>{numberIsAutomatic=false;invalidate()});
$('certificateForm').addEventListener('input',e=>{if(e.target.id!=='certificateNumber')invalidate()});
$('certificateForm').onsubmit=e=>{
  e.preventDefault();
  const data=buildPreview();if(!data)return;
  previewData=data;renderCertificate(data);
  const canIssue=canManageRole(data.recipient_type)&&Boolean(data.certificate_number);
  $('issueCertificate').classList.toggle('hidden',!canIssue);
  $('issueCertificate').disabled=false;message('certificateMessage','');
  if(canManageRole(data.recipient_type)&&!data.certificate_number)message('certificateMessage',t('Unable to generate certificate number.'),true);
};
$('issueCertificate').addEventListener('click',issueCertificate);
$('printCertificate').onclick=async()=>{await document.fonts.ready;await Promise.all([...$('certificatePreview').querySelectorAll('img')].map(i=>i.decode().catch(()=>{})));window.print()};
$('generateTab').addEventListener('click',()=>setTab('generate'));
$('recordsTab').addEventListener('click',()=>setTab('records'));
$('recordsSearch').addEventListener('input',()=>{clearTimeout(recordsTimer);recordsTimer=setTimeout(()=>{recordsPage=0;loadRecords()},250)});
$('recordsType').addEventListener('change',()=>{recordsPage=0;loadRecords()});
$('recordsYear').addEventListener('change',()=>{recordsPage=0;loadRecords()});
$('recordsPrev').addEventListener('click',()=>{if(recordsPage>0){recordsPage--;loadRecords()}});
$('recordsNext').addEventListener('click',()=>{if((recordsPage+1)*pageSize<recordsCount){recordsPage++;loadRecords()}});
$('signOut').onclick=async()=>{await db.auth.signOut();location.replace('./')};
(async()=>{
  const formControls=[...$('certificateForm').querySelectorAll('input,select,textarea,button')];
  formControls.forEach(control=>control.disabled=true);
  $('loading').classList.add('hidden');$('app').classList.remove('hidden');
  try{
    access=await getAccess(db);if(!access)throw Error(t('Please sign in'));
    rolesAllowed=Object.entries(roles).filter(([,r])=>access.can(r[3]+'.view')||access.can(r[3]+'.manage')).map(([role])=>role);
    if(!rolesAllowed.length)throw Error(t('No permission'));
    $('certificateRole').replaceChildren(...rolesAllowed.map(role=>{const o=node(t(roles[role][4]));o.value=role;return o}));
    const result=await db.from('qa_app_settings').select('value').eq('key','school_profile').maybeSingle();
    school={name_bn:'কোরআনের আলো',name_en:'QURANER ALO',...result.data?.value};
    $('certificateLanguage').value=locale();
    $('certificateDate').value=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Dhaka'});
    filterYearOptions();filterTypeOptions();
    searchableSelect($('certificatePerson'));
    await load();
    formControls.forEach(control=>control.disabled=false);
  }catch(e){$('loading').classList.add('hidden');$('errorBox').textContent=e.message;$('errorBox').classList.remove('hidden')}
})();
