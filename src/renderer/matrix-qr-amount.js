((root)=>{
 const numeric=value=>{
  const raw=String(value??'').trim().replace(/^₹\s*/, '').replaceAll(',','');
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw))return null;
  const amount=Number(raw);return Number.isFinite(amount)&&amount>0?amount:null;
 };
 const format=(amount,fare='')=>{
  let value=numeric(amount);
  if(value===null){const matches=[...String(fare).matchAll(/₹\s*([\d,]+(?:\.\d{1,2})?)/g)];value=numeric(matches.at(-1)?.[1]);}
  return value===null?'—':'₹ '+value.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 };
 const api={format};if(typeof module==='object'&&module.exports)module.exports=api;else root.MATRIX_QR_AMOUNT=api;
})(globalThis);
