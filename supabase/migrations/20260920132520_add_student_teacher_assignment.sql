alter table public.qa_students
  add column if not exists teacher_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'qa_students_teacher_id_fkey'
      and conrelid = 'public.qa_students'::regclass
  ) then
    alter table public.qa_students
      add constraint qa_students_teacher_id_fkey
      foreign key (teacher_id)
      references public.qa_teachers(teacher_id)
      on delete set null;
  end if;
end $$;

create index if not exists qa_students_teacher_id_idx
  on public.qa_students (teacher_id);

comment on column public.qa_students.teacher_id
  is 'Currently assigned teacher for the student; nullable means no teacher assigned.';
