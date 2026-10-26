const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {decorateQrPopup}=require('../src/main/runtime/qr-popup-theme.cjs');
test('separate popup keeps the provider QR and legacy handlers while rendering the Matrix payment layout',()=>{
 const image='data:image/png;base64,provider-qr-fixture';const old='<!doctype html><html><head></head><body><button id="checkNow">Check payment</button><script>window.legacyPolling=true</script></body></html>';
 const html=decorateQrPopup(old,{amount:'707.25',caption:'LTT → MAU <unsafe>'},path.resolve(__dirname,'..'),image);
 assert(html.includes('id="matrixPopupQr" src="'+image+'"'));assert(html.includes('₹ 707.25'));assert(html.includes('LTT → MAU &lt;unsafe&gt;'));assert(html.includes('window.legacyPolling=true'));assert(html.includes('id="checkNow"'));assert(html.includes('Google Pay'));assert(html.includes('PhonePe'));assert(html.includes('Navi'));assert(html.includes('matrixPopupElapsed'));
});
