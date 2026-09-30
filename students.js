import {initMobileListTools} from './mobile-list-tools.js?v=20260930-mobile1';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getAccess } from './authz.js';
import { debounce, populateYearSelect, renderFilterChips, updatePager, downloadCsv, downloadXlsx, downloadPdf, printRows, visibleExportColumns, bindColumnMenu, bindExportMenu } from './list-tools.js?v=20260926-3';

const config = window.QURANER_ALO_CONFIG;
const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});

const $ = (id) => document.getElementById(id);
let currentStudents = [];
let canManage = false;
let canManagePortal = false;
let teacherMap = new Map();
let groupTeacherByStudent = new Map();
let embeddedGroups = [], embeddedMembers = [], embeddedStudents = [], embeddedTeachers = [];
let embeddedStudentById = new Map(), embeddedTeacherById = new Map(), embeddedMembersByGroup = new Map();
let openGroupId = null;
let page = 1;
let pageSize = 10;
let totalRows = 0;
let syncColumns = () => {};
const courseStudentCache = new Map();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));
}

function groupSetMessage(text,type=''){const el=$('groupMessage');if(!el)return;el.textContent=text;el.style.color=type==='error'?'#b33b3b':'';}
function rebuildEmbeddedIndexes(){
 embeddedStudentById=new Map(embeddedStudents.map(student=>[student.student_id,student]));
 embeddedTeacherById=new Map(embeddedTeachers.map(teacher=>[teacher.teacher_id,teacher]));
 embeddedMembersByGroup=new Map();
 embeddedMembers.forEach(member=>{
  if(!embeddedMembersByGroup.has(member.group_id))embeddedMembersByGroup.set(member.group_id,[]);
  embeddedMembersByGroup.get(member.group_id).push(member);
 });
}
function membersForGroup(groupId){return embeddedMembersByGroup.get(groupId)||[];}
function teacherLabel(id){const t=embeddedTeacherById.get(id);return t?((t.teacher_code||'')+' · '+(t.full_name||'Teacher')):'Unassigned';}
async function loadEmbeddedGroups(){
 const [g,t,s,m]=await Promise.all([
  supabase.from('qa_study_groups').select('*').order('group_name'),
  supabase.from('qa_teachers').select('teacher_id,teacher_code,full_name').eq('active',true).order('full_name'),
  supabase.from('qa_students').select('student_id,student_code,full_name,status').eq('status','active').order('full_name'),
  supabase.from('qa_group_memberships').select('membership_id,group_id,student_id,joined_at,left_at').is('left_at',null)
 ]);
 if(g.error||t.error||s.error||m.error)throw(g.error||t.error||s.error||m.error);
 embeddedGroups=g.data||[];embeddedTeachers=t.data||[];embeddedStudents=s.data||[];embeddedMembers=m.data||[];
 rebuildEmbeddedIndexes();
 $('groupTeacherFilter').innerHTML='<option value="">সব Teacher</option><option value="__unassigned">Unassigned</option>'+embeddedTeachers.map(x=>'<option value="'+escapeHtml(x.teacher_id)+'">'+escapeHtml((x.teacher_code||'')+' · '+x.full_name)+'</option>').join('');
 renderEmbeddedGroups();
}
function filteredGroups(){
 const q=$('groupSearch').value.trim().toLowerCase(),status=$('groupStatusFilter').value,teacher=$('groupTeacherFilter').value;
 return embeddedGroups.filter(g=>{
  if(status&&String(g.active!==false)!==String(status==='active'))return false;
  if(teacher==='__unassigned'&&g.teacher_id)return false;if(teacher&&teacher!=='__unassigned'&&g.teacher_id!==teacher)return false;
  const ms=membersForGroup(g.group_id);const names=ms.map(m=>{const s=embeddedStudentById.get(m.student_id);return s?((s.student_code||'')+' '+(s.full_name||'')):''}).join(' ');
  return !q||[g.group_name,teacherLabel(g.teacher_id),names].join(' ').toLowerCase().includes(q);
 });
}
function renderEmbeddedGroups(){
 const list=filteredGroups();$('groupCountLabel').textContent=list.length+' টি group';
 $('embeddedGroupList').innerHTML=list.map(g=>{
  const ms=membersForGroup(g.group_id),ss=ms.map(m=>embeddedStudentById.get(m.student_id)).filter(Boolean),open=openGroupId===g.group_id;
  const studentNames=ss.length?ss.map((s,i)=>'<span class="group-student-name">'+(i+1)+'. <a href="student-profile.html?id='+encodeURIComponent(s.student_id)+'">'+escapeHtml(s.student_code||'')+' · '+escapeHtml(s.full_name||'Student')+'</a></span>').join(''):'<span class="muted">কোনো Student নেই</span>';
  return '<section class="embedded-group-row '+(open?'is-open':'')+'" data-group-id="'+escapeHtml(g.group_id)+'"><button class="embedded-group-summary" type="button" data-open-group="'+escapeHtml(g.group_id)+'" aria-expanded="'+open+'"><span class="group-name-cell"><strong>'+escapeHtml(g.group_name)+'</strong><small>'+ms.length+' students</small></span><span>'+escapeHtml(teacherLabel(g.teacher_id))+'</span><span class="group-students-cell">'+studentNames+'</span><span><span class="active-badge '+(g.active!==false?'on':'off')+'">'+(g.active!==false?'Active':'Inactive')+'</span></span></button>'+(open?renderGroupEditor(g,ss):'')+'</section>';
 }).join('')||'<div class="dues-empty">কোনো Group পাওয়া যায়নি।</div>';
 document.querySelectorAll('[data-open-group]').forEach(b=>b.onclick=()=>{openGroupId=openGroupId===b.dataset.openGroup?null:b.dataset.openGroup;renderEmbeddedGroups()});
 bindEmbeddedGroupEditor();
}
function renderGroupEditor(g,selectedStudents){
 const selected=new Set(selectedStudents.map(s=>s.student_id)),occupied=new Set(embeddedMembers.filter(m=>m.group_id!==g.group_id).map(m=>m.student_id));
 return '<form class="embedded-group-editor" data-group-form="'+escapeHtml(g.group_id)+'"><div class="group-editor-details"><h3>Group Details</h3><label>Group Name<input name="group_name" value="'+escapeHtml(g.group_name||'')+'" required></label><label>Teacher<select name="teacher_id"><option value="">— Unassigned —</option>'+embeddedTeachers.map(t=>'<option value="'+escapeHtml(t.teacher_id)+'" '+(g.teacher_id===t.teacher_id?'selected':'')+'>'+escapeHtml((t.teacher_code||'')+' · '+t.full_name)+'</option>').join('')+'</select></label><label>Status<select name="active"><option value="true" '+(g.active!==false?'selected':'')+'>Active</option><option value="false" '+(g.active===false?'selected':'')+'>Inactive</option></select></label><label>Notes<textarea name="notes" rows="2">'+escapeHtml(g.notes||'')+'</textarea></label></div><div class="group-editor-members"><h3>Students in this Group ('+selected.size+')</h3><label>Add / manage students<select name="students" multiple size="8">'+embeddedStudents.map(s=>'<option value="'+escapeHtml(s.student_id)+'" '+(selected.has(s.student_id)?'selected':'')+' '+(occupied.has(s.student_id)&&!selected.has(s.student_id)?'disabled':'')+'>'+escapeHtml((s.student_code||'')+' · '+s.full_name+(occupied.has(s.student_id)&&!selected.has(s.student_id)?' — অন্য Group-এ আছে':''))+'</option>').join('')+'</select></label><div class="group-current-members">'+selectedStudents.map(s=>'<div><span>'+escapeHtml(s.student_code||'')+' · '+escapeHtml(s.full_name)+'</span><button type="button" class="link-btn group-remove-student" data-remove-student="'+escapeHtml(s.student_id)+'">Remove</button></div>').join('')+'</div></div><div class="group-editor-actions"><button class="primary-btn" type="submit">Save Changes</button><button class="secondary-btn group-close-editor" type="button">Close</button></div></form>';
}
function bindEmbeddedGroupEditor(){
 const form=document.querySelector('[data-group-form]');if(!form)return;const gid=form.dataset.groupForm;
 form.querySelector('.group-close-editor').onclick=()=>{openGroupId=null;renderEmbeddedGroups()};
 form.querySelectorAll('.group-remove-student').forEach(b=>b.onclick=async()=>{const m=embeddedMembers.find(x=>x.group_id===gid&&x.student_id===b.dataset.removeStudent);if(!m)return;b.disabled=true;try{const now=new Date();const{error}=await supabase.from('qa_group_memberships').update({left_at:now.toISOString().slice(0,10),updated_at:now.toISOString()}).eq('membership_id',m.membership_id);if(error)throw error;await loadEmbeddedGroups();groupSetMessage('Student Group থেকে remove হয়েছে। Membership history সংরক্ষিত আছে।')}catch(e){console.error(e);groupSetMessage(e.message||'Remove করা যায়নি।','error')}});
 form.onsubmit=async e=>{e.preventDefault();groupSetMessage('Group save হচ্ছে…');const fd=new FormData(form),wanted=new Set([...form.elements.students.selectedOptions].map(o=>o.value));try{const{error}=await supabase.from('qa_study_groups').update({group_name:String(fd.get('group_name')||'').trim(),teacher_id:fd.get('teacher_id')||null,active:fd.get('active')==='true',notes:String(fd.get('notes')||'').trim(),updated_at:new Date().toISOString()}).eq('group_id',gid);if(error)throw error;const current=embeddedMembers.filter(m=>m.group_id===gid);for(const m of current.filter(m=>!wanted.has(m.student_id))){const now=new Date();const{error:er}=await supabase.from('qa_group_memberships').update({left_at:now.toISOString().slice(0,10),updated_at:now.toISOString()}).eq('membership_id',m.membership_id);if(er)throw er}for(const sid of wanted){if(current.some(m=>m.student_id===sid))continue;if(embeddedMembers.some(m=>m.student_id===sid&&m.group_id!==gid))throw Error('এই Student অন্য active Group-এ আছে।');const{error:er}=await supabase.from('qa_group_memberships').insert({group_id:gid,student_id:sid});if(er)throw er}await loadEmbeddedGroups();groupSetMessage('Group ও membership সংরক্ষিত হয়েছে।')}catch(err){console.error(err);groupSetMessage(err.message||'Group save করা যায়নি।','error')}};
}
async function createEmbeddedGroup(){if(!canManage)return;const name=prompt('নতুন Group-এর নাম লিখুন');if(!name?.trim())return;try{const{data,error}=await supabase.from('qa_study_groups').insert({group_name:name.trim(),active:true}).select('group_id').single();if(error)throw error;openGroupId=data.group_id;await loadEmbeddedGroups();groupSetMessage('নতুন Group তৈরি হয়েছে। এখন Teacher ও Students assign করুন।')}catch(e){console.error(e);groupSetMessage(e.message||'Group তৈরি করা যায়নি।','error')}}
function resetGroupFilters(){
  $('groupSearch').value=''; $('groupStatusFilter').value=''; $('groupTeacherFilter').value=''; renderEmbeddedGroups();
}
function exportGroupsCsv(){
  const rows=filteredGroups().map(g=>{const ms=membersForGroup(g.group_id),ss=ms.map(m=>embeddedStudentById.get(m.student_id)).filter(Boolean);return {group:g.group_name||'',teacher:teacherLabel(g.teacher_id),students:ss.map(s=>(s.student_code||'')+' · '+(s.full_name||'')).join('; '),status:g.active!==false?'Active':'Inactive'};});
  downloadCsv('QuranerAlo_Groups_'+new Date().toISOString().slice(0,10)+'.csv',[{label:'Group',key:'group'},{label:'Teacher',key:'teacher'},{label:'Students',key:'students'},{label:'Status',key:'status'}],rows);
}
function bindGroupListTools(){
  $('groupToggleFilters')?.addEventListener('click',()=>{const open=$('groupAdvancedFilters')?.classList.toggle('is-open');$('groupToggleFilters')?.setAttribute('aria-expanded',String(!!open));});
  $('groupResetFilters')?.addEventListener('click',resetGroupFilters);
  $('groupExport')?.addEventListener('click',exportGroupsCsv);
  $('groupColumns')?.addEventListener('click',e=>{e.stopPropagation();$('groupColumnMenu')?.classList.toggle('hidden');});
  document.querySelectorAll('[data-group-column]').forEach(box=>box.addEventListener('change',()=>{document.querySelector('.group-workspace-panel')?.classList.toggle('group-hide-'+box.dataset.groupColumn,!box.checked);}));
  document.addEventListener('click',e=>{if(!$('groupColumnMenu')?.contains(e.target)&&e.target!==$('groupColumns'))$('groupColumnMenu')?.classList.add('hidden');});
}

