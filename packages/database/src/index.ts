import pg from 'pg';
export interface DB {query(text:string,values?:any[]):Promise<{rows:any[];rowCount?:number|null}>}
export type Transaction = <T>(tenant:string|null,subject:string,fn:(db:DB)=>Promise<T>)=>Promise<T>;
export function connect(url=process.env.DATABASE_URL) {
 if(!url) throw new Error('DATABASE_URL is required');
 const pool=new pg.Pool({connectionString:url,max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
 const tx:Transaction=async(tenant,subject,fn)=>{
 const c=await pool.connect();try {await c.query('BEGIN');await c.query("SELECT set_config('app.institution_id',$1,true),set_config('app.subject',$2,true)",[tenant??'',subject]);const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
 return {pool,tx};
}
export async function assertRuntimeRole(db:DB) {
 const {rows}=await db.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user");
 const owned=await db.query("SELECT 1 FROM pg_tables WHERE schemaname='public' AND tableowner=current_user AND tablename='students'");
 if(rows[0]?.rolsuper || rows[0]?.rolbypassrls || owned.rows.length)throw new Error('Runtime database role must be non-owner and cannot bypass RLS');
}

