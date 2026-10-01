-- Existing charges and payments are preserved; legacy rows default to monthly.
alter table public.qa_fee_charges
 add column fee_category text not null default 'monthly',
 add column fee_name text not null default '',
 add column request_id uuid;
alter table public.qa_fee_charges add constraint qa_fee_category_check check
 (fee_category in ('monthly','admission','sports','exam','materials','id_card','event','other'));
alter table public.qa_fee_charges add constraint qa_fee_name_check check
 ((fee_category <> 'other' and fee_name = '') or (fee_category = 'other' and length(btrim(fee_name)) between 1 and 100));
alter table public.qa_fee_charges drop constraint qa_fee_charges_student_id_billing_month_key;
create unique index qa_monthly_charge_unique on public.qa_fee_charges(student_id,billing_month) where fee_category='monthly';
create unique index qa_charge_request_unique on public.qa_fee_charges(request_id) where request_id is not null;

-- Invoker trigger retains existing RLS and permits payment/status updates on old dues.
create or replace function private.qa_guard_new_student_fee()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_status text;
begin
 select s.status into v_status from public.qa_students s where s.student_id=new.student_id for share;
 if v_status is distinct from 'active' then
  raise exception 'INACTIVE_STUDENT: only active students can receive new fee charges' using errcode='23514';
 end if;
 if new.discount > new.expected_amount then
  raise exception 'INVALID_FEE_DISCOUNT' using errcode='23514';
 end if;
 if new.fee_category <> 'monthly' and (new.expected_amount <= 0 or new.discount <> 0 or new.previous_due <> 0 or new.current_payable <> new.expected_amount) then
  raise exception 'INVALID_OTHER_FEE_AMOUNT' using errcode='23514';
 end if;
 return new;
end;$$;
revoke all on function private.qa_guard_new_student_fee() from public,anon,authenticated;
create trigger qa_active_student_fee_guard before insert or update of student_id on public.qa_fee_charges
for each row execute function private.qa_guard_new_student_fee();

CREATE OR REPLACE FUNCTION public.qa_generate_monthly_fees(p_target_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_target date;
  v_eligible integer := 0;
  v_created integer := 0;
  v_skipped integer := 0;
  v_total numeric(14,2) := 0;
begin
  if not private.qa_has_permission('fees.manage') then
    raise exception 'FEES_MANAGE_REQUIRED';
  end if;

  if p_target_month is null then
    raise exception 'TARGET_MONTH_REQUIRED';
  end if;

  v_target := date_trunc('month', p_target_month)::date;

  select count(*)
    into v_eligible
  from public.qa_students s
  where s.status = 'active'
    and s.monthly_fee > 0
    and coalesce(s.admission_date, v_target) <= (v_target + interval '1 month - 1 day')::date;

  with inserted as (
    insert into public.qa_fee_charges (
      student_id,
      billing_month,
      expected_amount,
      discount,
      previous_due,
      current_payable,
      due_date,
      status,
      notes
    )
    select
      s.student_id,
      v_target,
      s.monthly_fee,
      0,
      0,
      s.monthly_fee,
      null,
      'open',
      'Automatically generated monthly fee'
    from public.qa_students s
    where s.status = 'active'
      and s.monthly_fee > 0
      and coalesce(s.admission_date, v_target) <= (v_target + interval '1 month - 1 day')::date
    on conflict (student_id, billing_month) where fee_category='monthly' do nothing
    returning current_payable
  )
  select count(*), coalesce(sum(current_payable),0)
    into v_created, v_total
  from inserted;

  v_skipped := greatest(v_eligible - v_created, 0);

  return jsonb_build_object(
    'target_month', v_target,
    'eligible', v_eligible,
    'created', v_created,
    'skipped', v_skipped,
    'total_new_due', v_total
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION private.qa_run_monthly_fee_scheduler()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_target date := date_trunc('month', now() at time zone 'Asia/Dhaka')::date;
  v_eligible integer := 0;
  v_created integer := 0;
  v_skipped integer := 0;
  v_total numeric(14,2) := 0;
begin
  select count(*)
    into v_eligible
  from public.qa_students s
  where s.status = 'active'
    and s.monthly_fee > 0
    and coalesce(s.admission_date, v_target) <= (v_target + interval '1 month - 1 day')::date;

  with inserted as (
    insert into public.qa_fee_charges (
      student_id, billing_month, expected_amount, discount,
      previous_due, current_payable, due_date, status, notes
    )
    select
      s.student_id, v_target, s.monthly_fee, 0,
      0, s.monthly_fee, null, 'open',
      'Automatically generated monthly fee'
    from public.qa_students s
    where s.status = 'active'
      and s.monthly_fee > 0
      and coalesce(s.admission_date, v_target) <= (v_target + interval '1 month - 1 day')::date
    on conflict (student_id, billing_month) where fee_category='monthly' do nothing
    returning current_payable
  )
  select count(*), coalesce(sum(current_payable),0)
    into v_created, v_total
  from inserted;

  v_skipped := greatest(v_eligible - v_created, 0);

  return jsonb_build_object(
    'target_month', v_target,
    'eligible', v_eligible,
    'created', v_created,
    'skipped', v_skipped,
    'total_new_due', v_total
  );
end;
$function$
;