function syncStudentGroupCreateActions(group){const studentBtn=$('newStudent'),groupBtn=$('newGroupInline');if(studentBtn){studentBtn.classList.toggle('hidden',group||!canManage);studentBtn.hidden=group||!canManage;}if(groupBtn){groupBtn.classList.toggle('hidden',!group||!canManage);groupBtn.hidden=!group||!canManage;}}
function switchStudentGroupTab(mode){const group=mode==='groups';$('studentView').classList.toggle('hidden',group);$('groupView').classList.toggle('hidden',!group);$('studentListTab').classList.toggle('is-active',!group);$('groupListTab').classList.toggle('is-active',group);$('studentListTab').setAttribute('aria-selected',String(!group));$('groupListTab').setAttribute('aria-selected',String(group));syncStudentGroupCreateActions(group);requestAnimationFrame(()=>syncStudentGroupCreateActions(group));if(group&&!embeddedGroups.length)loadEmbeddedGroups().catch(e=>{console.error(e);groupSetMessage('Group list load করা যায়নি।','error')})}

function redirectToLogin() { window.location.replace('./'); }

function setMessage(text, type = '') {
  $('message').textContent = text;
  $('message').style.color = type === 'error' ? '#b33b3b' : '';
}

function setFormMessage(text, type = '') {
  $('formMessage').textContent = text;
  $('formMessage').className = `message-inline ${type}`.trim();
}

