export const lists=['tasks','ideas','movies','inbox','trash','archive','grabItems','maintenance'];
export const clone=x=>JSON.parse(JSON.stringify(x));
export const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function normalise(d){for(const k of lists)d[k]??=[];d.tasks.forEach((t,i)=>{if(!Number.isFinite(t.createdAt))t.createdAt=1700000000000+i*1000});d.tasks.forEach(t=>{if(t.today&&!t.todaySelectedOn)t.todaySelectedOn=day()});d.settings??={};delete d.settings.tmdbKey;return d}
export function dateOK(d){return !d||(typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d)}
export function imageOK(s){return typeof s==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(s)&&s.length<1500000}
export function urlOK(s){if(!s)return true;try{return ['https:','http:'].includes(new URL(s).protocol)}catch{return false}}
export function validBoard(d){
 if(!d||typeof d!=='object'||!d.settings||typeof d.settings!=='object'||Array.isArray(d.settings))return false;
 if(d.settings.taskOrder!=null&&!['manual','added'].includes(d.settings.taskOrder))return false;
 for(const f of ['hot','cold','wind'])if(d.settings[f]!=null&&(!Number.isFinite(d.settings[f])||Math.abs(d.settings[f])>1000))return false;
 for(const k of lists){const arr=d[k]??(['tasks','ideas','movies'].includes(k)?null:[]);if(!Array.isArray(arr)||arr.length>5000)return false;const seen=new Set();for(const x of arr){if(!x||typeof x!=='object'||typeof x.id!=='string'||! /^[\w.-]{1,100}$/.test(x.id)||seen.has(x.id))return false;seen.add(x.id);if(x.position!=null&&!Number.isFinite(x.position))return false;if(typeof x.title!=='string'||x.title.length>1000)return false;if(k==='maintenance'&&(!['days','weeks','months'].includes(x.unit)||!Number.isInteger(x.interval)||x.interval<1||x.interval>365||!dateOK(x.lastDone)||!dateOK(x.nextDue)||!['Home','Pool','Garden','Professional servicing','Archie'].includes(x.category)))return false;if(k==='grabItems'&&(!['swim','beach','trip'].includes(x.outing)||typeof x.group!=='string'||x.group.length>100||typeof x.done!=='boolean'||typeof x.hidden!=='boolean'))return false;for(const f of ['notes','nextAction','leftOff','buildVersion','tag'])if(x[f]!=null&&(typeof x[f]!=='string'||x[f].length>30000))return false;for(const f of ['planned','deadline','revisit','todaySelectedOn','todayReviewedOn','completedOn'])if(!dateOK(x[f]))return false;for(const f of ['projectId','afterProject'])if(x[f]&& !/^[\w.-]{1,100}$/.test(x[f]))return false;if(x.category&&(!/^[\w &/-]{1,100}$/.test(x.category)))return false;if(x.minutes!=null&&(!Number.isFinite(x.minutes)||x.minutes<0||x.minutes>1440))return false;if(x.images&&(!Array.isArray(x.images)||x.images.length>12||!x.images.every(imageOK)))return false;if(x.cover&&!imageOK(x.cover))return false;if(x.links&&(!Array.isArray(x.links)||!x.links.every(urlOK)))return false;for(const f of ['url','chatUrl','repoUrl','poster'])if(x[f]&&!urlOK(x[f]))return false;if(x.stage&&!['Spark','Exploring','Building','Live','On ice'].includes(x.stage))return false;if(x.record){if(!['tasks','ideas','movies','inbox'].includes(x.collection)||x.record.record)return false;const nested={tasks:[],ideas:[],movies:[],settings:{},[x.collection]:[x.record]};if(!validBoard(nested))return false}}}
 return true;
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function mergeBoard(base,local,remote){const out=clone(remote),conflicts=[];
 function choose(b,l,r,path){if(equal(l,b))return r;if(equal(r,b)||equal(l,r))return l;conflicts.push({path,local:l,remote:r});return l}
 for(const k of lists){const b=new Map((base[k]||[]).map(x=>[x.id,x])),l=new Map((local[k]||[]).map(x=>[x.id,x])),r=new Map((remote[k]||[]).map(x=>[x.id,x]));out[k]=[];for(const id of new Set([...r.keys(),...l.keys(),...b.keys()])){const bv=b.get(id),lv=l.get(id),rv=r.get(id);let value;if(bv&&lv&&rv){value={};for(const f of new Set([...Object.keys(bv),...Object.keys(lv),...Object.keys(rv)])){const v=choose(bv[f],lv[f],rv[f],[k,id,f]);if(v!==undefined)value[f]=v}}else value=choose(bv,lv,rv,[k,id]);if(value!==undefined)out[k].push(value)}}
 out.settings={};for(const k of new Set([...Object.keys(base.settings||{}),...Object.keys(local.settings||{}),...Object.keys(remote.settings||{})]))out.settings[k]=choose(base.settings?.[k],local.settings?.[k],remote.settings?.[k],['settings',k]);return {data:normalise(out),conflicts}}
export function momentTasks(d,minutes,context){return d.tasks.filter(t=>!t.done&&t.minutes>0&&t.minutes<=minutes&&(context==='Any'||t.context===context)).sort((a,b)=>Number(b.today)-Number(a.today)||(a.deadline||'9999').localeCompare(b.deadline||'9999')||a.createdAt-b.createdAt)}
export function reviewIdeas(d){return d.ideas.filter(x=>(x.revisit&&x.revisit<=day())||(x.afterProject&&d.ideas.some(p=>p.id===x.afterProject&&p.stage==='Live')))}

export function orderedTasks(tasks,mode='added'){
 return [...tasks].sort((a,b)=>(mode==='manual'?((a.position??Infinity)-(b.position??Infinity)||0):0)||a.createdAt-b.createdAt||a.id.localeCompare(b.id));
}
export function placeTask(board,key,anchor='',after=false){
 const task=board.tasks.find(t=>t.id===key);if(!task||key===anchor)return false;
 const ordered=orderedTasks(board.tasks,board.settings.taskOrder).filter(t=>t.id!==key);
 const index=ordered.findIndex(t=>t.id===anchor);
 if(anchor&&index<0)return false;
 ordered.splice(index<0?ordered.length:index+Number(after),0,task);
 ordered.forEach((t,i)=>t.position=i*1024);
 board.settings.taskOrder='manual';return true;
}

export function maintenanceNext(date,interval,unit){
 const d=new Date(date+'T12:00:00Z');if(!Number.isFinite(d.getTime()))return '';
 if(unit==='months'){const n=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+interval);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(n,end))}else d.setUTCDate(d.getUTCDate()+interval*(unit==='weeks'?7:1));
 return d.toISOString().slice(0,10);
}

export function inToday(t,date=day()){return !!t.today||!!(t.planned&&t.planned<=date)}
export function needsTodayReview(t,date=day()){return !t.done&&inToday(t,date)&&(t.todayReviewedOn||t.todaySelectedOn||t.planned||date)<date}
export function reviewTodayTask(t,action,date=day()){if(action==='later'){t.today=false;if(t.planned&&t.planned<=date)t.planned=''}else if(action==='done'){t.done=true;t.completedOn=date}else if(action==='keep'){t.today=true;t.todayReviewedOn=date}else return false;return true}
