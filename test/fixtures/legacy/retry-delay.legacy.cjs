'use strict';

function bookingRetryDelay(response) {
  const text=typeof response==='string'?response:JSON.stringify(response??'');
  const match=/"retryAfterMili(?:s)?"\s*:\s*"?(\d+)"?/i.exec(text);
  if(!match)return null;
  const delay=Number(match[1]);
  return !Number.isFinite(delay)||delay<=0?null:Math.min(20000,Math.max(1000,delay));
}
module.exports={bookingRetryDelay};
