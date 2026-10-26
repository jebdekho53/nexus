'use strict';
const fs=require('node:fs'),path=require('node:path');
function create(root){
 const enabled=process.env.MATRIX_DIAGNOSTICS==='1';
 const file=path.join(root,'diagnostics/api-summary.jsonl');
 return row=>{
  if(!enabled)return;
  // Explicit allowlist: never persist URL query, headers, bodies or identifiers.
  const requestPath=String(row.path||'').split(/[?#]/)[0];
  const endpoint=/allLapAvlFareEnq\/Y(?:\/|$)/i.test(requestPath)?'allLapAvlFareEnq/Y':requestPath.match(/(?:^|\/)(allLapAvlFareEnq|avlFarenquiry|boardingStationEnq|bookingInitPayment|addonServices|validateUser|altAvlEnq|captchaganetate)(?:\/|$)/i)?.[1]||'other';
  const safe={at:Date.now(),endpoint,method:['GET','POST','PUT','DELETE'].includes(row.method)?row.method:'other',status:Number.isInteger(row.status)?row.status:null,category:['ok','other','retry','highload','terminal','csrf','network'].includes(row.category)?row.category:'other'};
  try{fs.appendFileSync(file,JSON.stringify(safe)+'\n');}catch{}
 };
}
module.exports={create};
