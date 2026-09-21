-- A linear append-only chain has one, and only one, genesis event per scope.
-- Non-genesis fork prevention was introduced in 0056; these indexes close the
-- remaining null-predecessor loophole without changing historical event rows.
CREATE UNIQUE INDEX "review_events_case_single_genesis_unique"
  ON "review_events" ("case_id")
  WHERE "previous_hash" IS NULL;

CREATE UNIQUE INDEX "workspace_audit_events_tenant_single_genesis_unique"
  ON "workspace_audit_events" ("tenant_id")
  WHERE "previous_hash" IS NULL;
