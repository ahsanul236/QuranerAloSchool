-- Certificate Management: persistent records, annual atomic numbering, and RLS.
create table public.qa_certificate_counters (
  issue_year integer primary key check (issue_year between 2000 and 9999),
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);

alter table public.qa_certificate_counters enable row level security;
grant select, insert, update on public.qa_certificate_counters to authenticated;

create policy qa_certificate_counters_select on public.qa_certificate_counters
  for select to authenticated using (
    (select private.qa_has_permission('students.manage'))
    or (select private.qa_has_permission('teachers.manage'))
    or (select private.qa_has_permission('staff.manage'))
  );
create policy qa_certificate_counters_insert on public.qa_certificate_counters
  for insert to authenticated with check (
    (select private.qa_has_permission('students.manage'))
    or (select private.qa_has_permission('teachers.manage'))
    or (select private.qa_has_permission('staff.manage'))
  );
create policy qa_certificate_counters_update on public.qa_certificate_counters
  for update to authenticated using (
    (select private.qa_has_permission('students.manage'))
    or (select private.qa_has_permission('teachers.manage'))
    or (select private.qa_has_permission('staff.manage'))
  ) with check (
    (select private.qa_has_permission('students.manage'))
    or (select private.qa_has_permission('teachers.manage'))
    or (select private.qa_has_permission('staff.manage'))
  );

create table public.qa_certificates (
  certificate_id uuid primary key default gen_random_uuid(),
  certificate_number text not null unique check (length(btrim(certificate_number)) between 1 and 80),
  manual_reference text check (manual_reference is null or length(btrim(manual_reference)) <= 120),
  recipient_type text not null check (recipient_type in ('student', 'teacher', 'helper')),
  recipient_id uuid not null,
  recipient_code text not null check (length(btrim(recipient_code)) between 1 and 80),
  recipient_name text not null check (length(btrim(recipient_name)) between 1 and 200),
  certificate_type text not null check (length(btrim(certificate_type)) between 1 and 80),
  certificate_title text not null check (length(btrim(certificate_title)) between 1 and 200),
  issue_date date not null,
  certificate_text text not null check (length(btrim(certificate_text)) between 1 and 5000),
  language text not null check (language in ('bn', 'en')),
  authorized_signatory text not null default '' check (length(authorized_signatory) <= 150),
  school_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
);

create index qa_certificates_issue_date_idx on public.qa_certificates(issue_date desc, certificate_id desc);
create index qa_certificates_recipient_idx on public.qa_certificates(recipient_type, recipient_id, issue_date desc);
create index qa_certificates_manual_reference_idx on public.qa_certificates(manual_reference) where manual_reference is not null;

alter table public.qa_certificates enable row level security;
grant select, insert, update on public.qa_certificates to authenticated;

create policy qa_certificates_select on public.qa_certificates
  for select to authenticated using (
    (recipient_type = 'student' and ((select private.qa_has_permission('students.view')) or (select private.qa_has_permission('students.manage'))))
    or (recipient_type = 'teacher' and ((select private.qa_has_permission('teachers.view')) or (select private.qa_has_permission('teachers.manage'))))
    or (recipient_type = 'helper' and ((select private.qa_has_permission('staff.view')) or (select private.qa_has_permission('staff.manage'))))
  );
create policy qa_certificates_insert on public.qa_certificates
  for insert to authenticated with check (
    created_by = (select auth.uid()) and (
      (recipient_type = 'student' and (select private.qa_has_permission('students.manage')))
      or (recipient_type = 'teacher' and (select private.qa_has_permission('teachers.manage')))
      or (recipient_type = 'helper' and (select private.qa_has_permission('staff.manage')))
    )
  );
