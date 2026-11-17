import {Worker} from 'node:worker_threads';import {connect,assertRuntimeRole} from '../../../packages/database/src/index.js';import {claim,settle,fail} from './jobs.js';
const {pool,tx}=connect();await assertRuntimeRole(pool);let stopping=false;for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>{stopping=true;});
async function evaluate(snapshot:any){return new Promise<any[]>((resolve,reject)=>{const w=new Worker(new URL('../../../packages/engine/src/thread.mjs',import.meta.url),{workerData:snapshot,resourceLimits:{maxOldGenerationSizeMb:256}});
 const timer=setTimeout(()=>{void w.terminate();reject(new Error('Timeout'));},30000);
 w.once('message',x=>{clearTimeout(timer);resolve(x);});w.once('error',e=>{clearTimeout(timer);reject(e);});w.once('exit',code=>{if(code!==0){clearTimeout(timer);reject(new Error('Worker exited'));}});
});}
while(!stopping){let work=false;const tenants=(await pool.query("SELECT id FROM institutions WHERE status='active' ORDER BY id")).rows;
 for(const {id:t}of tenants){if(stopping)break;const job=await tx(t,'system:worker',db=>claim(db,t));if(!job)continue;work=true;
 try{const output=await evaluate(job.snapshot);await tx(t,'system:worker',async db=>{if((await db.query("SELECT 1 FROM institutions WHERE id=$1 AND status='active'",[t])).rows.length)await settle(db,t,job,output);});console.log(JSON.stringify({event:'run.finished',tenant:t,run:job.id}));}catch{await tx(t,'system:worker',db=>fail(db,t,job));console.error(JSON.stringify({event:'run.failed',tenant:t,run:job.id}));}
 }if(!work)await new Promise(r=>setTimeout(r,1000));
}await pool.end();

