-- Add image_url column to items table if it does not already exist
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS image_url text DEFAULT NULL;
