
let ITERATOR = Symbol("iterator");

let baseHandlers = {
  get(target,key){
    track(target,key);
    return Reflect.get(target,key);
  },
  set(target,key,value){
    if(value == Reflect.get(target,key)){
      return ;
    }
    Reflect.set(target,key,value)
    trigger(target,key,value);
    return value;
  },
  ownKeys(target) {
    track(target, ITERATOR)
    return Reflect.ownKeys(target)
  }
}

function reactive(obj){
  if(typeof obj !== "object"){
    console.warn("只有对象可以被reactive处理");
    return ;
  }

  let p = new Proxy(obj,baseHandlers);

  return p;
}


function createDep(){
  let dep = new Set();



  return dep;
}



let targetMap =  new WeakMap();

function track(target,key){
  if (!activeEffect) return
  let depsMap = targetMap.get(target)
  if (!depsMap) {
    targetMap.set(target, (depsMap = new Map()))
  }

   let dep = depsMap.get(key);
   if(!dep){
    depsMap.set(key,(dep = createDep()))
   }

   if(!dep.has(activeEffect)){
    dep.add(activeEffect);
    console.log("收集依赖",activeEffect)
   }
}

function trigger(target,key,value){
  let depsMap = targetMap.get(target);
  if(!depsMap){
    return;
  }

  let deps = depsMap.get(key);
  console.log('deps: ', deps);

  if(!Array.isArray(target)){
    deps.add(...depsMap.get(ITERATOR));
  }

  for( const effect of deps){
    console.log("触发更新",effect)
    if(effect){
      effect()
    }
  }

}

let activeEffect = null;

function effect(fn){
  activeEffect=fn;
  fn();
  activeEffect=null;
}





let r = reactive({
  a:"aa"
})

effect(()=>{
  console.log("执行render函数",JSON.stringify(r));
  // console.log("执行render函数",r.a);
})


r.b ="bbb" ;
r.b ="bbb" ;
//