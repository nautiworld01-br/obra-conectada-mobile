-- Extensao para geracao de UUIDs
create extension if not exists pgcrypto;

-- Tabela de Equipes de Obra (Empreiteiras e Empresas terceirizadas)
-- Armazena dados de contato, financeiros e prazos de contrato.
create table if not exists public.work_crews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  photo text,
  company_name text not null,
  company_contact text,
  responsible_name text,
  responsible_contact text,
  average_workers integer,
  contracted_amount numeric(12, 2),
  planned_start_date date,
  planned_end_date date,
  observations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Habilita RLS para controle de acesso granular.
alter table public.work_crews enable row level security;

-- Politicas de Acesso: Restringe visualizacao e gestao apenas ao Proprietario da obra.
-- future_fix: Permitir visualizacao (select) tambem para membros com role 'funcionario' se necessario.

drop policy if exists "Owners can view work crews" on public.work_crews;
create policy "Owners can view work crews"
on public.work_crews
for select
to authenticated
using (
  exists (
    select 1
    from public.project_members members
    where members.project_id = work_crews.project_id
      and members.user_id = auth.uid()
      and members.role = 'proprietario'
  )
);

drop policy if exists "Owners can insert work crews" on public.work_crews;
create policy "Owners can insert work crews"
on public.work_crews
for insert
to authenticated
with check (
  exists (
    select 1
    from public.project_members members
    where members.project_id = work_crews.project_id
      and members.user_id = auth.uid()
      and members.role = 'proprietario'
  )
);

drop policy if exists "Owners can update work crews" on public.work_crews;
create policy "Owners can update work crews"
on public.work_crews
for update
to authenticated
using (
  exists (
    select 1
    from public.project_members members
    where members.project_id = work_crews.project_id
      and members.user_id = auth.uid()
      and members.role = 'proprietario'
  )
)
with check (
  exists (
    select 1
    from public.project_members members
    where members.project_id = work_crews.project_id
      and members.user_id = auth.uid()
      and members.role = 'proprietario'
  )
);

drop policy if exists "Owners can delete work crews" on public.work_crews;
create policy "Owners can delete work crews"
on public.work_crews
for delete
to authenticated
using (
  exists (
    select 1
    from public.project_members members
    where members.project_id = work_crews.project_id
      and members.user_id = auth.uid()
      and members.role = 'proprietario'
  )
);
