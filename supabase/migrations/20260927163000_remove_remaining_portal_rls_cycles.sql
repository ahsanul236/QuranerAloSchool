create or replace function private.qa_current_user_is_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.qa_students s where s.student_id=p_student_id and s.user_id=auth.uid());
$$;
drop policy if exists qa_enrollments_select on public.qa_enrollments;
create policy qa_enrollments_select on public.qa_enrollments for select to authenticated using (
 (select private.qa_has_permission('enrollments.manage'))
 or (select private.qa_has_permission('enrollments.view'))
 or private.qa_current_user_is_student(student_id)
 or teacher_user_id=(select auth.uid())
);
drop policy if exists qa_group_memberships_select on public.qa_group_memberships;
create policy qa_group_memberships_select on public.qa_group_memberships for select to authenticated using (
 (select private.qa_has_permission('students.view'))
 or (select private.qa_has_permission('students.manage'))
 or private.qa_user_is_group_teacher(group_id)
 or private.qa_current_user_is_student(student_id)
);
drop policy if exists qa_attendance_select on public.qa_attendance;
create policy qa_attendance_select on public.qa_attendance for select to authenticated using (
 (select private.qa_has_permission('attendance.manage'))
 or (select private.qa_has_permission('attendance.view'))
 or private.qa_current_user_is_student(student_id)
 or exists(select 1 from public.qa_teachers t where t.teacher_id=qa_attendance.teacher_id and t.user_id=(select auth.uid()))
 or exists(select 1 from public.qa_teachers t where t.user_id=(select auth.uid()) and t.active=true and private.qa_teacher_owns_student(qa_attendance.student_id,t.teacher_id))
);