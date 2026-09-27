drop policy if exists qa_attendance_delete on public.qa_attendance;
create policy qa_attendance_delete on public.qa_attendance for delete to authenticated using (
 (select private.qa_has_permission('attendance.manage'))
 or exists(select 1 from public.qa_teachers t where t.user_id=(select auth.uid()) and t.active=true and private.qa_teacher_owns_student(qa_attendance.student_id,t.teacher_id))
);