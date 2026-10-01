import {personName} from './ui-i18n.js?v=20261001-fourstep1';
import {initProfileTabs} from './profile-tabs.js?v=20260930-tabs1';
import{createClient}from'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';import{getAccess}from'./authz.js';
import{mountDocumentsPanel,setProfileImage}from'./documents-ui.js?v=20260930-design1';
const c=window.QURANER_ALO_CONFIG,supabase=createClient(c.supabaseUrl,c.supabasePublishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}}),$=id=>document.getElementById(id);
const qs=new URLSearchParams(location.search),type=qs.get('type')==='teacher'?'teacher':'helper',id=qs.get('id');let access=null,row=null,editing=false,allAssignedStudents=[],allTeacherGroups=[],editBaseline='',allowNavigation=false;
initProfileTabs({formId:'form',academicIds:type==='teacher'?['teacherStudentsCard','teacherGroupsCard']:[],documentsId:'staffDocumentsCard'});
let groupMembers=[],groupStudentMap=new Map(),assignmentTeacherMap={},documentsMounted=false,profileNeedsRefresh=false;
const msg=(t,k='')=>{$('message').textContent=t;$('message').className=`message-inline ${k}`.trim()};
function profileEditState(){
  const ids=['fullName','fullNameBn','gender','phone','email','specialization','joiningDate','active','notes','fatherName','motherName','maritalStatus','spouseName','nidNumber','address'];
  return JSON.stringify(Object.fromEntries(ids.filter(x=>$(x)).map(x=>[x,$(x).value??''])));
}
function startEditTracking(){editBaseline=profileEditState();allowNavigation=false;}
function clearEditTracking(){editBaseline='';allowNavigation=false;}
function hasUnsavedProfileChanges(){return Boolean(editing&&editBaseline&&profileEditState()!==editBaseline);}
function confirmDiscardChanges(){return !hasUnsavedProfileChanges()||window.confirm('আপনার কিছু পরিবর্তন এখনো Save করা হয়নি। এই পেজ থেকে বের হলে পরিবর্তনগুলো বাতিল হয়ে যাবে।\n\nবের হতে চান?');}
function guardLink(id){$(id)?.addEventListener('click',event=>{if(!hasUnsavedProfileChanges())return;if(!confirmDiscardChanges()){event.preventDefault();return;}allowNavigation=true;});}
window.addEventListener('beforeunload',event=>{if(allowNavigation||!hasUnsavedProfileChanges())return;event.preventDefault();event.returnValue='';});
const esc=v=>String(v??'').replace(/[&<>\"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[x]));
const canView=()=>access?.can(type==='teacher'?'teachers.view':'staff.view');
const canManage=()=>access?.can(type==='teacher'?'teachers.manage':'staff.manage');
async function loadProfileImageWithFallback(role,personId,img){if(!img)return false;img.src='assets/quraner-alo-logo.jpg';img.classList.remove('hidden');const loaded=await setProfileImage({role,personId,img});if(!loaded){img.src='assets/quraner-alo-logo.jpg';img.classList.remove('hidden');}return loaded;}
function normalizeWaNumber(value){const digits=String(value||'').trim().replace(/[^0-9]/g,'');if(!digits)return '';return digits.startsWith('00')?digits.slice(2):digits.startsWith('0')?'88'+digits:digits;}
function setWhatsAppLink(phone){const btn=$('whatsappBtn');if(!btn)return;const digits=normalizeWaNumber(phone);if(!digits){btn.href='#';btn.classList.add('is-disabled');btn.setAttribute('aria-disabled','true');btn.title='এই profile-এর WhatsApp number সংরক্ষিত নেই।';btn.onclick=e=>e.preventDefault();return;}btn.href='https://wa.me/'+digits;btn.classList.remove('is-disabled');btn.removeAttribute('aria-disabled');btn.title='Send message on WhatsApp';btn.onclick=null;}
function syncSpouseField(){const married=$('maritalStatus')?.value==='married';$('spouseNameWrap')?.classList.toggle('hidden',!married);if(!married&&editing&&$('spouseName'))$('spouseName').value='';}
function setInputs(on){['fullName','fullNameBn','gender','phone','email','specialization','joiningDate','active','notes','fatherName','motherName','maritalStatus','spouseName','nidNumber','address'].forEach(x=>{if($(x))$(x).disabled=!on})}
function updateContext(){
  const teacher=type==='teacher';
  $('topBack').href=`staff.html#${teacher?'teachers':'helpers'}`;
  $('topBack').textContent=teacher?'Teacher List':'Helper List';
  $('backBtn').href=`staff.html#${teacher?'teachers':'helpers'}`;
  $('title').textContent='—';
  $('modeBadge').textContent='View mode';
  $('specialWrap').classList.toggle('hidden',!teacher);
  $('bnWrap').classList.remove('hidden');
}
function fill(refreshImage=true){
  const teacher=type==='teacher';
  $('code').value=teacher?row.teacher_code:row.staff_code;
  $('fullName').value=row.full_name||'';
  $('fullNameBn').value=row.full_name_bn||'';
  $('gender').value=['male','female','unspecified'].includes(row.gender)?row.gender:'unspecified';
  $('phone').value=row.phone||'';
  $('email').value=row.email||'';
  $('specialization').value=teacher?row.specialization||'':'';
  $('fatherName').value=row.father_name||'';
  $('motherName').value=row.mother_name||'';
  $('maritalStatus').value=['married','unmarried'].includes(row.marital_status)?row.marital_status:'';
  $('spouseName').value=row.spouse_name||'';
  syncSpouseField();
  $('nidNumber').value=row.nid_number||'';
  $('address').value=row.address||'';
  $('joiningDate').value=row.joining_date||'';
  $('active').value=String(row.active!==false);
  $('notes').value=row.notes||'';
  $('title').textContent=personName(row)||row.full_name_bn||'—';
  $('subtitle').textContent=`${teacher?'Teacher':'Helper'} ID: ${teacher?row.teacher_code:row.staff_code}`;
  if(refreshImage)void loadProfileImageWithFallback(type,id,$('staffProfileImage'));
  setWhatsAppLink(row.phone);
}

async function loadTeacherGroups(){
  if(type!=='teacher'||!$('assignedGroupsList'))return;
  const [{data:gs,error:ge},{data:memberships,error:me}]=await Promise.all([
    supabase.from('qa_study_groups').select('group_id,group_name,teacher_id,active').order('group_name'),
    supabase.from('qa_group_memberships').select('group_id,student_id').is('left_at',null)
  ]);
  if(ge||me)throw(ge||me);
  allTeacherGroups=gs||[];
  const memberRows=memberships||[];
  const studentIds=[...new Set(memberRows.map(m=>m.student_id).filter(Boolean))];
  let studentMap=new Map();
  if(studentIds.length){
    const {data:ss,error:se}=await supabase.from('qa_students').select('student_id,student_code,full_name,status').in('student_id',studentIds);
    if(se)throw se;
    studentMap=new Map((ss||[]).map(st=>[st.student_id,st]));
  }
  groupMembers=memberRows;groupStudentMap=studentMap;
  renderTeacherGroups();
}
function renderTeacherGroups(){
  if(type!=='teacher')return;
  const memberRows=groupMembers,studentMap=groupStudentMap;
  const current=allTeacherGroups.filter(g=>g.teacher_id===id);
  $('assignedGroupsList').innerHTML=current.map(g=>{
    const groupStudents=memberRows.filter(m=>m.group_id===g.group_id).map(m=>studentMap.get(m.student_id)).filter(Boolean);
    const studentLines=groupStudents.map((st,index)=>'<span class="group-student-line">'+(index+1)+'. '+esc((st.student_code||'')+(st.student_code?' · ':'')+(st.full_name||'Student'))+'</span>').join('');
    const title=editing?'<a href="groups.html?group='+encodeURIComponent(g.group_id)+'"><strong>'+esc(g.group_name)+'</strong></a>':'<strong>'+esc(g.group_name)+'</strong>';
    return '<tr><td>'+title+'</td><td><div class="group-student-list">'+(studentLines||'<span class="muted">কোনো active Student নেই</span>')+'</div></td></tr>';
  }).join('')||'<tr><td colspan="2" class="portal-empty">কোনো Group assigned নেই।</td></tr>';
  const canEditGroups=Boolean(canManage()&&access?.can('students.manage')&&editing);
  $('teacherGroupEditor')?.classList.toggle('hidden',!canEditGroups);
  if($('groupPicker')){
    $('groupPicker').disabled=!canEditGroups;
    $('groupPicker').innerHTML=allTeacherGroups.map(g=>{
      const selected=g.teacher_id===id?' selected':'';
      const owner=g.teacher_id&&g.teacher_id!==id?' — অন্য Teacher-এর কাছে assigned':'';
      const inactive=g.active===false?' — Inactive':'';
      return '<option value="'+esc(g.group_id)+'"'+selected+'>'+esc(g.group_name+owner+inactive)+'</option>';
    }).join('')||'<option disabled>কোনো Group পাওয়া যায়নি</option>';
  }
  $('saveGroupAssignmentsBtn')?.classList.toggle('hidden',!canEditGroups);
  if($('teacherGroupsBadge'))$('teacherGroupsBadge').textContent=canManage()?(editing?(canEditGroups?'Edit mode':'Group manage permission নেই'):'Edit Profile থেকে পরিবর্তন'):'View only';
}
async function saveTeacherGroupAssignments(){
  if(type!=='teacher'||!canManage()||!access?.can('students.manage'))throw new Error('Group assignment পরিবর্তনের permission নেই।');
  const selectedIds=[...($('groupPicker')?.selectedOptions||[])].map(o=>o.value).filter(Boolean);
  const selectedSet=new Set(selectedIds);
  const current=allTeacherGroups.filter(g=>g.teacher_id===id);
  const conflicts=allTeacherGroups.filter(g=>selectedSet.has(g.group_id)&&g.teacher_id&&g.teacher_id!==id);
  if(conflicts.length){
    const names=conflicts.slice(0,5).map(g=>g.group_name).join(', ');
    const suffix=conflicts.length>5?' এবং আরও '+(conflicts.length-5)+'টি':'';
    if(!window.confirm(names+suffix+' বর্তমানে অন্য Teacher-এর কাছে assigned।\n\nSelected করলে Group assignment এই Teacher-এর কাছে চলে আসবে।\n\nচালিয়ে যেতে OK চাপুন।'))return;
  }
  const removeIds=current.filter(g=>!selectedSet.has(g.group_id)).map(g=>g.group_id);
  if(removeIds.length){
    const {error}=await supabase.from('qa_study_groups').update({teacher_id:null,updated_at:new Date().toISOString()}).in('group_id',removeIds);
    if(error)throw error;
  }
  if(selectedIds.length){
    const {error}=await supabase.from('qa_study_groups').update({teacher_id:id,updated_at:new Date().toISOString()}).in('group_id',selectedIds);
    if(error)throw error;
  }
  $('groupAssignmentMessage').textContent='Group assignment updated.';
  $('groupAssignmentMessage').className='message-inline success';
  await loadTeacherGroups();
}
async function loadTeacherAssignments(){
  if(type!=='teacher')return;
  $('teacherGroupsCard')?.classList.remove('hidden');
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
  assignmentTeacherMap=teacherMap;
  renderTeacherAssignments();
}
function renderTeacherAssignments(){
  if(type!=='teacher'||!canManage())return;
  const teacherMap=assignmentTeacherMap;
  $('studentPicker').innerHTML=allAssignedStudents.map(st=>{
    const assignedTo=st.teacher_id&&st.teacher_id!==id?teacherMap[st.teacher_id]:null;
    const label=(st.full_name||st.student_code||st.student_id)+(st.student_code?' · '+st.student_code:'')+(assignedTo?' — বর্তমানে '+(assignedTo.full_name_bn||assignedTo.full_name||'অন্য Teacher'):'');
    const selected=st.teacher_id===id?' selected':'';
    return '<option value="'+esc(st.student_id)+'"'+selected+'>'+esc(label)+'</option>';
  }).join('')||'<option disabled>কোনো Student পাওয়া যায়নি</option>';
  const editor=$('teacherAssignmentEditor');
  const canEditAssignment=canManage()&&editing;
  editor?.classList.toggle('hidden',!canEditAssignment);
  $('studentPicker').disabled=!canEditAssignment;
  $('saveStudentAssignmentsBtn').classList.toggle('hidden',!canEditAssignment);
  $('teacherStudentsBadge').textContent=canManage()?(editing?'Edit mode':'Edit Profile থেকে পরিবর্তন'):'View only';
  const current=allAssignedStudents.filter(st=>st.teacher_id===id);
  $('assignedStudentsList').innerHTML=current.map(st=>{
    const remove=canManage()&&editing
      ? '<button class="secondary-btn remove-student-assignment" type="button" data-student-id="'+esc(st.student_id)+'">Student বাদ দিন</button>'
      : '';
    return '<div class="staff-assignment-row"><div class="staff-assignment-person"><img id="assignedStudentProfileImage-'+esc(st.student_id)+'" class="profile-photo-small" src="assets/quraner-alo-logo.jpg" alt="" aria-hidden="true"><div class="staff-assignment-person-copy"><strong>'+esc(st.full_name||st.student_code||'Student')+'</strong><small>'+esc(st.student_code||'—')+' · '+esc(st.status||'—')+'</small></div></div>'+remove+'</div>';
  }).join('')||'<div class="portal-empty">এখনো কোনো Student assigned নেই।</div>';
  void Promise.all(current.map(st=>loadProfileImageWithFallback('student',st.student_id,$('assignedStudentProfileImage-'+st.student_id))));
  document.querySelectorAll('.remove-student-assignment').forEach(button=>button.addEventListener('click',async()=>{
    const studentIdToRemove=button.dataset.studentId;
    const student=allAssignedStudents.find(st=>st.student_id===studentIdToRemove);
    if(!student)return;
    const ok=window.confirm((student.full_name||student.student_code)+'-এর এই Teacher assignment বাদ দিতে চান?');
    if(!ok)return;
    button.disabled=true;
    try{
      const {error}=await supabase.from('qa_students').update({teacher_id:null}).eq('student_id',studentIdToRemove);
      if(error)throw error;
      $('assignmentMessage').textContent='Student assignment removed.';
      $('assignmentMessage').className='message-inline success';
      await loadTeacherAssignments();
    }catch(e){
      console.error(e);
      $('assignmentMessage').textContent=e.message||'Student assignment remove করা যায়নি।';
      $('assignmentMessage').className='message-inline error';
      button.disabled=false;
    }
  }));
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
  $('staffDocumentsCard')?.classList.remove('hidden');
  $('staffDocuments')?.classList.toggle('staff-documents-view',!canEdit);
  if(!canEdit)closeStaffDocumentUploader();
  const editor=$('teacherAssignmentEditor');
  const canEditAssignment=type==='teacher'&&canManage()&&editing;
  editor?.classList.toggle('hidden',!canEditAssignment);
  if($('studentPicker'))$('studentPicker').disabled=!canEditAssignment;
  if($('saveStudentAssignmentsBtn'))$('saveStudentAssignmentsBtn').classList.toggle('hidden',!canEditAssignment);
  if(type==='teacher'&&$('teacherStudentsBadge'))$('teacherStudentsBadge').textContent=canManage()?(editing?'Edit mode':'Edit Profile থেকে পরিবর্তন'):'View only';
  if(type==='teacher'&&$('teacherGroupsBadge'))$('teacherGroupsBadge').textContent=canManage()?(editing?(access?.can('students.manage')?'Edit mode':'Group manage permission নেই'):'Edit Profile থেকে পরিবর্তন'):'View only';
  $('teacherGroupEditor')?.classList.toggle('hidden',!(type==='teacher'&&canManage()&&access?.can('students.manage')&&editing));
}
// Keep the existing document callbacks mounted; gate mutations by current mode.
$('staffDocuments')?.addEventListener('click',event=>{
  if(!event.target.closest('[data-document-add],[data-document-upload],[data-delete]'))return;
  if(!editing||!row||!canManage()){event.preventDefault();event.stopImmediatePropagation();}
},true);
new MutationObserver(records=>{
  if(row&&records.some(r=>r.target.matches?.('[data-document-list]')))
    void loadProfileImageWithFallback(type,id,$('staffProfileImage'));
}).observe($('staffDocuments'),{childList:true,subtree:true});
function closeStaffDocumentUploader(){
  const container=$('staffDocuments');
  container.querySelector('[data-document-upload-panel]')?.classList.add('hidden');
  const add=container.querySelector('[data-document-add]');
  if(add){add.setAttribute('aria-expanded','false');add.textContent='Add Documents';}
  for(const selector of ['[data-document-category]','[data-document-file]']){
    const field=container.querySelector(selector);if(field)field.value='';
  }
  const message=container.querySelector('[data-document-message]');
  if(message){message.textContent='';message.className='message-inline';}
}
async function renderStaffDocuments(){
  if(!$('staffDocuments')||documentsMounted)return;
  documentsMounted=true;
  await mountDocumentsPanel({
    container:$('staffDocuments'),
    role:type,
    personId:id,
    editable:Boolean(canManage()),
    canDelete:Boolean(canManage()),
    title:type==='teacher'?'Teacher Documents':'Helper Documents'
  });
}

async function load(){
  if(!id)throw Error('Profile ID সঠিক নয়।');
  updateContext();
  const table=type==='teacher'?'qa_teachers':'qa_staff';
  const fields=type==='teacher'
    ?'teacher_id,teacher_code,full_name,full_name_bn,gender,phone,email,specialization,father_name,mother_name,marital_status,spouse_name,nid_number,address,joining_date,active,notes,user_id'
    :'staff_id,staff_code,full_name,full_name_bn,gender,phone,email,father_name,mother_name,marital_status,spouse_name,nid_number,address,joining_date,active,notes,user_id';
  const{data,error}=await supabase.from(table).select(fields).eq(type==='teacher'?'teacher_id':'staff_id',id).maybeSingle();
  if(error)throw error;
  if(!data)throw Error('Profile পাওয়া যায়নি।');
  row=data;
  fill();
  syncMode();
  const profileLoads=[renderStaffDocuments()];
  if(type==='teacher')profileLoads.push(loadTeacherAssignments(),loadTeacherGroups());
  await Promise.all(profileLoads);
  profileNeedsRefresh=false;
}
$('maritalStatus')?.addEventListener('change',syncSpouseField);
$('saveGroupAssignmentsBtn')?.addEventListener('click',async()=>{const btn=$('saveGroupAssignmentsBtn');btn.disabled=true;$('groupAssignmentMessage').textContent='Saving…';$('groupAssignmentMessage').className='message-inline';try{await saveTeacherGroupAssignments();}catch(e){console.error(e);$('groupAssignmentMessage').textContent=e.message||'Group assignment save করা যায়নি।';$('groupAssignmentMessage').className='message-inline error';}finally{btn.disabled=false;}});
$('saveStudentAssignmentsBtn')?.addEventListener('click',async()=>{const btn=$('saveStudentAssignmentsBtn');btn.disabled=true;$('assignmentMessage').textContent='Saving…';$('assignmentMessage').className='message-inline';try{await saveTeacherAssignments();}catch(e){console.error(e);$('assignmentMessage').textContent=e.message||'Student assignment save করা যায়নি।';$('assignmentMessage').className='message-inline error';}finally{btn.disabled=false;}});
$('editBtn').onclick=()=>{if(!row||!canManage())return;editing=true;msg('');syncMode();renderTeacherAssignments();renderTeacherGroups();startEditTracking();};
$('cancelBtn').onclick=()=>{editing=false;clearEditTracking();msg('');fill(false);syncMode();renderTeacherAssignments();renderTeacherGroups();if(profileNeedsRefresh)void load().catch(e=>msg(e.message||'Profile refresh করা যায়নি।','error'));};
$('form').onsubmit=async e=>{
  e.preventDefault();
  if(!canManage())return msg(`${type==='teacher'?'Teacher':'Helper'} edit permission নেই।`,'error');
  $('saveBtn').disabled=true;$('cancelBtn').disabled=true;profileNeedsRefresh=true;msg('Saving…');
  const payload={full_name:$('fullName').value.trim(),full_name_bn:$('fullNameBn').value.trim()||null,gender:['male','female','unspecified'].includes($('gender').value)?$('gender').value:'unspecified',phone:$('phone').value.trim(),email:$('email').value.trim(),father_name:$('fatherName').value.trim(),mother_name:$('motherName').value.trim(),marital_status:['married','unmarried'].includes($('maritalStatus').value)?$('maritalStatus').value:null,spouse_name:$('maritalStatus').value==='married'?$('spouseName').value.trim():'',nid_number:$('nidNumber').value.trim(),address:$('address').value.trim(),joining_date:$('joiningDate').value||null,active:$('active').value==='true',notes:$('notes').value.trim()};
  if(type==='teacher'){payload.specialization=$('specialization').value.trim()||null}
  try{
    const{error}=await supabase.from(type==='teacher'?'qa_teachers':'qa_staff').update(payload).eq(type==='teacher'?'teacher_id':'staff_id',id);
    if(error)throw error;
    editing=false;clearEditTracking();await load();msg('Profile updated successfully.','success');
  }catch(e){console.error(e);msg(e.message||'Profile update করা যায়নি।','error')}finally{$('saveBtn').disabled=false;$('cancelBtn').disabled=false}
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
$('signOut').onclick=async()=>{if(!confirmDiscardChanges())return;allowNavigation=true;await supabase.auth.signOut();location.replace('./')};
guardLink('backBtn');
guardLink('topBack');
(async()=>{
  try{
    access=await getAccess(supabase);
    if(!access){await supabase.auth.signOut();return location.replace('./')}
    if(!canView()&&!canManage())throw Error('Profile দেখার permission নেই।');
    $('loading').classList.add('hidden');$('app').classList.remove('hidden');await load();
  }catch(e){console.error(e);$('loading').classList.add('hidden');$('errorBox').textContent=e.message||'Profile load করা যায়নি।';$('errorBox').classList.remove('hidden')}
})();
window.addEventListener('qa-language-change',()=>{if(row)$('title').textContent=personName(row);});
