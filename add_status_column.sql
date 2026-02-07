-- Migration script to add deleted_at field for soft delete functionality
-- Run this in your Supabase SQL editor

ALTER TABLE products 
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;