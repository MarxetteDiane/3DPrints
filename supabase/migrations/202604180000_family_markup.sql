ALTER TABLE system_configurations
ADD COLUMN IF NOT EXISTS family_markup_percent numeric(10,2) DEFAULT 15.0;
