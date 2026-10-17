'use strict';
// Read-only preflight for the user's private scheduled QR-test plan. This
// resolves IST dates/slots and validates authorization. It never decrypts
// credentials, contacts a provider, launches booking, or prints passenger data.
const fs=require('node:fs');
const SLOTS=new Set(['08:00','10:00','11:00']);
function day(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('An explicit ISO local run day is required');
  const date=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw Error('Invalid local run day');
  return date;
}
function resolvePlan(plan,slot,runDay) {
  const date=day(runDay);
  if(!SLOTS.has(slot))throw Error('Only the authorized 08:00, 10:00 and 11:00 slots are supported');
  if(!plan||plan.enabled!==true||plan.readyForLiveExecution!==true)throw Error('Private plan is not ready for live execution');
  if(!['Asia/Calcutta','Asia/Kolkata'].includes(plan.timezone))throw Error('Plan must use the authorized IST timezone');
  if(plan.source!=='BSB'||plan.destination!=='LTT')throw Error('Route does not match the authorized BSB to LTT journey');
  if(plan.paymentSubmissionAllowed!==false||plan.stopAt!=='rendered QR')throw Error('Only QR-stop testing with payment submission disabled is authorized');
  if(plan.leadMinutes!==5||plan.verifyActualAppLaunchAndAutoCountdown!==true)throw Error('Five-minute preparation and AUTO countdown verification are required');
  if(!Array.isArray(plan.passengers)||!plan.passengers.length)throw Error('Authorized passenger details are missing');
  for(const passenger of plan.passengers) {
    if(!passenger||typeof passenger.name!=='string'||!passenger.name.trim()||!Number.isInteger(passenger.age)||passenger.age<1||passenger.age>125||!['M','F','T'].includes(passenger.gender))throw Error('Passenger details are incomplete or invalid');
  }
  if(typeof plan.credentialFile!=='string'||!plan.credentialFile)throw Error('Encrypted credential reference is missing');
  const selected=plan.slots?.[slot];
  if(!selected)throw Error('Slot is missing from the private plan');
  let journeyDate;
  if(slot==='08:00') {
    if(selected.dateOffsetDays!==60||selected.quota!=='GN'||selected.formQuota!=='8AM'||selected.classCode!=='SL')throw Error('General opening must use the authorized 60-day SL/GN plan with 8AM form mode');
    date.setUTCDate(date.getUTCDate()+60);journeyDate=date.toISOString().slice(0,10);
  } else {
    journeyDate=selected.journeyDate;day(journeyDate);
    if(journeyDate<runDay)throw Error('The fixed authorized journey date has expired; new user instructions are required');
    if(selected.quota!=='TQ'||selected.classCode!==(slot==='10:00'?'AC':'SL'))throw Error('Tatkal class/quota does not match the authorized slot');
  }
  const [hour,minute]=slot.split(':').map(Number),lead=hour*60+minute-5;
  return {slot,runDay,launchAtIST:String(Math.floor(lead/60)).padStart(2,'0')+':'+String(lead%60).padStart(2,'0'),
    openingAtIST:slot,journeyDate,source:plan.source,destination:plan.destination,
    formQuota:slot==='08:00'?'8AM':'TQ',providerQuota:selected.quota,classPolicy:selected.classCode,
    passengerCount:plan.passengers.length,alreadyVerified:selected.result==='qr-verified',
    paymentSubmissionAllowed:false,stopAt:'rendered QR',autoCountdownRequired:true};
}
module.exports={resolvePlan};
if(require.main===module) {
  try {
    const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
    for(const key of ['--plan','--slot','--day'])if(!args.includes(key)||!get(key))throw Error('Usage: node tools/qr_test_plan.cjs --plan PRIVATE_JSON --slot HH:MM --day YYYY-MM-DD');
    let plan;
    try{plan=JSON.parse(fs.readFileSync(get('--plan'),'utf8'));}
    catch{throw Error('Private plan is unavailable or invalid JSON; details were not printed');}
    const result=resolvePlan(plan,get('--slot'),get('--day'));
    if(!fs.existsSync(plan.credentialFile))throw Error('Encrypted credential file is unavailable');
    console.log(JSON.stringify({...result,encryptedCredentialPresent:true},null,2));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
