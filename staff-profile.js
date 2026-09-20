// Temporary Vercel preview deployment trigger: assignment test.
import{createClient}from'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';import{getAccess}from'./authz.js';
const c=window.QURANER_ALO_CONFIG,supabase=createClient(c.supabaseUrl,c.supabasePublishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}}),$=id=>document.getElementById(id);
const qs=new URLSearchParams(location.search),type=qs.get('type')==='teacher'?'teacher':'helper',id=qs.get('id');let access=null,row=null,editing=false,allAssignedStudents=[];
const msg=(t,k='')=>{$('message').textContent=t;$('message').className=`message-inline ${k}`.trim()};
const canView=()=>access?.can(type==='teacher'?'teachers.view':'staff.view');
const canManage=()=>access?.can(type==='teacher'?'teachers.manage':'staff.manage');
function normalizeWaNumber(value){const digits=String(value||'').trim().replace(/[^0-9]/g,'');if(!digits)return '';return digits.startsWith('00')?digits.slice(2):digits.startsWith('0')?'88'+digits:digits;}
function setWhatsAppLink(phone){const btn=$('whatsappBtn');if(!btn)return;const digits=normalizeWaNumber(phone);if(!digits){btn.href='#';btn.classList.add('is-disabled');btn.setAttribute('aria-disabled','true');btn.title='এই profile-এর WhatsApp number সংরক্ষিত নেই।';btn.onclick=e=>e.preventDefault();return;}btn.href='https://wa.me/'+digits;btn.classList.remove('is-disabled');btn.removeAttribute('aria-disabled');btn.removeAttribute('title');btn.onclick=null;}
function setInputs(on){['fullName','fullNameBn','phone','email','specialization','joiningDate','active','notes','fatherName','motherName','nidNumber','address'].forEach(x=>{if($(x))$(x).disabled=!on})}
function updateContext(){
  const teacher=type==='teacher';
  $('topBack').href=`staff.html#${teacher?'teachers':'helpers'}`;
  $('topBack').textContent=teacher?'Teacher List':'Helper List';
  $('backBtn').href=`staff.html#${teacher?'teachers':'helpers'}`;
  $('title').textContent=teacher?'Teacher Profile':'Helper Profile';
  $('modeBadge').textContent='View mode';
  $('specialWrap').classList.toggle('hidden',!teacher);
  $('bnWrap').classList.toggle('hidden',!teacher);
}
function fill(){
  const teacher=type==='teacher';
  $('code').value=teacher?row.teacher_code:row.staff_code;
  $('fullName').value=row.full_name||'';
  $('fullNameBn').value=row.full_name_bn||'';
  $('phone').value=row.phone||'';
  $('email').value=row.email||'';
  $('specialization').value=teacher?row.specialization||'':'';
  $('fatherName').value=row.father_name||'';
  $('motherName').value=row.mother_name||'';
  $('nidNumber').value=row.nid_number||'';
  $('address').value=row.address||'';
  $('joiningDate').value=row.joining_date||'';
  $('active').value=String(row.active!==false);
  $('notes').value=row.notes||'';
  $('subtitle').textContent=`${teacher?'Teacher':'Helper'} ID: ${teacher?row.teacher_code:row.staff_code}`;
  setWhatsAppLink(row.phone);
}

