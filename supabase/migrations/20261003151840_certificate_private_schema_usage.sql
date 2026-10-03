-- Invoker-mode certificate functions must resolve the authorized permission helper.
-- No changes to existing EXECUTE grants, RLS policies or exposed schemas.
grant usage on schema private to authenticated;
