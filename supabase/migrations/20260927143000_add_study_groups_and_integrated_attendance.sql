-- Study groups and integrated attendance security.
create table if not exists public.qa_study_groups (
  group_id uuid primary key default gen_random_uuid(), group_name text not null,
  teacher_id uuid references public.qa_teachers(teacher_id) on delete set null,
  active boolean not null default true, notes text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists qa_study_groups_teacher_idx on public.qa_study_groups(teacher_id, active);
create table if not exists public.qa_group_memberships (
  membership_id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.qa_study_groups(group_id) on delete cascade,
  student_id uuid not null references public.qa_students(student_id) on delete cascade,
  joined_at date not null default current_date, left_at date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint qa_group_memberships_dates_check check (left_at is null or left_at >= joined_at)
);
create unique index if not exists uq_qa_group_memberships_active_student on public.qa_group_memberships(student_id) where left_at is null;
create index if not exists qa_group_memberships_group_idx on public.qa_group_memberships(group_id,left_at);
create index if not exists qa_group_memberships_student_idx on public.qa_group_memberships(student_id,left_at);
alter table public.qa_study_groups enable row level security;
alter table public.qa_group_memberships enable row level security;
drop policy if exists qa_study_groups_select on public.qa_study_groups;
create policy qa_study_groups_select on public.qa_study_groups for select to authenticated using (
 private.qa_has_permission('students.view') or private.qa_has_permission('students.manage')
 or exists(select 1 from public.qa_teachers t where t.teacher_id=qa_study_groups.teacher_id and t.user_id=(select auth.uid()))
 or exists(select 1 from public.qa_group_memberships gm join public.qa_students s on s.student_id=gm.student_id where gm.group_id=qa_study_groups.group_id and gm.left_at is null and s.user_id=(select auth.uid()))
);
drop policy if exists qa_study_groups_insert on public.qa_study_groups;
create policy qa_study_groups_insert on public.qa_study_groups for insert to authenticated with check (private.qa_has_permission('students.manage'));
drop policy if exists qa_study_groups_update on public.qa_study_groups;
create policy qa_study_groups_update on public.qa_study_groups for update to authenticated using (private.qa_has_permission('students.manage')) with check (private.qa_has_permission('students.manage'));
drop policy if exists qa_study_groups_delete on public.qa_study_groups;
create policy qa_study_groups_delete on public.qa_study_groups for delete to authenticated using (private.qa_has_permission('students.manage'));
drop policy if exists qa_group_memberships_select on public.qa_group_memberships;
create policy qa_group_memberships_select on public.qa_group_memberships for select to authenticated using (
 private.qa_has_permission('students.view') or private.qa_has_permission('students.manage')
 or exists(select 1 from public.qa_study_groups g join public.qa_teachers t on t.teacher_id=g.teacher_id where g.group_id=qa_group_memberships.group_id and t.user_id=(select auth.uid()))
 or exists(select 1 from public.qa_students s where s.student_id=qa_group_memberships.student_id and s.user_id=(select auth.uid()))
);
drop policy if exists qa_group_memberships_insert on public.qa_group_memberships;
create policy qa_group_memberships_insert on public.qa_group_memberships for insert to authenticated with check (private.qa_has_permission('students.manage'));
drop policy if exists qa_group_memberships_update on public.qa_group_memberships;
create policy qa_group_memberships_update on public.qa_group_memberships for update to authenticated using (private.qa_has_permission('students.manage')) with check (private.qa_has_permission('students.manage'));
drop policy if exists qa_group_memberships_delete on public.qa_group_memberships;
create policy qa_group_memberships_delete on public.qa_group_memberships for delete to authenticated using (private.qa_has_permission('students.manage'));
create or replace function private.qa_teacher_owns_student(p_student_id uuid,p_teacher_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.qa_teachers t where t.teacher_id=p_teacher_id and t.user_id=auth.uid() and t.active=true and (
 exists(select 1 from public.qa_students s where s.student_id=p_student_id and s.teacher_id=p_teacher_id)
 or exists(select 1 from public.qa_group_memberships gm join public.qa_study_groups g on g.group_id=gm.group_id where gm.student_id=p_student_id and gm.left_at is null and g.active=true and g.teacher_id=p_teacher_id)));
$$;
drop policy if exists qa_attendance_insert on public.qa_attendance;
drop policy if exists qa_attendance_update on public.qa_attendance;
create policy qa_attendance_insert on public.qa_attendance for insert to authenticated with check(attendance_date<=current_date and (private.qa_has_permission('attendance.manage') or private.qa_teacher_owns_student(student_id,teacher_id)));
create policy qa_attendance_update on public.qa_attendance for update to authenticated using(private.qa_has_permission('attendance.manage') or private.qa_teacher_owns_student(student_id,teacher_id)) with check(attendance_date<=current_date and (private.qa_has_permission('attendance.manage') or private.qa_teacher_owns_student(student_id,teacher_id)));
alter table public.qa_attendance drop constraint if exists qa_attendance_not_future_check;
alter table public.qa_attendance add constraint qa_attendance_not_future_check check(attendance_date<=current_date);
create unique index if not exists uq_qa_attendance_student_date_no_session on public.qa_attendance(student_id,attendance_date) where session_id is null;
drop policy if exists qa_students_select on public.qa_students;
create policy qa_students_select on public.qa_students for select to authenticated using (
 (select private.qa_has_permission('students.manage')) or (select private.qa_has_permission('students.view')) or user_id=(select auth.uid())
 or exists(select 1 from public.qa_teachers t where t.user_id=(select auth.uid()) and t.active=true and (qa_students.teacher_id=t.teacher_id or exists(select 1 from public.qa_group_memberships gm join public.qa_study_groups g on g.group_id=gm.group_id where gm.student_id=qa_students.student_id and gm.left_at is null and g.active=true and g.teacher_id=t.teacher_id)))
);
