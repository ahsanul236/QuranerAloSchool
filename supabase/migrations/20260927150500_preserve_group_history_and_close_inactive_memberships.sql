-- Preserve group history and release students when a group is deactivated.
drop policy if exists qa_study_groups_delete on public.qa_study_groups;
drop policy if exists qa_group_memberships_delete on public.qa_group_memberships;
create or replace function private.qa_close_inactive_group_memberships()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if old.active=true and new.active=false then
    update public.qa_group_memberships
       set left_at=current_date, updated_at=now()
     where group_id=new.group_id and left_at is null;
  end if;
  return new;
end; $$;
drop trigger if exists qa_close_memberships_on_group_inactive on public.qa_study_groups;
create trigger qa_close_memberships_on_group_inactive
after update of active on public.qa_study_groups
for each row execute function private.qa_close_inactive_group_memberships();