function activationBadge(userId) {
  return userId
    ? '<span class="active-badge on">Activated</span>'
    : '<span class="active-badge off">Not activated</span>';
}

function portalAction(student) {
  if (!canManagePortal) return '—';
  if (student.user_id) {
    return `<div class="action-stack"><button class="save-btn secondary portal-disable" data-id="${escapeHtml(student.student_id)}" type="button">Disable</button><button class="save-btn portal-reset" data-id="${escapeHtml(student.student_id)}" type="button">Reset access</button></div>`;
  }
  return '<span class="muted">Activates with ID + phone</span>';
}

function genderLabel(value) {
  if (value === 'male') return 'পুরুষ';
  if (value === 'female') return 'নারী';
  return 'নির্ধারিত নয়';
}

function yearLabel(date) {
  return date ? String(date).slice(0, 4) : '—';
}

function selectedText(id) {
  return $(id)?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function filterItems() {
  const q = $('search').value.trim();
  return [
    { key:'search', label:'Search', value:q, text:q },
    { key:'year', label:'ভর্তি', value:$('yearFilter').value, text:selectedText('yearFilter') },
    { key:'gender', label:'লিঙ্গ', value:$('genderFilter').value, text:selectedText('genderFilter') },
    { key:'status', label:'Status', value:$('statusFilter').value, text:selectedText('statusFilter') },
    { key:'course', label:'Class', value:$('courseFilter').value, text:selectedText('courseFilter') },
    { key:'portal', label:'Portal', value:$('portalFilter').value, text:selectedText('portalFilter') },
    { key:'teacher', label:'Teacher', value:$('teacherFilter').value, text:selectedText('teacherFilter') },
    { key:'phone', label:'Phone', value:$('phoneFilter').value, text:selectedText('phoneFilter') }
  ];
}

function refreshFilterChips() {
  renderFilterChips($('activeFilters'), filterItems(), async (key) => {
    if (key === '*') {
      resetFilters(false);
    } else if (key === 'search') {
      $('search').value = '';
    } else {
      const map = {
        year:'yearFilter', gender:'genderFilter', status:'statusFilter', course:'courseFilter',
        portal:'portalFilter', teacher:'teacherFilter', phone:'phoneFilter'
      };
      if (map[key]) $(map[key]).value = '';
    }
    page = 1;
    await loadStudents();
  });
}

function resetFilters(load = true) {
  $('search').value = '';
  ['yearFilter','genderFilter','statusFilter','courseFilter','portalFilter','teacherFilter','phoneFilter']
    .forEach((id) => { $(id).value = ''; });
  page = 1;
  refreshFilterChips();
  if (load) void loadStudents();
}

async function loadFilterOptions() {
  populateYearSelect($('yearFilter'), 'সব বছর', 30);
  const [{ data: teachers, error: teacherError }, { data: enrollments, error: enrollmentError }] = await Promise.all([
    supabase.from('qa_teachers').select('teacher_id,teacher_code,full_name').eq('active', true).order('full_name'),
    supabase.from('qa_enrollments').select('course_code').eq('status', 'active').not('course_code', 'is', null).limit(1000)
  ]);
  if (teacherError) console.warn('Teacher filter options unavailable', teacherError);
  if (enrollmentError) console.warn('Course filter options unavailable', enrollmentError);

  teacherMap = new Map((teachers || []).map((teacher) => [teacher.teacher_id, `${teacher.teacher_code} · ${teacher.full_name}`]));
  $('teacherFilter').innerHTML = '<option value="">সব Teacher</option><option value="__unassigned">Unassigned</option>' +
    (teachers || []).map((teacher) => `<option value="${escapeHtml(teacher.teacher_id)}">${escapeHtml(teacher.teacher_code)} · ${escapeHtml(teacher.full_name)}</option>`).join('');

  const courses = [...new Set((enrollments || []).map((row) => row.course_code).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'en'));
  $('courseFilter').innerHTML = '<option value="">সব Class / Course</option>' +
    courses.map((course) => `<option value="${escapeHtml(course)}">${escapeHtml(course)}</option>`).join('');
}

async function courseStudentIds(course) {
  if (!course) return null;
  if (courseStudentCache.has(course)) return courseStudentCache.get(course);
  const ids = [];
  let from = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await supabase.from('qa_enrollments')
      .select('student_id').eq('status','active').eq('course_code', course)
      .range(from, from + size - 1);
    if (error) throw error;
    ids.push(...(data || []).map((row) => row.student_id).filter(Boolean));
    if (!data || data.length < size) break;
    from += size;
  }
  const unique = [...new Set(ids)];
  courseStudentCache.set(course, unique);
  return unique;
}

