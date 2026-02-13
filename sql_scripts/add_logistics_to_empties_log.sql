-- Add logistical tracking columns to empties_log
ALTER TABLE empties_log 
ADD COLUMN IF NOT EXISTS vehicle_no TEXT,
ADD COLUMN IF NOT EXISTS returned_by TEXT,
ADD COLUMN IF NOT EXISTS num_of_pallets INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS num_of_pcs INTEGER DEFAULT 0;

-- Refresh schema cache if needed (Supabase usually handles this)
COMMENT ON TABLE empties_log IS 'Table for tracking empties activities, including returns to GGBL with logistics info.';
