import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const context={paintSaveStatus(){},console,Response,URL,Intl,Date,crypto:globalThis.crypto,setTimeout(){},setInterval(){return 1},clearInterval(){},navigator:{},localStorage:{getItem(){return 'jay'},setItem(){}},document:{getElementById(){return {innerHTML:''}}}};vm.createContext(context);
vm.runInContext(fs.readFileSync('model.js','utf8').replaceAll('export ','')+'\n'+fs.readFileSync('client.js','utf8')+'\n'+fs.readFileSync('additions.js','utf8'),context);
const result=await vm.runInContext(`(async()=>{
 render=()=>{};syncStatus=label=>{syncLabel=label};showToast=()=>{};let savedCache;cached=async(op,value)=>op==='get'?savedCache:(savedCache=clone(value));
 data=normalise({tasks:[{id:'one',title:'Initial',done:false}],ideas:[],movies:[],settings:{}});baseBoard=clone(data);lastSaved=clone(data);owner='jay';ready=true;revision=1;data.tasks[0].done=true;pending=clone(data);
 const remote=clone(baseBoard);remote.ideas.push({id:'project',title:'Remote project',stage:'Spark'});let call=0;cloudRequest=async()=>++call===1?new Response('',{status:409}):Response.json({revision:2,data:remote,user:'jay'});
 await flushSave();const merged=data.tasks[0].done&&data.ideas[0].title==='Remote project'&&!blocked;
 cloudRequest=async()=>{throw Error('Offline')};await flushSave();await Promise.resolve();const recoverable=!!savedCache.pending&&savedCache.data.tasks[0].done;
 ready=false;await boot();const reopened=ready&&data.tasks[0].done&&pending?.tasks[0].done;
 cloudRequest=async()=>Response.json({revision:3});await flushSave();await Promise.resolve();const synced=!pending&&savedCache.pending===false;
 return {merged,recoverable,reopened,synced};})()`,context);
for(const [key,value]of Object.entries(result))assert.equal(value,true,key);
console.log('PASS: remote merge preserves local completion, failed save caches pending state, offline reopen restores it, successful retry clears pending');
