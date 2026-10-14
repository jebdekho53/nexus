const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
test('portal assets have executable MIME types; same-origin login works and foreign origins fail',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-assets-'));
 // Port zero is allocated by the OS; read the address from the child without exposing credentials.
 const runner=spawn(process.execPath,['-e',"const {server}=require('./server.cjs');server.on('listening',()=>console.log('PORT='+server.address().port))"],{cwd:__dirname,env:{...process.env,MATRIX_PORT:'0',MATRIX_DATA:directory,MATRIX_ADMIN_PASSWORD:'SyntheticPortal!123',MATRIX_PUBLIC_URL:'http://localhost'},stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{let output='';runner.stdout.on('data',d=>{output+=d;const m=output.match(/PORT=(\d+)/);if(m)resolve(m[1]);});runner.once('exit',()=>reject(Error('Server exited before listening')));});
  const base='http://127.0.0.1:'+port;
  for(const [asset,mime] of [['/password-fields.css','text/css'],['/password-fields.js','application/javascript'],['/assets/matrix-logo.svg','image/svg+xml'],['/assets/matrix.ico','image/x-icon']]){const r=await fetch(base+asset);assert.equal(r.status,200,asset);assert.equal(r.headers.get('content-type'),mime);assert((await r.arrayBuffer()).byteLength>0);}
  const login=origin=>fetch(base+'/api/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'SyntheticPortal!123'})});
  assert.equal((await login('http://localhost')).status,200);
  assert.equal((await login('https://foreign.invalid')).status,403);
  assert.equal((await fetch(base+'/admin/notice')).status,200);
 }finally{runner.kill();await new Promise(resolve=>runner.once('exit',resolve));fs.rmSync(directory,{recursive:true,force:true});}
});
