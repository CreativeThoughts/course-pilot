import {randomUUID,createHash} from 'node:crypto';
import type {DB} from '../../database/src/index.js';
import {courseInput,periodInput,refreshInput,decisionInput} from '../../contracts/src/index.js';
import {completionEligibility} from '../../engine/src/completion.mjs';
import {planStatus,overlap} from './status.js';
export class AppError extends Error {constructor(public statusCode:number,message:string){super(message);}}
export const requireRow=(rows:any[],message='Record not found')=>{if(!rows[0])throw new AppError(404,message);return rows[0];};
export async function audit(db:DB,t:string,actor:string,action:string,entity:string,detail:object={}) {await db.query('INSERT INTO audit_events(institution_id,id,actor,action,entity_id,detail) VALUES($1,$2,$3,$4,$5,$6)',[t,randomUUID(),actor,action,entity,JSON.stringify(detail)]);}
export async function access(db:DB,t:string,subject:string,course?:string,adminOnly=false) {
 const m=requireRow((await db.query("SELECT m.role FROM memberships m JOIN institutions i ON i.id=m.institution_id WHERE m.institution_id=$1 AND m.subject=$2 AND m.active AND i.status='active'",[t,subject])).rows,'Active membership required');
 if(adminOnly && m.role!=='admin')throw new AppError(403,'Institution administrator required');
 if(course&&m.role!=='admin'){
 if(!['coordinator','graduation'].includes(m.role))throw new AppError(403,'Course access denied');
 if(!(await db.query('SELECT 1 FROM assignments WHERE institution_id=$1 AND subject=$2 AND course_id=$3 AND starts<=CURRENT_DATE AND (ends IS NULL OR ends>=CURRENT_DATE)',[t,subject,course])).rows.length)throw new AppError(403,'Active course assignment required');
 }return m.role as string;
}
export async function intake(db:DB,t:string,subject:string,id:string,write=false){
 const r=requireRow((await db.query('SELECT * FROM intakes WHERE institution_id=$1 AND id=$2',[t,id])).rows);
 const role=await access(db,t,subject,r.course_id);if(write&&!['admin','coordinator'].includes(role))throw new AppError(403,'Coordinator required');return r;
}
export async function addCourse(db:DB,t:string,subject:string,input:unknown){await access(db,t,subject,undefined,true);const data=courseInput.parse(input);
 const codes=(s:string)=>s.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);data.cores=codes(data.cores).join(',');data.electives=codes(data.electives).join(',');
 if(completionEligibility({completed:'',in_progress:'',failed:''},data).issues.includes('Course requirement configuration needs review'))throw new AppError(400,'Invalid core/elective requirements');
 await db.query('INSERT INTO courses(institution_id,id,data) VALUES($1,$2,$3)',[t,data.id,JSON.stringify(data)]);await audit(db,t,subject,'course.created',data.id);return data;
}
export async function addIntake(db:DB,t:string,subject:string,course:string,input:unknown){await access(db,t,subject,undefined,true);const data=periodInput.parse(input),id=randomUUID();await db.query('INSERT INTO intakes(institution_id,id,course_id,data) VALUES($1,$2,$3,$4)',[t,id,course,JSON.stringify(data)]);await audit(db,t,subject,'intake.created',id);return {id,...data};}
export async function stage(db:DB,t:string,subject:string,i:string,input:unknown){
 const current=await intake(db,t,subject,i,true),data=refreshInput.parse(input);if(data.baseVersion!==current.version)throw new AppError(409,'Intake changed; refresh before staging');
 if(data.students.some(s=>s.course!==current.course_id)||data.sessions.some(s=>s.course!==current.course_id))throw new AppError(400,'Import contains another course');
 const perSubject=new Map<string,Set<string>>();for(const s of data.sessions){const g=perSubject.get(s.subject)??new Set();g.add(s.group);perSubject.set(s.subject,g);}
 if(perSubject.size>16||[...perSubject.values()].some(x=>x.size>3))throw new AppError(400,'Initial engine supports at most 16 offered subjects and 3 groups per subject');
 for(const row of data.sessions)for(const other of data.sessions)if(row.id<other.id&&row.lecturer===other.lecturer&&overlap(row,other))throw new AppError(400,'Lecturer has overlapping sessions: '+row.lecturer);
 const previous=(await db.query('SELECT id,data FROM students WHERE institution_id=$1 AND intake_id=$2',[t,i])).rows;
 const counts={added:0,updated:0,unchanged:0,missing:previous.filter(x=>!data.students.some(s=>s.id===x.id)).length};
 for(const s of data.students){const p=previous.find(x=>x.id===s.id);counts[!p?'added':canonical(p.data)===canonical(s)?'unchanged':'updated']++;}
 const id=randomUUID(),digest=createHash('sha256').update(canonical(data)).digest('hex');
 await db.query('INSERT INTO batches(institution_id,id,intake_id,base_version,data,digest,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[t,id,i,current.version,JSON.stringify(data),digest,subject]);
 await audit(db,t,subject,'import.staged',id,counts);return {id,...counts,semantics:'Partial student updates; omitted students retained. Sessions replace the published intake timetable after acceptance.'};
}
export function canonical(v:any):string {if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
export async function acceptBatch(db:DB,t:string,subject:string,id:string){
 const b=requireRow((await db.query('SELECT * FROM batches WHERE institution_id=$1 AND id=$2 FOR UPDATE',[t,id])).rows);await intake(db,t,subject,b.intake_id,true);
 if(b.status==='accepted')return {accepted:true,replayed:true};
 const current=requireRow((await db.query('SELECT * FROM intakes WHERE institution_id=$1 AND id=$2 FOR UPDATE',[t,b.intake_id])).rows);
 if(current.version!==b.base_version)throw new AppError(409,'Staged import is stale');
 // Serialize timetable acceptance across an institution to protect cross-course lecturer checks.
 await db.query('SELECT id FROM institutions WHERE id=$1 FOR UPDATE',[t]);
 const others=(await db.query("SELECT s.data,i.data AS period FROM sessions s JOIN intakes i ON i.institution_id=s.institution_id AND i.id=s.intake_id WHERE s.institution_id=$1 AND s.intake_id<>$2",[t,b.intake_id])).rows;
 for(const s of b.data.sessions)for(const o of others)if(current.data.start<=o.period.end&&o.period.start<=current.data.end&&s.lecturer===o.data.lecturer&&overlap(s,o.data))throw new AppError(409,'Lecturer clash in another course/intake');
 const existing=(await db.query('SELECT data FROM students WHERE institution_id=$1 AND intake_id=$2',[t,b.intake_id])).rows.map(x=>x.data);
 const oldSessions=(await db.query('SELECT data FROM sessions WHERE institution_id=$1 AND intake_id=$2 ORDER BY id',[t,b.intake_id])).rows.map(x=>x.data);
 const changed=b.data.students.some((s:any)=>canonical(existing.find((x:any)=>x.id===s.id))!==canonical(s))||canonical(oldSessions)!==canonical([...b.data.sessions].sort((a:any,b:any)=>a.id.localeCompare(b.id)));
 if(!changed){await db.query("UPDATE batches SET status='accepted' WHERE institution_id=$1 AND id=$2",[t,id]);return {accepted:true,unchanged:true};}
 for(const s of b.data.students)await db.query('INSERT INTO students(institution_id,intake_id,id,data) VALUES($1,$2,$3,$4) ON CONFLICT(institution_id,intake_id,id) DO UPDATE SET data=EXCLUDED.data',[t,b.intake_id,s.id,JSON.stringify(s)]);
 await db.query('DELETE FROM sessions WHERE institution_id=$1 AND intake_id=$2',[t,b.intake_id]);
 for(const s of b.data.sessions)await db.query('INSERT INTO sessions(institution_id,intake_id,id,data) VALUES($1,$2,$3,$4)',[t,b.intake_id,s.id,JSON.stringify(s)]);
 const version=current.version+1,run=randomUUID();
 const course=requireRow((await db.query('SELECT data,version FROM courses WHERE institution_id=$1 AND id=$2',[t,current.course_id])).rows);
 const students=(await db.query('SELECT data FROM students WHERE institution_id=$1 AND intake_id=$2 ORDER BY id',[t,b.intake_id])).rows.map(x=>x.data);
 const snapshot={students,course:course.data,courseVersion:course.version,sessions:b.data.sessions,settings:current.data,engineVersion:'f88e586',schemaVersion:1};
 await db.query('UPDATE intakes SET version=$3 WHERE institution_id=$1 AND id=$2',[t,b.intake_id,version]);
 // A durable database queue is committed atomically with the accepted refresh.
 await db.query('INSERT INTO runs(institution_id,id,intake_id,version,snapshot) VALUES($1,$2,$3,$4,$5)',[t,run,b.intake_id,version,JSON.stringify(snapshot)]);
 await db.query("UPDATE tasks SET status='Action needed',reason='Evidence changed; awaiting refreshed recommendations',version=version+1 WHERE institution_id=$1 AND intake_id=$2",[t,b.intake_id]);
 await db.query("UPDATE batches SET status='accepted' WHERE institution_id=$1 AND id=$2",[t,id]);await audit(db,t,subject,'import.accepted',id,{version,run});
 return {accepted:true,run,version};
}
export async function updateTask(db:DB,t:string,subject:string,id:string,input:unknown){
 const data=decisionInput.parse(input),task=requireRow((await db.query('SELECT * FROM tasks WHERE institution_id=$1 AND id=$2 FOR UPDATE',[t,id])).rows),i=await intake(db,t,subject,task.intake_id,true);
 if(i.version!==task.evidence_version||task.version!==data.version)throw new AppError(409,'Task evidence changed; refresh before deciding');
 if(data.status==='Waiting'&&!data.followUp)throw new AppError(400,'Waiting requires a follow-up date');
 await db.query('UPDATE tasks SET status=$3,reason=$4,follow_up=$5,version=version+1 WHERE institution_id=$1 AND id=$2',[t,id,data.status,data.reason,data.followUp??null]);
 await audit(db,t,subject,'task.decided',id,data);return {ok:true};
}
export async function confirm(db:DB,t:string,subject:string,i:string,version:number) {
 const current=await intake(db,t,subject,i,true);await db.query('SELECT id FROM intakes WHERE institution_id=$1 AND id=$2 FOR UPDATE',[t,i]);
 if(current.version!==version)throw new AppError(409,'Intake evidence changed');
 const run=requireRow((await db.query("SELECT output,version FROM runs WHERE institution_id=$1 AND id=$2 AND status='succeeded'",[t,current.current_run])).rows,'Current successful calculation required');
 if(run.version!==version)throw new AppError(409,'Recommendations are stale');
 if((await db.query('SELECT 1 FROM confirmations WHERE institution_id=$1 AND intake_id=$2',[t,i])).rows.length)throw new AppError(409,'Intake already confirmed; amendment workflow required');
 let count=0;const omitted=[];for(const p of run.output){const selected=p.scenarios[0];if(!selected.subjects.length){omitted.push(p.student.id);continue;}await db.query('INSERT INTO confirmations(institution_id,intake_id,student_id,evidence_version,data,actor) VALUES($1,$2,$3,$4,$5,$6)',[t,i,p.student.id,version,JSON.stringify(selected),subject]);count++;}
 if(!count)throw new AppError(400,'No non-empty selections to confirm');await audit(db,t,subject,'intake.confirmed',i,{version,count,omitted});return {count,omitted};
}
export async function approveCompletion(db:DB,t:string,subject:string,i:string,s:string,version:number,reason:string){
 const current=await intake(db,t,subject,i);const role=await access(db,t,subject,current.course_id);if(!['admin','coordinator'].includes(role))throw new AppError(403,'Academic coordinator required');
 await db.query('SELECT id FROM intakes WHERE institution_id=$1 AND id=$2 FOR UPDATE',[t,i]);
 if(current.version!==version)throw new AppError(409,'Evidence changed');
 const student=requireRow((await db.query('SELECT data FROM students WHERE institution_id=$1 AND intake_id=$2 AND id=$3',[t,i,s])).rows);
 const course=requireRow((await db.query('SELECT data FROM courses WHERE institution_id=$1 AND id=$2',[t,current.course_id])).rows);
 if(!completionEligibility(student.data,course.data).ready)throw new AppError(400,'Academic requirements are not satisfied');
 await db.query("INSERT INTO approvals(institution_id,intake_id,student_id,version,decision,reason,actor) VALUES($1,$2,$3,$4,'approved',$5,$6)",[t,i,s,version,reason,subject]);
 await audit(db,t,subject,'completion.approved',s,{intake:i,version,reason});return {approved:true};
}

