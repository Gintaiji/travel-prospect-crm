create table if not exists public.crm_backup_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  backup_type text not null check (backup_type in ('manual', 'auto')),
  prospects_count integer not null default 0,
  resources_count integer not null default 0,
  message_templates_count integer not null default 0,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists crm_backup_history_user_created_idx
  on public.crm_backup_history (user_id, created_at desc);

alter table public.crm_backup_history enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'crm_backup_history'
      and policyname = 'Users can manage their own backup history'
  ) then
    create policy "Users can manage their own backup history"
      on public.crm_backup_history
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
