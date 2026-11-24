import {validBoard} from './src/model.js';
import {tmdbResponse} from './tmdb.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const cookie=(name,value,age)=>`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const cookies=req=>Object.fromEntries((req.headers.get('Cookie')||'').split(';').filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),decodeURIComponent(x.slice(i+1))]}));
async function boundedJson(req,limit){if(Number(req.headers.get('Content-Length'))>limit)throw Object.assign(Error('Request too large'),{status:413});const reader=req.body?.getReader();let size=0,parts=[];if(!reader)throw Object.assign(Error('Missing JSON'),{status:400});while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Object.assign(Error('Request too large'),{status:413})}parts.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length}try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw Object.assign(Error('Invalid JSON'),{status:400})}}
function setSession(response,session){response.headers.append('Set-Cookie',cookie('__Host-sq-access',session.access_token,Math.min(session.expires_in||3600,86400)));response.headers.append('Set-Cookie',cookie('__Host-sq-refresh',session.refresh_token,60*60*24*30));return response}
function clearSession(response){for(const name of ['__Host-sq-access','__Host-sq-refresh'])response.headers.append('Set-Cookie',cookie(name,'',0));return response}
export function createWorker(fetcher=fetch){
 const request=async(env,path,{method='GET',body,token}={})=>{const response=await fetcher(env.SUPABASE_URL+path,{method,headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});if(response.status>=300&&response.status<400)throw Error('Unexpected upstream redirect');return response};
 async function authenticate(req,env){
  const c=cookies(req);let token=c['__Host-sq-access'],session;
  let response=token?await request(env,'/auth/v1/user',{token}):null;
  if(response&&!response.ok&&![401,403].includes(response.status))throw Error('Authentication unavailable');
  if(!response?.ok&&c['__Host-sq-refresh']){
   const r=await request(env,'/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:c['__Host-sq-refresh']}});
   if(!r.ok){if(r.status>=500||r.status===429)throw Error('Authentication unavailable');return null}
   session=await r.json();token=session.access_token;response=await request(env,'/auth/v1/user',{token});
  }
  if(!response?.ok)return null;
  const user=await response.json();if(!user.id)return null;return {user,token,session};
 }
 return {async fetch(req,env){
  const url=new URL(req.url),path=url.pathname;
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(req);
  try{
   if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return json({error:'Sidequest setup is not complete.'},503);
   if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL))return json({error:'Invalid server configuration.'},503);
   if(!['GET','HEAD'].includes(req.method)&&req.headers.get('Origin')!==url.origin)return json({error:'Invalid origin'},403);
   if(path==='/api/login'&&req.method==='POST'){
    const b=await boundedJson(req,8192);
    if(typeof b.email!=='string'||b.email.length>320||typeof b.password!=='string'||b.password.length>4096)return json({error:'Enter your email and password.'},400);
    const r=await request(env,'/auth/v1/token?grant_type=password',{method:'POST',body:{email:b.email,password:b.password}});
    if(r.status>=500)throw Error('Authentication unavailable');
    if(!r.ok)return json({error:r.status===429?'Too many attempts. Try again shortly.':'Could not sign in. Check your email and password.'},r.status===429?429:401);
    const session=await r.json();
    const allowed=await request(env,'/rest/v1/sidequest_members?select=user_id',{token:session.access_token});
    if(!allowed.ok)throw Error('Account check unavailable');
    if(!(await allowed.json()).length)return json({error:'This account has not been enabled for Sidequest.'},403);
    return setSession(json({ok:true}),session);
   }
   if(path==='/api/logout'&&req.method==='POST'){
    const auth=await authenticate(req,env);
    if(auth){const r=await request(env,'/auth/v1/logout?scope=local',{method:'POST',token:auth.token});if(!r.ok&&r.status!==401)throw Error('Sign out unavailable')}
    return clearSession(json({ok:true}));
   }
   if(path.startsWith('/api/tmdb/')&&req.method==='GET'){
    const auth=await authenticate(req,env);if(!auth)return clearSession(json({error:'Sign in again to look up titles.'},401));
    const finish=r=>auth.session?setSession(r,auth.session):r;
    const allowed=await request(env,'/rest/v1/sidequest_members?select=user_id',{token:auth.token});
    if(!allowed.ok)throw Error('Account check unavailable');
    if(!(await allowed.json()).length)return finish(json({error:'This account has not been enabled for Sidequest.'},403));
    return finish(await tmdbResponse(url,env.TMDB_READ_TOKEN,fetcher,json));
   }
   if(path!=='/api/state'||!['GET','PUT'].includes(req.method))return json({error:'Not found'},404);
   const auth=await authenticate(req,env);if(!auth)return clearSession(json({error:'Sign in'},401));
   const finish=r=>auth.session?setSession(r,auth.session):r;
   if(req.method==='GET'){
    const r=await request(env,'/rest/v1/rpc/sidequest_read',{method:'POST',token:auth.token,body:{}});
    if(!r.ok)return finish(json({error:'Could not load board'},r.status===403?403:503));
    const board=await r.json();return finish(json({user:auth.user.id,data:board.data,revision:board.revision}));
   }
   const b=await boundedJson(req,8000000);
   if(b.user&&b.user!==auth.user.id)return finish(json({error:'Account changed'},403));
   if(!Number.isSafeInteger(b.revision)||b.revision<0||!validBoard(b.data))return finish(json({error:'Invalid board'},400));
   delete b.data.settings.tmdbKey;
   const r=await request(env,'/rest/v1/rpc/sidequest_save',{method:'POST',token:auth.token,body:{expected_revision:b.revision,board:b.data}});
   if(!r.ok)return finish(json({error:'Could not save board'},r.status===403?403:503));
   const result=await r.json();if(result.conflict)return finish(json({error:'Conflict'},409));
   return finish(json({revision:result.revision}));
  }catch(e){return json({error:e.status?e.message:(path==='/api/login'?'Sign-in service unavailable. Please try again shortly.':'Connection unavailable. Your unsynced edits remain on this device.')},e.status||503)}
 }};
}
export default createWorker();
