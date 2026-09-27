import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { mountDocumentsPanel, setProfileImage } from './documents-ui.js?v=20260922-2';

const c = window.QURANER_ALO_CONFIG;
const supabase = createClient(c.supabaseUrl, c.supabasePublishableKey, {
  auth: { autoRefreshToken: true, persistSession: true }
});
const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(window.location.search);

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
  if (['active', 'paid', 'completed'].includes(v)) return 'on';
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

async function resolveTeacher(session) {
  const previewId = qs.get('preview_teacher');
  const viewer = await getViewerProfile(session);

  if (previewId) {
    if (!viewer || !viewer.active || viewer.role !== 'owner') throw new Error('PREVIEW_NOT_ALLOWED');

    const { data, error } = await supabase.functions.invoke('portal-preview', {
      body: { entityType: 'teacher', entityId: previewId }
    });
    if (error) throw error;
    if (!data?.ok || data.entityType !== 'teacher' || !data.entity) {
      throw new Error(data?.error || 'PREVIEW_NOT_FOUND');
    }
    const teacher = data.entity;
    $('previewBanner').classList.remove('hidden');
    $('previewText').textContent =
      `Read-only preview · ${teacher.teacher_code} · ${teacher.full_name}`;
    $('signOut').textContent = 'Exit Preview';
    return teacher;
  }

  const { data, error } = await supabase.from('qa_teachers')
    .select('teacher_id,teacher_code,full_name,full_name_bn,phone,email,specialization,joining_date,active,user_id,father_name,mother_name,nid_number,address')
    .eq('user_id', session.user.id).maybeSingle();

  if (error || !data) throw error || new Error('TEACHER_PROFILE_NOT_FOUND');
  return data;
}

async function loadTeacherDetails(teacherId) {
  const { data, error } = await supabase.from('qa_teachers')
    .select('teacher_id,teacher_code,full_name,full_name_bn,phone,email,specialization,joining_date,active,user_id,father_name,mother_name,nid_number,address')
    .eq('teacher_id', teacherId).maybeSingle();
  if (error || !data) throw error || new Error('TEACHER_PROFILE_NOT_FOUND');
  return data;
}


