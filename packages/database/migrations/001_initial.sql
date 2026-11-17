CREATE TABLE institutions (
 id uuid PRIMARY KEY, name text NOT NULL, timezone text NOT NULL DEFAULT 'Australia/Sydney',
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_admins (subject text PRIMARY KEY);
CREATE TABLE memberships (
 institution_id uuid REFERENCES institutions(id), subject text NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','coordinator','lecturer','graduation')),
 active boolean NOT NULL DEFAULT true, PRIMARY KEY(institution_id,subject)
);
CREATE TABLE courses (institution_id uuid NOT NULL REFERENCES institutions(id), id text NOT NULL, data jsonb NOT NULL, version int NOT NULL DEFAULT 1, PRIMARY KEY(institution_id,id));
CREATE TABLE assignments (
 institution_id uuid NOT NULL, subject text NOT NULL, course_id text NOT NULL, starts date NOT NULL, ends date,
 PRIMARY KEY(institution_id,subject,course_id), FOREIGN KEY(institution_id,course_id) REFERENCES courses(institution_id,id),
 FOREIGN KEY(institution_id,subject) REFERENCES memberships(institution_id,subject), CHECK(ends IS NULL OR ends>=starts)
);
CREATE TABLE intakes (
 institution_id uuid NOT NULL, id uuid NOT NULL, course_id text NOT NULL, data jsonb NOT NULL,
 version int NOT NULL DEFAULT 0, current_run uuid, PRIMARY KEY(institution_id,id),
 FOREIGN KEY(institution_id,course_id) REFERENCES courses(institution_id,id)
);
CREATE TABLE students (
 institution_id uuid NOT NULL, intake_id uuid NOT NULL, id text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(institution_id,intake_id,id), FOREIGN KEY(institution_id,intake_id) REFERENCES intakes(institution_id,id)
);
CREATE TABLE sessions (
 institution_id uuid NOT NULL, intake_id uuid NOT NULL, id text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(institution_id,intake_id,id), FOREIGN KEY(institution_id,intake_id) REFERENCES intakes(institution_id,id)
);
CREATE TABLE batches (
 institution_id uuid NOT NULL, id uuid NOT NULL, intake_id uuid NOT NULL, base_version int NOT NULL,
 data jsonb NOT NULL, digest text NOT NULL, status text NOT NULL DEFAULT 'staged',
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(institution_id,id), FOREIGN KEY(institution_id,intake_id) REFERENCES intakes(institution_id,id)
);
CREATE TABLE runs (
 institution_id uuid NOT NULL, id uuid NOT NULL, intake_id uuid NOT NULL, version int NOT NULL,
 snapshot jsonb NOT NULL, output jsonb, status text NOT NULL DEFAULT 'queued',
 attempts int NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz,
 error text, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 PRIMARY KEY(institution_id,id), UNIQUE(institution_id,intake_id,version),
 FOREIGN KEY(institution_id,intake_id) REFERENCES intakes(institution_id,id)
);
CREATE INDEX runs_queue ON runs(institution_id,status,available_at);
CREATE TABLE tasks (
 institution_id uuid NOT NULL, id uuid NOT NULL, intake_id uuid NOT NULL, student_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('Action needed','Waiting','On track','Completed')),
 reason text NOT NULL, evidence_version int NOT NULL, version int NOT NULL DEFAULT 1,
 follow_up date, PRIMARY KEY(institution_id,id), UNIQUE(institution_id,intake_id,student_id),
 FOREIGN KEY(institution_id,intake_id,student_id) REFERENCES students(institution_id,intake_id,id)
);
CREATE TABLE confirmations (
 institution_id uuid NOT NULL, intake_id uuid NOT NULL, student_id text NOT NULL,
 evidence_version int NOT NULL, data jsonb NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(institution_id,intake_id,student_id),
 FOREIGN KEY(institution_id,intake_id,student_id) REFERENCES students(institution_id,intake_id,id)
);
CREATE TABLE audit_events (
 institution_id uuid NOT NULL REFERENCES institutions(id), id uuid NOT NULL, actor text NOT NULL,
 action text NOT NULL, entity_id text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(institution_id,id)
);
CREATE TABLE approvals (
 institution_id uuid NOT NULL, intake_id uuid NOT NULL, student_id text NOT NULL, version int NOT NULL,
 decision text NOT NULL, reason text NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(institution_id,intake_id,student_id,version),
 FOREIGN KEY(institution_id,intake_id,student_id) REFERENCES students(institution_id,intake_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['courses','assignments','intakes','students','sessions','batches','runs','tasks','confirmations','audit_events','approvals'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
 EXECUTE format('CREATE POLICY tenant_policy ON %I USING (institution_id = nullif(current_setting(''app.institution_id'',true),'''')::uuid) WITH CHECK (institution_id = nullif(current_setting(''app.institution_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_self ON memberships USING (subject=current_setting('app.subject',true)) WITH CHECK (institution_id=nullif(current_setting('app.institution_id',true),'')::uuid);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_self ON platform_admins FOR SELECT USING(subject=current_setting('app.subject',true));
REVOKE ALL ON SCHEMA public FROM PUBLIC;

