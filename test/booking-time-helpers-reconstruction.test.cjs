'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');

// Every helper is called on the recovered and native side with the same arguments; results and thrown
// error types must match. Randomness is a fixed sequence shared by both sides.
function sides(native,slots={}) {
  let index=0;const sequence=[0,0.25,0.5,0.75,0.9999];
  const math=Object.create(Math);math.random=()=>sequence[index++%sequence.length];
  const{rootFunction,nestedFunction}=harness({native,slots,globals:{Math:math},dependencies:{random:math.random}});
  return id=>id==='f2271'||id==='f2367'?nestedFunction(id):rootFunction(id);
}
async function check(id,inputs,slots) {
  for(const args of inputs)
    await compare(async native=>outcome(async()=>sides(native,slots)(id)(...args)));
}

test('randomBetween (f2271)',()=>check('f2271',[[0,10],[5,5],[3,4],[100,300],[-5,5],[1.5,4.5],[10,2],['1','5']]));
test('pickRandom (f2367)',()=>check('f2367',[[['a','b','c']],[[]],[[1]],[['x','y','z','w','v']],[undefined]]));
test('pickStep (f2368)',()=>check('f2368',[[[10,20,30],1],[[10,20,30],2],[[10,20,30],99],[[10,20,30],0],[[10,20,30],-4],[[],3],[[10,'x',30],2],[[10,NaN],2],[[10,20],'2'],[[10,20],undefined],[[10,20],1.5],[null,1]]));
test('errorText (f2369)',()=>check('f2369',[['plain'],[''],[null],[undefined],[0],[5],[{}],[{error:'e'}],[{error_description:'d',errorMessage:'m',errorMsg:'s',error:'e'}],[{error:{nested:1},errorMsg:'only'}],[['array']],[{error:null}],[()=>1]]));
test('describeFailure (f2373)',()=>check('f2373',[[401,'x'],[200,'xx invalid_token yy'],[200,'Invalid Access Token'],[403,'denied'],[409,'dup'],[500,''],[500,'server said no'],[undefined,undefined],[404,{error:'e'}],[401,''],['401','x']],
  {928:value=>typeof value==='string'?value:(value&&value.error)||'',602:'duplicate-login-terminal'}));
test('quotaFamily (f2375)',()=>check('f2375',[['8AM','SL'],['LD','3A'],['SS',undefined],['TQ','3A'],['TQ','sl'],['PT','cc'],['PT',''],['PT',undefined],['GN','SL'],[undefined,'3A'],['tq','3A'],['TQ','3a']],{933:new Set(['3A','CC','2A'])}));
test('parseClockTime (f2376)',()=>check('f2376',[[{hour:10,minute:0}],[{hour:'10',minute:'30',second:'15',millisecond:'250'}],[{hour:23,minute:59,second:60,millisecond:1000}],[{hour:24,minute:0}],[{hour:-1,minute:0}],[{hour:1,minute:60}],[{hour:1.5,minute:0}],[{hour:1}],[null],[undefined],['10:00'],[0],[{hour:0,minute:0,second:-1,millisecond:-1}],[{hour:' 9 ',minute:' 5 '}]]));
test('formatIstClock (f2377)',()=>check('f2377',[[0],[1700000000000],[1700000000123],[-1],[86399999],[1e15],[NaN]].concat([[19800000],[19799999]])));
test('parseServerTimestamp (f2379)',()=>check('f2379',[['2026-10-16 10:00:00'],['2026-10-16T10:00:00+05:30'],['2026-10-16T10:00:00Z'],['2026-10-16T10:00:00-0700'],['  2026-10-16 10:00:00.123 '],['2026-10-16'],['garbage'],[''],['   '],[null],[undefined],[123],['2026-13-45 99:99:99'],['2026-10-16 10:00:00 +0530']]));
test('istDayAt (f2380)',()=>check('f2380',[[1700000000000,{hour:10,minute:0}],[1700000000000,{hour:23,minute:59,second:59,millisecond:999}],[0,{hour:0,minute:0}],[1700000000000,{hour:5,minute:30,second:null,millisecond:undefined}],[1700000000000,{hour:'7',minute:'8'}],[NaN,{hour:1,minute:1}],[1700000000000,undefined]]));
test('preview (f2381)',()=>check('f2381',[['text'],[{a:1}],[[1,2]],[null],[undefined],[0],[''],['x'.repeat(20001)],['x'.repeat(20000)],['x'.repeat(30000),true],[{a:'y'.repeat(25000)}],[{a:'y'.repeat(25000)},true],[(()=>{const c={};c.c=c;return c;})()],[10n],[()=>1]]));
test('referenceNumber (f2383)',()=>check('f2383',[[]]));
test('maskedKey (f2385)',()=>check('f2385',[['AB','1234-5678-9012-3456'],['K',''],['K',undefined],['K','abc'],['K','12'],['','x9y8z7w6v5'],['K',null],['K',12345678],['K',{}]]));
test('helpers keep their documented values',()=>{
  const{formatIstClock,parseServerTimestamp,istDayAt,quotaFamily}=require('../src/main/booking/time-helpers.cjs');
  assert.equal(formatIstClock(0),'05:30:00.000');
  assert.equal(parseServerTimestamp('2026-10-16 10:00:00'),Date.parse('2026-10-16T10:00:00+05:30'));
  assert.equal(istDayAt(Date.parse('2026-10-16T22:00:00+05:30'),{hour:8,minute:0}),Date.parse('2026-10-16T08:00:00+05:30'));
  assert.equal(quotaFamily('8AM','SL',{acClasses:()=>new Set()}),'eightAm');
});
