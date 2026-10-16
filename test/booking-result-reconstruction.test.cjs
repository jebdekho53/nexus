'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const {emptyBooking}=require('../src/main/payment/booking-result.cjs');
function fixture(native){
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{String,Number,Array,Boolean}}),root=engine.context(555,null);
  const table=Object.assign({},...Object.values(strings));root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing fixture '+n+'|'+key);return value;};
  root[396]=engine.makeFunction('f546',root);root[400]=engine.makeFunction('f554',root);
  return engine.makeFunction('f549',root);
}
const person={passengerName:'Synthetic Passenger',bookingStatusDetails:'CNF/S1/10',currentStatusDetails:'CNF/S2/20',passengerAge:'30',passengerGender:'M',bookingCoachId:'S1',bookingBerthNo:10,bookingBerthCode:'LB',passengerNetFare:'99.50'};
const row={pnrNumber:'synthetic-pnr',trainNumber:'00000',trainName:'SYNTHETIC TRAIN',fromStnName:'From Fixture',fromStn:'AAA',resvnUptoStnName:'To Fixture',resvnUptoStn:'BBB',
  boardingStnName:'Boarding Fixture',boardingStn:'CCC',boardingDate:'2026-10-20T12:30:00',journeyDate:'2026-10-21',departureTime:'12:30',arrivalTime:'18:00',journeyClass:'SL',bookedQuota:'GN',
  totalCollectibleAmount:'123',bookingDate:'row-booking',reservationId:'row-reservation',ticketType:'synthetic-ticket',qrCodeText:'synthetic-qr',ersDisplayMessage:['synthetic-message','',null,0],psgnDtlList:[person]};
for(const[name,value]of Object.entries({minimal:{bookingResponseDTO:[{pnrNumber:'synthetic-pnr'}]},full:{bookingResponseDTO:[row],userDetail:{firstName:'Synthetic User'}},
  rootOverrides:{bookingResponseDTO:[row],bookingDate:'root-date',bankNameDis:'root-bank',transactionId:'root-txn',qrCodeText:'root-qr'},
  null:null,missing:undefined,rawString:'synthetic raw response',empty:{},emptyDto:{bookingResponseDTO:[]},rootError:{errorMessage:'synthetic rejected'},
  bankFlag:{bankErrorFlag:true},bankFlagString:{bankErrorFlag:'true'},bankFlagFalse:{bankErrorFlag:'false'},
  rowError:{bookingResponseDTO:[{errorMessage:'synthetic rejected'}]},pnrWithError:{bookingResponseDTO:[{...row,errorMessage:'synthetic informational'}]},
  waiting:{bookingResponseDTO:[{...row,psgnDtlList:[{passengerName:'Synthetic',bookingStatusDetails:'WL/1'}]}]},
  sparsePassengers:{bookingResponseDTO:[{...row,psgnDtlList:Array(1)}]},
  fallbacks:{bookingResponseDTO:[{pnrNumber:'synthetic-pnr',fromStn:'AAA',destStnName:'Destination',destStn:'BBB',journeyDate:'2026-10-20T00:00:00',journeyQuota:'GN'}],totalCollectibleAmount:'20',bankPaymentMode:'synthetic-mode'},
}))test('booking-result normalization matches recovered function: '+name,()=>{
  assert.deepEqual(fixture(true)(value),fixture(false)(value));
});
test('booking-result fallback/coercion matrix matches actual recovered implementation',()=>{
  const before=fixture(false),after=fixture(true);
  for(const key of ['trainNumber','fromStn','resvnUptoStn','boardingStn','departureTime','totalCollectibleAmount','bookingDate','reservationId','qrCodeText','ticketType'])
    for(const value of [undefined,null,'',0,false,'synthetic-value']){
      const body={bookingResponseDTO:[{...row,[key]:value}],transactionId:0,bankNameDis:0};
      assert.deepEqual(after(body),before(body),key+'='+String(value));
    }
});
test('empty booking records own their passenger arrays',()=>{
  const first=emptyBooking(),second=emptyBooking();first.passengers.push({synthetic:true});assert.equal(second.passengers.length,0);
});
