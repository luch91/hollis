CREATE OR REPLACE FUNCTION public.generate_hollis_case_reference(input_created_at timestamp with time zone DEFAULT now())
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  random_bytes bytea := extensions.gen_random_bytes(8);
  suffix text := '';
  position integer;
BEGIN
  FOR position IN 0..7 LOOP
    suffix := suffix || substr(alphabet, (get_byte(random_bytes, position) & 31) + 1, 1);
  END LOOP;

  RETURN format(
    'HL-%s-%s-%s',
    to_char(input_created_at AT TIME ZONE 'UTC', 'YY'),
    substr(suffix, 1, 4),
    substr(suffix, 5, 4)
  );
END;
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA extensions TO hollis_app;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION extensions.gen_random_bytes(integer) TO hollis_app;
