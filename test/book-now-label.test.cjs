const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Auto Book now label preserves the mode element and dropdown caret used by booking initialization',()=>{
 let ready,update;const label={textContent:'AUTO',dataset:{}},caret={textContent:'▾'},chip={children:[label,caret],title:'',set textContent(value){this.children=[];}};
 const elements={loginModeChip:chip,loginModeVal:label,quotaSel:{value:'GN'},loginFlowSel:{value:'auto'}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/matrix-book-now.js'),'utf8'),{document:{getElementById:id=>elements[id],addEventListener:(event,fn)=>{if(event==='DOMContentLoaded')ready=fn;}},setInterval:fn=>{update=fn;}});ready();update();assert.equal(label.dataset.display,'AUTO · NOW');assert.deepEqual(chip.children,[label,caret]);assert(chip.title.includes('Auto Book now'));
 label.textContent='AUTO';update();assert.equal(label.dataset.display,'AUTO · NOW');
 elements.loginFlowSel.value='manual';update();assert.equal(label.dataset.display,'MANUAL');
 elements.loginFlowSel.value='auto';elements.quotaSel.value='TQ';update();assert.equal(label.dataset.display,'AUTO');
});
