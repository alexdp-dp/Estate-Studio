
function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}
function at(x,y,w){return y*w+x}

function rasterLine(mask,w,h,x0,y0,x1,y1,thick=1){
  x0=Math.round(x0); y0=Math.round(y0);
  x1=Math.round(x1); y1=Math.round(y1);
  const dx=Math.abs(x1-x0), sx=x0<x1?1:-1;
  const dy=-Math.abs(y1-y0), sy=y0<y1?1:-1;
  let err=dx+dy;
  while(true){
    for(let yy=y0-thick;yy<=y0+thick;yy++){
      if(yy<0||yy>=h)continue;
      for(let xx=x0-thick;xx<=x0+thick;xx++){
        if(xx<0||xx>=w)continue;
        mask[at(xx,yy,w)]=1;
      }
    }
    if(x0===x1&&y0===y1)break;
    const e2=2*err;
    if(e2>=dy){err+=dy;x0+=sx}
    if(e2<=dx){err+=dx;y0+=sy}
  }
}

function dilate(src,w,h,passes=1){
  let cur=src;
  for(let pass=0;pass<passes;pass++){
    const out=cur.slice();
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      if(cur[at(x,y,w)])continue;
      let hit=false;
      for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1)&&!hit;yy++){
        for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){
          if(cur[at(xx,yy,w)]){hit=true;break}
        }
      }
      if(hit)out[at(x,y,w)]=1;
    }
    cur=out;
  }
  return cur;
}

function bridgeDirectional(src,w,h,maxGap,minSupport){
  const out=src.slice();
  const bridges=[];

  function scan(get,set,len,orientation,axis){
    const runs=[];
    let i=0;
    while(i<len){
      while(i<len&&!get(i))i++;
      const start=i;
      while(i<len&&get(i))i++;
      if(i>start)runs.push([start,i-1]);
    }
    for(let r=0;r<runs.length-1;r++){
      const a=runs[r], b=runs[r+1];
      const gap=b[0]-a[1]-1;
      const la=a[1]-a[0]+1, lb=b[1]-b[0]+1;
      if(gap>=2&&gap<=maxGap&&la>=minSupport&&lb>=minSupport){
        for(let k=a[1]+1;k<b[0];k++)set(k);
        bridges.push({orientation,axis,from:a[1]+1,to:b[0]-1,size:gap});
      }
    }
  }

  for(let y=0;y<h;y++){
    scan(i=>!!src[at(i,y,w)],i=>{out[at(i,y,w)]=1},w,'h',y);
  }
  for(let x=0;x<w;x++){
    scan(i=>!!src[at(x,i,w)],i=>{out[at(x,i,w)]=1},h,'v',x);
  }

  return {mask:out,bridges};
}

function components(free,w,h){
  const labels=new Int32Array(w*h);
  const stats=[];
  let id=0;
  const qx=new Int32Array(w*h), qy=new Int32Array(w*h);

  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=at(x,y,w);
    if(!free[p]||labels[p])continue;

    id++;
    let head=0,tail=0;
    qx[tail]=x;qy[tail]=y;tail++;
    labels[p]=id;

    let area=0,sumX=0,sumY=0,minX=x,maxX=x,minY=y,maxY=y,touchesBorder=false;

    while(head<tail){
      const cx=qx[head],cy=qy[head];head++;
      area++;sumX+=cx;sumY+=cy;
      minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);
      minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);
      if(cx===0||cy===0||cx===w-1||cy===h-1)touchesBorder=true;

      for(const [nx,ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]){
        if(nx<0||ny<0||nx>=w||ny>=h)continue;
        const ni=at(nx,ny,w);
        if(!free[ni]||labels[ni])continue;
        labels[ni]=id;
        qx[tail]=nx;qy[tail]=ny;tail++;
      }
    }

    stats.push({
      id,area,cx:sumX/area,cy:sumY/area,
      minX,maxX,minY,maxY,
      width:maxX-minX+1,height:maxY-minY+1,
      touchesBorder
    });
  }
  return {labels,stats};
}

function pointInPolygon(x,y,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if(((a.y>y)!==(b.y>y)) &&
      x < (b.x-a.x)*(y-a.y)/((b.y-a.y)||1e-9)+a.x)inside=!inside;
  }
  return inside;
}

