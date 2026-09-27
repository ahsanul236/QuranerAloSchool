create or replace function private.qa_user_is_group_teacher(p_group_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.qa_study_groups g
    join public.qa_teachers t on t.teacher_id=g.teacher_id
    where g.group_id=p_group_id and t.user_id=auth.uid() and t.active=true
  );
$$;
create or replace function private.qa_user_is_group_student(p_group_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.qa_group_memberships gm
    join public.qa_students s on s.student_id=gm.student_id
    where gm.group_id=p_group_id and gm.left_at is null and s.user_id=auth.uid()
  );
$$;
drop policy if exists qa_study_groups_select on public.qa_study_groups;
create policy qa_study_groups_select on public.qa_study_groups for select to authenticated using (
 (select private.qa_has_permission('students.view'))
 or (select private.qa_has_permission('students.manage'))
 or exists(select 1 from public.qa_teachers t where t.teacher_id=qa_study_groups.teacher_id and t.user_id=(select auth.uid()))
 or private.qa_user_is_group_student(group_id)
);
drop policy if exists qa_group_memberships_select on public.qa_group_memberships;
create policy qa_group_memberships_select on public.qa_group_memberships for select to authenticated using (
 (select private.qa_has_permission('students.view'))
 or (select private.qa_has_permission('students.manage'))
 or private.qa_user_is_group_teacher(group_id)
 or exists(select 1 from public.qa_students s where s.student_id=qa_group_memberships.student_id and s.user_id=(select auth.uid()))
);