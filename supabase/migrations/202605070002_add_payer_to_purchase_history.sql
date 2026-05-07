alter table inventory_purchase_history add column if not exists payer text not null default '';
