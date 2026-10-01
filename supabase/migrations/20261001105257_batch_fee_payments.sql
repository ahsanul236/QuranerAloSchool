-- Existing ledger rows and individual receipts remain intact.
alter table public.qa_fee_payments add column if not exists batch_id uuid;
create unique index if not exists qa_fee_payment_batch_charge_unique on public.qa_fee_payments(batch_id,charge_id) where batch_id is not null;

-- Serialize balance checks for all payment entry points, including older clients.
create or replace function private.qa_validate_fee_payment()
returns trigger language plpgsql security definer set search_path='' as $$
declare c public.qa_fee_charges; paid numeric;
begin
 if auth.uid() is null or not (private.qa_has_permission('payments.manage') or private.qa_has_permission('fees.manage')) then
  raise exception 'PAYMENT_PERMISSION_DENIED' using errcode='42501';
 end if;
 if TG_OP='UPDATE' and (new.charge_id<>old.charge_id or new.student_id<>old.student_id or new.batch_id is distinct from old.batch_id) then
  raise exception 'PAYMENT_IDENTITY_IMMUTABLE';
 end if;
 select * into c from public.qa_fee_charges where charge_id=new.charge_id for update;
 if not found or c.student_id<>new.student_id then raise exception 'PAYMENT_STUDENT_MISMATCH'; end if;
 select coalesce(sum(amount),0) into paid from public.qa_fee_payments where charge_id=new.charge_id and payment_id<>new.payment_id;
 if new.amount is null or new.amount::text in ('NaN','Infinity','-Infinity') or new.amount<=0 or new.amount>c.current_payable-paid then
  raise exception 'PAYMENT_EXCEEDS_REMAINING';
 end if;
 return new;
end;
$$;
revoke all on function private.qa_validate_fee_payment() from public,anon,authenticated;
create trigger qa_fee_payment_validate before insert or update on public.qa_fee_payments for each row execute function private.qa_validate_fee_payment();

-- One atomic request; repeating the same batch returns its existing receipts.
create or replace function public.qa_receive_fee_batch(p_batch_id uuid,p_student_id uuid,p_items jsonb,p_paid_at timestamptz,p_method text,p_reference text default null,p_notes text default '')
returns setof public.qa_fee_payments language plpgsql security invoker set search_path='' as $$
declare n integer; existing integer; item record;
begin
 -- RLS and the guarded insert trigger enforce payment-management permission.
 if auth.uid() is null then raise exception 'PAYMENT_PERMISSION_DENIED' using errcode='42501'; end if;
 if p_batch_id is null or p_student_id is null or p_paid_at is null or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'INVALID_PAYMENT_BATCH'; end if;
 n:=jsonb_array_length(p_items);
 if n<1 or n>100 or (select count(distinct x.charge_id) from jsonb_to_recordset(p_items) as x(charge_id uuid,amount numeric))<>n then raise exception 'INVALID_PAYMENT_ITEMS'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_batch_id::text,0));
 select count(*) into existing from public.qa_fee_payments where batch_id=p_batch_id;
 if existing>0 then
  if existing<>n or exists(select 1 from public.qa_fee_payments p left join jsonb_to_recordset(p_items) as x(charge_id uuid,amount numeric) on x.charge_id=p.charge_id where p.batch_id=p_batch_id and (x.charge_id is null or p.amount is distinct from x.amount or p.student_id<>p_student_id or p.paid_at is distinct from p_paid_at or p.payment_method is distinct from p_method or p.reference is distinct from p_reference or p.notes is distinct from coalesce(p_notes,'') or p.received_by is distinct from auth.uid())) then raise exception 'PAYMENT_BATCH_CONFLICT'; end if;
 else
  for item in select * from jsonb_to_recordset(p_items) as x(charge_id uuid,amount numeric) order by charge_id loop
   insert into public.qa_fee_payments(batch_id,charge_id,student_id,amount,paid_at,payment_method,reference,notes)
   values(p_batch_id,item.charge_id,p_student_id,item.amount,p_paid_at,p_method,p_reference,coalesce(p_notes,''));
  end loop;
 end if;
 return query select * from public.qa_fee_payments where batch_id=p_batch_id order by receipt_no;
end;
$$;
revoke all on function public.qa_receive_fee_batch(uuid,uuid,jsonb,timestamptz,text,text,text) from public,anon;
grant execute on function public.qa_receive_fee_batch(uuid,uuid,jsonb,timestamptz,text,text,text) to authenticated;
