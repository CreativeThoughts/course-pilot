import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';import pg from 'pg';
import {createApp} from '../apps/api/src/app.js';import {claim,settle} from '../apps/worker/src/jobs.js';import {calculate} from '../packages/engine/src/calculate.mjs';import {assertRuntimeRole} from '../packages/database/src/index.js';import type {DB,Transaction} from '../packages/database/src/index.js';
test('tenant boundaries, import replay, worker freshness, frozen confirmation and scoped approval',async()=>{
 const real=process.env.TEST_DATABASE_URL;const connection=real?new pg.Client({connectionString:real}):new PGlite();if(real)await (connection as pg.Client).connect();
 const db=connection as unknown as DB;const exec=async(sql:string)=>{if(real)await db.query(sql);else await (connection as PGlite).exec(sql);};
 try{
 await exec(readFileSync('packages/database/migrations/001_initial.sql','utf8'));
 await exec("CREATE ROLE coursepilot_test NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO coursepilot_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO coursepilot_test;");
 const a=randomUUID(),b=randomUUID();for(const [t,name]of [[a,'Alpha'],[b,'Beta']]){await db.query('INSERT INTO institutions(id,name) VALUES($1,$2)',[t,name]);await db.query("INSERT INTO memberships(institution_id,subject,role) VALUES($1,$2,'admin')",[t,name]);}
 const tx:Transaction=async(t,s,fn)=>{await exec('BEGIN; SET LOCAL ROLE coursepilot_test');try{await db.query("SELECT set_config('app.institution_id',$1,true),set_config('app.subject',$2,true)",[t??'',s]);const r=await fn(db);await exec('COMMIT');return r;}catch(e){await exec('ROLLBACK');throw e;}};
 await tx(null,'Alpha',d=>assertRuntimeRole(d));
 const app=await createApp(tx,{authenticate:async h=>{if(!h)throw Object.assign(new Error('Authentication required'),{statusCode:401});return h;},staticRoot:'/missing'});
 const api=async(method:'GET'|'POST',url:string,body?:any,user='Alpha')=>app.inject({method,url,headers:{authorization:user},payload:body});
 const base='/api/institutions/'+a;
 assert.equal((await app.inject({method:'GET',url:'/api/me'})).statusCode,401);
 assert.equal((await api('GET','/api/institutions/'+b+'/workspace')).statusCode,404);
 const course={id:'BBIS',name:'Synthetic degree',cores:'BIS101,BIS102,BIS103,BIS104',electives:'BIS201,BIS202',core_count:4,elective_count:1};
 assert.equal((await api('POST',base+'/courses',course)).statusCode,200);
 assert.equal((await api('POST','/api/institutions/'+b+'/courses',course,'Beta')).statusCode,200);
 await tx(a,'Alpha',async d=>{assert.equal((await d.query('SELECT * FROM courses')).rows.length,1);await assert.rejects(d.query('INSERT INTO courses(institution_id,id,data) VALUES($1,$2,$3)',[b,'BAD','{}']));});
 // A rolled-back failed statement cannot leak a previous connection tenant context.
 await tx(null,'Alpha',async d=>assert.equal((await d.query('SELECT * FROM courses')).rows.length,0));
 const i=(await api('POST',base+'/courses/BBIS/intakes',{name:'Semester',start:'2027-02-01',end:'2027-06-30'})).json().id;assert.ok(i);
 const input=JSON.parse(readFileSync('apps/web/public/sample-import.json','utf8'));
 const stage=(await api('POST',base+'/intakes/'+i+'/imports',{...input,baseVersion:0})).json();assert.equal(stage.added,3);
 assert.equal((await api('POST',base+'/imports/'+stage.id+'/accept',{})).statusCode,200);
 assert.equal((await api('POST',base+'/imports/'+stage.id+'/accept',{})).json().replayed,true);
 const job=await tx(a,'system:worker',d=>claim(d,a));assert.ok(job);await tx(a,'system:worker',d=>settle(d,a,job,calculate(job.snapshot)));
 let details=(await api('GET',base+'/intakes/'+i)).json();assert.equal(details.fresh,true);assert.equal(details.tasks.length,3);assert.equal(details.totals.students,3);
 const decision=await api('POST',base+'/tasks/'+details.tasks[0].id+'/decision',{version:0,status:'Completed',reason:'reviewed'});assert.equal(decision.statusCode,400);
 assert.equal((await api('POST',base+'/intakes/'+i+'/confirm',{version:1})).statusCode,200);
 assert.equal((await api('POST',base+'/intakes/'+i+'/confirm',{version:1})).statusCode,409);
 assert.equal((await api('POST',base+'/intakes/'+i+'/completion/DEMO002',{version:1,reason:'Verified academic evidence'})).statusCode,200);
 assert.equal((await api('POST',base+'/intakes/'+i+'/completion/DEMO001',{version:1,reason:'Not complete yet'})).statusCode,400);
 const duplicate=(await api('POST',base+'/intakes/'+i+'/imports',{...input,baseVersion:1})).json();assert.equal((await api('POST',base+'/imports/'+duplicate.id+'/accept',{})).json().unchanged,true);
 const changed=structuredClone(input);changed.students[0].name='Changed synthetic name';
 const staged=(await api('POST',base+'/intakes/'+i+'/imports',{...changed,baseVersion:1})).json();assert.equal((await api('POST',base+'/imports/'+staged.id+'/accept',{})).statusCode,200);
 const stale=await api('POST',base+'/tasks/'+details.tasks[0].id+'/decision',{version:details.tasks[0].version,status:'Completed',reason:'stale decision'});assert.equal(stale.statusCode,409);
 const job2=await tx(a,'system:worker',d=>claim(d,a));await tx(a,'system:worker',d=>settle(d,a,job2,calculate(job2.snapshot)));
 details=(await api('GET',base+'/intakes/'+i)).json();assert.ok(details.confirmations.every((c:any)=>c.evidence_version===1));assert.ok(details.tasks.some((t:any)=>t.reason.includes('reconciliation')));
 assert.equal((await api('POST',base+'/memberships',{subject:'Coord',role:'coordinator',courses:['BBIS'],starts:'2000-01-01',ends:'2001-01-01'})).statusCode,200);
 assert.equal((await api('GET',base+'/intakes/'+i,undefined,'Coord')).statusCode,403);
 await app.close();
 }finally{if(real)await (connection as pg.Client).end();else await (connection as PGlite).close();}
});