function applyStudentFilters(query, allowedStudentIds) {
  const search = $('search').value.trim().replace(/[,()]/g, ' ');
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(`student_code.ilike.${pattern},full_name.ilike.${pattern},full_name_bn.ilike.${pattern},phone.ilike.${pattern}`);
  }

  const year = $('yearFilter').value;
  if (year) query = query.gte('admission_date', `${year}-01-01`).lt('admission_date', `${Number(year) + 1}-01-01`);

  const gender = $('genderFilter').value;
  if (gender) query = query.eq('gender', gender);

  const status = $('statusFilter').value;
  if (status) query = query.eq('status', status);

  const portal = $('portalFilter').value;
  if (portal === 'activated') query = query.not('user_id', 'is', null);
  if (portal === 'not_activated') query = query.is('user_id', null);

  const teacher = $('teacherFilter').value;
  if (teacher === '__unassigned') query = query.is('teacher_id', null);
  else if (teacher) query = query.eq('teacher_id', teacher);

  const phone = $('phoneFilter').value;
  if (phone === 'yes') query = query.not('phone', 'is', null).neq('phone', '');
  if (phone === 'no') query = query.or('phone.is.null,phone.eq.""');

  if (allowedStudentIds) query = query.in('student_id', allowedStudentIds);
  return query;
}

