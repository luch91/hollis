CREATE OR REPLACE FUNCTION public.generate_hollis_case_reference(input_created_at timestamp with time zone DEFAULT now())
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public
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

ALTER TABLE public.review_cases ADD COLUMN hollis_case_reference text;
--> statement-breakpoint

CREATE UNIQUE INDEX review_cases_hollis_case_reference_unique
  ON public.review_cases USING btree (hollis_case_reference);
--> statement-breakpoint

DO $$
DECLARE
  case_record record;
  generated_reference text;
BEGIN
  FOR case_record IN
    SELECT id, created_at
    FROM public.review_cases
    WHERE hollis_case_reference IS NULL
  LOOP
    LOOP
      generated_reference := public.generate_hollis_case_reference(case_record.created_at);
      BEGIN
        UPDATE public.review_cases
        SET hollis_case_reference = generated_reference
        WHERE id = case_record.id;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          NULL;
      END;
    END LOOP;
  END LOOP;
END;
$$;
--> statement-breakpoint

ALTER TABLE public.review_cases
  ALTER COLUMN hollis_case_reference SET NOT NULL;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.assign_hollis_case_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.hollis_case_reference IS NULL THEN
    NEW.hollis_case_reference := public.generate_hollis_case_reference(NEW.created_at);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER review_cases_assign_hollis_case_reference
BEFORE INSERT ON public.review_cases
FOR EACH ROW
EXECUTE FUNCTION public.assign_hollis_case_reference();
