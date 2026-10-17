'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');

function check(name,id,args,slots={321:'f473',322:'f476'}) {
  test('forms CSV matches recovered: '+name,async()=>{
    await compare(async native=>{
      const h=harness({native,slots});
      return outcome(()=>(id==='f482'?h.nestedFunction(id):h.rootFunction(id))(...args));
    });
  });
}
const samples=['','\n','\r','\r\n',',',',,','a','a,','a,b','a,b\n1,2','a,b\r1,2','a,b\r\n1,2\r\n',
  '\uFEFFa,b\n1,2','a,\"b,c\"\n1,2','a,b\n\"x\ny\",z','a,b\n\"x\r\ny\",z','a,b\n\"x\"\"y\",z',
  'a,b\n\"unterminated,x','a,b\n\"\",\"\"\n,\n \t,\n', 'a\"b,c\"d,e', '\"\"', '\"\"\"\"', '\n\n , \n'];
samples.forEach((text,index)=>check('tokenizer '+index,'f473',[text]));
for(const value of [null,undefined,0,[],{}])check('tokenizer invalid '+String(value),'f473',[value]);

// Deterministic mixed quote/newline corpus, not round-trip-only tests.
let seed=0x12345678;
function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;}
for(let index=0;index<70;index++) {
  const alphabet=['a','b',',','"','\r','\n',' ','0'];
  const text=Array.from({length:20+random()%70},()=>alphabet[random()%alphabet.length]).join('');
  check('mixed tokenizer '+index,'f473',[text]);
}
for(const text of ['', 'Name', 'Name:30:F:lb:Veg', ' Name : 5 : female : ub : ', 'A:30:other', 'A::f',
  'A:30:M:LB:Veg:ignored', ';|', 'A:30:F; B:40:M|C:5:F', ':30:F|Named:4', '  |  Named : 0 : f |']) {
  check('passengers '+text,'f476',[text]);
}
for(const header of [' From Station ', 'Train-Number', 'MOBILE_number', 'DoJ','Ä* Name','', '123'])
  check('header '+header,'f482',[header]);

const headerGroups=[['from','to','train'],['from_station','destination','Train No'],['origin','dst','trainnumber'],
  ['src','dest','train'],['source','tostation','trainno']];
for(const headers of headerGroups) {
  check('form aliases '+headers,'f481',[headers.join(',')+'\nAAA,BBB,12345']);
  check('empty journey '+headers,'f481',[headers.join(',')+'\n,,']);
}
check('all exported columns','f481',['From Station,To,Train Number,Date,Class Code,Quota,Boarding,User,Pass,Phone,Payment,VPA,Mode,Pax\nAAA,BBB,12345,2026-11-01,SL,GN,CCC,synthetic,synthetic-only,0000000000,paytm,synthetic@example,auto,A:30:F;B:40:M']);
check('alias priority uses first recognized even when empty','f481',['fromstation,from,to,train\n,AAA,BBB,12345']);
check('duplicate headers use first column','f481',['from,from,to,train\nAAA,OTHER,BBB,12345']);
check('short row','f481',['from,to,train\nAAA']);
check('blank journey skipped despite account data','f481',['from,to,train,user\n,,,synthetic\nAAA,,,']);
check('headers only','f481',['from,to,train']);
check('no rows','f481',['']);
check('passenger parser throws','f481',['from,pax\nAAA,A:30'],{321:'f473',322:()=>{throw new Error('synthetic passenger');}});
for(const rows of [[],[['from']], [['from'],[null]], [['from','to'],[undefined,'BBB']], [['from'],[42]], [['from'],{}]])
  check('injected rows '+JSON.stringify(rows),'f481',['ignored'],{321:()=>rows,322:'f476'});

for(const row of [['AAA','BBB'],['','BBB'],[null,'BBB'],[undefined,'BBB'],[' A ',' B ']]) {
  test('CSV alias accessor matches recovered '+JSON.stringify(row),async()=>{
    await compare(async native=>{
      const h=harness({native}),header=h.engine.context(4,h.root);header[2]=h.root[5];header[3]=['from','origin'];
      const ctx=h.engine.context(3,header);ctx[2]=row;
      return outcome(()=>h.engine.makeFunction('f483',ctx)('from','origin'));
    });
  });
}
test('CSV pipeline really maps quoted columns and passenger data',()=>{
  const h=harness({native:true,slots:{321:'f473',322:'f476'}});
  const result=h.rootFunction('f481')('from,to,train,pax\n"A,A",BBB,12345,"Name:30:F:lb:Veg"');
  assert.equal(result.length,1);assert.equal(result[0].fromStation,'A,A');
  assert.deepEqual(result[0].passengers,[{passengerName:'Name',passengerAge:'30',passengerGender:'F',passengerBerthChoice:'LB',passengerFoodChoice:'Veg'}]);
});
