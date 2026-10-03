CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Scheduling is intentionally deferred to the latest automation migration.
-- The original version hard-coded credentials and the URL of the deleted project.