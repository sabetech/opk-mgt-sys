-- Remove duplicate products from the 'products' table.
-- This script identifies duplicates based on 'sku_name' and 'code_name',
-- keeps the record with the smallest 'id' (the original), 
-- and deletes the subsequent duplicates.

DELETE FROM products
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY sku_name, code_name 
                   ORDER BY id ASC
               ) as row_num
        FROM products
    ) t
    WHERE t.row_num > 1
);

-- Verification: Count products after cleanup
-- SELECT count(*) FROM products;
