-- R2: Change history can't be edited or deleted. Restore writes a new line instead.
CREATE OR REPLACE FUNCTION edit_log_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'edit_log is append-only: history can''t be edited or deleted';
END;
$$;--> statement-breakpoint
CREATE TRIGGER edit_log_no_update_delete BEFORE UPDATE OR DELETE ON "edit_log"
FOR EACH ROW EXECUTE FUNCTION edit_log_append_only();
