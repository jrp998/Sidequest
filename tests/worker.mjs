import test from 'node:test';import assert from 'node:assert/strict';import {createWorker} from '../worker.mjs';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test-key',ASSETS:{fetch:async()=>new Response('Static shell')}};
const request=(method='GET',body,headers={})=>new Request('https://sidequest.example/api/state',{method,headers:{Origin:'https://sidequest.example',Cookie:'__Host-sq-access=test-access','Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
const board={tasks:[],ideas:[],movies:[],settings:{}};
const auth=()=>Response.json({id:'owner-one'});
test('public shell works before configuration; data endpoints fail closed',async()=>{const worker=createWorker(()=>{throw Error('unexpected network')});assert.equal((await worker.fetch(new Request('https://sidequest.example/'),env)).status,200);assert.equal((await worker.fetch(request(),{})).status,503);assert.equal((await worker.fetch(request('PUT',{},{Origin:'https://evil.example'}),env)).status,403);assert.equal((await worker.fetch(request('GET',undefined,{Cookie:''}),env)).status,401)});
test('remote records use verified identity',async()=>{const worker=createWorker(async url=>url.endsWith('/user')?auth():Response.json({data:board,revision:7}));const r=await worker.fetch(request(),env);assert.deepEqual(await r.json(),{user:'owner-one',data:board,revision:7});assert.equal(r.headers.get('cache-control'),'no-store')});
test('account spoof, malformed board and oversized request cannot save',async()=>{let writes=0;const worker=createWorker(async url=>{if(url.endsWith('/user'))return auth();writes++;return Response.json({revision:1})});assert.equal((await worker.fetch(request('PUT',{user:'another-owner',revision:0,data:board}),env)).status,403);assert.equal((await worker.fetch(request('PUT',{revision:0,data:{}}),env)).status,400);assert.equal((await worker.fetch(request('PUT',{revision:0,data:board},{'Content-Length':'8000001'}),env)).status,413);assert.equal(writes,0)});
test('revision conflict remains 409 for existing merge logic',async()=>{const worker=createWorker(async url=>url.endsWith('/user')?auth():Response.json({conflict:true}));assert.equal((await worker.fetch(request('PUT',{revision:4,data:board}),env)).status,409)});
test('save sends expected revision and strips movie credentials',async()=>{let saved;const worker=createWorker(async(url,options)=>{if(url.endsWith('/user'))return auth();saved=JSON.parse(options.body);return Response.json({revision:5})});const r=await worker.fetch(request('PUT',{revision:4,user:'owner-one',data:{...board,settings:{tmdbKey:'not-for-sync'}}}),env);assert.equal(r.status,200);assert.equal(saved.expected_revision,4);assert.equal(saved.board.settings.tmdbKey,undefined)});
test('expired session refreshes into secure HTTP-only cookies',async()=>{let calls=0;const worker=createWorker(async url=>{calls++;if(url.includes('grant_type=refresh_token'))return Response.json({access_token:'renewed',refresh_token:'next',expires_in:3600});if(url.endsWith('/user'))return calls===1?new Response('',{status:401}):auth();return Response.json({data:board,revision:2})});const r=await worker.fetch(request('GET',undefined,{Cookie:'__Host-sq-access=old; __Host-sq-refresh=refresh'}),env);assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);assert.match(r.headers.get('set-cookie'),/__Host-sq-refresh=next/)});
test('login blocks non-members and does not expose tokens in JSON',async()=>{const req=()=>new Request('https://sidequest.example/api/login',{method:'POST',headers:{Origin:'https://sidequest.example'},body:JSON.stringify({email:'test@example.com',password:'test-only'})});let allowed=false;const worker=createWorker(async url=>url.includes('grant_type=password')?Response.json({access_token:'token',refresh_token:'refresh',expires_in:3600}):Response.json(allowed?[{user_id:'owner-one'}]:[]));assert.equal((await worker.fetch(req(),env)).status,403);allowed=true;const r=await worker.fetch(req(),env);assert.deepEqual(await r.json(),{ok:true});assert.match(r.headers.get('set-cookie'),/HttpOnly/)});
test('upstream outages are recoverable errors, not sign-outs',async()=>{const worker=createWorker(async()=>new Response('',{status:503}));const r=await worker.fetch(request(),env);assert.equal(r.status,503);assert.equal(r.headers.get('set-cookie'),null)});
test('login uses Workers-supported redirect handling and fails closed on redirects',async()=>{let calls=0;const worker=createWorker(async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://other.example'}})});const r=await worker.fetch(new Request('https://sidequest.example/api/login',{method:'POST',headers:{Origin:'https://sidequest.example'},body:JSON.stringify({email:'test@example.com',password:'test-only'})}),env);assert.equal(calls,1);assert.equal(r.status,503);assert.equal(r.headers.get('set-cookie'),null);assert.equal((await r.json()).error,'Sign-in service unavailable. Please try again shortly.')});

test('TMDB lookup checks membership, keeps credentials server-side and limits providers to Australia', async () => {
 const lookUp = path => new Request('https://sidequest.example/api/tmdb/' + path, {
  headers:{Cookie:'__Host-sq-access=test-access'}
 });
 let allowed = false;
 let tmdbCalls = 0;
 const configured = {...env, TMDB_READ_TOKEN:'test-secret'};
 const worker = createWorker(async (url, options) => {
  if (url.endsWith('/user')) return auth();
  if (url.includes('/sidequest_members')) return Response.json(allowed ? [{user_id:'owner-one'}] : []);
  tmdbCalls++;
  assert.equal(options.headers.Authorization, 'Bearer test-secret');
  assert.equal(options.redirect, 'manual');
  const upstream = new URL(url);
  assert.equal(upstream.origin, 'https://api.themoviedb.org');
  if (upstream.pathname.endsWith('/search/multi')) {
   assert.equal(upstream.searchParams.get('query'), 'Alien & Aliens');
   return Response.json({results:[
    {id:4, media_type:'person', name:'Person'}, {id:5, media_type:'movie', title:'Alien', poster_path:'/poster.jpg'}
   ]});
  }
  assert.equal(upstream.pathname, '/3/movie/5');
  assert.equal(upstream.searchParams.get('append_to_response'), 'watch/providers');
  return Response.json({title:'Alien', genres:[{name:'Horror'}], 'watch/providers':{results:{
   AU:{flatrate:[{provider_name:'Disney Plus'},{provider_name:'Disney Plus'}]},
   US:{flatrate:[{provider_name:'Unrelated'}]}
  }}});
 });
 assert.equal((await worker.fetch(lookUp('search?q=Alien'), configured)).status, 403);
 allowed = true;
 assert.equal((await worker.fetch(lookUp('search?q=Alien'), env)).status, 503);
 assert.equal((await worker.fetch(lookUp('person/5'), configured)).status, 404);
 assert.equal(tmdbCalls, 0);
 const results = await (await worker.fetch(lookUp('search?q=Alien%20%26%20Aliens'), configured)).json();
 assert.equal(results.results.length, 1);
 assert.equal(results.results[0].poster, 'https://image.tmdb.org/t/p/w342/poster.jpg');
 const details = await (await worker.fetch(lookUp('movie/5'), configured)).json();
 assert.deepEqual(details.genres, ['Horror']);
 assert.deepEqual(details.providers.subscription, ['Disney Plus']);
 assert(!JSON.stringify(details).includes('test-secret'));
 assert.equal(tmdbCalls, 2);
});
