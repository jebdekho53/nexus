'use strict';
// f1: application bootstrap. The original function is one very large initialisation sequence; it is
// split into ordered parts that carry their live variables in the frame object `s`.
const part1=require("./f1-01.cjs");
const part2=require("./f1-02.cjs");
const part3=require("./f1-03.cjs");
const part4=require("./f1-04.cjs");
const part5=require("./f1-05.cjs");
const part6=require("./f1-06.cjs");
const part7=require("./f1-07.cjs");
const part8=require("./f1-08.cjs");
const part9=require("./f1-09.cjs");
const part10=require("./f1-10.cjs");
const part11=require("./f1-11.cjs");
const part12=require("./f1-12.cjs");
module.exports=function f1(rt,fn,self,args,newTarget,ctx,K){
  const s={ctx,acc:undefined,pending:rt.HOLE};
  part1(rt,fn,self,args,newTarget,K,s);
  part2(rt,fn,self,args,newTarget,K,s);
  part3(rt,fn,self,args,newTarget,K,s);
  part4(rt,fn,self,args,newTarget,K,s);
  part5(rt,fn,self,args,newTarget,K,s);
  part6(rt,fn,self,args,newTarget,K,s);
  part7(rt,fn,self,args,newTarget,K,s);
  part8(rt,fn,self,args,newTarget,K,s);
  part9(rt,fn,self,args,newTarget,K,s);
  part10(rt,fn,self,args,newTarget,K,s);
  part11(rt,fn,self,args,newTarget,K,s);
  return part12(rt,fn,self,args,newTarget,K,s);
};
