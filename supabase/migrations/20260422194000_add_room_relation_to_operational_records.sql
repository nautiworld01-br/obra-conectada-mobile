alter table public.daily_logs
  add column if not exists room_id uuid references public.rooms(id) on delete set null;

alter table public.schedule_stages
  add column if not exists room_id uuid references public.rooms(id) on delete set null;

alter table public.weekly_updates
  add column if not exists room_id uuid references public.rooms(id) on delete set null;

create index if not exists daily_logs_room_id_idx on public.daily_logs (room_id);
create index if not exists schedule_stages_room_id_idx on public.schedule_stages (room_id);
create index if not exists weekly_updates_room_id_idx on public.weekly_updates (room_id);
