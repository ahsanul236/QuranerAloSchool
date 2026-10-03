-- Keep manually chosen values in the standard QA-CERT sequence from colliding
-- with future automatically allocated values.
create or replace function private.qa_guard_certificate_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_permission text; v_parts text[];
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
    v_parts := pg_catalog.regexp_match(new.certificate_number, '^QA-CERT-([0-9]{4})-([0-9]{6,9})$');
    if v_parts is not null then
      insert into public.qa_certificate_counters(issue_year, last_number, updated_at)
      values (v_parts[1]::integer, v_parts[2]::integer, now())
      on conflict (issue_year) do update
        set last_number = greatest(public.qa_certificate_counters.last_number, excluded.last_number), updated_at = now();
    end if;
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
