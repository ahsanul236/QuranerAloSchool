-- Fee managers with Students.view must not need Students.manage merely to validate status.
create or replace function private.qa_guard_new_student_fee()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_status text;
begin
 select s.status into v_status from public.qa_students s where s.student_id=new.student_id;
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
