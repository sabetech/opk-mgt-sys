-- 1. Ensure the bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('receivable-images', 'receivable-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;
-- 2. Allow anyone to upload images to the 'receivables/' folder
CREATE POLICY "Allow public upload"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'receivable-images');
-- 3. Allow anyone to view the uploaded images
CREATE POLICY "Allow public view"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'receivable-images');


-- ####################