async function attendanceSummaryMap(students){
  const ids=[...new Set(students.map(s=>s.student_id))]; if(!ids.length)return {};
  const {data,error}=await supabase.from('qa_attendance').select('student_id,status').in('student_id',ids).in('status',['present','absent']);
  if(error)throw error; const map={};
  ids.forEach(id=>map[id]={present:0,total:0});
  (data||[]).forEach(a=>{if(!map[a.student_id])map[a.student_id]={present:0,total:0};map[a.student_id].total++;if(a.status==='present')map[a.student_id].present++});
  return map;
}
function summaryText(summary){
  const total=summary?.total||0,present=summary?.present||0,pct=total?Math.round((present/total)*100):0;
  return pct+'% · '+present+' days out of '+total+' days';
}
function attendanceChoices(studentId,current){
  return '<div class="attendance-choices" data-attendance-student="'+esc(studentId)+'">'
    +'<label><input type="radio" name="att-'+esc(studentId)+'" value="present" '+(current==='present'?'checked':'')+'> Present</label>'
    +'<label><input type="radio" name="att-'+esc(studentId)+'" value="absent" '+(current==='absent'?'checked':'')+'> Absent</label>'
    +'<label><input type="radio" name="att-'+esc(studentId)+'" value="" '+(!current?'checked':'')+'> Not Recorded</label></div>';
}
async function attendanceForDate(students,date){
  const ids=[...new Set(students.map(s=>s.student_id))]; if(!ids.length)return {};
  const {data,error}=await supabase.from('qa_attendance').select('attendance_id,student_id,status').eq('attendance_date',date).is('session_id',null).in('student_id',ids);
  if(error)throw error; return Object.fromEntries((data||[]).map(a=>[a.student_id,a]));
}
async function saveAttendanceRows(teacher,students,date,containerId){
  const today=new Date().toISOString().slice(0,10); if(!date||date>today)throw new Error('Future date save করা যাবে না।');
  const existing=await attendanceForDate(students,date); let changed=0;
  for(const student of students){
    const choice=document.querySelector('#'+containerId+' [data-attendance-student="'+CSS.escape(student.student_id)+'"] input:checked');
    const status=choice?.value??''; const old=existing[student.student_id];
    if(!status){
      if(old){const r=await supabase.from('qa_attendance').delete().eq('attendance_id',old.attendance_id);if(r.error)throw r.error;changed++}
      continue;
    }
    if(old?.status===status)continue;
    const payload={teacher_id:teacher.teacher_id,student_id:student.student_id,attendance_date:date,session_id:null,status,remarks:'',updated_at:new Date().toISOString()};
    const r=old?await supabase.from('qa_attendance').update(payload).eq('attendance_id',old.attendance_id):await supabase.from('qa_attendance').insert(payload);
    if(r.error)throw r.error;changed++;
  }
  return changed;
}
async function renderAssignedStudents(students,mode=false,date='',readOnly=false){
  const summaries=await attendanceSummaryMap(students); const daily=mode?await attendanceForDate(students,date):{};
  $('assignedStudentRows').innerHTML=students.map(student=>{
    const digits=String(student.phone||'').replace(/[^0-9]/g,'').replace(/^00/,'');const waDigits=digits?(digits.startsWith('0')?'88'+digits:digits):'';
    const wa=waDigits?'<a class="whatsapp-btn" href="https://wa.me/'+waDigits+'" target="_blank" rel="noopener noreferrer">WhatsApp</a>':'<span class="muted">ফোন নেই</span>';
    const attendance=mode&&!readOnly?attendanceChoices(student.student_id,daily[student.student_id]?.status||''):'<span class="attendance-summary">'+esc(summaryText(summaries[student.student_id]))+'</span>';
    return '<tr><td><div class="assigned-person-inline"><img id="teacherAssignedStudentPhoto-'+esc(student.student_id)+'" class="portal-relationship-avatar small hidden" alt="Student profile"><div><strong>'+esc(student.full_name||student.student_code||'Student')+'</strong><br><span class="muted">'+esc(student.student_code||'—')+'</span></div></div></td><td>'+esc(student.phone||'—')+'</td><td><span class="active-badge '+statusClass(student.status)+'">'+esc(student.status||'—')+'</span></td><td>'+attendance+'</td><td>'+wa+'</td></tr>';
  }).join('')||'<tr><td colspan="5">এখনো কোনো individually assigned Student নেই।</td></tr>';
  await Promise.all(students.map(student=>setProfileImage({role:'student',personId:student.student_id,img:$('teacherAssignedStudentPhoto-'+student.student_id)})));
}
async function loadAssignedStudents(previewTeacherId=''){
  const {data,error}=await supabase.functions.invoke('portal-teacher-student',{body:{action:'teacher',...(previewTeacherId?{previewTeacherId}:{})}});
  if(error)throw error;if(!data?.ok)throw new Error(data?.error||'ASSIGNED_STUDENTS_LOAD_FAILED');return data.students||[];
}
async function loadTeachingGroups(teacherId){
  const {data:groups,error}=await supabase.from('qa_study_groups').select('group_id,group_name,active').eq('teacher_id',teacherId).eq('active',true).order('group_name');
  if(error)throw error;const gids=(groups||[]).map(g=>g.group_id);let memberships=[];
  if(gids.length){const r=await supabase.from('qa_group_memberships').select('group_id,student_id').in('group_id',gids).is('left_at',null);if(r.error)throw r.error;memberships=r.data||[]}
  const ids=[...new Set(memberships.map(m=>m.student_id))];let sm={};
  if(ids.length){const r=await supabase.from('qa_students').select('student_id,student_code,full_name,phone,status').in('student_id',ids);if(r.error)throw r.error;sm=Object.fromEntries((r.data||[]).map(s=>[s.student_id,s]))}
  return {groups:groups||[],memberships,students:ids.map(id=>sm[id]).filter(Boolean),studentMap:sm};
}
async function renderGroups(groupData,mode=false,date='',readOnly=false){
  const summaries=await attendanceSummaryMap(groupData.students);const daily=mode?await attendanceForDate(groupData.students,date):{};
  const rows=[];
  for(const g of groupData.groups){
    const list=groupData.memberships.filter(m=>m.group_id===g.group_id).map(m=>groupData.studentMap[m.student_id]).filter(Boolean);
    if(!list.length){rows.push('<tr><td><strong>'+esc(g.group_name)+'</strong></td><td>কোনো active Student নেই।</td><td>—</td><td>0</td></tr>');continue}
    list.forEach((s,i)=>{const attendance=mode&&!readOnly?attendanceChoices(s.student_id,daily[s.student_id]?.status||''):'<span class="attendance-summary">'+esc(summaryText(summaries[s.student_id]))+'</span>';rows.push('<tr><td>'+(i===0?'<strong>'+esc(g.group_name)+'</strong>':'')+'</td><td>'+esc((s.student_code||'')+' · '+(s.full_name||'Student'))+'</td><td>'+attendance+'</td><td>'+(i===0?list.length:'')+'</td></tr>')});
  }
  $('groupRows').innerHTML=rows.join('')||'<tr><td colspan="4">কোনো active Group assigned নেই।</td></tr>';
}
function setupAttendanceSection({teacher,students,getGroupData,buttonId,dateId,dateWrapId,messageId,containerId,render,readOnly}){
  const button=$(buttonId),input=$(dateId),wrap=$(dateWrapId),message=$(messageId);const today=new Date().toISOString().slice(0,10);input.max=today;input.value=today;
  if(readOnly){button.classList.add('hidden');return}
  let mode=false,busy=false;
  const redraw=async()=>{if(getGroupData)await render(getGroupData(),mode,input.value,readOnly);else await render(students,mode,input.value,readOnly)};
  input.onchange=()=>{if(input.value>today)input.value=today;redraw().catch(e=>{message.textContent=e.message||'Attendance load করা যায়নি।';message.className='portal-message error'})};
  button.onclick=async()=>{if(busy)return;message.textContent='';
    if(!mode){mode=true;wrap.classList.remove('hidden');button.textContent='Save Attendance';await redraw();return}
    busy=true;button.disabled=true;
    try{const targetStudents=getGroupData?getGroupData().students:students;const changed=await saveAttendanceRows(teacher,targetStudents,input.value,containerId);mode=false;wrap.classList.add('hidden');button.textContent='Take Attendance';await redraw();message.textContent=changed+'টি attendance পরিবর্তন save হয়েছে।';message.className='portal-message success'}
    catch(e){message.textContent=e.message||'Attendance save করা যায়নি।';message.className='portal-message error'}
    finally{busy=false;button.disabled=false}
  };
}
async function loadPayroll(previewTeacherId = '') {
  const { data, error } = await supabase.functions.invoke('portal-self-payroll', {
    body: previewTeacherId ? { action: 'list', previewTeacherId } : { action: 'list' }
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

  const previewTeacherId = qs.get('preview_teacher') || '';
  $('signOut').addEventListener('click', async () => {
    if (previewTeacherId) {
      location.href = 'dashboard.html#settings';
      return;
    }
    try { await supabase.auth.signOut(); } finally { location.replace('./'); }
  });
  $('exitPreview')?.addEventListener('click', () => { location.href = 'dashboard.html'; });

  const baseTeacher = await resolveTeacher(session);
  const teacher = await loadTeacherDetails(baseTeacher.teacher_id);

  if (!teacher.active) {
    await supabase.auth.signOut();
    location.replace('./');
    return;
  }

  await setProfileImage({role:'teacher',personId:teacher.teacher_id,img:$('teacherPortalProfileImage')});
  await mountDocumentsPanel({
    container:$('teacherPortalDocuments'),
    role:'teacher',
    personId:teacher.teacher_id,
    editable:!previewTeacherId,
    canDelete:false,
    title:'My Documents'
  });

  $('teacherCodeBadge').textContent = teacher.teacher_code || '—';
  $('teacherName').textContent = teacher.full_name_bn || teacher.full_name || '—';
  $('teacherSubtitle').textContent = `Teacher ID: ${teacher.teacher_code || '—'} · ${teacher.active ? 'Active' : 'Inactive'}`;
  $('teacherCodeHero').textContent = teacher.teacher_code || '—';
  $('teacherPhoneHero').textContent = teacher.phone || 'ফোন নম্বর দেওয়া নেই';
  $('statusHero').textContent = teacher.active ? 'Active' : 'Inactive';
  $('statusHero').className = `active-badge ${statusClass(teacher.active ? 'active' : 'inactive')}`;

  $('teacherCode').textContent = teacher.teacher_code || '—';
  $('teacherPhone').textContent = teacher.phone || '—';
  $('teacherEmail').textContent = teacher.email || '—';
  $('joiningDate').textContent = formatDate(teacher.joining_date);
  $('fatherName').textContent = teacher.father_name || '—';
  $('motherName').textContent = teacher.mother_name || '—';
  $('nidNumber').textContent = teacher.nid_number || '—';
  $('address').textContent = teacher.address || '—';
  $('specialization').textContent = teacher.specialization || '—';

  const [{ data: enrollmentData, error: enrollmentError }, payroll, assignedStudents, groupData] = await Promise.all([
    supabase.from('qa_enrollments')
      .select('student_id,course_code,start_date,end_date,status')
      .eq('teacher_user_id', teacher.user_id)
      .order('start_date', { ascending: false })
      .limit(100),
    loadPayroll(previewTeacherId),
    loadAssignedStudents(previewTeacherId),
    loadTeachingGroups(teacher.teacher_id)
  ]);

  if (enrollmentError) throw enrollmentError;
  const groupStudentIds=new Set(groupData.students.map(s=>s.student_id));
  const singleStudents=assignedStudents.filter(s=>!groupStudentIds.has(s.student_id));
  await renderAssignedStudents(singleStudents,false,'',Boolean(previewTeacherId));
  await renderGroups(groupData,false,'',Boolean(previewTeacherId));
  setupAttendanceSection({teacher,students:singleStudents,buttonId:'singleAttendanceToggle',dateId:'singleAttendanceDate',dateWrapId:'singleAttendanceDateWrap',messageId:'singleAttendanceMessage',containerId:'assignedStudentRows',render:renderAssignedStudents,readOnly:Boolean(previewTeacherId)});
  setupAttendanceSection({teacher,getGroupData:()=>groupData,buttonId:'groupAttendanceToggle',dateId:'groupAttendanceDate',dateWrapId:'groupAttendanceDateWrap',messageId:'groupAttendanceMessage',containerId:'groupRows',render:renderGroups,readOnly:Boolean(previewTeacherId)});
  const attendanceStudents=[...new Map([...singleStudents,...groupData.students].map(s=>[s.student_id,s])).values()];

  const enrollments = enrollmentData || [];
  $('studentCount').textContent = String(attendanceStudents.length);
  const studentIds = [...new Set(enrollments.map((item) => item.student_id).filter(Boolean))];
  let studentNames = {};
  if (studentIds.length) {
    const { data: students, error } = await supabase.from('qa_students')
      .select('student_id,student_code,full_name').in('student_id', studentIds);
    if (error) throw error;
    studentNames = Object.fromEntries((students || []).map((student) => [
      student.student_id, `${student.student_code} · ${student.full_name}`
    ]));
  }

  $('studentRows').innerHTML = enrollments.map((item) => `
    <tr>
      <td>${esc(studentNames[item.student_id] || item.student_id)}</td>
      <td>${esc(item.course_code)}</td>
      <td>${esc(formatDate(item.start_date))}</td>
      <td><span class="active-badge ${statusClass(item.status)}">${esc(item.status)}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="4">No assigned students.</td></tr>';

  const payrollRows = payroll.payrolls || [];
  $('latestPaidAmount').textContent = money(payroll.summary?.latestPaidAmount || 0);
  $('latestPaidMonth').textContent = payroll.summary?.latestPaidMonth
    ? `Latest paid month: ${formatDate(payroll.summary.latestPaidMonth)}`
    : 'কোনো paid record নেই';
  $('totalPaid').textContent = money(payroll.summary?.totalPaid || 0);
  $('paidCount').textContent = `${Number(payroll.summary?.paidCount || 0)} টি paid record`;

  $('payrollRows').innerHTML = payrollRows.map((item) => `
    <tr>
      <td>${esc(formatDate(item.payroll_month))}</td>
      <td><span class="active-badge ${statusClass(item.status)}">${esc(item.status || '—')}</span></td>
      <td><strong>${esc(money(item.net_payable))}</strong></td>
      <td>${esc(item.paid_at ? new Date(item.paid_at).toLocaleDateString('en-GB') : '—')}</td>
      <td>${esc(item.payment_method || '—')}</td>
      <td>${item.status === 'paid' ? `<a class="portal-action-link" href="receipt.html?type=payroll&id=${encodeURIComponent(item.payroll_id)}&portal=1${previewTeacherId ? '&preview_teacher=' + encodeURIComponent(previewTeacherId) : ''}" target="_blank" rel="noopener noreferrer">রিসিট দেখুন</a>` : '<span class="muted">পেমেন্ট হয়নি</span>'}</td>
    </tr>
  `).join('') || '<tr><td colspan="6">No payroll record.</td></tr>';

  try { await setSchoolWhatsApp(); } catch (error) { console.warn('school WhatsApp link unavailable', error); }

  $('loading').classList.add('hidden');
  $('app').classList.remove('hidden');
}

init().catch((error) => {
  console.error('teacher portal error', error);
  if (error.message === 'PREVIEW_NOT_ALLOWED') {
    location.replace('./');
    return;
  }
  $('loading').classList.add('hidden');
  $('errorBox').textContent = error.message || 'Portal load করা যায়নি।';
  $('errorBox').classList.remove('hidden');
});
