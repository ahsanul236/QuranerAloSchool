alter table public.qa_teachers
  add column if not exists gender text not null default 'unspecified';

alter table public.qa_staff
  add column if not exists gender text not null default 'unspecified';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'qa_teachers_gender_check'
      and conrelid = 'public.qa_teachers'::regclass
  ) then
    alter table public.qa_teachers
      add constraint qa_teachers_gender_check
      check (gender = any (array['male'::text, 'female'::text, 'unspecified'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'qa_staff_gender_check'
      and conrelid = 'public.qa_staff'::regclass
  ) then
    alter table public.qa_staff
      add constraint qa_staff_gender_check
      check (gender = any (array['male'::text, 'female'::text, 'unspecified'::text]));
  end if;
end $$;

comment on column public.qa_teachers.gender
  is 'Teacher gender: male, female, or unspecified.';

comment on column public.qa_staff.gender
  is 'Helper/staff gender: male, female, or unspecified.';
