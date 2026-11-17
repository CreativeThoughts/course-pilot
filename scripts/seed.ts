import pg from 'pg';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {addCourse,addIntake,stage,acceptBatch} from '../packages/domain/src/service.js';
if(process.env.NODE_ENV==='production')throw new Error('Demo seeding disabled in production');
if(!process.env.MIGRATION_DATABASE_URL)throw new Error('MIGRATION_DATABASE_URL required');
const pool=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),c=await pool.connect();
try{await c.query('BEGIN');const tenant='11111111-1111-4111-8111-111111111111';await c.query("SELECT set_config('app.subject','demo-admin',true),set_config('app.institution_id',$1,true)",[tenant]);
if((await c.query('SELECT 1 FROM institutions WHERE id=$1',[tenant])).rows.length)throw new Error('Demo already exists; seed is intentionally non-destructive');
await c.query("INSERT INTO institutions(id,name) VALUES($1,'Harbour Institute — Demo')",[tenant]);await c.query("INSERT INTO platform_admins(subject) VALUES('demo-admin') ON CONFLICT DO NOTHING");await c.query("INSERT INTO memberships(institution_id,subject,role) VALUES($1,'demo-admin','admin')",[tenant]);
await addCourse(c,tenant,'demo-admin',{id:'BBIS',name:'Bachelor of Business Information Systems',cores:'BIS101,BIS102,BIS103,BIS104',electives:'BIS201,BIS202',core_count:4,elective_count:1,rules:{BIS104:{prerequisite:'BIS101',corequisite:'Nil'}}});
const i=await addIntake(c,tenant,'demo-admin','BBIS',{name:'Semester 1, 2027',start:'2027-02-01',end:'2027-06-30'});
const input=JSON.parse(readFileSync('apps/web/public/sample-import.json','utf8'));const batch=await stage(c,tenant,'demo-admin',i.id,{...input,baseVersion:0});await acceptBatch(c,tenant,'demo-admin',batch.id);await c.query('COMMIT');console.log('Synthetic demo seeded. Start the worker to calculate plans.');
} catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}

