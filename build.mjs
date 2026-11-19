import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');await cp('public','dist',{recursive:true});
const names=['model','client','additions','design','grabgo','navigation','notes','maintenance','compact','flow','companion','account'];
const parts=await Promise.all(names.map(name=>readFile('src/'+name+'.js','utf8')));
parts[0]=parts[0].replaceAll('export ','');
await writeFile('dist/app.js',parts.join('\n')+'\npreview=false;boot();');
await cp('src/ui.html','dist/index.html');
console.log('Built independent Sidequest; no account configuration or personal board data bundled.');
