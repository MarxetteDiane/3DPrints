-- Migration: Create products and product_variants tables
-- Created on 2026-06-27

create table if not exists products (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text default '',
    image_url text default '',
    created_at timestamptz not null default timezone('utc'::text, now())
);

-- Enable RLS
alter table products enable row level security;

-- Policies for products
create policy "products_select_all" on products for select to anon, authenticated using (true);
create policy "products_insert_all" on products for insert to anon, authenticated with check (true);
create policy "products_update_all" on products for update to anon, authenticated using (true) with check (true);
create policy "products_delete_all" on products for delete to anon, authenticated using (true);

create table if not exists product_variants (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references products(id) on delete cascade,
    name text not null,
    fixed_standard_price numeric not null default 0 check (fixed_standard_price >= 0),
    fixed_family_price numeric not null default 0 check (fixed_family_price >= 0),
    weight_g numeric not null default 0 check (weight_g >= 0),
    print_time_hours numeric not null default 0 check (print_time_hours >= 0),
    plates_count integer not null default 1 check (plates_count >= 1),
    labor_hours numeric not null default 0 check (labor_hours >= 0),
    created_at timestamptz not null default timezone('utc'::text, now())
);

-- Enable RLS
alter table product_variants enable row level security;

-- Policies for product_variants
create policy "product_variants_select_all" on product_variants for select to anon, authenticated using (true);
create policy "product_variants_insert_all" on product_variants for insert to anon, authenticated with check (true);
create policy "product_variants_update_all" on product_variants for update to anon, authenticated using (true) with check (true);
create policy "product_variants_delete_all" on product_variants for delete to anon, authenticated using (true);

-- Indexing for joins
create index if not exists product_variants_product_id_idx on product_variants (product_id);
