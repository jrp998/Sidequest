import {spawnSync} from 'node:child_process';
for(const file of ['model','notes','sync','flow','grabgo']){const r=spawnSync(process.execPath,['../tests/'+file+'.mjs'],{cwd:'src',stdio:'inherit'});if(r.status)process.exit(r.status)}
const r=spawnSync(process.execPath,['--test','tests/worker.mjs'],{stdio:'inherit'});process.exit(r.status??1);
