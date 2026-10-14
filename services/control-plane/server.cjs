'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const port=Number(process.env.MATRIX_PORT||8082),base=process.env.MATRIX_PUBLIC_URL||'http://127.0.0.1:'+port;
const directory=process.env.MATRIX_DATA||path.join(__dirname,'data');
process.env.MATRIX_ALLOWED_ORIGINS=base;
const licensing=require('./licensing.cjs').createLicensing({directory,adminPassword:process.env.MATRIX_ADMIN_PASSWORD,port});
const pages={'/':['portal.html','text/html'],'/portal':['portal.html','text/html'],'/signup':['signup.html','text/html'],'/downloads':['downloads.html','text/html'],'/client':['client.html','text/html'],'/admin':['index.html','text/html'],'/seller':['seller.html','text/html'],'/public/portal.css':['public.css','text/css'],'/public/portal.js':['public.js','application/javascript']};
const assets={'/password-fields.css':['password-fields.css','text/css'],'/password-fields.js':['password-fields.js','application/javascript'],'/assets/matrix-logo.svg':['assets/matrix-logo.svg','image/svg+xml'],'/assets/matrix.ico':['assets/matrix.ico','image/x-icon']};
for(const file of ['admin.js','style.css','portal.js','client.js','usdt.js'])pages['/admin/'+file]=[file,file.endsWith('.css')?'text/css':'application/javascript'];
pages['/client/client.js']=['client.js','application/javascript'];
for(const role of ['admin','seller'])for(const page of ['overview','create-seller','sellers','create-key','keys','connections','ledger','activity','usdt','signup-requests','notice'])pages['/'+role+'/'+page]=pages['/'+role];
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 const setHeader=res.setHeader.bind(res);res.setHeader=(name,value)=>setHeader(name,name.toLowerCase()==='set-cookie'&&base.startsWith('https:')?(Array.isArray(value)?value.map(x=>x+'; Secure'):value+'; Secure'):value);
 try{
  const url=new URL(req.url,base);
  if(req.method==='POST'&&((req.headers.origin&&req.headers.origin!==base)||!String(req.headers['content-type']).startsWith('application/json'))){res.writeHead(403);return res.end(JSON.stringify({error:'Use the same-origin JSON API'}));}
  if(url.pathname==='/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,name:'Matrix',version:require('./package.json').version}));}
  if(req.method==='GET'&&(url.pathname==='/api/portal/downloads'||url.pathname.startsWith('/downloads/'))){
   const releases=process.env.MATRIX_RELEASES_DIR||path.join(__dirname,'releases');
   let manifest={version:'1.0.0',name:'Matrix',setup:null};
   try{manifest={...manifest,...JSON.parse(fs.readFileSync(path.join(releases,'manifest.json'),'utf8'))};}catch{}
   if(url.pathname==='/api/portal/downloads'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(manifest));}
   const item=[manifest.setup,manifest.offlineSetup,manifest.updater,manifest.updaterExe].filter(Boolean).find(entry=>entry.url===url.pathname);
   const name=item&&path.basename(item.url),archive=name&&path.join(releases,name);
   if(!item||!/^[\w.-]+$/.test(name)||!fs.existsSync(archive)){res.writeHead(404);return res.end('Download not found');}
   res.setHeader('Content-Type',name.endsWith('.exe')?'application/vnd.microsoft.portable-executable':'application/zip');res.setHeader('Content-Disposition','attachment; filename="'+name+'"');res.setHeader('Content-Length',fs.statSync(archive).size);
   return fs.createReadStream(archive).on('error',()=>res.destroy()).pipe(res);
  }
  if(await licensing.handle(req,res,url))return;
  if(req.method==='GET'&&assets[url.pathname]){const [file,type]=assets[url.pathname];res.setHeader('Content-Type',type);return res.end(fs.readFileSync(path.join(__dirname,file)));}
  const page=pages[url.pathname.replace(/\/$/,'')||'/'];
  if(req.method==='GET'&&page){res.setHeader('Content-Type',page[1]+'; charset=utf-8');return res.end(fs.readFileSync(path.join(__dirname,'admin',page[0])));}
  res.writeHead(404);res.end('Not found');
 }catch{if(!res.headersSent){res.writeHead(500);res.end(JSON.stringify({error:'Request failed'}));}else res.end();}
});
server.listen(port,process.env.MATRIX_HOST||'127.0.0.1',()=>console.log('Matrix control plane listening on '+port));
module.exports={server};
