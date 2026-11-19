import assert from 'node:assert/strict';
import {validBoard,mergeBoard,normalise,clone,momentTasks,reviewIdeas,day} from '../src/model.js';
const empty=()=>normalise({tasks:[],ideas:[],movies:[],settings:{}});
const b=empty();b.tasks.push({id:'t1',title:'Fix importer',done:false,category:'AI & Builds',minutes:10,context:'Computer',projectId:'p1'});b.ideas.push({id:'p1',title:'GOALIE',stage:'Building',notes:'',links:[]});
assert(validBoard(b));const l=clone(b),r=clone(b);l.tasks[0].done=true;r.ideas[0].leftOff='Table import';let m=mergeBoard(b,l,r);assert.equal(m.conflicts.length,0);assert(m.data.tasks[0].done);assert.equal(m.data.ideas[0].leftOff,'Table import');
r.tasks[0].notes='Remote note';m=mergeBoard(b,l,r);assert.equal(m.conflicts.length,0);assert.equal(m.data.tasks[0].notes,'Remote note');
l.tasks[0].title='Local';r.tasks[0].title='Remote';assert.equal(mergeBoard(b,l,r).conflicts.length,1);
const deleted=clone(b);deleted.tasks=[];const changed=clone(b);changed.tasks[0].notes='Keep';assert.equal(mergeBoard(b,deleted,changed).conflicts.length,1);
assert.equal(momentTasks(b,10,'Computer').length,1);assert.equal(momentTasks(b,5,'Computer').length,0);assert.equal(momentTasks(b,10,'Phone').length,0);
b.ideas.push({id:'p2',title:'Next build',stage:'Spark',afterProject:'p1'});assert.equal(reviewIdeas(b).length,0);b.ideas[0].stage='Live';assert.equal(reviewIdeas(b).length,1);b.ideas[0].revisit=day();assert.equal(reviewIdeas(b).length,2);
for(const patch of [{deadline:'2026-02-31'},{id:"x');alert(1);//"},{images:['data:image/svg+xml;base64,YQ==']},{minutes:-10}]){const bad=clone(b);Object.assign(bad.tasks[0],patch);assert.equal(validBoard(bad),false)}
const recovery=clone(b);recovery.trash.push({id:'trash1',title:'Task',collection:'tasks',record:clone(b.tasks[0])});assert(validBoard(recovery));recovery.trash[0].record.id="bad'";assert(!validBoard(recovery));
const roundtrip=JSON.parse(JSON.stringify({app:'sidequest',data:b}));assert(validBoard(roundtrip.data));assert.deepEqual(roundtrip.data,b);
console.log('PASS: independent and same-record merges, conflicts, deletion conflicts, time/context filtering, revisit triggers, hostile imports, nested recovery validation and backup roundtrip');
