drop policy if exists qa_attendance_select on public.qa_attendance;
create policy qa_attendance_select on public.qa_attendance for select to authenticated
using (
  (select private.qa_has_permission('attendance.manage'))
  or (select private.qa_has_permission('attendance.view'))
  or exists(select 1 from public.qa_students s where s.student_id=qa_attendance.student_id and s.user_id=(select auth.uid()))
  or exists(select 1 from public.qa_teachers t where t.teacher_id=qa_attendance.teacher_id and t.user_id=(select auth.uid()))
  or exists(select 1 from public.qa_teachers t where t.user_id=(select auth.uid()) and t.active=true and private.qa_teacher_owns_student(qa_attendance.student_id,t.teacher_id))
);
drop policy if exists qa_attendance_update on public.qa_attendance;
create policy qa_attendance_update on public.qa_attendance for update to authenticated
using (
  (select private.qa_has_permission('attendance.manage'))
  or exists(select 1 from public.qa_teachers t where t.user_id=(select auth.uid()) and t.active=true and private.qa_teacher_owns_student(qa_attendance.student_id,t.teacher_id))
)
with check (
  attendance_date<=current_date and (
    (select private.qa_has_permission('attendance.manage'))
    or exists(select 1 from public.qa_teachers t where t.user_id=(select auth.uid()) and t.active=true and private.qa_teacher_owns_student(qa_attendance.student_id,t.teacher_id))
  )
);