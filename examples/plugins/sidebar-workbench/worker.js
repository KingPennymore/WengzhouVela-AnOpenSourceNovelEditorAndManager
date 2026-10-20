onmessage=({data})=>{
 const counts=new Map();for(let i=0;i<data.length;i++){counts.set(data[i],(counts.get(data[i])||0)+1);if(i%100===0)postMessage({progress:{progress:i/Math.max(1,data.length),message:'统计类别'}});}
 postMessage({result:Object.fromEntries(counts)});
};
