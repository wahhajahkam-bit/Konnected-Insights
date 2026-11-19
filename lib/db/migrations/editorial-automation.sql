-- Additive, repeatable Gmail automation setup; never changes editorial content.
CREATE TABLE IF NOT EXISTS editorial_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, collection text NOT NULL,
  senders jsonb NOT NULL, search text NOT NULL DEFAULT '',
  guidance text NOT NULL DEFAULT '', enabled boolean NOT NULL DEFAULT false,
  publish_mode text NOT NULL DEFAULT 'draft', schedule_utc text NOT NULL DEFAULT '02:00',
  lookback_days integer NOT NULL DEFAULT 7, max_items integer NOT NULL DEFAULT 10,
  mailbox_email text NOT NULL, created_by_user_id text NOT NULL,
  next_run_at timestamptz NOT NULL DEFAULT now(), last_run_at timestamptz, last_error text,
  lease_token uuid, lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS editorial_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES editorial_automation_rules(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running', started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz, matched integer NOT NULL DEFAULT 0,
  attempted integer NOT NULL DEFAULT 0, created integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0, failed integer NOT NULL DEFAULT 0, error text
);
CREATE TABLE IF NOT EXISTS editorial_automation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES editorial_automation_rules(id) ON DELETE CASCADE,
  message_id text NOT NULL, status text NOT NULL DEFAULT 'failed',
  editorial_item_id uuid, error text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS editorial_automation_rule_message_unique
  ON editorial_automation_messages (rule_id, message_id);