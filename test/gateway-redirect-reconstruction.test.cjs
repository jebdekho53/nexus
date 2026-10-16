'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const table=Object.assign({},...Object.values(strings));
function fixture(native,id){
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{RegExp}}),root=engine.context(785,null);
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  root[783]=engine.makeFunction('f1609',root);root[784]=engine.makeFunction('f1610',root);
  return engine.makeFunction(id,id==='f1667'?engine.context(2,root):root);
}
const html='<form action="https://gateway.invalid/start"><input name="encdata" value="fixture-encdata"></form>';
test('form parsers preserve recovered quotes, attribute order, case and coercion',()=>{
  const values=[html,"<form action='fixture'><input value='fixture' name='encdata'></form>",'<FORM ACTION="fixture"><INPUT NAME="encdata" VALUE="fixture"></FORM>',
    '<form action=""><input name="encdata" value=""></form>','<form action="a&amp;b"><input name="encdata" value="x&amp;y"></form>',
    '<form action = "fixture"><input name = "encdata" value = "fixture"></form>','<input name="encdata"\nvalue="fixture">','',null,undefined,0,{toString(){return html;}}];
  for(const id of ['f1609','f1610'])for(const value of values)for(const name of ['encdata','missing','enc.*','[']){
    function evaluate(native){try{return{value:fixture(native,id)(value,name)};}catch(error){return{error:error.name};}}
    assert.deepEqual(evaluate(true),evaluate(false));
  }
});
async function run(native,options={}){
  const trace=[],forms=[],input=options.nullInput?null:{username:'fixture-user',clientTxnId:'fixture-txn',accessToken:'fixture-access',rand8:'fixture-rand',csrf:'fixture-csrf'};
  let attempts=0;
  if(options.missingFields)for(const key of Object.keys(input))delete input[key];
  const actor={hosts:{wps:'https://example.invalid'},
    async gwHeaders(host,settings){trace.push(['headers',host,settings]);if(options.headersThrow)throw Error('synthetic headers');if(options.replacePost)actor.req.post=()=>{throw Error('replacement post must not run');};return {'fixture-header':'fixture-value'};},
    req:{async post(url,settings){assert.equal(this,actor.req);trace.push(['post',url,settings]);forms.push(settings.form);attempts++;if(options.postThrow)throw Error('synthetic post');return{
      async text(){trace.push(['text']);if(options.textThrow)throw Error('synthetic text');return(options.responses??[html])[Math.min(attempts-1,(options.responses??[html]).length-1)];},
      status(){trace.push(['status']);if(options.statusThrow)throw Error('synthetic status');return 200;},
    };}},
    async sleep(ms){trace.push(['sleep',ms]);if(options.sleepThrow)throw Error('synthetic sleep');},
    noteGatewayPage(value){trace.push(['note',value]);if(options.noteThrow)throw Error('synthetic note');},
    log(...args){trace.push(['log',...args]);if(options.logThrow)throw Error('synthetic log');},
  };
  if(options.noHosts)delete actor.hosts;
  try{const value=await fixture(native,'f1667').call(actor,input);for(const form of forms)assert.equal(form,forms[0],'Retries reuse the original form object');return{value,trace};}
  catch(error){return{error:error.name,...(error.message.startsWith('synthetic')?{message:error.message}:{}),trace};}
}
const cases={success:{},missingAction:{responses:['<input name="encdata" value="fixture">']},empty:{responses:['']},secondAttempt:{responses:['',html]},fourthAttempt:{responses:['','','',html]},
  blocked:{responses:['UNABLE TO PROCESS']},blockedWithAction:{responses:[html+'unable to process']},actionWithoutEncdata:{responses:['<form action="https://gateway.invalid/start"></form>']},
  headersFail:{headersThrow:true},networkFail:{postThrow:true},textFail:{textThrow:true},statusFail:{statusThrow:true},sleepFail:{responses:[''],sleepThrow:true},noteFail:{noteThrow:true},logFail:{logThrow:true},
  noInput:{nullInput:true},missingFields:{missingFields:true},noHosts:{noHosts:true},capturedPost:{replacePost:true}};
for(const[name,options]of Object.entries(cases))test('payment redirect matches actual recovered parsing/retry behavior: '+name,async()=>assert.deepEqual(await run(true,options),await run(false,options)));
test('payment redirect uses four attempts and 700/1400/2100ms only for missing unblocked action',async()=>{
  const missing=await run(true,{responses:['']});assert.equal(missing.trace.filter(row=>row[0]==='post').length,4);assert.deepEqual(missing.trace.filter(row=>row[0]==='sleep'),[['sleep',700],['sleep',1400],['sleep',2100]]);
  assert.deepEqual(missing.trace.at(-1),['note','']);
  const blocked=await run(true,{responses:['Unable to process']});assert.equal(blocked.trace.filter(row=>row[0]==='post').length,1);assert.equal(blocked.trace.filter(row=>row[0]==='sleep').length,0);
});