function boundaryLoops(mask,w,h){
  const edges=new Map();
  function add(ax,ay,bx,by){
    const k=`${ax},${ay}`;
    if(!edges.has(k))edges.set(k,[]);
    edges.get(k).push([bx,by]);
  }

  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(!mask[at(x,y,w)])continue;
    if(y===0||!mask[at(x,y-1,w)])add(x,y,x+1,y);
    if(x===w-1||!mask[at(x+1,y,w)])add(x+1,y,x+1,y+1);
    if(y===h-1||!mask[at(x,y+1,w)])add(x+1,y+1,x,y+1);
    if(x===0||!mask[at(x-1,y,w)])add(x,y+1,x,y);
  }

  const loops=[];
  while(edges.size){
    const first=edges.entries().next().value;
    if(!first)break;
    const [startKey,nexts]=first;
    if(!nexts.length){edges.delete(startKey);continue}
    const [sx,sy]=startKey.split(',').map(Number);
    let next=nexts.shift();
    if(!nexts.length)edges.delete(startKey);
    const loop=[[sx,sy]];
    let guard=0;

    while(next&&guard++<w*h*4){
      loop.push(next);
      if(next[0]===sx&&next[1]===sy)break;
      const k=`${next[0]},${next[1]}`;
      const arr=edges.get(k);
      if(!arr?.length)break;
      next=arr.shift();
      if(!arr.length)edges.delete(k);
    }
    if(loop.length>=8)loops.push(loop);
  }
  return loops;
}

function polygonArea(poly){
  let a=0;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    a+=poly[j][0]*poly[i][1]-poly[i][0]*poly[j][1];
  }
  return a/2;
}

function perpDistance(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1];
  if(Math.abs(dx)+Math.abs(dy)<1e-9)return Math.hypot(p[0]-a[0],p[1]-a[1]);
  const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy);
  const x=a[0]+t*dx,y=a[1]+t*dy;
  return Math.hypot(p[0]-x,p[1]-y);
}

function simplifyOpen(points,eps){
  if(points.length<=2)return points;
  let max=0,index=0;
  const a=points[0],b=points[points.length-1];
  for(let i=1;i<points.length-1;i++){
    const d=perpDistance(points[i],a,b);
    if(d>max){max=d;index=i}
  }
  if(max>eps){
    const left=simplifyOpen(points.slice(0,index+1),eps);
    const right=simplifyOpen(points.slice(index),eps);
    return left.slice(0,-1).concat(right);
  }
  return [a,b];
}

function simplifyClosed(loop,eps){
  if(loop.length<6)return loop;
  const pts=loop.slice(0,-1);
  let left=0,right=1,maxD=0;
  for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
    const d=(pts[i][0]-pts[j][0])**2+(pts[i][1]-pts[j][1])**2;
    if(d>maxD){maxD=d;left=i;right=j}
  }
  const a=[],b=[];
  let i=left;
  while(true){a.push(pts[i]);if(i===right)break;i=(i+1)%pts.length}
  i=right;
  while(true){b.push(pts[i]);if(i===left)break;i=(i+1)%pts.length}
  return simplifyOpen(a,eps).slice(0,-1).concat(simplifyOpen(b,eps).slice(0,-1));
}

function contour(mask,w,h){
  const loops=boundaryLoops(mask,w,h);
  if(!loops.length)return [];
  loops.sort((a,b)=>Math.abs(polygonArea(b))-Math.abs(polygonArea(a)));
  let p=simplifyClosed(loops[0],Math.max(2,Math.min(w,h)*.004));

  let changed=true;
  while(changed&&p.length>4){
    changed=false;
    for(let i=0;i<p.length;i++){
      const a=p[i],b=p[(i+1)%p.length];
      if(Math.hypot(b[0]-a[0],b[1]-a[1])<Math.min(w,h)*.006){
        p.splice((i+1)%p.length,1);
        changed=true;break;
      }
    }
  }
  return p.map(([x,y])=>({x:clamp(x/w),y:clamp(y/h)}));
}

