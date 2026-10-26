const test=require('node:test'),assert=require('node:assert/strict');
const {format}=require('../src/renderer/matrix-qr-amount.js');
test('QR amount excludes seat availability and prefers the payment provider amount',()=>{
 assert.equal(format(undefined,'AVL 4 · ₹ 162.25'),'₹ 162.25');
 assert.equal(format(180.25,'AVL 4 · ₹ 162.25'),'₹ 180.25');
 assert.equal(format('1,234.50'),'₹ 1,234.50');
 assert.equal(format(null,'RAC 12'),'—');
 assert.equal(format('bad','WL 81 · ₹ 150'),'₹ 150.00');
 assert.equal(format(-1),'—');
});
