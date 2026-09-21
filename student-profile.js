import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {getAccess} from './authz.js';
import {mountDocumentsPanel} from './documents-ui.js?v=20260921-5';

const c=window.QURANER_ALO_CONFIG;
const supabase=createClient(c.supabaseUrl,c.supabasePublishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const studentId=new URLSearchParams(location.search).get('id');
let access=null,student=null,guardians=[],teachers=[],editing=false;

const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]));
const login=()=>location.replace('./');
const msg=(t,type='')=>{$('saveMessage').textContent=t;$('saveMessage').className=`message-inline ${type}`.trim();};

function normalizeWaNumber(value){const digits=String(value||'').trim().replace(/[^0-9]/g,'');if(!digits)return '';return digits.startsWith('00')?digits.slice(2):digits.startsWith('0')?'88'+digits:digits;}
function setWhatsAppLink(phone){const btn=$('whatsappBtn');if(!btn)return;const digits=normalizeWaNumber(phone);if(!digits){btn.href='#';btn.classList.add('is-disabled');btn.setAttribute('aria-disabled','true');btn.title='এই profile-এর WhatsApp number সংরক্ষিত নেই।';btn.onclick=e=>e.preventDefault();return;}btn.href='https://wa.me/'+digits;btn.classList.remove('is-disabled');btn.removeAttribute('aria-disabled');btn.removeAttribute('title');btn.onclick=null;}
async function loadTeachers(){
  if(!access?.can('teachers.view')&&!access?.can('teachers.manage')){renderTeacherAssignment();return;}
  const {data,error}=await supabase.from('qa_teachers').select('teacher_id,teacher_code,full_name,full_name_bn,phone,specialization,active').order('full_name',{ascending:true});
  if(error)throw error;
  teachers=data||[];
  renderTeacherAssignment();
}
function renderTeacherAssignment(){
  const select=$('assignedTeacher');
  const saveBtn=$('saveTeacherBtn');
  const view=$('teacherAssignmentView');
  const editor=$('teacherAssignmentEditor');
  if(!select||!view||!editor)return;
  const canManage=access?.can('students.manage');
  const currentId=student?.teacher_id||'';
  const currentTeacher=teachers.find(t=>t.teacher_id===currentId);
  const currentName=currentTeacher
    ? (currentTeacher.full_name_bn||currentTeacher.full_name||currentTeacher.teacher_code)
    : 'কোনো শিক্ষক নির্ধারিত নেই';
  const currentMeta=currentTeacher
    ? [currentTeacher.teacher_code,currentTeacher.specialization,currentTeacher.active===false?'Inactive':'Active'].filter(Boolean).join(' · ')
    : 'Edit Profile খুলে শিক্ষক নির্বাচন করা যাবে।';
  view.innerHTML='<strong>'+esc(currentName)+'</strong><small style="display:block;margin-top:4px;color:var(--muted)">'+esc(currentMeta)+'</small>';
  const rows=[{teacher_id:'',teacher_code:'',full_name:'কোনো শিক্ষক নেই',full_name_bn:'',active:true},...teachers.filter(t=>t.active!==false||t.teacher_id===currentId)];
  select.innerHTML=rows.map(t=>{
    const name=t.teacher_id?(t.full_name_bn||t.full_name||t.teacher_code):'কোনো শিক্ষক নেই';
    const extra=t.teacher_id&&t.active===false?' (Inactive)':'';
    return '<option value="'+esc(t.teacher_id||'')+'" '+((t.teacher_id||'')===currentId?'selected':'')+'>'+esc(name+extra)+'</option>';
  }).join('');
  editor.classList.toggle('hidden',!(canManage&&editing));
  select.disabled=!(canManage&&editing);
  saveBtn?.classList.toggle('hidden',!(canManage&&editing));
  $('removeTeacherBtn')?.classList.toggle('hidden',!(canManage&&editing&&!!currentId));
  $('teacherAssignmentBadge').textContent=canManage?(editing?'Edit mode':'Edit Profile থেকে পরিবর্তন'):'View only';
  $('teacherAssignmentNote').textContent=canManage
    ? (editing?'Teacher পরিবর্তন করতে নিচের অপশন ব্যবহার করুন।':'Teacher assignment পরিবর্তন করতে আগে Edit Profile খুলুন।')
    : 'এই শিক্ষার্থীর জন্য নির্ধারিত শিক্ষক এখানে দেখা যাবে।';
}
async function saveTeacherAssignment(){
  if(!access?.can('students.manage'))throw new Error('Teacher assignment পরিবর্তনের permission নেই।');
  const teacherId=$('assignedTeacher')?.value||null;
  const {data,error}=await supabase.from('qa_students').update({teacher_id:teacherId}).eq('student_id',studentId).select('student_id,student_code,full_name,gender,date_of_birth,phone,admission_date,status,notes,father_name,father_nid,mother_name,mother_nid,birth_registration_no,user_id,teacher_id,created_at,updated_at').single();
  if(error)throw error;
  student=data;
  const teacher=teachers.find(t=>t.teacher_id===teacherId);
  $('teacherSaveMessage').textContent=teacherId?(teacher?.full_name_bn||teacher?.full_name||'Teacher assigned.'):'Teacher assignment removed.';
  $('teacherSaveMessage').className='message-inline success';
  renderTeacherAssignment();
}

