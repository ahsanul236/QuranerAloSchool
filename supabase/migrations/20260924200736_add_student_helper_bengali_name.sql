alter table public.qa_students
  add column if not exists full_name_bn text;

alter table public.qa_staff
  add column if not exists full_name_bn text;

comment on column public.qa_students.full_name_bn is 'Optional Bengali full name for the student.';
comment on column public.qa_staff.full_name_bn is 'Optional Bengali full name for the helper/staff profile.';
