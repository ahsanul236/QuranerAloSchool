create or replace function private.qa_current_student_has_teacher(p_teacher_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.qa_enrollments e
    join public.qa_students s on s.student_id=e.student_id
    where e.teacher_user_id=p_teacher_user_id and s.user_id=auth.uid()
  );
$$;
drop policy if exists qa_teachers_select on public.qa_teachers;
create policy qa_teachers_select on public.qa_teachers for select to authenticated using (
 (select private.qa_has_permission('teachers.manage'))
 or (select private.qa_has_permission('teachers.view'))
 or user_id=(select auth.uid())
 or private.qa_current_student_has_teacher(user_id)
);