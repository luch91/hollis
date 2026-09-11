ALTER TABLE public.review_cases
  ALTER COLUMN hollis_case_reference SET DEFAULT public.generate_hollis_case_reference(now());
