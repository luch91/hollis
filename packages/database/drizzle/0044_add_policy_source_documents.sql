ALTER TABLE public.policy_versions
  ADD COLUMN source_file_name text,
  ADD COLUMN source_media_type text,
  ADD COLUMN source_object_name text,
  ADD COLUMN source_size_bytes integer;
