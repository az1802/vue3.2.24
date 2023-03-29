function reactive(obj){
  if(typeof obj == "object"){

  }
  let p = new Proxy(obj,{
    get(target,key,recevier){
      console.log('target,key,recevier: ', target,key,recevier);
      track(target,key)
      return Reflect.get(target,key,recevier);
    },
    set(target,key,value,recevier){
      console.log('target,key,value,recevier: ', target,key,value,recevier);
      Reflect.set(target,key,value,recevier) //设置新的值 触发更新
      trigger(target,key)

    }
  })


  return p;
}

let activeEffect = null;
// effect 相当于存在锁,fn函数必须是同步的如果是异步的可能fn运行是 activeEffect指向另外的effect
function effect(fn){
  activeEffect = fn;
  fn();
  activeEffect = null;
}

let wp = new WeakMap();
function track(target,key){
  if(!activeEffect){
    return ;
  }
  let depMap = wp.get(target);
  if(!depMap){
    depMap = new Map();
    wp.set(target,depMap);
  }

  let depSet = depMap.get(key);
  if(!depSet){
    depSet = new Set();
    depMap.set(key,depSet);
  }


  depSet.add(activeEffect);

}


// 触发dep列表运行相关依赖
function trigger(target,key){
  let tarMap = wp.get(target);
  let depSet = tarMap.get(key);
  depSet&&depSet.forEach(effectItem=>{
    console.log('effect: ',  effectItem);
    effectItem();
  })
}



let p1 = reactive({
  num:10
})


effect(()=>{
  console.log(`响应式更新${p1.num*10}`);
})


p1.num1=20;