function normText(v){
  return String(v||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toUpperCase().replace(/\s+/g,' ').trim();
}

function apCode(text){
  const t=normText(text).replace(/\s+/g,'');
  const m=t.match(/AP(?:ARTAMENT)?[.\-_]?(\d{1,3})/);
  return m?`AP.${String(Number(m[1])).padStart(2,'0')}`:null;
}

function isCommonText(text){
  const t=normText(text);
  return /(HOL COMUN|HOL ETAJ|CORIDOR|CIRCULATIE|PALIER|CASA SCARII|SCARA|LIFT|LOBBY|VESTIBUL COMUN)/.test(t);
}

export function mapApartmentsFromCad(segments,texts=[],aspect=1){
  const base=1100;
  const w=aspect>=1?base:Math.max(600,Math.round(base*aspect));
  const h=aspect>=1?Math.max(600,Math.round(base/aspect)):base;
  const wall=new Uint8Array(w*h);

  const structural=[];
  for(const s of segments||[]){
    if(!Array.isArray(s)||s.length<4)continue;
    const dx=s[2]-s[0],dy=s[3]-s[1];
    const len=Math.hypot(dx,dy);
    if(len<.0045)continue;

    let a=Math.abs(Math.atan2(dy,dx));
    while(a>Math.PI)a-=Math.PI;
    const axis=Math.min(Math.abs(a),Math.abs(a-Math.PI/2),Math.abs(a-Math.PI));
    if(axis<.14 || len>.018)structural.push(s);
  }

  for(const s of structural){
    rasterLine(
      wall,w,h,
      s[0]*(w-1),s[1]*(h-1),
      s[2]*(w-1),s[3]*(h-1),
      1
    );
  }

  const thick=dilate(wall,w,h,1);
  const bridged=bridgeDirectional(
    thick,w,h,
    Math.max(8,Math.round(Math.min(w,h)*.027)),
    Math.max(4,Math.round(Math.min(w,h)*.005))
  );
  const closed=dilate(bridged.mask,w,h,1);

  const free=new Uint8Array(w*h);
  for(let i=0;i<free.length;i++)free[i]=closed[i]?0:1;

  const cc=components(free,w,h);
  const minRoom=Math.max(160,w*h*.00028);
  const maxRoom=w*h*.18;

  const rooms=cc.stats.filter(r=>
    !r.touchesBorder &&
    r.area>=minRoom &&
    r.area<=maxRoom &&
    r.width>=8 && r.height>=8
  );

  const roomSet=new Set(rooms.map(r=>r.id));
  const edges=new Map();

  function addEdge(a,b,bridge){
    if(!a||!b||a===b||!roomSet.has(a)||!roomSet.has(b))return;
    const lo=Math.min(a,b),hi=Math.max(a,b),k=`${lo}:${hi}`;
    const e=edges.get(k)||{a:lo,b:hi,count:0,bridges:[]};
    e.count++;
    if(e.bridges.length<24)e.bridges.push(bridge);
    edges.set(k,e);
  }

  const look=Math.max(7,Math.round(Math.min(w,h)*.016));
  for(const br of bridged.bridges){
    const mid=Math.round((br.from+br.to)/2);
    if(br.orientation==='h'){
      const x=Math.max(0,Math.min(w-1,mid)),y=br.axis;
      let up=0,down=0;
      for(let d=2;d<=look&&!up;d++){const yy=y-d;if(yy>=0)up=cc.labels[at(x,yy,w)]}
      for(let d=2;d<=look&&!down;d++){const yy=y+d;if(yy<h)down=cc.labels[at(x,yy,w)]}
      addEdge(up,down,br);
    }else{
      const x=br.axis,y=Math.max(0,Math.min(h-1,mid));
      let left=0,right=0;
      for(let d=2;d<=look&&!left;d++){const xx=x-d;if(xx>=0)left=cc.labels[at(xx,y,w)]}
      for(let d=2;d<=look&&!right;d++){const xx=x+d;if(xx<w)right=cc.labels[at(xx,y,w)]}
      addEdge(left,right,br);
    }
  }

  const graphEdges=[...edges.values()].filter(e=>e.count>=2);
  const degree=new Map(rooms.map(r=>[r.id,0]));
  for(const e of graphEdges){
    degree.set(e.a,(degree.get(e.a)||0)+1);
    degree.set(e.b,(degree.get(e.b)||0)+1);
  }

  const roomById=new Map(rooms.map(r=>[r.id,r]));
  const commonTextRoomIds=new Set();

  for(const t of texts||[]){
    if(!isCommonText(t.text))continue;
    const x=Math.round(clamp(t.x)*(w-1)),y=Math.round(clamp(t.y)*(h-1));
    const id=cc.labels[at(x,y,w)];
    if(roomSet.has(id))commonTextRoomIds.add(id);
  }

  let commonIds=[...commonTextRoomIds];

  if(!commonIds.length&&rooms.length){
    const cx=w/2,cy=h/2;
    const maxDeg=Math.max(...rooms.map(r=>degree.get(r.id)||0),1);
    const maxArea=Math.max(...rooms.map(r=>r.area),1);

    const ranked=rooms.map(r=>{
      const deg=(degree.get(r.id)||0)/maxDeg;
      const area=r.area/maxArea;
      const aspectRoom=Math.max(r.width,r.height)/Math.max(1,Math.min(r.width,r.height));
      const elong=Math.min(1,Math.max(0,(aspectRoom-1.6)/4));
      const central=1-clamp(Math.hypot(r.cx-cx,r.cy-cy)/Math.hypot(cx,cy));
      return {id:r.id,score:deg*.52+area*.16+elong*.16+central*.16,deg:degree.get(r.id)||0};
    }).sort((a,b)=>b.score-a.score);

    if(ranked[0]?.deg>=3)commonIds=[ranked[0].id];
  }

  const common=new Set(commonIds);
  const nodes=rooms.filter(r=>!common.has(r.id));
  const nodeSet=new Set(nodes.map(r=>r.id));
  const graph=new Map(nodes.map(r=>[r.id,[]]));

  for(const e of graphEdges){
    if(!nodeSet.has(e.a)||!nodeSet.has(e.b))continue;
    graph.get(e.a).push(e.b);
    graph.get(e.b).push(e.a);
  }

  const groups=[],seen=new Set();
  for(const room of nodes){
    if(seen.has(room.id))continue;
    const ids=[],q=[room.id];seen.add(room.id);
    while(q.length){
      const id=q.shift();ids.push(id);
      for(const n of graph.get(id)||[]){
        if(!seen.has(n)){seen.add(n);q.push(n)}
      }
    }
    groups.push(ids);
  }

  let groupObjs=groups.map(ids=>{
    const rs=ids.map(id=>roomById.get(id)).filter(Boolean);
    const area=rs.reduce((sum,r)=>sum+r.area,0);
    const cx=rs.reduce((sum,r)=>sum+r.cx*r.area,0)/Math.max(1,area);
    const cy=rs.reduce((sum,r)=>sum+r.cy*r.area,0)/Math.max(1,area);
    return {ids,rooms:rs,area,cx,cy};
  });

  const areas=groupObjs.map(g=>g.area).sort((a,b)=>a-b);
  const med=areas.length?areas[Math.floor(areas.length/2)]:1;
  groupObjs=groupObjs.filter(g=>g.area>=Math.max(350,med*.25));

  const detections=[];
  for(const g of groupObjs){
    const ids=new Set(g.ids);
    let mask=new Uint8Array(w*h);
    for(let i=0;i<cc.labels.length;i++)if(ids.has(cc.labels[i]))mask[i]=1;

    for(const e of graphEdges){
      if(!ids.has(e.a)||!ids.has(e.b))continue;
      for(const br of e.bridges){
        if(br.orientation==='h'){
          for(let x=br.from;x<=br.to;x++){
            for(let y=Math.max(0,br.axis-2);y<=Math.min(h-1,br.axis+2);y++)mask[at(x,y,w)]=1;
          }
        }else{
          for(let y=br.from;y<=br.to;y++){
            for(let x=Math.max(0,br.axis-2);x<=Math.min(w-1,br.axis+2);x++)mask[at(x,y,w)]=1;
          }
        }
      }
    }

    mask=dilate(mask,w,h,1);
    const points=contour(mask,w,h);
    if(points.length<4)continue;

    detections.push({
      points,
      roomCount:g.rooms.length,
      area:g.area,
      cx:g.cx/w,
      cy:g.cy/h,
      code:null
    });
  }

  for(const t of texts||[]){
    const code=apCode(t.text);
    if(!code)continue;
    let chosen=null,best=Infinity;
    for(const d of detections){
      if(pointInPolygon(t.x,t.y,d.points)){chosen=d;break}
      const dist=Math.hypot(d.cx-t.x,d.cy-t.y);
      if(dist<best){best=dist;chosen=d}
    }
    if(chosen&&!chosen.code)chosen.code=code;
  }

  detections.sort((a,b)=>{
    const ra=Math.round(a.cy*8),rb=Math.round(b.cy*8);
    return ra===rb?a.cx-b.cx:a.cy-b.cy;
  });

  let seq=1;
  for(const d of detections){
    if(!d.code)d.code=`A${String(seq++).padStart(2,'0')}`;
  }

  return {
    detections,
    debug:{
      inputSegments:(segments||[]).length,
      structuralSegments:structural.length,
      rooms:rooms.length,
      doors:graphEdges.length,
      commonIds:[...common],
      groupCount:detections.length
    }
  };
}