create policy qa_certificates_update on public.qa_certificates
  for update to authenticated using (
    (recipient_type = 'student' and (select private.qa_has_permission('students.manage')))
    or (recipient_type = 'teacher' and (select private.qa_has_permission('teachers.manage')))
    or (recipient_type = 'helper' and (select private.qa_has_permission('staff.manage')))
  ) with check (
    (recipient_type = 'student' and (select private.qa_has_permission('students.manage')))
    or (recipient_type = 'teacher' and (select private.qa_has_permission('teachers.manage')))
    or (recipient_type = 'helper' and (select private.qa_has_permission('staff.manage')))
  );

create or replace function private.qa_guard_certificate_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_permission text;
begin
  if auth.uid() is null then raise exception 'CERTIFICATE_AUTH_REQUIRED' using errcode = '42501'; end if;
  v_permission := case new.recipient_type
    when 'student' then 'students.manage'
    when 'teacher' then 'teachers.manage'
    when 'helper' then 'staff.manage'
    else null
  end;
  if v_permission is null or not private.qa_has_permission(v_permission) then
    raise exception 'CERTIFICATE_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.created_by is distinct from auth.uid() then raise exception 'CERTIFICATE_CREATOR_MISMATCH' using errcode = '42501'; end if;
  elsif row(new.certificate_id, new.manual_reference, new.recipient_type, new.recipient_id, new.recipient_code,
            new.recipient_name, new.certificate_type, new.certificate_title, new.issue_date,
            new.certificate_text, new.language, new.authorized_signatory, new.school_snapshot,
            new.created_at, new.created_by)
        is distinct from
        row(old.certificate_id, old.manual_reference, old.recipient_type, old.recipient_id, old.recipient_code,
            old.recipient_name, old.certificate_type, old.certificate_title, old.issue_date,
            old.certificate_text, old.language, old.authorized_signatory, old.school_snapshot,
            old.created_at, old.created_by) then
    raise exception 'CERTIFICATE_RECORD_IMMUTABLE';
  end if;
  return new;
end;
$$;
revoke all on function private.qa_guard_certificate_write() from public, anon, authenticated;
create trigger qa_certificate_write_guard before insert or update on public.qa_certificates
  for each row execute function private.qa_guard_certificate_write();

create or replace function private.qa_audit_certificate_number()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.certificate_number is distinct from old.certificate_number then
    insert into public.qa_audit_log(actor_user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'certificate.number.updated', 'qa_certificates', new.certificate_id::text,
      jsonb_build_object('old_certificate_number', old.certificate_number, 'new_certificate_number', new.certificate_number));
  end if;
  return new;
end;
$$;
revoke all on function private.qa_audit_certificate_number() from public, anon, authenticated;
create trigger qa_certificate_number_audit after update of certificate_number on public.qa_certificates
  for each row execute function private.qa_audit_certificate_number();

create or replace function public.qa_next_certificate_number(p_issue_year integer, p_recipient_type text)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_permission text; v_number integer;
begin
  if auth.uid() is null or p_issue_year not between 2000 and 9999 then
    raise exception 'CERTIFICATE_INVALID_NUMBER_REQUEST' using errcode = '22023';
  end if;
  v_permission := case p_recipient_type
    when 'student' then 'students.manage'
    when 'teacher' then 'teachers.manage'
    when 'helper' then 'staff.manage'
    else null
  end;
  if v_permission is null or not private.qa_has_permission(v_permission) then
    raise exception 'CERTIFICATE_PERMISSION_DENIED' using errcode = '42501';
  end if;
  insert into public.qa_certificate_counters(issue_year, last_number, updated_at)
  values (p_issue_year, 1, now())
  on conflict (issue_year) do update
    set last_number = public.qa_certificate_counters.last_number + 1, updated_at = now()
  returning last_number into v_number;
  return 'QA-CERT-' || p_issue_year::text || '-' || lpad(v_number::text, greatest(6, length(v_number::text)), '0');
end;
$$;
revoke all on function public.qa_next_certificate_number(integer, text) from public, anon;
grant execute on function public.qa_next_certificate_number(integer, text) to authenticated;