function fillStudent(){
  $('studentCode').value=student.student_code||'';
  $('fullName').value=student.full_name||'';
  $('gender').value=['male','female','unspecified'].includes(student.gender)?student.gender:'unspecified';
  $('dateOfBirth').value=student.date_of_birth||'';
  $('admissionDate').value=student.admission_date||'';
  $('studentPhone').value=student.phone||'';
  $('status').value=['active','inactive','graduated','suspended','withdrawn'].includes(student.status)?student.status:'active';
  $('notes').value=student.notes||'';
  $('fatherName').value=student.father_name||'';
  $('fatherNid').value=student.father_nid||'';
  $('motherName').value=student.mother_name||'';
  $('motherNid').value=student.mother_nid||'';
  $('birthRegistrationNo').value=student.birth_registration_no||'';
  $('profileTitle').textContent=student.full_name||'শিক্ষার্থী প্রোফাইল';
  $('profileSubtitle').textContent=`Student ID: ${student.student_code||'—'} · Status: ${String(student.status||'').replaceAll('_',' ')}`;
  setWhatsAppLink(student.phone);
}

function guardianHtml(g){
  const dis=!(editing&&access?.can('guardians.manage'));
  const relation=g.relation==='Guardian'?'Other':(g.relation||'Other');
  const selectedOther=relation==='Other';
  return `<div class="guardian-card"><div class="guardian-title"><strong>${g.is_primary?'প্রধান Guardian':'Guardian'}</strong><span class="readonly-badge">${esc(relation)}</span></div>${editing&&access?.can('guardians.manage') ? `<label class="primary-guardian-toggle"><input type="radio" name="primaryGuardian" value="${esc(g.guardian_id)}" ${g.is_primary?'checked':''}> প্রধান Guardian হিসেবে সেট করুন</label>` : ''}<div class="profile-fields">
  <div class="profile-field"><label>পূর্ণ নাম</label><input data-g-field="full_name" data-g-id="${esc(g.guardian_id)}" value="${esc(g.full_name)}" ${dis?'disabled':''}></div>
  <div class="profile-field"><label>Guardian হিসেবে</label><select data-g-field="relation" data-g-id="${esc(g.guardian_id)}" ${dis?'disabled':''}><option value="">নির্বাচন করুন</option><option value="Father" ${relation==='Father'?'selected':''}>Father</option><option value="Mother" ${relation==='Mother'?'selected':''}>Mother</option><option value="Other" ${selectedOther?'selected':''}>Other</option></select></div>
  <div class="profile-field"><label>ফোন</label><input data-g-field="phone" data-g-id="${esc(g.guardian_id)}" value="${esc(g.phone)}" ${dis?'disabled':''}></div>
  <div class="profile-field"><label>Email</label><input data-g-field="email" data-g-id="${esc(g.guardian_id)}" type="email" value="${esc(g.email)}" ${dis?'disabled':''}></div>
  <div class="profile-field full"><label>ঠিকানা</label><textarea data-g-field="address" data-g-id="${esc(g.guardian_id)}" rows="2" ${dis?'disabled':''}>${esc(g.address)}</textarea></div>
  </div></div>`;
}
function renderGuardians(){
  $('guardianList').innerHTML=guardians.length?guardians.map(guardianHtml).join(''):'<p class="profile-note">Guardian তথ্য পাওয়া যায়নি।</p>';
}
function mode(){
  const se=editing&&access?.can('students.manage'), ge=editing&&access?.can('guardians.manage');
  ['fullName','gender','dateOfBirth','admissionDate','studentPhone','status','notes','fatherName','fatherNid','motherName','motherNid','birthRegistrationNo'].forEach(id=>$(id).disabled=!se);
  $('editBadge').textContent=se?'Edit mode':'View mode';
  $('guardianPermissionBadge').textContent=ge?'Edit mode':'View mode';
  $('editBtn').classList.toggle('hidden',editing||!access?.can('students.manage'));$('removeBtn').classList.toggle('hidden',editing||!access?.can('students.manage'));
  $('saveBtn').classList.toggle('hidden',!editing);
  $('cancelBtn').classList.toggle('hidden',!editing);
  $('studentDocumentsCard')?.classList.remove('hidden');
  $('guardianNote').textContent=ge?'Guardian তথ্যও এখান থেকে edit করা যাবে।':'Guardian তথ্য দেখা যাবে; edit করতে guardians.manage permission প্রয়োজন।';
  renderGuardians();
  renderTeacherAssignment();
}

