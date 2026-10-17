'use strict';
const {parseClockTime}=require('../../../src/main/booking/time-helpers.cjs');

// Recovered f425: Playwright-style proxy settings from a stored proxy record.
function proxySettings(proxy) {
  return{
    server:proxy.port?proxy.host+':'+proxy.port:proxy.host,
    username:proxy.username||undefined,
    password:proxy.password||undefined,
  };
}

// Recovered f426: display name for a proxy record (its trimmed label, else host[:port]).
function proxyLabel(proxy) {
  const label=proxy.label&&proxy.label.trim();
  return label||(proxy.port?proxy.host+':'+proxy.port:proxy.host);
}

// Recovered f427: senior citizen (men 60+, women 58+).
function isSeniorCitizen(gender,age) {
  return gender==='M'&&age>=60||gender==='F'&&age>=58;
}

// Recovered f428 (+f430): whether a passenger counts toward the lower-berth limit. A blank preference counts
// for senior citizens because the booking service allots them a lower berth automatically.
function countsAsLowerBerth(passenger,{isSenior=isSeniorCitizen}={}) {
  const age=Number(passenger.age)||0;
  if(age>0&&age<5&&passenger.childBerth===false)return false;
  const preference=String(passenger.berthPreference??'').toUpperCase().trim();
  if(preference==='LB')return true;
  if(preference!=='')return false;
  return isSenior(String(passenger.gender??''),age);
}

// Recovered f429 (+f430): number of passengers that count as lower berths.
function countLowerBerths(passengers,{counts}) {
  return passengers.reduce((total,passenger)=>total+(counts(passenger)?1:0),0);
}

// Recovered f431: warning text when too many passengers need lower berths, else null.
function lowerBerthWarning(passengers,{countLower,limit}) {
  const lower=countLower(passengers);
  if(lower<=limit())return null;
  return 'Only '+limit()+' lower berths are allowed per booking — this form has '+lower
    +'. IRCTC auto-allots a lower berth to senior citizens (men 60+, women 58+) even when the berth is left blank, so a senior counts as a lower. Give a senior citizen a non-lower berth, or reduce the Lower-berth passengers to '
    +limit()+'.';
}

const FAMILIES=['eightAm','acTatkal','slTatkal'];

// Recovered f433: opening-time defaults per quota family (stored values when valid, else built-in ones).
function openingTimes(stored,{parse=parseClockTime,defaults}) {
  const times={};
  for(const family of FAMILIES)times[family]=parse(stored?.default?.[family])??defaults()[family];
  return times;
}

// Recovered f435: availability config tagged with the epoch it was captured in (availTimes are dropped when the
// epoch changed).
function withAvailabilityEpoch(config,epoch) {
  if(!epoch||config?.availabilityEpoch===epoch)return config;
  const{availTimes:dropped,...rest}=config??{};
  rest.availabilityEpoch=epoch;
  return rest;
}

// Recovered f436: default availability time for a family, only when the stored epoch matches the current one.
function storedAvailabilityTime(stored,current,family) {
  if(current.availabilityEpoch&&stored?.availabilityEpoch!==current.availabilityEpoch)return undefined;
  return stored?.availTimes?.default?.[family];
}

// Recovered f437: the flag is exactly true and the minute of day is before the cutoff.
function beforeCutoff(flag,minuteOfDay,{cutoff}) {
  return flag===true&&minuteOfDay<cutoff();
}

// Recovered f438: availability time for a family — a special-train override first, else the stored default.
function availabilityTime(stored,current,family,special,{parse=parseClockTime,lookup=storedAvailabilityTime}={}) {
  if(special) {
    const overridden=parse(current.availTimes?.special?.[family]);
    if(overridden!=null)return overridden;
    return current.availTimes?.default?.[family];
  }
  const resolved=parse(lookup(stored,current,family));
  if(resolved!=null)return resolved;
  return current.availTimes?.default?.[family];
}

// Recovered f439: "name · detail" unless the detail is empty, contains whitespace or is already in the name.
function joinLabel(name,detail) {
  const second=(detail||'').trim(),first=(name||'').trim();
  if(!second||/\s/.test(second)||first.includes(second))return first;
  return first+' · '+second;
}

// Recovered f440: is the mode in the list.
function listIncludes(list,mode) {
  return list.includes(mode);
}

// Recovered f441: 'alt' when the configuration enables Rail-Brahmos and the list has the mode, else 'normal'.
function railBrahmosKind(config,list,{includes}) {
  return config?.railBrahmos===true&&includes(list)?'alt':'normal';
}

