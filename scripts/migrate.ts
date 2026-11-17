import pg from 'pg';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const pool=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});if(!process.env.MIGRATION_DATABASE_URL)throw new Error('MIGRATION_DATABASE_URL required');
const c=await pool.connect();try {
 await c.query("SELECT pg_advisory_lock(9274401)");
 await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY,digest text NOT NULL,applied_at timestamptz DEFAULT now())');
 const sql=readFileSync('packages/database/migrations/001_initial.sql','utf8'),digest=createHash('sha256').update(sql).digest('hex');
 const prior=await c.query("SELECT digest FROM schema_migrations WHERE name='001_initial'");
 if(prior.rows.length){if(prior.rows[0].digest!==digest)throw new Error('Applied migration changed');}else{
 await c.query('BEGIN');await c.query(sql);await c.query("INSERT INTO schema_migrations(name,digest) VALUES('001_initial',$1)",[digest]);await c.query('COMMIT');
 }
 if(!(await c.query("SELECT 1 FROM pg_roles WHERE rolname='coursepilot_app'")).rows.length)await c.query('CREATE ROLE coursepilot_app LOGIN NOSUPERUSER NOBYPASSRLS');
 if(process.env.APP_DATABASE_PASSWORD){const literal=await c.query('SELECT quote_literal($1) AS password',[process.env.APP_DATABASE_PASSWORD]);await c.query('ALTER ROLE coursepilot_app PASSWORD '+literal.rows[0].password);}
 await c.query('GRANT USAGE ON SCHEMA public TO coursepilot_app');
 await c.query('GRANT SELECT ON institutions,platform_admins,memberships TO coursepilot_app');
 await c.query('GRANT INSERT ON institutions,memberships TO coursepilot_app');
 await c.query('GRANT SELECT,INSERT,UPDATE ON courses,assignments,intakes,students,sessions,batches,runs,tasks,confirmations,approvals TO coursepilot_app');
 await c.query('GRANT DELETE ON sessions TO coursepilot_app');
 await c.query('GRANT SELECT,INSERT ON audit_events TO coursepilot_app');
 console.log('Database schema and restricted runtime role ready');
}finally{await c.query("SELECT pg_advisory_unlock(9274401)");c.release();await pool.end();}

