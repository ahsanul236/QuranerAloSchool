alter table public.qa_teachers
  add column if not exists marital_status text,
  add column if not exists spouse_name text;

alter table public.qa_staff
  add column if not exists marital_status text,
  add column if not exists spouse_name text;

alter table public.qa_teachers drop constraint if exists qa_teachers_marital_status_check;
alter table public.qa_teachers
  add constraint qa_teachers_marital_status_check
  check (marital_status is null or marital_status in ('married','unmarried'));

alter table public.qa_staff drop constraint if exists qa_staff_marital_status_check;
alter table public.qa_staff
  add constraint qa_staff_marital_status_check
  check (marital_status is null or marital_status in ('married','unmarried'));

alter table public.qa_teachers drop constraint if exists qa_teachers_spouse_name_married_check;
alter table public.qa_teachers
  add constraint qa_teachers_spouse_name_married_check
  check (marital_status = 'married' or coalesce(btrim(spouse_name),'') = '');

alter table public.qa_staff drop constraint if exists qa_staff_spouse_name_married_check;
alter table public.qa_staff
  add constraint qa_staff_spouse_name_married_check
  check (marital_status = 'married' or coalesce(btrim(spouse_name),'') = '');
