CREATE TABLE IF NOT EXISTS agent_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 agent_id text NOT NULL, category text NOT NULL CHECK(category IN ('website','replit')),
 label text NOT NULL, status text NOT NULL DEFAULT 'running',
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 duration_ms double precision, parent_run_id uuid REFERENCES agent_runs(id),
 source_id text, provenance text NOT NULL DEFAULT 'automatic',
 outcome text, output_path text, cost_amount numeric, currency text,
 reference text, notes text, entered_by text, updated_by text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 heartbeat_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 UNIQUE(agent_id,source_id)
);
CREATE INDEX IF NOT EXISTS agent_runs_history_idx ON agent_runs(started_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS agent_runs_parent_idx ON agent_runs(parent_run_id);
CREATE TABLE IF NOT EXISTS agent_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES agent_runs(id),
 key text NOT NULL, model text, input_tokens bigint, output_tokens bigint, cached_tokens bigint,
 tool_calls bigint, cost_amount numeric, currency text, pricing_version text,
 started_at timestamptz, finished_at timestamptz, provider_call_ms double precision,
 pricing_source text, pricing_effective_date text, partial boolean NOT NULL DEFAULT false,
 breakdown jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id,key)
);
CREATE TABLE IF NOT EXISTS agent_manual_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES agent_runs(id),
 action text NOT NULL, actor text NOT NULL, at timestamptz NOT NULL DEFAULT now()
);
-- Repeatable upgrade for installations that already applied the initial schema.
ALTER TABLE agent_operations ADD COLUMN IF NOT EXISTS input_text_tokens bigint;
ALTER TABLE agent_operations ADD COLUMN IF NOT EXISTS input_image_tokens bigint;
ALTER TABLE agent_operations ADD COLUMN IF NOT EXISTS output_text_tokens bigint;
ALTER TABLE agent_operations ADD COLUMN IF NOT EXISTS output_image_tokens bigint;