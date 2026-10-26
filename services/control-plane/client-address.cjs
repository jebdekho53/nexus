'use strict';
const net=require('node:net');
const fs=require('node:fs'),path=require('node:path');
function normalize(value){const ip=String(value||'').trim().replace(/^::ffff:/i,'');return net.isIP(ip)?ip:null;}
function clientAddress(req){
 const peer=normalize(req.socket?.remoteAddress);
 // Forwarded addresses are trusted only behind an explicitly configured proxy.
 let configured=[];try{configured=JSON.parse(fs.readFileSync(path.join(__dirname,'trusted-proxies.json'),'utf8'));}catch{}
 const trusted=[...String(process.env.MATRIX_TRUSTED_PROXIES||'').split(','),...(Array.isArray(configured)?configured:[])].map(normalize).filter(Boolean);
 if(peer&&trusted.includes(peer)){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',').map(normalize).filter(Boolean);
  if(forwarded.length)return forwarded[forwarded.length-1];
 }
 return peer;
}
function recordAccess(item,device,ip,now=Date.now()){
 if(!ip)return;
 item.deviceAccess??=[];
 let entry=item.deviceAccess.find(x=>x.device===device);
 if(!entry){entry={device,firstSeenAt:new Date(now).toISOString(),firstIp:ip};item.deviceAccess.push(entry);}
 entry.lastSeenAt=new Date(now).toISOString();entry.lastIp=ip;
 // Retain a bounded recent history per device, not request bodies or credentials.
 entry.recentIps=[ip,...(entry.recentIps||[]).filter(x=>x!==ip)].slice(0,10);
}
module.exports={clientAddress,recordAccess};