async function load(){
  if(!studentId)throw new Error('Student ID সঠিক নয়।');
  const {data:s,error}=await supabase.from('qa_students').select('student_id,student_code,full_name,gender,date_of_birth,phone,admission_date,status,notes,father_name,father_nid,mother_name,mother_nid,birth_registration_no,user_id,teacher_id,created_at,updated_at').eq('student_id',studentId).maybeSingle();
  if(error)throw error;if(!s)throw new Error('Student profile পাওয়া যায়নি।');student=s;
  const {data:links,error:le}=await supabase.from('qa_student_guardians').select('guardian_id,is_primary').eq('student_id',studentId);
  if(le)throw le;
  guardians=[];
  if(links?.length){
    const {data:gs,error:ge}=await supabase.from('qa_guardians').select('guardian_id,full_name,relation,phone,email,address').in('guardian_id',links.map(x=>x.guardian_id));
    if(ge)throw ge;
    const map=Object.fromEntries((gs||[]).map(x=>[x.guardian_id,x]));
    guardians=links.map(x=>({...map[x.guardian_id],is_primary:x.is_primary})).filter(x=>x.guardian_id).sort((a,b)=>Number(b.is_primary)-Number(a.is_primary));
  }
  fillStudent();mode();await loadTeachers();
  await mountDocumentsPanel({
    container:$('studentDocuments'),
    role:'student',
    personId:studentId,
    editable:access?.can('students.manage'),
    canDelete:access?.can('students.manage'),
    title:'Student Documents'
  });
}

async function save(){
  if(!access?.can('students.manage'))throw new Error('Student edit permission নেই।');
  const payload={full_name:$('fullName').value.trim(),gender:$('gender').value,date_of_birth:$('dateOfBirth').value||null,phone:$('studentPhone').value.trim(),admission_date:$('admissionDate').value||null,status:$('status').value,notes:$('notes').value.trim(),father_name:$('fatherName').value.trim(),father_nid:$('fatherNid').value.trim(),mother_name:$('motherName').value.trim(),mother_nid:$('motherNid').value.trim(),birth_registration_no:$('birthRegistrationNo').value.trim()};
  if(!payload.full_name)throw new Error('Student-এর নাম দিতে হবে।');
  const {data,error}=await supabase.from('qa_students').update(payload).eq('student_id',studentId).select('student_id,student_code,full_name,gender,date_of_birth,phone,admission_date,status,notes,father_name,father_nid,mother_name,mother_nid,birth_registration_no,user_id,created_at,updated_at').single();
  if(error)throw error;student=data;
  if(access.can('guardians.manage')){
    const selectedPrimary=document.querySelector('input[name="primaryGuardian"]:checked')?.value||guardians.find(g=>g.is_primary)?.guardian_id||'';
    for(const g of guardians){
      const q=s=>document.querySelector(`[data-g-field="${s}"][data-g-id="${CSS.escape(g.guardian_id)}"]`);
      const update={full_name:q('full_name')?.value.trim()||'',relation:q('relation')?.value||'',phone:q('phone')?.value.trim()||'',email:q('email')?.value.trim()||'',address:q('address')?.value.trim()||''};
      if(!update.full_name||!update.relation)throw new Error('Guardian-এর নাম ও সম্পর্ক পূরণ করতে হবে।');
      const {error:ge}=await supabase.from('qa_guardians').update(update).eq('guardian_id',g.guardian_id);if(ge)throw ge;
      const {error:gle}=await supabase.from('qa_student_guardians').update({is_primary:g.guardian_id===selectedPrimary}).eq('student_id',studentId).eq('guardian_id',g.guardian_id);if(gle)throw gle;
    }
  }
  editing=false;await load();
}

