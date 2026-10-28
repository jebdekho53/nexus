'use strict';
const fs=require('node:fs'),path=require('node:path');
const endpoints=['allLapAvlFareEnq/Y','allLapAvlFareEnq','allLapAvlEnq','avlFarenquiry','boardingStationEnq','bookingInitPayment','addonServices','validateUser','altAvlEnq/TC','altAvlEnq','captchaganetate'];
const reasons=new Set(['network','session-expired','access-denied','session-conflict','csrf-mismatch','rate-limit','provider-highload','provider-busy','provider-rejected','ok','other']);
function endpointName(value){
 const requestPath=String(value||'').split(/[?#]/)[0];
 return endpoints.find(name=>new RegExp('(?:^|/)'+name+'(?:/|$)','i').test(requestPath))||'other';
}
function summary(row={}){
 // Explicit allowlist: never persist URL query, headers, bodies or identifiers.
 const safe={endpoint:endpointName(row.path||row.endpoint),method:['GET','POST','PUT','DELETE'].includes(row.method)?row.method:'other',status:Number.isInteger(row.status)&&row.status>=100&&row.status<=599?row.status:null,category:['ok','other','retry','highload','terminal','csrf','network'].includes(row.category)?row.category:'other'};
 if(Number.isFinite(row.durationMs)&&row.durationMs>=0)safe.durationMs=Math.round(row.durationMs);
 if(Number.isSafeInteger(row.attempt)&&row.attempt>0)safe.attempt=row.attempt;
 if(reasons.has(row.reason))safe.reason=row.reason;
 return safe;
}
function create(root,{onRecord}={}){
 const enabled=process.env.MATRIX_DIAGNOSTICS==='1';
 const file=path.join(root,'diagnostics/api-summary.jsonl');
 return (row,actor)=>{
  const safe={at:Date.now(),...summary(row)};
  // Activity exports are available in normal releases too. Diagnostics remains opt-in.
  try{onRecord?.(safe,actor);}catch{}
  if(!enabled)return;
  try{fs.appendFileSync(file,JSON.stringify(safe)+'\n');}catch{}
 };
}
module.exports={create,summary,endpointName,reasons};