async function fetchStudentRows(from, to, includeCount = false) {
  const course = $('courseFilter').value;
  const allowed = await courseStudentIds(course);
  if (course && (!allowed || !allowed.length)) return { data:[], count:0, error:null };

  const fields = 'student_id,student_code,full_name,full_name_bn,gender,phone,admission_date,status,user_id,teacher_id';
  let query = supabase.from('qa_students').select(fields, includeCount ? { count:'exact' } : {});
  query = applyStudentFilters(query, allowed);
  query = query.order('created_at', { ascending:false }).range(from, to);
  return query;
}

async function groupTeacherMapForStudents(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { data: memberships, error } = await supabase.from('qa_group_memberships')
    .select('student_id,group_id').is('left_at', null).in('student_id', ids);
  if (error) {
    console.warn('Group teacher labels unavailable', error);
    return map;
  }
  const groupIds = [...new Set((memberships || []).map((row) => row.group_id).filter(Boolean))];
  if (!groupIds.length) return map;
  const { data: groups, error: groupError } = await supabase.from('qa_study_groups')
    .select('group_id,teacher_id').eq('active', true).in('group_id', groupIds);
  if (groupError) {
    console.warn('Group teacher labels unavailable', groupError);
    return map;
  }
  const teacherByGroup = new Map((groups || []).map((group) => [group.group_id, group.teacher_id]));
  (memberships || []).forEach((membership) => {
    const teacherId = teacherByGroup.get(membership.group_id);
    if (!teacherId) return;
    const teacher = teacherMap.get(teacherId);
    if (teacher) map.set(membership.student_id, `Group Teacher · ${teacher}`);
  });
  return map;
}

async function courseMapForStudents(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { data, error } = await supabase.from('qa_enrollments')
    .select('student_id,course_code').eq('status','active').in('student_id', ids);
  if (error) {
    console.warn('Course labels unavailable', error);
    return map;
  }
  (data || []).forEach((row) => {
    if (!row.course_code) return;
    if (!map.has(row.student_id)) map.set(row.student_id, []);
    map.get(row.student_id).push(row.course_code);
  });
  map.forEach((values, key) => map.set(key, [...new Set(values)].sort()));
  return map;
}

