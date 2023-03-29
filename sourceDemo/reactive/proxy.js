
 let arr = new Set([1,2,3]);


 let p = new Proxy(arr,{
  get(target,key,receiver){
    console.log('key: ',target, key);
    return  target.keys.bind(target);
  },
 })

console.log(p.keys())