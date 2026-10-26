'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{Readable}=require('node:stream'),{pipeline}=require('node:stream/promises'),{promisify}=require('node:util');
const metadata=Object.freeze({version:'156.0.8078.48',url:'https://matrix.vaidya-gpt.com/downloads/Matrix-Browser-156.0.8078.48-win-x64.zip',bytes:230782091,sha256:'d115c321aabb9c0c97ce1885139af0a717501d9d97acc7629f4cf4056c8e3f61',exeSha256:'590f61577988fe9971bc551a9338d2d35d03b22ee2077028391680cec84834d3'});
async function digest(file){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function renameUnlocked(from,to){for(let attempt=0;;attempt++){try{return await fsp.rename(from,to);}catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=24)throw error;await new Promise(r=>setTimeout(r,400));}}}
function create({base=path.join(process.env.LOCALAPPDATA||os.homedir(),'Matrix'),fetcher=globalThis.fetch,probe,extract}={}){
 let pending,state={phase:'idle',percent:0};
 const target=path.join(base,'Browser'),exe=path.join(target,'ShardX-Windows/chrome.exe');
 async function ready(){try{return JSON.parse(await fsp.readFile(path.join(target,'runtime-ready.json'),'utf8')).ready===true&&await digest(exe)===metadata.exeSha256;}catch{return false;}}
 async function verify(directory){
  const executablePath=path.join(directory,'ShardX-Windows/chrome.exe');if(await digest(executablePath)!==metadata.exeSha256)throw Error('Browser executable hash mismatch');
  if(probe)return probe(executablePath);
  const profile=await fsp.mkdtemp(path.join(os.tmpdir(),'matrix-browser-install-check-'));let context;
  try{context=await require('../../../vendor/node_modules/patchright').chromium.launchPersistentContext(profile,{executablePath,headless:true,timeout:30000});await context.route('**/*',r=>r.abort());const page=await context.newPage();await page.setContent('<title>Matrix browser installation check</title>');if(await page.title()!=='Matrix browser installation check'||context.browser()?.version()!==metadata.version)throw Error('Browser launch/version check failed');}finally{await context?.close();await fsp.rm(profile,{recursive:true,force:true}).catch(()=>{});}
 }
 async function unpack(archive,stage){
  if(extract)return extract(archive,stage);
  // ZIP paths are validated before extraction. Run .NET extraction out of the
  // 32-bit Electron process to keep the large archive out of its JS heap.
  const quote=s=>"'"+s.replaceAll("'","''")+"'";
  const script=`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; $archive=${quote(archive)}; $destination=${quote(stage)}; $zip=[IO.Compression.ZipFile]::OpenRead($archive); try { if($zip.Entries.Count -gt 20000){throw 'Archive has too many entries'}; $total=0L; foreach($entry in $zip.Entries){$name=$entry.FullName.Replace('\\','/'); if($name.StartsWith('/') -or $name.Contains(':') -or $name.Split('/') -contains '..'){throw 'Unsafe archive path'}; $total+=$entry.Length; if($total -gt 2147483648){throw 'Archive exceeds size limit'}} } finally {$zip.Dispose()}; [IO.Compression.ZipFile]::ExtractToDirectory($archive,$destination)`;
  await promisify(require('node:child_process').execFile)('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:180000,maxBuffer:65536});
 }
 async function perform(){
  if(process.platform!=='win32')throw Error('Matrix Browser package requires Windows x64');
  if(await ready()){state={phase:'ready',percent:100};return{ok:true,alreadyInstalled:true};}
  await fsp.mkdir(base,{recursive:true});const stage=await fsp.mkdtemp(path.join(base,'Browser-install-')),archive=path.join(base,'Matrix-Browser-'+crypto.randomUUID()+'.zip'),backup=path.join(base,'Browser-backup-'+crypto.randomUUID());let moved=false,switched=false;
  try{
   state={phase:'downloading',percent:0};const response=await fetcher(metadata.url,{redirect:'error',signal:AbortSignal.timeout(600000)});if(!response.ok||!response.body)throw Error('Browser download HTTP '+response.status);
   let bytes=0;const hash=crypto.createHash('sha256');const stream=Readable.fromWeb(response.body);stream.on('data',chunk=>{bytes+=chunk.length;hash.update(chunk);state={phase:'downloading',percent:Math.min(99,Math.floor(bytes/metadata.bytes*100))};if(bytes>metadata.bytes)stream.destroy(Error('Download exceeds expected size'));});
   await pipeline(stream,fs.createWriteStream(archive,{flags:'wx'}));if(bytes!==metadata.bytes||hash.digest('hex')!==metadata.sha256)throw Error('Browser archive verification failed');
   state={phase:'extracting',percent:100};await unpack(archive,stage);state={phase:'checking',percent:100};await verify(stage);
   await fsp.writeFile(path.join(stage,'runtime-ready.json'),JSON.stringify({ready:true,version:metadata.version,exeSha256:metadata.exeSha256,verifiedAt:new Date().toISOString()}));
   if(fs.existsSync(target)){await renameUnlocked(target,backup);moved=true;}
   await renameUnlocked(stage,target);switched=true;await verify(target);if(moved)await fsp.rm(backup,{recursive:true,force:true,maxRetries:10,retryDelay:400}).catch(()=>{});state={phase:'ready',percent:100};return{ok:true};
  }catch(error){if(switched)await fsp.rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:400});if(moved&&fs.existsSync(backup))await renameUnlocked(backup,target);state={phase:'error',percent:0,error:String(error.message)};return{ok:false,error:state.error};}
  finally{await fsp.rm(stage,{recursive:true,force:true}).catch(()=>{});await fsp.rm(archive,{force:true}).catch(()=>{});}
 }
 return{metadata,ready,get state(){return state;},install(){if(!pending)pending=perform().catch(error=>{state={phase:'error',percent:0,error:error.message};return{ok:false,error:error.message};}).finally(()=>{pending=null;});return pending;}};
}
module.exports={create,metadata,digest};
