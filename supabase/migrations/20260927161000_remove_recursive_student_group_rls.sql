drop policy if exists qa_students_select on public.qa_students;
create policy qa_students_select on public.qa_students for select to authenticated using (
 (select private.qa_has_permission('students.manage'))
 or (select private.qa_has_permission('students.view'))
 or user_id=(select auth.uid())
 or exists(
   select 1 from public.qa_teachers t
   where t.user_id=(select auth.uid()) and t.active=true
     and private.qa_teacher_owns_student(qa_students.student_id,t.teacher_id)
 )
);