$('saveTeacherBtn')?.addEventListener('click',async()=>{const btn=$('saveTeacherBtn');btn.disabled=true;$('teacherSaveMessage').textContent='Saving…';$('teacherSaveMessage').className='message-inline';try{await saveTeacherAssignment();}catch(e){console.error(e);$('teacherSaveMessage').textContent=e.message||'Teacher assignment save করা যায়নি।';$('teacherSaveMessage').className='message-inline error';}finally{btn.disabled=false;}}); 
$('removeTeacherBtn')?.addEventListener('click',async()=>{
  if(!access?.can('students.manage'))return;
  if(!student?.teacher_id)return;
  const ok=window.confirm('এই Student-এর বর্তমান Teacher assignment বাদ দিতে চান?');
  if(!ok)return;
  const btn=$('removeTeacherBtn');btn.disabled=true;
  $('teacherSaveMessage').textContent='Removing…';$('teacherSaveMessage').className='message-inline';
  try{
    const {data,error}=await supabase.from('qa_students').update({teacher_id:null}).eq('student_id',studentId).select('student_id,teacher_id').single();
    if(error)throw error;
    student.teacher_id=data.teacher_id;
    $('teacherSaveMessage').textContent='Teacher assignment removed.';
    $('teacherSaveMessage').className='message-inline success';
    renderTeacherAssignment();
  }catch(e){
    console.error(e);
    $('teacherSaveMessage').textContent=e.message||'Teacher assignment remove করা যায়নি।';
    $('teacherSaveMessage').className='message-inline error';
  }finally{btn.disabled=false;}
});
$('editBtn').onclick=()=>{editing=true;msg('');mode();};
$('cancelBtn').onclick=async()=>{editing=false;msg('');await load();};$('removeBtn').onclick=async()=>{if(!access?.can('students.manage')){msg('Student remove permission নেই।','error');return;}const name=student?.full_name||student?.student_code||'এই শিক্ষার্থী';const ok=window.confirm(`আপনি কি "${name}"-এর profile remove করতে চান?\\n\\nRemove করলে profile-টি স্থায়ীভাবে মুছে ফেলা হবে না; Student status "Withdrawn" করা হবে এবং fee, attendance, Quran progress ও অন্যান্য history সংরক্ষিত থাকবে।\\n\\nনিশ্চিত করতে OK চাপুন।`);if(!ok)return;$('removeBtn').disabled=true;msg('Removing profile…');try{const {error}=await supabase.from('qa_students').update({status:'withdrawn'}).eq('student_id',studentId);if(error)throw error;window.location.replace('students.html');}catch(e){console.error(e);msg(e?.message||'Profile remove করা যায়নি।','error');$('removeBtn').disabled=false;}};
$('profileForm').onsubmit=async e=>{e.preventDefault();$('saveBtn').disabled=true;msg('Saving changes…');try{await save();msg('Student profile updated successfully.','success');}catch(err){console.error(err);msg(err?.message||'Profile update করা যায়নি।','error');}finally{$('saveBtn').disabled=false;}};
$('signOut').onclick=async()=>{await supabase.auth.signOut();login();};

(async()=>{try{access=await getAccess(supabase);if(!access){await supabase.auth.signOut();return login();}if(!access.can('students.view')&&!access.can('students.manage'))throw new Error('Student profile দেখার permission নেই।');$('loading').classList.add('hidden');$('app').classList.remove('hidden');await load();}catch(e){console.error(e);$('loading').classList.add('hidden');$('errorBox').textContent=e.message||'Profile load করা যায়নি।';$('errorBox').classList.remove('hidden');}})();