function renderStudents(list, courseMap = new Map()) {
  $('countLabel').textContent = `${totalRows} জন শিক্ষার্থী`;
  $('studentRows').innerHTML = list.map((s) => {
    const courses = (courseMap.get(s.student_id) || []).join(', ') || '—';
    const teacher = s.teacher_id ? (teacherMap.get(s.teacher_id) || 'Assigned') : (groupTeacherByStudent.get(s.student_id) || 'Unassigned');
    return `
    <tr>
      <td class="student-code"><a class="student-id-link" href="student-profile.html?id=${encodeURIComponent(s.student_id)}">${escapeHtml(s.student_code)}</a></td>
      <td>${escapeHtml(s.full_name)}${s.full_name_bn ? `<div class="muted">${escapeHtml(s.full_name_bn)}</div>` : ''}</td>
      <td data-col="gender">${escapeHtml(genderLabel(s.gender))}</td>
      <td data-col="course">${escapeHtml(courses)}</td>
      <td data-col="admission">${escapeHtml(yearLabel(s.admission_date))}</td>
      <td data-col="teacher">${escapeHtml(teacher)}</td>
      <td data-col="phone">${escapeHtml(s.phone || '—')}</td>
      <td data-col="status"><span class="active-badge ${s.status === 'active' ? 'on' : 'off'}">${escapeHtml(s.status || '—')}</span></td>
      <td data-col="portal">${activationBadge(s.user_id)}</td>
      <td data-col="access">${portalAction(s)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10">এই filter অনুযায়ী কোনো শিক্ষার্থী পাওয়া যায়নি।</td></tr>';
  bindPortalActions();
  syncColumns();
}

async function loadStudents() {
  const from = (page - 1) * pageSize;
  const { data, error, count } = await fetchStudentRows(from, from + pageSize - 1, true);
  if (error) throw error;

  totalRows = Number(count || 0);
  const pager = updatePager({
    summaryEl:$('paginationSummary'), pageLabelEl:$('pageLabel'), prevEl:$('prevPage'), nextEl:$('nextPage'),
    page, pageSize, total:totalRows
  });
  if (pager.page !== page) {
    page = pager.page;
    return loadStudents();
  }

  currentStudents = data || [];
  const ids = currentStudents.map((row) => row.student_id);
  const [courseMap, groupMap] = await Promise.all([courseMapForStudents(ids), groupTeacherMapForStudents(ids)]);
  groupTeacherByStudent = groupMap;
  renderStudents(currentStudents, courseMap);
  refreshFilterChips();
}

async function exportStudents(format, actionButton) {
  const button = $('exportList');
  button.disabled = true;
  if (actionButton) actionButton.disabled = true;
  try {
    const exported = [];
    let from = 0;
    const size = 1000;
    while (true) {
      const { data, error } = await fetchStudentRows(from, from + size - 1, false);
      if (error) throw error;
      const batch = data || [];
      const ids = batch.map((row) => row.student_id);
      const [courseMap, groupMap] = await Promise.all([courseMapForStudents(ids), groupTeacherMapForStudents(ids)]);
      batch.forEach((row) => {
        exported.push({
          ...row,
          courses:(courseMap.get(row.student_id) || []).join(', '),
          teacher_name:row.teacher_id ? (teacherMap.get(row.teacher_id) || 'Assigned') : (groupMap.get(row.student_id) || 'Unassigned')
        });
      });
      if (batch.length < size) break;
      from += size;
    }

    const columns = [
      { label:'Student ID', key:'student_code' },
      { label:'English Name', key:'full_name' },
      { label:'বাংলা নাম', key:'full_name_bn' },
      { label:'Gender', column:'gender', value:(row) => genderLabel(row.gender) },
      { label:'Class / Course', column:'course', key:'courses' },
      { label:'Admission Year', column:'admission', value:(row) => yearLabel(row.admission_date) },
      { label:'Assigned Teacher', column:'teacher', key:'teacher_name' },
      { label:'Phone', column:'phone', key:'phone' },
      { label:'Status', column:'status', key:'status' },
      { label:'Portal', column:'portal', value:(row) => row.user_id ? 'Activated' : 'Not Activated' }
    ];
    const exportColumns = visibleExportColumns(columns, $('columnMenu'));
    const date = new Date().toISOString().slice(0,10);
    const base = `QuranerAlo_Students_${date}`;
    const note = filterItems().filter((item) => String(item.value || '').trim())
      .map((item) => `${item.label}: ${item.text}`).join(' · ') || 'All students';

    if (format === 'csv') {
      downloadCsv(base + '.csv', exportColumns, exported);
    } else if (format === 'xlsx') {
      await downloadXlsx(base + '.xlsx', 'Students', exportColumns, exported);
    } else if (format === 'pdf') {
      await downloadPdf(base + '.pdf', 'Student List', exportColumns, exported, note);
    } else if (format === 'print') {
      printRows('Student List', exportColumns, exported, note);
    } else {
      throw new Error('Unsupported export format');
    }

    const label = format === 'xlsx' ? 'Excel' : format === 'pdf' ? 'PDF' : format === 'print' ? 'Print' : 'CSV';
    setMessage(`${exported.length} জন শিক্ষার্থীর filtered list ${label} এর জন্য প্রস্তুত হয়েছে।`);
  } catch (error) {
    console.error(error);
    setMessage('Student export করা যায়নি।', 'error');
  } finally {
    button.disabled = false;
    if (actionButton) actionButton.disabled = false;
  }
}

function getGuardianFromForm(prefix) {
  return {
    full_name: $(prefix + 'Name').value.trim(),
    relation: $(prefix + 'Relation').value.trim(),
    phone: $(prefix + 'Phone').value.trim(),
    email: $(prefix + 'Email').value.trim(),
    address: $(prefix + 'Address').value.trim()
  };
}

function syncPrimaryGuardianName() {
  const relation = $('guardian1Relation').value;
  if (relation === 'Father') $('guardian1Name').value = $('fatherName').value.trim();
  if (relation === 'Mother') $('guardian1Name').value = $('motherName').value.trim();
}

function resetGuardianForm() {
  $('guardian1Name').value = '';
  $('guardian1Relation').value = '';
  $('guardian1Phone').value = '';
  $('guardian1Email').value = '';
  $('guardian1Address').value = '';
  $('guardian2Enabled').checked = false;
  $('guardian2Fields').classList.add('hidden');
  $('guardian2Name').value = '';
  $('guardian2Relation').value = '';
  $('guardian2Phone').value = '';
  $('guardian2Email').value = '';
  $('guardian2Address').value = '';
}

function friendlyRpcError(error) {
  const code = String(error?.message || '');
  if (code.includes('STUDENTS_MANAGE_REQUIRED')) return 'Student create permission নেই।';
  if (code.includes('STUDENT_NAME_REQUIRED')) return 'Student-এর নাম দিন।';
  if (code.includes('AT_LEAST_ONE_GUARDIAN_REQUIRED')) return 'কমপক্ষে একজন guardian-এর তথ্য দিন।';
  if (code.includes('GUARDIAN_NAME_REQUIRED')) return 'Guardian-এর নাম দিন।';
  if (code.includes('GUARDIAN_RELATION_REQUIRED')) return 'Guardian-এর সম্পর্ক নির্বাচন করুন।';
  return 'Student ও guardian তথ্য save করা যায়নি। আবার চেষ্টা করুন।';
}

async function portalAdminAction(action, entityId) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) { redirectToLogin(); return; }
  const response = await fetch(`${config.supabaseUrl}/functions/v1/portal-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': config.supabasePublishableKey
    },
    body: JSON.stringify({ action, entityType: 'student', entityId })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'PORTAL_ADMIN_FAILED');
  return body;
}

