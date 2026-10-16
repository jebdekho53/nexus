'use strict';
// Prints the structured tree produced by structure.cjs as JavaScript source.

function print(tree,options={},indent='  ') {
  const out=[];
  const emit=(items,level)=>{
    const pad=indent.repeat(level);
    for(const item of items) {
      switch(item.k) {
        case 'stmts': for(const line of item.lines)out.push(pad+line); break;
        case 'block': out.push(pad+item.label+':{'); emit(item.body,level+1); out.push(pad+'}'); break;
        case 'loop': out.push(pad+item.label+':while(true){'); if(options.tick)out.push(pad+indent+'rt.tick();'); emit(item.body,level+1); out.push(pad+'}'); break;
        case 'if':
          out.push(pad+'if('+item.test+'){'); emit(item.then,level+1);
          if(item.else.length){out.push(pad+'}else{');emit(item.else,level+1);}
          out.push(pad+'}');
          break;
        case 'switch':
          out.push(pad+'switch(acc){');
          for(const[key,body]of item.cases){out.push(pad+indent+'case '+key+':{');emit(body,level+2);out.push(pad+indent+'}');}
          out.push(pad+indent+'default:{');emit(item.otherwise,level+2);out.push(pad+indent+'}');
          out.push(pad+'}');
          break;
        case 'try':
          out.push(pad+'try{'); emit(item.body,level+1);
          out.push(pad+'}catch(e'+item.id+'){');
          out.push(pad+indent+'acc=e'+item.id+';'+(Number.isInteger(item.contextRegister)?'ctx=r'+item.contextRegister+';':''));
          emit(item.handler,level+1);
          out.push(pad+'}');
          break;
        case 'break': out.push(pad+'break '+item.label+';'); break;
        case 'continue': out.push(pad+'continue '+item.label+';'); break;
        case 'return': out.push(pad+'return acc;'); break;
        case 'return-undefined': out.push(pad+'return undefined;'); break;
        case 'throw': out.push(pad+'throw acc;'); break;
        default: throw new Error('Unknown node '+item.k);
      }
    }
  };
  emit(tree,2);
  return out.join('\n');
}

module.exports={print};
