let origin = {
  a:"aaa",
  b:{
    bb:"bbb",
  }
}

let p1 = new Proxy(origin,{
  get(target,key,receiver){
    console.log('key ===== ', target,key,receiver);
    return target[key]
  }
})


console.log(p1.a)
