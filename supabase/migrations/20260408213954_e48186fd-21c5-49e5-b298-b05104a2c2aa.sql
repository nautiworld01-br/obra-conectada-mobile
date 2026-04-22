INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Members can view receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'receipts');
CREATE POLICY "Writers can upload receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'receipts');
CREATE POLICY "Writers can update receipts"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'receipts');
CREATE POLICY "Writers can delete receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'receipts');
