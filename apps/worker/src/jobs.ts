import {randomUUID} from 'node:crypto';import type {DB,Transaction} from '../../../packages/database/src/index.js';import {planStatus} from '../../../packages/domain/src/status.js';
export async function claim(db:DB,t:string){
 const r=await db.query("SELECT * FROM runs WHERE institution_id=$1 AND attempts<3 AND ((status='queued' AND available_at<=now()) OR (status='running' AND locked_at<now()-interval '5 minutes')) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",[t]);const job=r.rows[0];if(!job)return;
 await db.query("UPDATE runs SET status='running',locked_at=now(),attempts=attempts+1 WHERE institution_id=$1 AND id=$2",[t,job.id]);job.attempts++;return job;
}
export async function settle(db:DB,t:string,job:any,output:any[]){
 const r=(await db.query('SELECT * FROM runs WHERE institution_id=$1 AND id=$2 FOR UPDATE',[t,job.id])).rows[0];
 if(r.status!=='running'||r.attempts!==job.attempts)return;
 const i=(await db.query('SELECT * FROM intakes WHERE institution_id=$1 AND id=$2 FOR UPDATE',[t,job.intake_id])).rows[0];
 const fresh=i.version===job.version;
 await db.query("UPDATE runs SET output=$3,status=$4,finished_at=now(),locked_at=NULL WHERE institution_id=$1 AND id=$2",[t,job.id,JSON.stringify(output),fresh?'succeeded':'superseded']);
 if(!fresh)return;
 await db.query('UPDATE intakes SET current_run=$3 WHERE institution_id=$1 AND id=$2',[t,job.intake_id,job.id]);
 for(const p of output){const flags=p.scenarios[0].flags;const confirmation=(await db.query('SELECT evidence_version FROM confirmations WHERE institution_id=$1 AND intake_id=$2 AND student_id=$3',[t,job.intake_id,p.student.id])).rows[0];
 const status=confirmation&&confirmation.evidence_version!==job.version?'Action needed':planStatus(flags);
 const reason=confirmation&&confirmation.evidence_version!==job.version?'Confirmed enrolment needs reconciliation with changed evidence':flags.length?flags.map((f:string)=>f.toLowerCase().replaceAll('_',' ')).join('; '):'Plan meets configured requirements';
 await db.query('INSERT INTO tasks(institution_id,id,intake_id,student_id,status,reason,evidence_version) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(institution_id,intake_id,student_id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason,evidence_version=EXCLUDED.evidence_version,follow_up=NULL,version=tasks.version+1',[t,randomUUID(),job.intake_id,p.student.id,status,reason,job.version]);
 }
}
export async function fail(db:DB,t:string,job:any){await db.query("UPDATE runs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,error='Calculation failed or exceeded resource limit',available_at=now()+interval '30 seconds',locked_at=NULL WHERE institution_id=$1 AND id=$2 AND attempts=$3 AND status='running'",[t,job.id,job.attempts]);}

