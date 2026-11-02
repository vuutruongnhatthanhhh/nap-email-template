-- Storage bucket for images embedded in template bodies (editor uploads,
-- already converted to WebP client-side before upload). Public bucket so
-- recipients' email clients can load the <img src> directly.

insert into storage.buckets (id, name, public)
values ('template-images', 'template-images', true)
on conflict (id) do nothing;

drop policy if exists "template_images_public_read" on storage.objects;
create policy "template_images_public_read" on storage.objects
  for select
  using (bucket_id = 'template-images');

drop policy if exists "template_images_owner_insert" on storage.objects;
create policy "template_images_owner_insert" on storage.objects
  for insert
  with check (bucket_id = 'template-images' and auth.uid() = owner);

drop policy if exists "template_images_owner_delete" on storage.objects;
create policy "template_images_owner_delete" on storage.objects
  for delete
  using (bucket_id = 'template-images' and auth.uid() = owner);