function bindPortalActions() {
  document.querySelectorAll('.portal-disable').forEach((button) => button.addEventListener('click', async () => {
    const student = currentStudents.find((x) => x.student_id === button.dataset.id);
    if (!student || !confirm(`${student.student_code} portal access disable করবেন?`)) return;
    button.disabled = true;
    try {
      await portalAdminAction('disable', student.student_id);
      setMessage(`${student.student_code} portal access disabled.`);
      await loadStudents();
    } catch (error) {
      console.error(error);
      setMessage('Portal access disable করা যায়নি।', 'error');
      button.disabled = false;
    }
  }));

  document.querySelectorAll('.portal-reset').forEach((button) => button.addEventListener('click', async () => {
    const student = currentStudents.find((x) => x.student_id === button.dataset.id);
    if (!student || !confirm(`${student.student_code} portal account reset করবেন? এতে পুরনো login account বাতিল হবে এবং student আবার phone দিয়ে activate করতে পারবে।`)) return;
    button.disabled = true;
    try {
      await portalAdminAction('reset', student.student_id);
      setMessage(`${student.student_code} portal access reset হয়েছে।`);
      await loadStudents();
    } catch (error) {
      console.error(error);
      setMessage('Portal access reset করা যায়নি।', 'error');
      button.disabled = false;
    }
  }));
}

$('studentListTab').addEventListener('click',()=>switchStudentGroupTab('students'));
$('groupListTab').addEventListener('click',()=>switchStudentGroupTab('groups'));
$('groupSearch').addEventListener('input',debounce(renderEmbeddedGroups,250));
$('groupStatusFilter').addEventListener('change',renderEmbeddedGroups);
$('groupTeacherFilter').addEventListener('change',renderEmbeddedGroups);
$('newGroupInline').addEventListener('click',createEmbeddedGroup);

$('newStudent').addEventListener('click', () => {
  if (canManage) {
    $('studentFormPanel').classList.toggle('hidden');
    setFormMessage('');
  }
});

$('cancelStudent').addEventListener('click', () => {
  $('studentForm').reset();
  resetGuardianForm();
  $('studentFormPanel').classList.add('hidden');
  setFormMessage('');
});

$('guardian1Relation').addEventListener('change', syncPrimaryGuardianName);
$('fatherName').addEventListener('input', syncPrimaryGuardianName);
$('motherName').addEventListener('input', syncPrimaryGuardianName);
$('guardian2Enabled').addEventListener('change', () => {
  $('guardian2Fields').classList.toggle('hidden', !$('guardian2Enabled').checked);
});

const debouncedSearch = debounce(() => {
  page = 1;
  loadStudents().catch((error) => {
    console.error(error);
    setMessage('Student list filter করা যায়নি।', 'error');
  });
}, 350);
$('search').addEventListener('input', debouncedSearch);

['yearFilter','genderFilter','statusFilter','courseFilter','portalFilter','teacherFilter','phoneFilter'].forEach((id) => {
  $(id).addEventListener('change', () => {
    page = 1;
    loadStudents().catch((error) => {
      console.error(error);
      setMessage('Student list filter করা যায়নি।', 'error');
    });
  });
});

$('resetFilters').addEventListener('click', () => resetFilters(true));
$('toggleFilters').addEventListener('click', () => {
  const open = $('advancedFilters').classList.toggle('is-open');
  $('toggleFilters').setAttribute('aria-expanded', String(open));
});
$('pageSize').addEventListener('change', () => {
  pageSize = Number($('pageSize').value || 10);
  page = 1;
  void loadStudents();
});
$('prevPage').addEventListener('click', () => { if (page > 1) { page -= 1; void loadStudents(); } });
$('nextPage').addEventListener('click', () => { page += 1; void loadStudents(); });
bindExportMenu({
  button:$('exportList'),
  menu:$('exportMenu'),
  onAction:(format, actionButton) => exportStudents(format, actionButton)
});

