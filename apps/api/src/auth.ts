import {createRemoteJWKSet,jwtVerify,createLocalJWKSet} from 'jose';
import {AppError} from '../../../packages/domain/src/service.js';
export function authConfig(){
 const mode=process.env.AUTH_MODE??'oidc',issuer=process.env.OIDC_ISSUER,audience=process.env.OIDC_AUDIENCE;
 if(mode==='development'){
 if(process.env.NODE_ENV==='production'||!['127.0.0.1','localhost','::1'].includes(process.env.HOST??'127.0.0.1'))throw new Error('Development identity is allowed only on a local development listener');
 }else if(!issuer||!audience||!process.env.OIDC_JWKS_URL)throw new Error('OIDC_ISSUER, OIDC_AUDIENCE and OIDC_JWKS_URL required');
 return {mode,issuer,audience};
}
export function verifier(){
 const cfg=authConfig();const jwks=cfg.mode==='oidc'?createRemoteJWKSet(new URL(process.env.OIDC_JWKS_URL!)):undefined;
 return async(header?:string)=>{
 if(cfg.mode==='development')return 'demo-admin';
 if(!header?.startsWith('Bearer '))throw new AppError(401,'Sign in required');
 try{const {payload}=await jwtVerify(header.slice(7),jwks!,{issuer:cfg.issuer,audience:cfg.audience,algorithms:['RS256','ES256']});
 if(!payload.sub||payload.token_use==='id'||!String(payload.scope??'').split(' ').includes(process.env.OIDC_API_SCOPE??'coursepilot'))throw new Error('Access token required');
 return payload.sub;}catch{throw new AppError(401,'Invalid or expired access token');}
 };
}

