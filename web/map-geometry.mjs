export const directions=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
export function hexPoint(q,r,size=32,orientation='pointy'){return orientation==='flat'?{x:size*1.5*q,y:size*Math.sqrt(3)*(r+q/2)}:{x:size*Math.sqrt(3)*(q+r/2),y:size*1.5*r};}
export function cubeRound(q,r){let x=Math.round(q),z=Math.round(r),y=Math.round(-q-r);const dx=Math.abs(x-q),dy=Math.abs(y+q+r),dz=Math.abs(z-r);if(dx>dy&&dx>dz)x=-y-z;else if(dy>dz)y=-x-z;else z=-x-y;return {q:x||0,r:z||0};}
export function pointHex(x,y,size=32,orientation='pointy'){return cubeRound(...(orientation==='flat'?[x*2/3/size,(-x/3+Math.sqrt(3)*y/3)/size]:[(Math.sqrt(3)*x/3-y/3)/size,y*2/3/size]));}
export function hexVertices(q,r,size=32,orientation='pointy'){const p=hexPoint(q,r,size,orientation);return Array.from({length:6},(_,i)=>{const a=(i*60+(orientation==='pointy'?30:0))*Math.PI/180;return [p.x+size*Math.cos(a),p.y+size*Math.sin(a)];});}
export const hexDistance=(a,b)=>{const [q,r]=a.split(',').map(Number),[x,y]=b.split(',').map(Number);return (Math.abs(q-x)+Math.abs(r-y)+Math.abs(q+r-x-y))/2;};
