'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const port=Number(process.env.NEXUS_PORT||8082),base=process.env.NEXUS_PUBLIC_URL||'http://127.0.0.1:'+port;
const directory=process.env.NEXUS_DATA||path.join(__dirname,'data');
const licensing=require('./licensing.cjs').createLicensing({directory,adminPassword:process.env.NEXUS_ADMIN_PASSWORD,port});
const pages={'/':['portal.html','text/html'],'/portal':['portal.html','text/html'],'/signup':['signup.html','text/html'],'/downloads':['downloads.html','text/html'],'/client':['client.html','text/html'],'/admin':['index.html','text/html'],'/seller':['seller.html','text/html'],'/public/portal.css':['public.css','text/css'],'/public/portal.js':['public.js','application/javascript']};
for(const file of ['admin.js','style.css','portal.js','client.js','usdt.js'])pages['/admin/'+file]=[file,file.endsWith('.css')?'text/css':'application/javascript'];
pages['/client/client.js']=['client.js','application/javascript'];
for(const role of ['admin','seller'])for(const page of ['overview','create-seller','sellers','create-key','keys','connections','ledger','activity','usdt','signup-requests'])pages['/'+role+'/'+page]=pages['/'+role];
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 const setHeader=res.setHeader.bind(res);res.setHeader=(name,value)=>setHeader(name,name.toLowerCase()==='set-cookie'&&base.startsWith('https:')?(Array.isArray(value)?value.map(x=>x+'; Secure'):value+'; Secure'):value);
 try{
  const url=new URL(req.url,base);
  if(req.method==='POST'&&((req.headers.origin&&req.headers.origin!==base)||!String(req.headers['content-type']).startsWith('application/json'))){res.writeHead(403);return res.end(JSON.stringify({error:'Use the same-origin JSON API'}));}
  if(url.pathname==='/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,name:'Nexus',version:'1.0.0'}));}
  if(url.pathname==='/api/portal/downloads'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({version:'1.0.0',name:'Nexus',sourceUrl:'https://github.com/urbanmoveservices/nexus',setup:null}));}
  if(await licensing.handle(req,res,url))return;
  const page=pages[url.pathname.replace(/\/$/,'')||'/'];
  if(req.method==='GET'&&page){res.setHeader('Content-Type',page[1]+'; charset=utf-8');return res.end(fs.readFileSync(path.join(__dirname,'admin',page[0])));}
  res.writeHead(404);res.end('Not found');
 }catch{if(!res.headersSent){res.writeHead(500);res.end(JSON.stringify({error:'Request failed'}));}else res.end();}
});
server.listen(port,process.env.NEXUS_HOST||'127.0.0.1',()=>console.log('Nexus control plane listening on '+port));
module.exports={server};
