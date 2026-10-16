'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
const success='<form action="https://gateway.invalid/start?private=synthetic-marker"><input name="encData" value="synthetic-enc"><input name="mid" value="synthetic-mid"><input name="checksum" value="synthetic-checksum">';
async function run(native,options={}) {
  const trace=[],logs=[],forms=[];
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{RegExp}}),root=engine.context(785,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  root[783]=engine.makeFunction('f1609',root);root[784]=engine.makeFunction('f1610',root);root[775]=engine.makeFunction('f1599',root);
  if(options.parserThrow)root[775]=()=>{throw Error('synthetic parser');};
  let attempts=0;
  const actor={hosts:{wps:'https://example.invalid'},
    reqRetry(label,operation){trace.push(['retry',label]);attempts++;if(options.retrySyncThrow)throw Error('synthetic retry');if(options.retryReject)return Promise.reject(Error('synthetic retry rejection'));if(options.nullResponse)return Promise.resolve(null);return operation();},
    async gwHeaders(host,settings){trace.push(['headers',host,settings]);if(options.headersThrow)throw Error('synthetic headers');if(options.replacePost)actor.req.post=()=>{throw Error('replacement post must not run');};return{synthetic:'header'};},
    req:{async post(url,settings){assert.equal(this,actor.req);forms.push(settings.form);trace.push(['post',url,settings]);if(options.postThrow)throw Error('synthetic post');return{
      async text(){trace.push(['text']);if(options.textThrow)throw Error('synthetic text');return(options.responses??[success])[Math.min(attempts-1,(options.responses??[success]).length-1)];},
      status(){trace.push(['status']);if(options.statusThrow)throw Error('synthetic status');return 200;},
    };}},
    log(value){assert.equal(this,actor);trace.push(['log']);logs.push(value);if(options.logThrow)throw Error('synthetic log');},
    snip(html){trace.push(['snip',html]);if(options.snipThrow)throw Error('synthetic snip');return html;},
    async sleep(ms){trace.push(['sleep',ms]);if(options.sleepThrow)throw Error('synthetic sleep');},
  };
  const input=options.nullInput?null:{username:'synthetic-user',clientTxnId:'synthetic-txn',accessToken:'synthetic-token',rand8:'synthetic-rand',csrf:'synthetic-csrf'};
  if(options.missingFields)for(const key of Object.keys(input))delete input[key];
  let result;
  try{result={value:await engine.makeFunction('f1684',engine.context(2,root)).call(actor,input)};}
  catch(error){result={error:error.name,...(error.message.startsWith('synthetic')?{message:error.message}:{})};}
  for(const form of forms)assert.equal(form,forms[0]);
  // Only intentional difference: diagnostics omit the raw action URL and HTML.
  const normalized=logs.map(value=>value.replace(/ action=.*? mid=/,' action=<redacted> mid=').split(' :: ')[0]);
  return{...result,trace,logs:normalized,rawLogs:logs};
}
const cases={success:{},empty:{responses:['']},second:{responses:['',success]},fourth:{responses:['','','',success]},missingChecksum:{responses:['<form action="fixture"><input name="mid" value="fixture"><input name="encData" value="fixture">']},
  reject:{retryReject:true},nullResponse:{nullResponse:true},retrySync:{retrySyncThrow:true},network:{postThrow:true},headers:{headersThrow:true},text:{textThrow:true},parser:{parserThrow:true},status:{statusThrow:true},snip:{snipThrow:true},log:{logThrow:true},sleep:{responses:[''],sleepThrow:true},missingFields:{missingFields:true},nullInput:{nullInput:true},capturedPost:{replacePost:true}};
for(const[name,options]of Object.entries(cases))test('PayTM redirect preserves recovered requests/retries/errors: '+name,async()=>{
  const actual=await run(true,options),expected=await run(false,options);delete actual.rawLogs;delete expected.rawLogs;assert.deepEqual(actual,expected);
});
test('PayTM redirect keeps bounded retries and no raw gateway HTML/URL diagnostics',async()=>{
  const failed=await run(true,{retryReject:true});assert.deepEqual(failed.trace.filter(row=>row[0]==='sleep'),[['sleep',700],['sleep',1400],['sleep',2100]]);assert.equal(failed.trace.filter(row=>row[0]==='retry').length,4);
  assert.deepEqual(failed.value,{action:'',encData:'',mid:'',checksum:''});
  const passed=await run(true);assert.equal(passed.rawLogs.length,1);assert.match(passed.rawLogs[0],/action=y mid=y enc=y chk=y/);assert.doesNotMatch(passed.rawLogs.join(' '),/synthetic-marker|gateway\.invalid|<form|synthetic-enc|synthetic-checksum/);
});
