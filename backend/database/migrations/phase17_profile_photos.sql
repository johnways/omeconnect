-- Phase 17: customer profile photos.
-- Own photo: private Storage bucket "avatars", one folder per user
-- (<user id>/avatar-<time>.jpg). Only the owner (and 2-step admins) can read it.
-- Google photo: shown from the Google account when no own photo is set
-- (no database change needed; it comes from the sign-in identity).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_path text;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_avatar_path_own_folder;
ALTER TABLE public.users ADD CONSTRAINT users_avatar_path_own_folder
  CHECK (avatar_path IS NULL OR avatar_path ~ ('^' || id::text || '/avatar-[0-9]+\.jpg$'));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', false, 1048576, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = 1048576, allowed_mime_types = ARRAY['image/jpeg'];

DROP POLICY IF EXISTS "Avatars: owner reads" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: owner uploads" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: owner replaces" ON storage.objects;
DROP POLICY IF EXISTS "Avatars: owner deletes" ON storage.objects;

CREATE POLICY "Avatars: owner reads" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars'
         AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR public.is_omeco_admin()));

CREATE POLICY "Avatars: owner uploads" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "Avatars: owner replaces" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "Avatars: owner deletes" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- Customers may change only their own avatar_path (row policy limits it to their row).
GRANT UPDATE (avatar_path) ON public.users TO authenticated;
