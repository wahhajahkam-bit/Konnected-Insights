CREATE TABLE IF NOT EXISTS future_work_functions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name text NOT NULL,
 description text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, enabled boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1
);
-- Optional editorial framing; deliberately separate from evidence-backed versions.
ALTER TABLE future_work_functions ADD COLUMN IF NOT EXISTS presentation jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Private CMS research constraints. These are snapshotted into each durable run
-- plan so later function edits cannot alter in-flight or historical research.
ALTER TABLE future_work_functions ADD COLUMN IF NOT EXISTS research_sources jsonb;
CREATE TABLE IF NOT EXISTS future_of_work_content (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), function_id uuid NOT NULL REFERENCES future_work_functions(id),
 horizon integer NOT NULL DEFAULT 2030 CHECK(horizon IN (2030,2050,2100)),
 lens text NOT NULL DEFAULT 'technology' CHECK(lens IN ('technology','field')), slot text NOT NULL,
 status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','flagged','published','rejected','superseded','unpublished')),
 data jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 1, previous_version_id uuid,
 approved_at timestamptz, published_at timestamptz, last_verified_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(), stale boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS leading_programs (LIKE future_of_work_content INCLUDING ALL);
CREATE TABLE IF NOT EXISTS future_work_news (LIKE future_of_work_content INCLUDING ALL);
CREATE UNIQUE INDEX IF NOT EXISTS future_work_one_published_content ON future_of_work_content(slot) WHERE status='published';
CREATE UNIQUE INDEX IF NOT EXISTS future_work_one_published_combination ON future_of_work_content(function_id,horizon,lens) WHERE status='published';
CREATE UNIQUE INDEX IF NOT EXISTS future_work_one_published_program ON leading_programs(slot) WHERE status='published';
CREATE UNIQUE INDEX IF NOT EXISTS future_work_one_published_news ON future_work_news(slot) WHERE status='published';
CREATE TABLE IF NOT EXISTS future_work_schedules (
 id text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1,
 next_run_at timestamptz NOT NULL DEFAULT now(), source_window_months integer NOT NULL,
 stale_after_days integer NOT NULL, verification_only_opt_in boolean NOT NULL DEFAULT false, cursor integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS research_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), schedule_id text NOT NULL REFERENCES future_work_schedules(id),
 status text NOT NULL DEFAULT 'running', started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 lease_until timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 1,
 processed integer NOT NULL DEFAULT 0, sources_found integer NOT NULL DEFAULT 0,
 sources_accepted integer NOT NULL DEFAULT 0, sources_rejected integer NOT NULL DEFAULT 0,
 errors jsonb NOT NULL DEFAULT '[]', usage jsonb NOT NULL DEFAULT '[]', results jsonb NOT NULL DEFAULT '[]',
 plan jsonb NOT NULL DEFAULT '[]', requested_by text
);
CREATE UNIQUE INDEX IF NOT EXISTS future_work_single_worker ON research_log((true)) WHERE status='running';
CREATE TABLE IF NOT EXISTS future_work_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES research_log(id),
 publisher text NOT NULL, url text NOT NULL, accepted boolean NOT NULL DEFAULT false, evidence jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS future_work_evidence_run_url ON future_work_evidence(run_id,url);
CREATE TABLE IF NOT EXISTS future_work_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, version_id uuid NOT NULL,
 action text NOT NULL, actor text NOT NULL, reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS future_work_research_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, version_id uuid NOT NULL UNIQUE,
 function_id uuid NOT NULL REFERENCES future_work_functions(id) ON DELETE CASCADE,
 horizon integer NOT NULL, lens text NOT NULL, status text NOT NULL DEFAULT 'queued',
 run_id uuid REFERENCES research_log(id) ON DELETE SET NULL, candidate_version_id uuid,
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
-- Canonicalize all future content writes, independently of caller-supplied slot.
CREATE OR REPLACE FUNCTION future_work_canonical_content_slot() RETURNS trigger AS $$
BEGIN
 NEW.slot := NEW.function_id::text || ':content:' || NEW.horizon::text || ':' || NEW.lens;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS future_work_canonical_content_slot_trigger ON future_of_work_content;
CREATE TRIGGER future_work_canonical_content_slot_trigger
 BEFORE INSERT OR UPDATE ON future_of_work_content FOR EACH ROW EXECUTE FUNCTION future_work_canonical_content_slot();
UPDATE future_of_work_content SET slot=function_id::text || ':content:' || horizon::text || ':' || lens
 WHERE slot<>function_id::text || ':content:' || horizon::text || ':' || lens;
INSERT INTO future_work_functions(slug,name,sort_order) VALUES
 ('finance','Finance',0),('marketing','Marketing',1),('hr','HR',2),('operations','Operations',3),
 ('sales','Sales',4),('technology-it','Technology / IT',5),('grc','Governance, Risk & Compliance',6)
 ON CONFLICT(slug) DO NOTHING;
INSERT INTO future_work_schedules(id,source_window_months,stale_after_days) VALUES
 ('2030',12,35),('2050',24,190),('2100',24,370),('programs',12,35),('news',1,10)
 ON CONFLICT(id) DO NOTHING;