'use strict';
const {randomInt}=require('node:crypto');
function freshMobile(previous){
 let next;do{next=String(randomInt(6,10))+String(randomInt(0,1000000000)).padStart(9,'0');}while(next===previous);
 return next;
}
function prepareMobile(channel,args){
 if(channel!=='app:start-booking')return args;
 const request=args[0],form=request?.form;if(!form||typeof form!=='object')return args;
 // Booking jobs carry a flat mobile; editor form objects carry account.mobileNumber.
 const previous=form.account?.mobileNumber??form.mobile;
 const mobile=freshMobile(previous);
 const copy={...form,mobile};
 if(form.account)copy.account={...form.account,mobileNumber:mobile};
 return [{...request,form:copy},...args.slice(1)];
}
module.exports={freshMobile,prepareMobile};