$('studentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!canManage) {
    setFormMessage('Student create permission নেই।', 'error');
    return;
  }

  setFormMessage('Student ও guardian তথ্য save হচ্ছে…');
  const form = new FormData(event.currentTarget);
  const guardians = [getGuardianFromForm('guardian1')];

  if ($('guardian2Enabled').checked) {
    const guardian2 = getGuardianFromForm('guardian2');
    if (!guardian2.full_name || !guardian2.relation) {
      setFormMessage('দ্বিতীয় guardian যোগ করলে নাম ও সম্পর্ক দিতে হবে।', 'error');
      return;
    }
    guardians.push(guardian2);
  }

  try {
    const { data, error } = await supabase.rpc('qa_create_student_with_guardian', {
      p_student: {
        full_name: String(form.get('full_name') || '').trim(),
        gender: String(form.get('gender') || 'unspecified'),
        date_of_birth: form.get('date_of_birth') || '',
        phone: String(form.get('phone') || '').trim(),
        admission_date: form.get('admission_date') || new Date().toISOString().slice(0, 10),
        status: String(form.get('status') || 'active'),
        monthly_fee: Number(form.get('monthly_fee') || 0),
        notes: String(form.get('notes') || '').trim(),
        father_name: String(form.get('father_name') || '').trim(),
        father_nid: String(form.get('father_nid') || '').trim(),
        mother_name: String(form.get('mother_name') || '').trim(),
        mother_nid: String(form.get('mother_nid') || '').trim(),
        birth_registration_no: String(form.get('birth_registration_no') || '').trim()
      },
      p_guardians: guardians
    });

    if (error) throw error;

    const fullNameBn = String(form.get('full_name_bn') || '').trim();
    if (fullNameBn && data?.student_id) {
      const { error: bengaliNameError } = await supabase.from('qa_students')
        .update({ full_name_bn: fullNameBn })
        .eq('student_id', data.student_id);
      if (bengaliNameError) throw bengaliNameError;
    }

    event.currentTarget.reset();
    resetGuardianForm();
    $('studentFormPanel').classList.add('hidden');
    const guardianCount = Number(data?.guardians_created || guardians.length);
    setMessage(`শিক্ষার্থী ${data?.student_code || ''} সফলভাবে যুক্ত হয়েছে। ${guardianCount} জন guardian তথ্যও সংরক্ষণ করা হয়েছে।`);
    setFormMessage('');
    page = 1;
    await loadStudents();
  } catch (error) {
    console.error(error);
    setFormMessage(friendlyRpcError(error), 'error');
  }
});

$('signOut').addEventListener('click', async () => {
  await supabase.auth.signOut();
  redirectToLogin();
});

function applyCompactListLayout(){
  const panel=document.querySelector('.list-management-panel');
  const actions=panel?.querySelector('.list-head-actions');
  const reset=document.getElementById('resetFilters');
  if(panel&&actions&&reset&&!actions.contains(reset)) actions.appendChild(reset);
  panel?.classList.add('compact-list-layout');
}

async function init() {
  applyCompactListLayout();
  initMobileListTools({search:'search',toggle:'toggleFilters',filters:'advancedFilters',export:'exportList',columns:'columnsButton',reset:'resetFilters',create:'newStudent',chips:'activeFilters',count:'countLabel'});
  initMobileListTools({search:'groupSearch',toggle:'groupToggleFilters',filters:'groupAdvancedFilters',export:'groupExport',columns:'groupColumns',reset:'groupResetFilters',create:'newGroupInline',count:'groupCountLabel',group:true});
  bindGroupListTools();
  const access = await getAccess(supabase);
  if (!access) {
    await supabase.auth.signOut();
    return redirectToLogin();
  }

  if (!access.can('students.view') && !access.can('students.manage')) {
    $('loading').textContent = 'এই module দেখার permission আপনার account-এ নেই।';
    return;
  }

  canManage = access.can('students.manage');
  canManagePortal = access.profile.role === 'owner';
  $('loading').classList.add('hidden');
  $('app').classList.remove('hidden');
  switchStudentGroupTab('students');

  syncColumns = bindColumnMenu({
    button:$('columnsButton'), menu:$('columnMenu'), table:$('studentTable')
  }) || (() => {});

  try {
    await loadFilterOptions();
    await loadStudents();
  } catch (error) {
    console.error(error);
    setMessage('Student list load করা যায়নি।', 'error');
  }
}

init().catch((error) => {
  console.error(error);
  $('loading').textContent = 'Page load করা যায়নি।';
});
