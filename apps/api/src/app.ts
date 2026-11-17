import Fastify from 'fastify';import rateLimit from '@fastify/rate-limit';import staticPlugin from '@fastify/static';import {resolve} from 'node:path';import {existsSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {z,ZodError} from 'zod';
import type {Transaction,DB} from '../../../packages/database/src/index.js';
import {id,institutionInput} from '../../../packages/contracts/src/index.js';
import {AppError,access,intake,addCourse,addIntake,stage,acceptBatch,updateTask,confirm,approveCompletion,audit,requireRow} from '../../../packages/domain/src/service.js';
import {completionEligibility} from '../../../packages/engine/src/completion.mjs';
import {verifier,authConfig} from './auth.js';
export async function createApp(tx:Transaction,options:{authenticate?:(header?:string)=>Promise<string>;staticRoot?:string;logger?:boolean}={}){
 const app=Fastify({logger:options.logger??false,bodyLimit:2*1024*1024,disableRequestLogging:true});
 const auth=options.authenticate??verifier();
 await app.register(rateLimit,{max:120,timeWindow:'1 minute'});
 app.setErrorHandler((e,req,reply)=>{const error=e as any;const status=error instanceof ZodError?400:error.statusCode??(error.code==='23505'?409:500);reply.code(status).send({error:status===500?'Unexpected server error; contact support with request ID':error instanceof ZodError?'Invalid input: '+error.issues.map((i:any)=>i.path.join('.')+' '+i.message).join('; '):status===409&&error.code==='23505'?'Record already exists':error.message,requestId:req.id});});
 app.addHook('onSend',async(req,reply,payload)=>{reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','same-origin').header('X-Frame-Options','DENY');if(req.url.startsWith('/api'))reply.header('Cache-Control','no-store');return payload;});
 app.get('/healthz',async()=>({status:'ok'}));
 app.get('/readyz',async()=>tx(null,'health',async db=>{await db.query('SELECT 1');return {status:'ready'};}));
 app.get('/api/auth/config',async()=>({mode:process.env.AUTH_MODE??'oidc',issuer:process.env.OIDC_ISSUER,clientId:process.env.OIDC_CLIENT_ID,scope:process.env.OIDC_SCOPE??'openid profile coursepilot',publicUrl:process.env.PUBLIC_URL??'http://localhost:3000'}));
 app.get('/api/me',async(req)=>{const subject=await auth(req.headers.authorization);return tx(null,subject,async db=>({subject,institutions:(await db.query("SELECT i.id,i.name,i.timezone,m.role FROM memberships m JOIN institutions i ON i.id=m.institution_id WHERE m.subject=$1 AND m.active AND i.status='active'",[subject])).rows,platformAdmin:!!(await db.query('SELECT 1 FROM platform_admins WHERE subject=$1',[subject])).rows.length}));});
 app.post('/api/platform/institutions',async(req)=>{const subject=await auth(req.headers.authorization),input=institutionInput.parse(req.body),tenant=randomUUID();return tx(tenant,subject,async db=>{if(!(await db.query('SELECT 1 FROM platform_admins WHERE subject=$1',[subject])).rows.length)throw new AppError(403,'Platform administrator required');await db.query('INSERT INTO institutions(id,name,timezone) VALUES($1,$2,$3)',[tenant,input.name,input.timezone]);await db.query("INSERT INTO memberships(institution_id,subject,role) VALUES($1,$2,'admin')",[tenant,input.adminSubject]);await audit(db,tenant,subject,'institution.created',tenant);return {id:tenant};});});
 // Scope all domain routes through the same authenticated transaction boundary.
 const route=(method:'GET'|'POST',path:string,handler:(db:DB,t:string,s:string,req:any)=>Promise<unknown>)=>{
 app.route({method,url:'/api/institutions/:tenant'+path,handler:async(req)=>{const t=id.parse((req.params as any).tenant),s=await auth(req.headers.authorization);return tx(t,s,async db=>{await access(db,t,s);return handler(db,t,s,req);});}});
 };
 route('GET','/workspace',async(db,t,s)=>{const role=await access(db,t,s);
 const courses=(await db.query("SELECT c.* FROM courses c WHERE c.institution_id=$1 AND ($3='admin' OR EXISTS (SELECT 1 FROM assignments a WHERE a.institution_id=c.institution_id AND a.course_id=c.id AND a.subject=$2 AND a.starts<=CURRENT_DATE AND (a.ends IS NULL OR a.ends>=CURRENT_DATE))) ORDER BY c.id",[t,s,role])).rows;
 const courseIds=courses.map(c=>c.id);
 const intakes=(await db.query("SELECT i.*,r.status AS run_status,r.version AS run_version FROM intakes i LEFT JOIN runs r ON r.institution_id=i.institution_id AND r.id=i.current_run WHERE i.institution_id=$1 AND i.course_id=ANY($2::text[]) ORDER BY i.data->>'start' DESC",[t,courseIds])).rows;return {courses,intakes};});
 route('POST','/courses',async(db,t,s,r)=>addCourse(db,t,s,r.body));
 route('POST','/courses/:course/intakes',async(db,t,s,r)=>addIntake(db,t,s,r.params.course,r.body));
 route('POST','/memberships',async(db,t,s,r)=>{await access(db,t,s,undefined,true);const b=z.object({subject:z.string().min(1),role:z.enum(['coordinator','lecturer','graduation']),courses:z.array(z.string()).max(50),starts:z.string().date(),ends:z.string().date().optional()}).parse(r.body);if(b.ends&&b.ends<b.starts)throw new AppError(400,'Invalid assignment dates');
 await db.query('INSERT INTO memberships(institution_id,subject,role) VALUES($1,$2,$3)',[t,b.subject,b.role]);
 for(const c of b.courses)await db.query('INSERT INTO assignments(institution_id,subject,course_id,starts,ends) VALUES($1,$2,$3,$4,$5)',[t,b.subject,c,b.starts,b.ends??null]);await audit(db,t,s,'membership.created',b.subject,{role:b.role,courses:b.courses});return {ok:true};});
 route('GET','/intakes/:intake',async(db,t,s,r)=>{
 const i=await intake(db,t,s,id.parse(r.params.intake));const limit=50,offset=z.coerce.number().int().min(0).max(100000).parse(r.query.offset??0);
 const students=(await db.query('SELECT data FROM students WHERE institution_id=$1 AND intake_id=$2 ORDER BY id LIMIT $3 OFFSET $4',[t,i.id,limit,offset])).rows.map(x=>x.data);
 const course=requireRow((await db.query('SELECT data FROM courses WHERE institution_id=$1 AND id=$2',[t,i.course_id])).rows).data;
 const run=(await db.query('SELECT id,version,status,output,created_at FROM runs WHERE institution_id=$1 AND id=$2',[t,i.current_run])).rows[0];
 const ids=students.map(x=>x.id);const output=run?.output?.filter((p:any)=>ids.includes(p.student.id))??[];
 const tasks=(await db.query("SELECT *,CASE WHEN status='Waiting' AND follow_up<CURRENT_DATE THEN 'Action needed' ELSE status END AS display_status FROM tasks WHERE institution_id=$1 AND intake_id=$2 ORDER BY student_id LIMIT $3 OFFSET $4",[t,i.id,limit,offset])).rows;
 const sessions=(await db.query('SELECT data FROM sessions WHERE institution_id=$1 AND intake_id=$2 ORDER BY id',[t,i.id])).rows.map(x=>x.data);
 const totals=(await db.query("SELECT (SELECT count(*) FROM students WHERE institution_id=$1 AND intake_id=$2)::int AS students,(SELECT count(*) FROM confirmations WHERE institution_id=$1 AND intake_id=$2)::int AS enrolled,(SELECT COALESCE(sum(jsonb_array_length(data->'subjects')),0) FROM confirmations WHERE institution_id=$1 AND intake_id=$2)::int AS registrations",[t,i.id])).rows[0];
 const statuses=(await db.query("SELECT CASE WHEN status='Waiting' AND follow_up<CURRENT_DATE THEN 'Action needed' ELSE status END AS status,count(*)::int FROM tasks WHERE institution_id=$1 AND intake_id=$2 GROUP BY 1",[t,i.id])).rows;
 const confirmations=(await db.query('SELECT student_id,evidence_version,data FROM confirmations WHERE institution_id=$1 AND intake_id=$2 AND student_id=ANY($3::text[])',[t,i.id,ids])).rows;
 const approvals=(await db.query('SELECT student_id,version,decision FROM approvals WHERE institution_id=$1 AND intake_id=$2 AND student_id=ANY($3::text[])',[t,i.id,ids])).rows;
 const jobs=(await db.query('SELECT id,version,status,attempts,created_at,finished_at FROM runs WHERE institution_id=$1 AND intake_id=$2 ORDER BY created_at DESC LIMIT 10',[t,i.id])).rows;
 return {intake:i,course,students,plans:output,tasks,sessions,totals,statuses,confirmations,approvals,jobs,completion:students.map(x=>({id:x.id,name:x.name,...completionEligibility(x,course)})),fresh:run?.version===i.version,offset,limit};
 });
 route('POST','/intakes/:intake/imports',async(db,t,s,r)=>stage(db,t,s,id.parse(r.params.intake),r.body));
 route('POST','/imports/:batch/accept',async(db,t,s,r)=>acceptBatch(db,t,s,id.parse(r.params.batch)));
 route('POST','/tasks/:task/decision',async(db,t,s,r)=>updateTask(db,t,s,id.parse(r.params.task),r.body));
 route('POST','/intakes/:intake/confirm',async(db,t,s,r)=>confirm(db,t,s,id.parse(r.params.intake),z.object({version:z.number().int()}).parse(r.body).version));
 route('POST','/intakes/:intake/completion/:student',async(db,t,s,r)=>{const b=z.object({version:z.number().int(),reason:z.string().min(3).max(2000)}).parse(r.body);return approveCompletion(db,t,s,id.parse(r.params.intake),r.params.student,b.version,b.reason);});
 route('GET','/audit',async(db,t,s)=>{await access(db,t,s,undefined,true);return (await db.query('SELECT actor,action,entity_id,detail,created_at FROM audit_events WHERE institution_id=$1 ORDER BY created_at DESC LIMIT 100',[t])).rows;});
 const root=options.staticRoot??resolve('apps/web/dist');if(existsSync(root)){await app.register(staticPlugin,{root});app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({error:'Route not found'}):reply.sendFile('index.html'));}
 return app;
}

