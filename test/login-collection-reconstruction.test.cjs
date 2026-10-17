'use strict';
const test=require('node:test');
const {harness,compare,outcome}=require('./helpers/recovered-harness.cjs');
function scenario(name,options={}) {
  test('login collection matches recovered: '+name,async()=>compare(async native=>{
    const trace=[];
    const rows=options.rows??[{username:' Alice ',password:' pw ',mobileNumber:' 123 '},{username:'alice',password:' pw ',mobileNumber:'other'},{username:'ALICE',password:'pw'}, {username:'',password:'ignored'}];
    const forms=options.forms??[{account:{username:'Bob',password:'form'}},{account:{username:'Alice',password:'different'}},{account:null},{}];
    const source=(name,records)=>({*[Symbol.iterator](){try{for(let i=0;i<records.length;i++){trace.push([name,'row',i]);if(options.fail===name+'-row'&&i===1)throw new Error('synthetic '+name);yield records[i];}}finally{trace.push([name,'closed']);}}});
    const slots={
      1789:()=>{trace.push(['logins']);if(options.fail==='logins')throw new Error('synthetic logins');return {list(){trace.push(['list']);if(options.fail==='list')throw new Error('synthetic list');return source('login',rows);}};},
      1712:()=>{trace.push(['forms']);if(options.fail==='forms')throw new Error('synthetic forms');return {all(){trace.push(['all']);if(options.fail==='all')throw new Error('synthetic all');return source('form',forms);}};},
    };
    if(options.getterForm)forms.splice(0,forms.length,{get account(){trace.push(['account']);return {username:'Getter',password:'synthetic',mobileNumber:'1'};}});
    const h=harness({native,slots});return {result:await outcome(()=>h.rootFunction('f3576')()),trace};
  }));
}
scenario('source order and case-insensitive username plus exact password');
scenario('empty sources',{rows:[],forms:[]});
scenario('form getter evaluated for each field',{getterForm:true});
for(const fail of ['logins','list','login-row','forms','all','form-row'])scenario('failure '+fail,{fail});
for(const row of [null,undefined,false,0,{}, {username:null}, {username:0,password:false,mobileNumber:42},{username:true,password:0},{username:'case',password:null},{username:'case',password:''}])scenario('source row '+JSON.stringify(row),{rows:[{username:'prefix',password:'synthetic'},row,{username:'tail'}]});
for(const form of [null,undefined,false,{}, {account:0},{account:false},{account:{username:123,password:true,mobileNumber:0}}])scenario('form row '+JSON.stringify(form),{rows:[],forms:[{account:{username:'prefix'}},form,{account:{username:'tail'}}]});
for(const [username,password,mobile] of [[null,'p','m'],[' x ',null,null],[false,false,0],[123,true,42],['Name',' p ','  mobile  '],['','p','m'],['üSER','p','m']]) {
  test('login add matches recovered '+JSON.stringify([username,password,mobile]),async()=>compare(async native=>{
    const seen=new Set(),records=[];const h=harness({native});const ctx=h.engine.context(4,h.root);ctx[2]=seen;ctx[3]=records;
    const add=h.engine.makeFunction('f3577',ctx);add(username,password,mobile);add(username,password,'other');
    return {records,seen:[...seen]};
  }));
}
test('mobile conversion failure consumes dedup key before returning',async()=>compare(async native=>{
  const seen=new Set(),records=[];const h=harness({native});const ctx=h.engine.context(4,h.root);ctx[2]=seen;ctx[3]=records;
  const add=h.engine.makeFunction('f3577',ctx);const failure=await outcome(()=>add('same','synthetic',{toString(){throw new Error('synthetic mobile');}}));
  add('SAME','synthetic','later');return {failure,records,seen:[...seen]};
}));
