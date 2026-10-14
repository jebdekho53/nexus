const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const payments=require('../src/renderer/matrix-payments.js');
test('form and booking labels share exact method keys without speed claims',()=>{
  for(const file of ['form.html','booking-box.html']){
    const source=fs.readFileSync(path.join(__dirname,'../src/renderer',file),'utf8');
    for(const [method,label]of Object.entries(payments.labels))if(method!=='phonepe')assert.ok(source.includes('value="'+method+'">'+label+'</option>'),file+': '+method);
  }
  assert.equal(payments.normalize('📲 PayTM QR — Ultra Fast'),'Paytm QR');
  assert.equal(payments.normalize('📲 PhonePay QR — Super Fast'),'PhonePe QR');
  assert.equal(payments.label('paytmupi'),'Razorpay UPI');
});
test('shipped form converter keeps selected Paytm QR in the booking request',async()=>{
  const types=await import(pathToFileURL(path.join(__dirname,'../src/renderer/assets/types-B0-2ZUtm.js')).href);
  const form={id:'synthetic-form',account:{},journey:{origin:'TEST',destination:'DEMO',journeyDate:'2099-01-01',classCode:'SL',quota:'GN',trainNumber:'00000'},options:{},payment:{method:'paytm'},passengers:[],timing:{}};
  const converted=types.J(form);
  assert.equal(converted.paymentMethod,'paytm');assert.equal(converted.paymentMethodDisplay,'paytm');assert.equal(form.payment.method,'paytm');
});