// Recovered f444: login mode from the option flags.
function loginMode(options,{brahmosMode}) {
  if(options?.manualLogin===true)return 'manual';
  if(options?.brahmosLogin===true)return brahmosMode();
  if(options?.directLogin===true)return 'direct';
  return 'auto';
}

// Recovered f445: option flags for a login mode.
function loginFlags(mode,{brahmosMode}) {
  const brahmos=mode===brahmosMode();
  return{manualLogin:mode==='manual',directLogin:mode==='direct'||brahmos,brahmosLogin:brahmos};
}

// Recovered f446: the mode if allowed (the list, or the default list when empty), else the first allowed one.
function allowedMode(mode,list,{defaults}) {
  const allowed=list.length?list:[...defaults()];
  return allowed.includes(mode)?mode:allowed[0];
}

// Recovered f447: dispatch by booking mode (rail-one and UI-login runs have their own handling).
function modeDispatch(mode,config,args,{railKind,loginModeOf,allowedModeOf}) {
  if(mode==='railone')return railKind(config,args);
  if(mode==='uilogin')return 'uilogin';
  return allowedModeOf(loginModeOf(config),[...args]);
}

// Recovered f448: proxy settings from the saved proxy form (disabled or host-less configurations give nothing).
function proxyFromConfig(config) {
  if(!(config?.enabled&&config.host?.trim()))return undefined;
  const host=config.host.trim();
  const port=config.port?.trim();
  return{
    server:port?host+':'+port:host,
    username:config.username||undefined,
    password:config.password||undefined,
  };
}

// Recovered f449.
function isPlainObject(value) {
  return Boolean(value)&&typeof value=='object'&&!Array.isArray(value);
}

// Recovered f450: the value when it is a string, else the fallback (default empty text).
function stringOr(value,fallback='') {
  return typeof value=='string'?value:fallback;
}

// Recovered f451: the candidate when it is a member of the allowed text, else the fallback.
function memberOr(allowed,candidate,fallback) {
  return typeof candidate=='string'&&allowed.includes(candidate)?candidate:fallback;
}

// Recovered f452: a positive amount from a number or text such as "₹1,234.50" (anything else: undefined).
function positiveAmount(value) {
  const number=typeof value=='number'?value:typeof value=='string'?Number(value.replace(/[^\d.]/g,'')):NaN;
  return Number.isFinite(number)&&number>0?number:undefined;
}

// Recovered f453: passenger count from a number or text, kept within 1–4 (invalid input: 1).
function passengerCount(value) {
  const number=typeof value=='number'?value:typeof value=='string'?parseInt(value,10):NaN;
  return Number.isFinite(number)?Math.max(1,Math.min(4,Math.floor(number))):1;
}

// Recovered f454: quota family with case-insensitive input.
function quotaFamilyCaseless(quota,classCode,{acClasses}) {
  const code=(quota||'').toUpperCase();
  if(code==='8AM'||code==='LD'||code==='SS')return 'eightAm';
  if(code==='TQ'||code==='PT')return acClasses().has((classCode||'').toUpperCase())?'acTatkal':'slTatkal';
  return null;
}

// Recovered f455: whether the booking window of a quota is open at `now` (IST opening time of the same day).
function bookingWindow(quota,classCode,now,{family,openingTimes}) {
  const name=family(quota,classCode);
  if(!name)return{open:true};
  const opening=openingTimes()[name];
  const hour=opening.h,minute=opening.m,label=opening.label;
  const day=new Date(now+19800000);
  const opensAt=Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate(),hour,minute,0)-19800000;
  return now>=opensAt?{open:true}:{open:false,opensAtLabel:label};
}

const PREMIUM_NAMES=['vande','shatabdi','rajdhani','gatimaan','tejas'];

// Recovered f456 (+f457): premium trains by name or by (trimmed) train number.
function isPremiumTrain(number,name,{premiumNumbers}) {
  const lowered=(name??'').toLowerCase();
  if(lowered&&PREMIUM_NAMES.some(part=>lowered.includes(part)))return true;
  const trimmed=(number??'').trim();
  return Boolean(trimmed)&&premiumNumbers().has(trimmed);
}

module.exports={proxyFromConfig,isPlainObject,stringOr,memberOr,positiveAmount,passengerCount,quotaFamilyCaseless,bookingWindow,isPremiumTrain,proxySettings,proxyLabel,isSeniorCitizen,countsAsLowerBerth,countLowerBerths,lowerBerthWarning,openingTimes,withAvailabilityEpoch,storedAvailabilityTime,beforeCutoff,availabilityTime,joinLabel,listIncludes,railBrahmosKind,loginMode,loginFlags,allowedMode,modeDispatch};
