'use strict';

const IST_OFFSET_MS=19800000;

// Recovered f2271: min + a random whole number below (max - min).
function randomBetween(min,max,random=Math.random) {
  return min+Math.floor(random()*(max-min));
}

// Recovered f2367: a random element of the list.
function pickRandom(list,random=Math.random) {
  return list[Math.floor(random()*list.length)];
}

// Recovered f2368: step table lookup (1-based index, clamped); empty or non-numeric entries give 35.
function pickStep(list,position) {
  if(!list.length)return 35;
  const value=list[Math.min(Math.max(position,1)-1,list.length-1)];
  return Number.isFinite(value)?value:35;
}

// Recovered f2369 (+f2370): message text from a string or an error-like object.
function errorText(value) {
  if(typeof value==='string')return value;
  if(!(value&&typeof value==='object'))return '';
  return [value.error_description,value.errorMessage,value.errorMsg,value.error].filter(part=>typeof part==='string').join(' ');
}

// Recovered f2373: human-readable failure for an API response.
function describeFailure(status,text,{messageOf,duplicateLoginMessage}) {
  const message=messageOf(text);
  if(status===401||/invalid_token|invalid access token/i.test(message))return 'session expired (invalid token) — re-login & retry';
  if(status===403)return 'access blocked by the Provider (403)';
  if(status===409)return duplicateLoginMessage();
  return message||'error '+status;
}

// Recovered f2375: which timing family a quota belongs to.
function quotaFamily(quota,classCode,{acClasses}) {
  if(quota==='8AM'||quota==='LD'||quota==='SS')return 'eightAm';
  if(quota==='TQ'||quota==='PT')return acClasses().has((classCode||'').toUpperCase())?'acTatkal':'slTatkal';
  return null;
}

// Recovered f2376: validated {hour, minute, second, millisecond} or null.
function parseClockTime(value) {
  if(!(value&&typeof value=='object'))return null;
  const hour=Number(value.hour),minute=Number(value.minute);
  if(!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(minute)||minute<0||minute>59)return null;
  const second=Number(value.second),millisecond=Number(value.millisecond);
  return{
    hour,minute,
    second:Number.isInteger(second)&&second>=0&&second<=59?second:0,
    millisecond:Number.isInteger(millisecond)&&millisecond>=0&&millisecond<=999?millisecond:0,
  };
}

const pad=(value,width=2)=>String(value).padStart(width,'0');

// Recovered f2377 (+f2378): India Standard Time clock text "HH:MM:SS.mmm" for an epoch time.
function formatIstClock(epochMs) {
  const date=new Date(epochMs+IST_OFFSET_MS);
  return pad(date.getUTCHours())+':'+pad(date.getUTCMinutes())+':'+pad(date.getUTCSeconds())+'.'+pad(date.getUTCMilliseconds(),3);
}

// Recovered f2379: provider timestamp text -> epoch ms (IST assumed when no zone is given) or null.
function parseServerTimestamp(value) {
  if(!(typeof value=='string'&&value.trim()))return null;
  let text=value.trim().replace(' ','T');
  if(!/(?:[+-]\d{2}:?\d{2}|Z)$/.test(text))text+='+05:30';
  const epoch=new Date(text).getTime();
  return Number.isFinite(epoch)?epoch:null;
}

// Recovered f2380: epoch ms of the IST calendar day containing `dayMs` at the given clock time.
function istDayAt(dayMs,time) {
  const day=new Date(dayMs+IST_OFFSET_MS);
  return Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate(),time.hour,time.minute,time.second??0,time.millisecond??0)-IST_OFFSET_MS;
}

// Recovered f2381: text preview of a value (long JSON is cut at 20000 characters unless `full`).
function preview(value,full=false) {
  try {
    const text=typeof value=='string'?value:JSON.stringify(value);
    if(!text)return '';
    if(full)return text;
    return text.length>20000?text.slice(0,20000)+'…':text;
  } catch {return '';}
}

// Recovered f2383: random reference number "REF-XXXXXXXX".
function referenceNumber(random=Math.random) {
  return 'REF-'+random().toString(36).slice(2,10).toUpperCase();
}

// Recovered f2385: "<prefix>|<last four digits>".
function maskedKey(prefix,value) {
  return prefix+'|'+(value||'').replace(/\D/g,'').slice(-4);
}

module.exports={IST_OFFSET_MS,randomBetween,pickRandom,pickStep,errorText,describeFailure,quotaFamily,parseClockTime,formatIstClock,parseServerTimestamp,istDayAt,preview,referenceNumber,maskedKey};
