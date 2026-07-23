do $$
declare t text;
begin
  foreach t in array array['students','messages','scheduled_messages','predefined_messages','automation_settings']
  loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t) then
      execute format('create policy "authenticated_full_access" on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;