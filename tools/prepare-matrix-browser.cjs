'use strict';
// Package the public upstream engine once; no TS files or user profiles are used.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Readable}=require('node:stream'),{pipeline}=require('node:stream/promises');
const root=path.resolve(__dirname,'..'),version='156.0.8078.48',build=path.join(root,'..','matrix-browser-build'),base='https://pub-e57a7c60f6934eb09a6600bf2fc59cdc.r2.dev';
async function main(){
 fs.mkdirSync(build,{recursive:true});
 const url=base+'/ShardX-Windows.zip',archive=path.join(build,'ShardX-Windows.zip');
 const manifestResponse=await fetch('https://raw.githubusercontent.com/ProxyShard/ShardBrowser/main/runtime.json');if(!manifestResponse.ok)throw Error('Upstream manifest unavailable');const upstream=await manifestResponse.json();
 if(upstream.chromium_version!==version)throw Error('Upstream version changed; review before packaging');
 const response=await fetch(url);if(!response.ok)throw Error('Engine download HTTP '+response.status);
 const etag=response.headers.get('etag')?.replaceAll('"','');if(etag!==upstream.archives['ShardX-Windows.zip'])throw Error('Upstream archive identity mismatch');
 console.log('Downloading upstream engine ('+response.headers.get('content-length')+' bytes)…');
 await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(archive+'.part'));fs.renameSync(archive+'.part',archive);
 const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(archive))hash.update(chunk);
 const license=await fetch('https://raw.githubusercontent.com/ProxyShard/ShardBrowser/main/LICENSE');if(!license.ok)throw Error('Upstream license unavailable');fs.writeFileSync(path.join(build,'LICENSE-ShardBrowser.txt'),await license.text());
 fs.writeFileSync(path.join(build,'source-manifest.json'),JSON.stringify({name:'Matrix Browser runtime',upstream:'ProxyShard/ShardBrowser',version,source:url,etag,sha256:hash.digest('hex'),engineBuild:upstream.engine_build,downloadedAt:new Date().toISOString(),note:'Upstream prebuilt runtime; not a Matrix-compiled Chromium binary. Original notices retained. No TS dependency.'},null,2));
 console.log('Download verified against upstream manifest. Ready for local extraction.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
