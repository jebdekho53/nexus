'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=process.argv[2];
if(!['/app','/srv/matrix'].includes(root))throw Error('Unexpected deployment root');
const admin=path.join(root,'admin');
for(const name of fs.readdirSync(admin)){
 if(!name.endsWith('.html'))continue;
 const file=path.join(admin,name),old=fs.readFileSync(file,'utf8');
 const next=old.replace(/(\/assets\/matrix(?:-logo\.svg|-mark\.png|-logo\.jpg|\.ico))(?:\?v=[^"\s<>]+)?/g,'$1?v=green-logo-2');
 if(next!==old)fs.writeFileSync(file,next);
}
const sw=path.join(admin,'sw.js');
if(fs.existsSync(sw))fs.writeFileSync(sw,fs.readFileSync(sw,'utf8').replace(/const CACHE_NAME = '[^']+';/,"const CACHE_NAME = 'matrix-mobile-logo-v2';"));
console.log('Logo/favicons refreshed on existing portal pages.');
