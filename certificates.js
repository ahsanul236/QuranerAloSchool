import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {getAccess} from './authz.js';
import {readAll} from './ui-data.js?v=20261001-fixes2';
import {searchableSelect} from './ui-forms.js?v=20261003-documents8';
import {locale,t,setLanguage,refreshTranslations} from './ui-i18n.js?v=20261001-fixes2';
const $=id=>document.getElementById(id),config=window.QURANER_ALO_CONFIG,db=createClient(config.supabaseUrl,config.supabasePublishableKey);
if(new URLSearchParams(location.search).get('embed')==='1')document.body.classList.add('qa-id-embedded');
const roles={student:['qa_students','student_id','student_code','students','Student'],teacher:['qa_teachers','teacher_id','teacher_code','teachers','Teacher'],helper:['qa_staff','staff_id','staff_code','staff','Helper']};
const kinds=[['completion','Course Completion Certificate','কোর্স সমাপ্তির সনদ'],['academic','Academic Achievement Certificate','শিক্ষাগত অর্জনের সনদ'],['testimonial','Testimonial','প্রশংসাপত্র'],['character','Character Certificate','চারিত্রিক সনদ'],['transfer','Transfer Certificate','ছাড়পত্র'],['status','Student Status Certificate','অধ্যয়নরত শিক্ষার্থীর প্রত্যয়নপত্র'],['attendance','Attendance Certificate','উপস্থিতির সনদ'],['participation','Participation Certificate','অংশগ্রহণের সনদ'],['appreciation','Certificate of Appreciation','সম্মাননা সনদ'],['experience','Experience Certificate','অভিজ্ঞতার সনদ'],['custom','Other Certificate','অন্যান্য সনদ']];
let people=[],school={name_bn:'কোরআনের আলো',name_en:'QURANER ALO'},lastTemplate='',loadToken=0,access=null,rolesAllowed=[],previewData=null,numberRequest=0,numberIsAutomatic=true,recordsPage=0,recordsCount=0,recordsLoadToken=0,recordsTimer=null;
const bn=()=>$('certificateLanguage').value==='bn',name=p=>bn()?(p.full_name_bn||p.full_name):(p.full_name||p.full_name_bn),node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e};
function updateTypes(regenerate=true){const old=$('certificateType').value,staff=$('certificateRole').value!=='student';$('certificateType').replaceChildren(...kinds.filter(k=>staff?['experience','character','participation','appreciation','custom'].includes(k[0]):k[0]!=='experience').map(k=>{const o=node('option',k[locale()==='bn'?2:1]);o.value=k[0];return o}));if([...$('certificateType').options].some(o=>o.value===old))$('certificateType').value=old;if(regenerate)template()}
function displayDate(value){if(!value)return '';const date=new Date(value+'T00:00:00');return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat(bn()?'bn-BD':'en-GB',{day:'numeric',month:'long',year:'numeric'}).format(date)}
function studentFacts(p){const gender=p.gender==='female'?'daughter':p.gender==='male'?'son':'child',genderBn=p.gender==='female'?'কন্যা':p.gender==='male'?'পুত্র':'সন্তান',father=p.father_name?.trim(),mother=p.mother_name?.trim(),parents=bn()?`পিতা/অভিভাবক: ${father||'[পিতার/অভিভাবকের নাম]'}${mother?' · মাতা: '+mother:''}`:`${gender} of ${father||'[father / guardian name]'}${mother?' and '+mother+' (mother)':''}`;return {gender,genderBn,parents,identityEn:`${gender[0].toUpperCase()+gender.slice(1)} of ${father||'[father / guardian name]'}${mother?' and '+mother+' (mother)':''}; Student ID: ${p.student_code||'[ID]'}; Date of birth: ${displayDate(p.date_of_birth)||'[date of birth]'}; Admission date: ${displayDate(p.admission_date)||'[admission date]'}.`,identityBn:`${father?'পিতা/অভিভাবক '+father+'-এর ':'[পিতার/অভিভাবকের নাম]'}${genderBn}${mother?', মাতা '+mother:''}; শিক্ষার্থী আইডি: ${p.student_code||'[আইডি]'}; জন্মতারিখ: ${displayDate(p.date_of_birth)||'[জন্মতারিখ]'}; ভর্তির তারিখ: ${displayDate(p.admission_date)||'[ভর্তির তারিখ]'}।`}}
function template(){invalidate();const role=roles[$('certificateRole').value],person=role&&people.find(p=>p[role[1]]===$('certificatePerson').value);if(!person){$('certificateText').value=lastTemplate='';return}const who=name(person),schoolName=bn()?school.name_bn:school.name_en,student=$('certificateRole').value==='student',facts=student?studentFacts(person):null,kind=$('certificateType').value;const en={completion:`This is to certify that ${who}, ${facts?.identityEn||''} successfully completed [course / study program] at ${schoolName} on [completion date]. Result / remarks: [verified details].`,academic:`This certificate is awarded to ${who}${facts?`, ${facts.identityEn}`:''} in recognition of [examination / achievement], [result / grade], during [academic year].`,testimonial:`This is to certify that ${who}${facts?`, ${facts.identityEn}`:''} studied at ${schoolName} in [class / group] during [academic session]. Conduct: [verified remarks]. Issued for: [purpose].`,character:`This is to certify that ${who}${facts?`, ${facts.identityEn}`:''} attended ${schoolName} from [start date] to [end date] in [class / group]. Conduct: [verified remarks].`,transfer:`Transfer certificate for ${who}${facts?`, ${facts.identityEn}`:''}. Class / group last attended: [class / group]; last attendance date: [date]; leaving reason: [reason]; conduct: [verified remarks].`,status:`This certifies that ${who}${facts?`, ${facts.identityEn}`:''} is currently enrolled at ${schoolName} in [class / group] for the [academic session]. Issued for: [purpose].`,attendance:`Attendance certificate for ${who}${facts?`, ${facts.identityEn}`:''} in [class / group] during [period]: [days present] of [working days] ([percentage]%).`,participation:`This certifies that ${who}${facts?`, ${facts.identityEn}`:''} participated in [event / activity] on [date] as [role / category]. Achievement: [verified details].`,appreciation:`This certificate is presented to ${who}${facts?`, ${facts.identityEn}`:''} in recognition of [verified contribution / achievement] at ${schoolName}.`,experience:`This is to certify that ${who} worked / has worked at ${schoolName} as [role] from [start date] to [end date]. Service details: [verified responsibilities / remarks].`,custom:`Certificate for ${who}${facts?`, ${facts.identityEn}`:''}. Purpose and details: [enter verified information].`};const bnText={completion:`এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, ${who} ${facts?.identityBn||''} ${schoolName}-এ [কোর্স / শিক্ষাক্রম]-এ অধ্যয়ন করে [সমাপ্তির তারিখ]-এ সফলভাবে সম্পন্ন করেছেন। ফলাফল / মন্তব্য: [যাচাইকৃত তথ্য]।`,academic:`${who}${facts?' ('+facts.identityBn+')':''}-কে [পরীক্ষা / অর্জন], [ফলাফল / গ্রেড] এবং [শিক্ষাবর্ষ]-এর স্বীকৃতিস্বরূপ এই সনদ প্রদান করা হলো।`,testimonial:`এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, ${who}${facts?' ('+facts.identityBn+')':''} ${schoolName}-এ [শ্রেণি / গ্রুপ]-এ [শিক্ষাবর্ষ]-এ অধ্যয়ন করেছেন। আচরণ: [যাচাইকৃত মন্তব্য]। সনদ প্রদানের কারণ: [উদ্দেশ্য]।`,character:`এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, ${who}${facts?' ('+facts.identityBn+')':''} ${schoolName}-এ [শুরুর তারিখ] থেকে [শেষ তারিখ] পর্যন্ত [শ্রেণি / গ্রুপ]-এ অধ্যয়ন করেছেন। আচরণ: [যাচাইকৃত মন্তব্য]।`,transfer:`${who}${facts?' ('+facts.identityBn+')':''}-এর ছাড়পত্র। সর্বশেষ শ্রেণি / গ্রুপ: [শ্রেণি / গ্রুপ]; শেষ উপস্থিতির তারিখ: [তারিখ]; ছাড়ার কারণ: [কারণ]; আচরণ: [যাচাইকৃত মন্তব্য]।`,status:`এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, ${who}${facts?' ('+facts.identityBn+')':''} ${schoolName}-এ [শ্রেণি / গ্রুপ]-এ [শিক্ষাবর্ষ]-এ বর্তমানে অধ্যয়নরত আছেন। সনদ প্রদানের উদ্দেশ্য: [উদ্দেশ্য]।`,attendance:`${who}${facts?' ('+facts.identityBn+')':''}-এর [সময়সীমা]-এর উপস্থিতির সনদ: [মোট কার্যদিবস]-এর মধ্যে [উপস্থিতির দিন] ([শতাংশ]%)। শ্রেণি / গ্রুপ: [লিখুন]।`,participation:`এই মর্মে সনদ দেওয়া যাচ্ছে যে, ${who}${facts?' ('+facts.identityBn+')':''} [তারিখ]-এ [অনুষ্ঠান / কার্যক্রম]-এ [ভূমিকা / বিভাগ]-এ অংশগ্রহণ করেছেন। অর্জন: [যাচাইকৃত তথ্য]।`,appreciation:`${who}${facts?' ('+facts.identityBn+')':''}-কে ${schoolName}-এ [যাচাইকৃত অবদান / অর্জন]-এর স্বীকৃতিস্বরূপ এই সম্মাননা প্রদান করা হলো।`,experience:`এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, ${who} ${schoolName}-এ [পদ]-এ [শুরুর তারিখ] থেকে [শেষ তারিখ] পর্যন্ত কর্মরত ছিলেন / আছেন। দায়িত্ব / মন্তব্য: [যাচাইকৃত তথ্য]।`,custom:`${who}${facts?' ('+facts.identityBn+')':''}-এর জন্য সনদের উদ্দেশ্য ও বিবরণ লিখুন।`};let text=(bn()?bnText:en)[kind]||'';if(!student&&person[role[2]])text=text.replace(who,who+(bn()?' (আইডি: ':' (ID: ')+person[role[2]]+')');$('certificateText').value=lastTemplate=text}
function message(id,text,error=false){const e=$(id);e.textContent=text||'';e.classList.toggle('hidden',!text);e.classList.toggle('error-box',Boolean(text&&error))}
function canManageRole(value){const r=roles[value];return Boolean(r&&access?.can(r[3]+'.manage'))}
function clearPreviewState(){previewData=null;$('issueCertificate').classList.add('hidden');$('issueCertificate').disabled=false;message('certificateMessage','')}
function invalidate(){ $('printCertificate').disabled=true;$('certificatePreview').classList.add('hidden');$('certificatePreviewFrame').classList.add('hidden');$('certificateFitWarning').classList.add('hidden');clearPreviewState() }
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
  people=[];numberRequest++;
  $('certificatePerson').replaceChildren(node('option',''));
  $('certificatePerson').dispatchEvent(new Event('change'));
  const role=$('certificateRole').value,r=roles[role],fields=role==='student'?',gender,date_of_birth,admission_date,father_name,mother_name,birth_registration_no':'';
  if(!r)return;
  const {data,error}=await readAll(()=>{let query=db.from(r[0]).select(r[1]+','+r[2]+',full_name,full_name_bn'+fields).order(r[1]);return role==='helper'?query.eq('staff_type','helper'):query});
  if(token!==loadToken)return;
  if(error){message('errorBox',t('Unable to load students.'),true);return}
  message('errorBox','');
  people=data||[];
  for(const p of people){const o=node('option',(p.full_name||'')+' · '+(p.full_name_bn||'')+' · '+p[r[2]]);o.value=p[r[1]];$('certificatePerson').append(o)}
  const searchInput=$('qa-search-certificatePerson'),searchTerm=searchInput?.value||'';
  $('certificatePerson').dispatchEvent(new Event('change'));
  if(searchInput&&searchTerm){searchInput.value=searchTerm;searchInput.dispatchEvent(new Event('input',{bubbles:true}))}
  else if(searchInput?.getAttribute('aria-expanded')==='true')searchInput.dispatchEvent(new Event('input',{bubbles:true}));
  updateTypes();
  if(numberIsAutomatic)getNextNumber().catch(error=>{console.error(error);message('certificateMessage',t('Unable to generate certificate number.'),true)});
}
function schoolSnapshot(){return {name_bn:school.name_bn||'কোরআনের আলো',name_en:school.name_en||'QURANER ALO',address:school.address||'',phone:school.phone||'',logo_path:school.logo_path||'assets/quraner-alo-logo.jpg'}}
function renderCertificate(data){
  const box=$('certificatePreview'),snap=data.school_snapshot||schoolSnapshot(),isBn=data.language==='bn';
  box.replaceChildren();box.lang=isBn?'bn':'en';
  const watermark=node('img',null,'certificate-watermark');watermark.src=snap.logo_path||'assets/quraner-alo-logo.jpg';watermark.alt='';watermark.setAttribute('aria-hidden','true');
  const head=node('header'),logo=node('img');logo.src=snap.logo_path||'assets/quraner-alo-logo.jpg';logo.alt='';
  const schoolText=node('div');schoolText.append(node('h2',isBn?(snap.name_bn||snap.name_en):(snap.name_en||snap.name_bn)),node('p',[snap.address,snap.phone].filter(Boolean).join(' · ')));
  head.append(logo,schoolText);
  const meta=node('div',null,'certificate-meta');
  meta.append(node('span',(isBn?'সনদ নম্বর: ':'Certificate No: ')+(data.certificate_number||'')),node('span',(isBn?'তারিখ: ':'Date: ')+data.issue_date));
  if(data.manual_reference)meta.append(node('span',(isBn?'রেফারেন্স: ':'Reference: ')+data.manual_reference));
  box.append(watermark,head,meta,node('h1',data.certificate_title),node('p',data.certificate_text,'certificate-body'),node('footer',[data.authorized_signatory,isBn?'অনুমোদনকারী কর্তৃপক্ষ':'Authorized Signatory'].filter(Boolean).join('\n')));
  box.classList.remove('hidden');$('certificatePreviewFrame').classList.remove('hidden');fitCertificate();
}
function fitCertificate(){
  const box=$('certificatePreview'),frame=$('certificatePreviewFrame');if(box.classList.contains('hidden'))return;
  const scale=Math.min(1,frame.parentElement.clientWidth/box.offsetWidth);
  frame.style.width=(box.offsetWidth*scale)+'px';frame.style.height=(box.offsetHeight*scale)+'px';box.style.transform=`scale(${scale})`;
  const body=box.querySelector('.certificate-body');body.style.fontSize='20px';
  // Keep long text within this single sheet, without altering its page ratio.
  for(let size=20;box.scrollHeight>box.clientHeight+1&&size>11;size-=.5)body.style.fontSize=(size-.5)+'px';
  const fits=box.scrollHeight<=box.clientHeight+1;$('printCertificate').disabled=!fits;
  box.classList.toggle('certificate-overflow',!fits);$('certificateFitWarning').classList.toggle('hidden',fits);
}
new ResizeObserver(fitCertificate).observe($('certificatePreviewFrame').parentElement);
document.fonts.ready.then(fitCertificate);
function buildPreview(){
  const role=$('certificateRole').value,r=roles[role],p=r&&people.find(x=>x[r[1]]===$('certificatePerson').value);
  if(!p)return null;
  return {
    certificate_number:$('certificateNumber').value.trim(),
    manual_reference:$('certificateReference').value.trim()||null,
    recipient_type:role,recipient_id:p[r[1]],recipient_code:p[r[2]],
    recipient_name:name(p),certificate_type:$('certificateType').value,
    certificate_title:kinds.find(k=>k[0]===$('certificateType').value)?.[bn()?2:1]||$('certificateType').value,
    issue_date:$('certificateDate').value,certificate_text:$('certificateText').value.trim(),
    language:bn()?'bn':'en',authorized_signatory:$('certificateSigner').value.trim(),
    school_snapshot:schoolSnapshot()
  };
}
function setTab(which){
  const generate=which==='generate';
  $('generatePanel').classList.toggle('hidden',!generate);$('generatePanel').hidden=!generate;
  $('recordsPanel').classList.toggle('hidden',generate);$('recordsPanel').hidden=generate;
  $('generateTab').classList.toggle('is-active',generate);$('recordsTab').classList.toggle('is-active',!generate);
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
function refreshCertificateLabels(){
  for(const id of ['certificateRole','recordsType'])for(const option of $(id).options){if(roles[option.value])option.textContent=t(roles[option.value][4]);}
  if(roles[$('certificateRole').value])updateTypes(false);
  refreshTranslations();
}
window.addEventListener('qa-language-change',refreshCertificateLabels);
if(new URLSearchParams(location.search).get('embed')==='1'&&window.parent!==window){
  window.parent.addEventListener('qa-language-change',event=>setLanguage(event.detail.language,false));
}
$('certificateRole').onchange=()=>{numberIsAutomatic=true;load().catch(error=>{console.error(error);message('errorBox',t('Unable to load students.'),true)})};
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
  $('loading').classList.add('hidden');$('app').classList.remove('hidden');
  try{
    access=await getAccess(db);if(!access)throw Error(t('Please sign in'));
    rolesAllowed=Object.entries(roles).filter(([,r])=>access.can(r[3]+'.view')||access.can(r[3]+'.manage')).map(([role])=>role);
    if(!rolesAllowed.length)throw Error(t('No permission'));
    $('certificateRole').replaceChildren(...rolesAllowed.map(role=>{const o=node('option',t(roles[role][4]));o.value=role;return o}));
    $('certificateLanguage').value=locale();
    $('certificateDate').value=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Dhaka'});
    filterYearOptions();filterTypeOptions();
    searchableSelect($('certificatePerson'));
    updateTypes();
    load().catch(e=>{console.error(e);message('errorBox',t('Unable to load students.'),true)});
    db.from('qa_app_settings').select('value').eq('key','school_profile').maybeSingle().then(result=>{
      if(result.error)console.warn('School profile could not be loaded:',result.error);
      school={name_bn:'কোরআনের আলো',name_en:'QURANER ALO',...result.data?.value};
      if($('certificatePerson').value&&$('certificateText').value===lastTemplate)template();
    }).catch(error=>console.warn('School profile could not be loaded:',error));
  }catch(e){$('loading').classList.add('hidden');$('errorBox').textContent=e.message;$('errorBox').classList.remove('hidden')}
})();
