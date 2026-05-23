-- Migration: Add Failed Prints Log Table
create table if not exists failed_prints (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references orders(id) on delete cascade,
    filament_id bigint references inventory_filaments(id) on delete set null,
    weight_grams numeric not null check (weight_grams >= 0),
    estimated_cost numeric not null check (estimated_cost >= 0),
    failure_reason text not null default 'Unknown',
    logged_at timestamptz not null default timezone('utc'::text, now()),
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Enable RLS
alter table failed_prints enable row level security;

-- Policies for public and authenticated access
create policy "failed_prints_select_all"
on failed_prints
for select
to anon, authenticated
using (true);

create policy "failed_prints_insert_all"
on failed_prints
for insert
to anon, authenticated
with check (true);

create policy "failed_prints_update_all"
on failed_prints
for update
to anon, authenticated
using (true)
with check (true);

create policy "failed_prints_delete_all"
on failed_prints
for delete
to anon, authenticated
using (true);

-- Index for speed
create index if not exists failed_prints_order_id_idx on failed_prints(order_id);
create index if not exists failed_prints_logged_at_idx on failed_prints(logged_at desc);
