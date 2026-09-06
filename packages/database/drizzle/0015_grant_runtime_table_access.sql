GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "tenants" TO hollis_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "users" TO hollis_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "tenant_memberships" TO hollis_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "review_cases" TO hollis_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "review_events" TO hollis_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "evidence_objects" TO hollis_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "retention_deletion_jobs" TO hollis_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "attestations" TO hollis_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public_attestation_case_files" TO hollis_app;

REVOKE INSERT, UPDATE, DELETE ON TABLE "tenants" FROM hollis_app;
REVOKE INSERT, UPDATE, DELETE ON TABLE "users" FROM hollis_app;
REVOKE INSERT, UPDATE, DELETE ON TABLE "tenant_memberships" FROM hollis_app;
REVOKE DELETE ON TABLE "review_cases" FROM hollis_app;
REVOKE UPDATE, DELETE ON TABLE "review_events" FROM hollis_app;
REVOKE UPDATE, DELETE ON TABLE "evidence_objects" FROM hollis_app;
REVOKE DELETE ON TABLE "attestations" FROM hollis_app;
REVOKE DELETE ON TABLE "public_attestation_case_files" FROM hollis_app;
