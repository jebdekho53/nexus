'use strict';
// Lowering of single instructions to JavaScript statements. The semantics mirror runtime/engine.cjs, which is the
// compatibility oracle: registers become local variables r0..rN, the accumulator is `acc`, the lexical context is
// `ctx`, and everything with non-trivial behaviour goes through the `rt` helper object.
const {Unsupported}=require('./cfg.cjs');

const IDENTIFIER=/^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED=new Set('break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await async of'.split(' '));

function literalOf(value) {
  if(typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number')return Object.is(value,-0)?'-0':Number.isNaN(value)?'NaN':value===Infinity?'Infinity':value===-Infinity?'-Infinity':String(value);
  if(typeof value==='boolean')return String(value);
  if(value===null)return 'null';
  if(value===undefined)return 'undefined';
  throw new Unsupported('non-primitive literal');
}

function property(object,key) {
  return typeof key==='string'&&IDENTIFIER.test(key)&&!RESERVED.has(key)?object+'.'+key:object+'['+key+']';
}

class Lowering {
  constructor(definition,options={}) {
    this.definition=definition;
    this.async=definition.kind.includes('Async');
    this.derived=definition.kind.includes('Derived');
    this.options=options;
    this.usesArgs=false;
  }

  // constant pool entry as a JS expression
  constant(index) {
    const value=this.definition.constants[index];
    if(value===null||typeof value!=='object')return literalOf(value);
    switch(value.type) {
      case 'undefined': case 'uninitialized': return 'undefined';
      case 'hole': return 'HOLE';
      case 'number': return literalOf(Number(value.value));
      default: return 'rt.constant(K['+index+'])';
    }
  }

  // plain JS value of a constant (compile-time), or undefined when it needs the runtime
  constantValue(index) {
    const value=this.definition.constants[index];
    if(value===null||typeof value!=='object')return {known:true,value};
    if(value.type==='undefined'||value.type==='uninitialized')return {known:true,value:undefined};
    if(value.type==='number')return {known:true,value:Number(value.value)};
    return {known:false};
  }

  operand(operand) {
    if(operand===undefined||operand===null||typeof operand!=='object')return literalOf(operand);
    if('r' in operand)return 'r'+operand.r;
    if('a' in operand){this.usesArgs=true;return 'args['+operand.a+']';}
    if('c' in operand)return this.constant(operand.c);
    switch(operand.special) {
      case 'context': return 'ctx';
      case 'closure': return 'fn';
      case 'this': return 'self';
      case 'new.target': case 'new_target': return 'newTarget';
      default: throw new Unsupported('operand '+JSON.stringify(operand));
    }
  }

  assign(operand,expression) {
    if('r' in operand)return 'r'+operand.r+'='+expression+';';
    if('a' in operand){this.usesArgs=true;return 'args['+operand.a+']='+expression+';';}
    if(operand.special==='context')return 'ctx='+expression+';';
    if(operand.special==='this')return 'self='+expression+';';
    throw new Unsupported('destination '+JSON.stringify(operand));
  }

  // registers read by an instruction taking a register or argument range
  range(operand,offset) {
    if(!operand||typeof operand!=='object')throw new Unsupported('range operand');
    const count=this.definition.registerCounts?.[offset];
    if(count===0)return [];
    if(operand.range) {
      const total=count??operand.range[1]-operand.range[0]+1;
      return Array.from({length:total},(_,index)=>'r'+(operand.range[0]+index));
    }
    if(operand.argRange) {
      this.usesArgs=true;
      const total=count??operand.argRange[1]-operand.argRange[0]+1;
      return Array.from({length:total},(_,index)=>'args['+(operand.argRange[0]+index)+']');
    }
    return [this.operand(operand)];
  }

  rangeStart(operand) {
    return operand.range[0];
  }

  // Lowers one instruction (not a terminator). Returns a list of statement strings.
  instruction(row) {
    const[offset,op,args]=row;
    const[a,b,c]=args;
    const O=value=>this.operand(value);
    if(/^Star\d+$/.test(op))return ['r'+op.slice(4)+'=acc;'];
    switch(op) {
      case 'LdaZero': return ['acc=0;'];
      case 'LdaSmi': return ['acc='+literalOf(a)+';'];
      case 'LdaUndefined': return ['acc=undefined;'];
      case 'LdaNull': return ['acc=null;'];
      case 'LdaTheHole': return ['acc=HOLE;'];
      case 'LdaTrue': return ['acc=true;'];
      case 'LdaFalse': return ['acc=false;'];
      case 'LdaConstant': case 'Ldar': return ['acc='+O(a)+';'];
      case 'Star': return [this.assign(a,'acc')];
      case 'Mov': return [this.assign(b,O(a))];
      case 'LdaGlobal': {
        return ['acc=rt.global('+O(a)+');'];
      }
      case 'LdaGlobalInsideTypeof': return ['acc=rt.globals['+O(a)+'];'];
      case 'CreateClosure': {
        const id=this.definition.constants[a.c]?.id;
        if(!id)throw new Unsupported('closure constant');
        return ['acc=rt.makeFunction('+JSON.stringify(id)+',ctx,{thisValue:self,newTarget});'];
      }
      case 'CreateFunctionContext': case 'CreateFunctionContextWithCells': return ['acc=rt.context('+(b+2)+',ctx);'];
      case 'CreateBlockContext': return ['acc=rt.context(rt.constant(K['+a.c+']).length,ctx);'];
      case 'CreateCatchContext': return ['acc=rt.context(rt.constant(K['+b.c+']).length,ctx);acc[2]='+O(a)+';'];
      case 'PushContext': return [this.assign(a,'ctx'),'ctx=acc;'];
      case 'PopContext': return ['ctx='+O(a)+';'];
      case 'LdaImmutableCurrentContextSlot': case 'LdaCurrentContextSlotNoCell': case 'LdaCurrentContextSlot': return ['acc=ctx['+a+'];'];
      case 'LdaImmutableContextSlot': case 'LdaContextSlotNoCell': case 'LdaContextSlot': return ['acc=rt.outer('+O(a)+','+c+')['+b+'];'];
      case 'StaCurrentContextSlotNoCell': case 'StaCurrentContextSlot': return ['ctx['+a+']=acc;'];
      case 'StaContextSlotNoCell': case 'StaContextSlot': return ['rt.outer('+O(a)+','+c+')['+b+']=acc;'];
      case 'GetNamedProperty': return ['acc='+this.keyed(O(a),b)+';'];
      case 'GetKeyedProperty': return ['acc='+O(a)+'[acc];'];
      case 'SetNamedProperty': case 'SetKeyedProperty': return [this.keyed(O(a),b,'acc')+';'];
      case 'DefineNamedOwnProperty': case 'DefineKeyedOwnProperty': case 'DefineKeyedOwnPropertyInLiteral': return ['rt.own('+O(a)+','+O(b)+',acc);'];
      case 'StaInArrayLiteral': return [O(a)+'['+O(b)+']=acc;'];
      case 'CreateObjectLiteral': case 'CreateArrayLiteral': return ['acc=rt.literal(K['+a.c+']);'];
      case 'CreateEmptyObjectLiteral': return ['acc={};'];
      case 'CreateEmptyArrayLiteral': return ['acc=[];'];
      case 'CreateArrayFromIterable': return ['acc=[...acc];'];
      case 'CloneObject': return ['acc={...'+O(a)+'};'];
      case 'CreateRegExpLiteral': {
        const names=['g','i','m','y','u','s','l','d','v'];
        const flags=names.filter((_,n)=>((c??0)&(1<<n))!==0).join('');
        const pattern=this.constantValue(a.c);
        if(!pattern.known)throw new Unsupported('regexp constant');
        return ['acc=new RegExp('+literalOf(pattern.value)+','+literalOf(flags)+');'];
      }
      case 'CallUndefinedReceiver0': return ['acc=rt.call('+O(a)+',undefined,[]);'];
      case 'CallUndefinedReceiver1': return ['acc=rt.call('+O(a)+',undefined,['+O(b)+']);'];
      case 'CallUndefinedReceiver2': return ['acc=rt.call('+O(a)+',undefined,['+O(b)+','+O(c)+']);'];
      case 'CallUndefinedReceiver': return ['acc=rt.call('+O(a)+',undefined,['+this.range(b,offset).join(',')+']);'];
      case 'CallProperty0': return ['acc=rt.call('+O(a)+','+O(b)+',[]);'];
      case 'CallProperty1': return ['acc=rt.call('+O(a)+','+O(b)+',['+O(c)+']);'];
      case 'CallProperty2': return ['acc=rt.call('+O(a)+','+O(b)+',['+O(c)+','+O(args[3])+']);'];
      case 'CallProperty': case 'CallAnyReceiver': {
        const list=this.range(b,offset);
        if(!list.length)throw new Unsupported('call without receiver');
        return ['acc=rt.call('+O(a)+','+list[0]+',['+list.slice(1).join(',')+']);'];
      }
      case 'CallWithSpread': {
        const list=this.range(b,offset);
        if(list.length<2)throw new Unsupported('spread call shape');
        const spread=list[list.length-1],that=list[0],middle=list.slice(1,-1);
        return ['acc=rt.call('+O(a)+','+that+',[...['+middle.join(',')+'],...'+spread+']);'];
      }
      case 'Construct': return ['acc=Reflect.construct('+O(a)+',['+this.range(b,offset).join(',')+'],acc||'+O(a)+');'];
      case 'CallRuntime': case 'InvokeIntrinsic': return this.runtime(row);
      case 'ThrowReferenceErrorIfHole': return ['if(acc===HOLE)throw new ReferenceError("Cannot access "+'+O(a)+'+" before initialization");'];
      case 'ThrowSuperNotCalledIfHole': return ['if(acc===HOLE)throw new ReferenceError("Must call super constructor");'];
      case 'ThrowSuperAlreadyCalledIfNotHole': return ['if(acc!==HOLE)throw new ReferenceError("Super constructor already called");'];
      case 'ThrowIfNotSuperConstructor': return ['if(typeof '+O(a)+'!=="function")throw new TypeError("Super value is not a constructor");'];
      case 'GetIterator': return ['acc='+O(a)+'[Symbol.iterator]();'];
      case 'ToName': return ['acc=typeof acc==="symbol"?acc:String(acc);'];
      case 'ToObject': return ['acc=Object(acc);'+(a?this.assign(a,'acc'):'')];
      case 'ToNumeric': return ['acc=rt.numeric(acc);'];
      case 'ToNumber': return ['acc=Number(acc);'];
      case 'ToBoolean': return ['acc=Boolean(acc);'];
      case 'LogicalNot': case 'ToBooleanLogicalNot': return ['acc=!acc;'];
      case 'TypeOf': return ['acc=typeof acc;'];
      case 'TestTypeOf': return ['acc=typeof acc==='+literalOf(['number','string','symbol','boolean','bigint','undefined','function','object'][a])+';'];
      case 'TestUndefined': return ['acc=acc===undefined;'];
      case 'TestNull': return ['acc=acc===null;'];
      case 'TestUndetectable': return ['acc=acc==null;'];
      case 'TestEqual': return ['acc='+O(a)+'==acc;'];
      case 'TestEqualStrict': case 'TestReferenceEqual': return ['acc='+O(a)+'===acc;'];
      case 'TestLessThan': return ['acc='+O(a)+'<acc;'];
      case 'TestLessThanOrEqual': return ['acc='+O(a)+'<=acc;'];
      case 'TestGreaterThan': return ['acc='+O(a)+'>acc;'];
      case 'TestGreaterThanOrEqual': return ['acc='+O(a)+'>=acc;'];
      case 'TestInstanceOf': return ['acc='+O(a)+' instanceof acc;'];
      case 'TestIn': return ['acc='+O(a)+' in acc;'];
      case 'Add': return ['acc='+O(a)+'+acc;'];
      case 'Sub': return ['acc='+O(a)+'-acc;'];
      case 'Mul': return ['acc='+O(a)+'*acc;'];
      case 'Div': return ['acc='+O(a)+'/acc;'];
      case 'Mod': return ['acc='+O(a)+'%acc;'];
      case 'Exp': return ['acc='+O(a)+'**acc;'];
      case 'BitwiseOr': return ['acc='+O(a)+'|acc;'];
      case 'BitwiseAnd': return ['acc='+O(a)+'&acc;'];
      case 'BitwiseXor': return ['acc='+O(a)+'^acc;'];
      case 'ShiftLeft': return ['acc='+O(a)+'<<acc;'];
      case 'ShiftRight': return ['acc='+O(a)+'>>acc;'];
      case 'ShiftRightLogical': return ['acc='+O(a)+'>>>acc;'];
      case 'AddSmi': return ['acc=acc+'+literalOf(a)+';'];
      case 'SubSmi': return ['acc=acc-'+literalOf(a)+';'];
      case 'MulSmi': return ['acc=acc*'+literalOf(a)+';'];
      case 'DivSmi': return ['acc=acc/'+literalOf(a)+';'];
      case 'ModSmi': return ['acc=acc%'+literalOf(a)+';'];
      case 'BitwiseAndSmi': return ['acc=acc&'+literalOf(a)+';'];
      case 'BitwiseOrSmi': return ['acc=acc|'+literalOf(a)+';'];
      case 'BitwiseXorSmi': return ['acc=acc^'+literalOf(a)+';'];
      case 'ShiftLeftSmi': return ['acc=acc<<'+literalOf(a)+';'];
      case 'ShiftRightSmi': return ['acc=acc>>'+literalOf(a)+';'];
      case 'ShiftRightLogicalSmi': return ['acc=acc>>>'+literalOf(a)+';'];
      case 'Inc': return ['acc=rt.numeric(acc)+(typeof acc==="bigint"?1n:1);'];
      case 'Dec': return ['acc=rt.numeric(acc)-(typeof acc==="bigint"?1n:1);'];
      case 'Negate': return ['acc=-rt.numeric(acc);'];
      case 'BitwiseNot': return ['acc=~rt.numeric(acc);'];
      case 'DeletePropertyStrict': return ['acc=delete '+O(a)+'[acc];'];
      case 'CreateRestParameter': this.usesArgs=true; return ['acc=args.slice('+(this.definition.parameterCount-1)+');'];
      case 'SetPendingMessage': return ['{const previous=pending;pending=acc;acc=previous;}'];
      case 'SwitchOnGeneratorState': return [];
      default: throw new Unsupported('opcode '+op);
    }
  }

  keyed(object,key,assigned) {
    const text=typeof key==='object'&&key!==null&&'c' in key?this.constantValue(key.c):null;
    const expression=text&&text.known&&typeof text.value==='string'?property(object,text.value):object+'['+this.operand(key)+']';
    return assigned===undefined?expression:expression+'='+assigned;
  }

  runtime(row) {
    const[offset,,args]=row;
    const name=args[0];
    const list=args[1]===undefined?[]:this.range(args[1],offset);
    switch(name) {
      case '_CopyDataProperties': case '_CopyDataPropertiesWithExcludedPropertiesOnStack': case 'ThrowIteratorResultNotAnObject': case 'ThrowStaticPrototypeError': case 'LoadKeyedFromSuper': case 'DefineAccessorPropertyUnchecked': case 'DynamicImportCall':
        return ['acc=rt.runtime('+JSON.stringify(name)+',['+list.join(',')+'],{});'];
      default: throw new Unsupported('runtime '+name);
    }
  }
}

module.exports={Lowering,literalOf,property,IDENTIFIER};
