/**
 * Environment for integration tests: a separate database and storage folder.
 * Override TEST_DATABASE_URL to point at another PostgreSQL instance.
 */
(process.env as Record<string, string | undefined>).NODE_ENV ??= "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://museum:museum@localhost:5432/our_museum_test";
process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = "./.data/test-storage";
process.env.STORAGE_SIGNING_SECRET = "test-storage-signing-secret-0123456789abcdef";
process.env.REALTIME_TICKET_SECRET = "test-realtime-ticket-secret-0123456789abcdef";
process.env.REALTIME_INTERNAL_URL = "http://127.0.0.1:9";
process.env.UPLOAD_MAX_BYTES = "2000000";
process.env.EMAIL_DRIVER = "console";
process.env.ENABLE_DEV_OUTBOX = "true";
process.env.APP_URL = "http://localhost:3000";
process.env.LOG_LEVEL = "error";
process.env.CRON_SECRET = "test-cron-secret-123456";