async function loadTeacherAssignments(){
  if(type!=='teacher')return;
  if(!canManage())return;
  $('teacherStudentsCard')?.classList.remove('hidden');
  const {data:students,error}=await supabase.from('qa_students').select('student_id,student_code,full_name,phone,status,teacher_id').order('full_name',{ascending:true});
  if(error)throw error;
  allAssignedStudents=students||[];
  const teacherIds=[...new Set(allAssignedStudents.map(x=>x.teacher_id).filter(Boolean))];
  let teacherMap={};
  if(teacherIds.length){
    const {data:ts,error:te}=await supabase.from('qa_teachers').select('teacher_id,full_name,full_name_bn,active').in('teacher_id',teacherIds);
    if(te)throw te;
    teacherMap=Object.fromEntries((ts||[]).map(x=>[x.teacher_id,x]));
  }
  $('studentPicker').innerHTML=allAssignedStudents.map(st=>{
    const assignedTo=st.teacher_id&&st.teacher_id!==id?teacherMap[st.teacher_id]:null;
    const label=(st.full_name||st.student_code||st.student_id)+(st.student_code?' · '+st.student_code:'')+(assignedTo?' — বর্তমানে '+(assignedTo.full_name_bn||assignedTo.full_name||'অন্য Teacher'):'');
    const selected=st.teacher_id===id?' selected':'';
    return '<option value="'+esc(st.student_id)+'"'+selected+'>'+esc(label)+'</option>';
  }).join('')||'<option disabled>কোনো Student পাওয়া যায়নি</option>';
  $('studentPicker').disabled=!canManage();
  $('saveStudentAssignmentsBtn').classList.toggle('hidden',!canManage());
  $('teacherStudentsBadge').textContent=canManage()?'Assignment editable':'View only';
  const current=allAssignedStudents.filter(st=>st.teacher_id===id);
  $('assignedStudentsList').innerHTML=current.map(st=>{
    const phone=normalizeWaNumber(st.phone);
    const wa=phone?'<a class="whatsapp-btn" href="https://wa.me/'+phone+'" target="_blank" rel="noopener noreferrer">WhatsApp</a>':'<span class="badge">ফোন নেই</span>';
    return '<div class="staff-assignment-row"><div><strong>'+esc(st.full_name||st.student_code||'Student')+'</strong><small>'+esc(st.student_code||'—')+' · '+esc(st.status||'—')+'</small></div><div>'+wa+'</div></div>';
  }).join('')||'<div class="portal-empty">এখনো কোনো Student assigned নেই।</div>';
}
async function saveTeacherAssignments(){
  if(type!=='teacher'||!canManage())throw new Error('Teacher student assignment permission নেই।');
  const picker=$('studentPicker');
  const selectedIds=[...picker.selectedOptions].map(o=>o.value).filter(Boolean);
  const selectedSet=new Set(selectedIds);
  const current=allAssignedStudents.filter(st=>st.teacher_id===id);
  const conflicts=allAssignedStudents.filter(st=>selectedSet.has(st.student_id)&&st.teacher_id&&st.teacher_id!==id);
  if(conflicts.length){
    const names=conflicts.slice(0,5).map(st=>st.full_name||st.student_code).join(', ');
    const suffix=conflicts.length>5?' এবং আরও '+(conflicts.length-5)+' জন':'';
    const ok=window.confirm(names+suffix+' বর্তমানে অন্য Teacher-এর কাছে assigned।\n\nSelected করলে তাদের বর্তমান assignment পরিবর্তন হয়ে এই Teacher-এর কাছে চলে আসবে।\n\nচালিয়ে যেতে OK চাপুন।');
    if(!ok)return;
  }
  const removeIds=current.filter(st=>!selectedSet.has(st.student_id)).map(st=>st.student_id);
  if(removeIds.length){
    const {error}=await supabase.from('qa_students').update({teacher_id:null}).in('student_id',removeIds);
    if(error)throw error;
  }
  if(selectedIds.length){
    const {error}=await supabase.from('qa_students').update({teacher_id:id}).in('student_id',selectedIds);
    if(error)throw error;
  }
  $('assignmentMessage').textContent='Student assignment updated.';
  $('assignmentMessage').className='message-inline success';
  await loadTeacherAssignments();
}
function syncMode(){
  const canEdit=editing&&canManage();
  setInputs(canEdit);
  $('modeBadge').textContent=canEdit?'Edit mode':'View mode';
  $('editBtn').classList.toggle('hidden',editing||!canManage());
  $('removeBtn').classList.toggle('hidden',editing||!canManage());
  $('saveBtn').classList.toggle('hidden',!editing);
  $('cancelBtn').classList.toggle('hidden',!editing);
}
async function load(){
  if(!id)throw Error('Profile ID সঠিক নয়।');
  updateContext();
  const table=type==='teacher'?'qa_teachers':'qa_staff';
  const fields=type==='teacher'
    ?'teacher_id,teacher_code,full_name,full_name_bn,phone,email,specialization,father_name,mother_name,nid_number,address,joining_date,active,notes,user_id'
    :'staff_id,staff_code,full_name,phone,email,father_name,mother_name,nid_number,address,joining_date,active,notes,user_id';
  const{data,error}=await supabase.from(table).select(fields).eq(type==='teacher'?'teacher_id':'staff_id',id).maybeSingle();
  if(error)throw error;
  if(!data)throw Error('Profile পাওয়া যায়নি।');
  row=data;
  fill();
  syncMode();
  if(type==='teacher') await loadTeacherAssignments();
}
$('saveStudentAssignmentsBtn')?.addEventListener('click',async()=>{const btn=$('saveStudentAssignmentsBtn');btn.disabled=true;$('assignmentMessage').textContent='Saving…';$('assignmentMessage').className='message-inline';try{await saveTeacherAssignments();}catch(e){console.error(e);$('assignmentMessage').textContent=e.message||'Student assignment save করা যায়নি।';$('assignmentMessage').className='message-inline error';}finally{btn.disabled=false;}});
$('editBtn').onclick=()=>{editing=true;msg('');syncMode()};
$('cancelBtn').onclick=async()=>{editing=false;msg('');await load()};
$('form').onsubmit=async e=>{
  e.preventDefault();
  if(!canManage())return msg(`${type==='teacher'?'Teacher':'Helper'} edit permission নেই।`,'error');
  $('saveBtn').disabled=true;msg('Saving…');
  const payload={full_name:$('fullName').value.trim(),phone:$('phone').value.trim(),email:$('email').value.trim(),father_name:$('fatherName').value.trim(),mother_name:$('motherName').value.trim(),nid_number:$('nidNumber').value.trim(),address:$('address').value.trim(),joining_date:$('joiningDate').value||null,active:$('active').value==='true',notes:$('notes').value.trim()};
  if(type==='teacher'){payload.full_name_bn=$('fullNameBn').value.trim();payload.specialization=$('specialization').value.trim()||null}
  try{
    const{error}=await supabase.from(type==='teacher'?'qa_teachers':'qa_staff').update(payload).eq(type==='teacher'?'teacher_id':'staff_id',id);
    if(error)throw error;
    editing=false;await load();msg('Profile updated successfully.','success');
  }catch(e){console.error(e);msg(e.message||'Profile update করা যায়নি।','error')}finally{$('saveBtn').disabled=false}
};
$('removeBtn').onclick=async()=>{
  if(!canManage()){msg(`${type==='teacher'?'Teacher':'Helper'} remove permission নেই।`,'error');return}
  const name=row?.full_name|| (type==='teacher'?row?.teacher_code:row?.staff_code)||'এই profile';
  const label=type==='teacher'?'Teacher':'Helper';
  const ok=window.confirm(`আপনি কি "${name}"-এর ${label} profile remove করতে চান?\n\nProfile স্থায়ীভাবে delete করা হবে না। Record-এর Active status বন্ধ করা হবে, ফলে এটি list-এ আর দেখাবে না। পুরোনো payroll, portal এবং অন্যান্য history database-এ সংরক্ষিত থাকবে।\n\nনিশ্চিত করতে OK চাপুন।`);
  if(!ok)return;
  $('removeBtn').disabled=true;msg('Removing profile…');
  try{
    const{error}=await supabase.from(type==='teacher'?'qa_teachers':'qa_staff').update({active:false}).eq(type==='teacher'?'teacher_id':'staff_id',id);
    if(error)throw error;
    location.replace(`staff.html#${type==='teacher'?'teachers':'helpers'}`);
  }catch(e){console.error(e);msg(e?.message||'Profile remove করা যায়নি।','error');$('removeBtn').disabled=false}
};
$('signOut').onclick=async()=>{await supabase.auth.signOut();location.replace('./')};
(async()=>{
  try{
    access=await getAccess(supabase);
    if(!access){await supabase.auth.signOut();return location.replace('./')}
    if(!canView()&&!canManage())throw Error('Profile দেখার permission নেই।');
    $('loading').classList.add('hidden');$('app').classList.remove('hidden');await load();
  }catch(e){console.error(e);$('loading').classList.add('hidden');$('errorBox').textContent=e.message||'Profile load করা যায়নি।';$('errorBox').classList.remove('hidden')}
})();