ALTER FUNCTION public.assert_journal_entry_balanced_by_id(text)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.assert_journal_entry_header_balanced()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.assert_journal_entry_line_balanced()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.assert_journal_line_household_scope()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.prevent_posted_journal_mutation()
  SET search_path = pg_catalog, public;
