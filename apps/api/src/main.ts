import {connect,assertRuntimeRole} from '../../../packages/database/src/index.js';import {createApp} from './app.js';
const {pool,tx}=connect();await assertRuntimeRole(pool);const app=await createApp(tx,{logger:true});
await app.listen({port:Number(process.env.PORT??3000),host:process.env.HOST??'127.0.0.1'});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await app.close();await pool.end();process.exit(0);});

