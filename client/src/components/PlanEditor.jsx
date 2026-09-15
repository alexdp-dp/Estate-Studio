import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Stage,Layer,Group,Image as KImage,Line,Circle,Text,Rect} from 'react-konva';
import {api,statusLabel} from '../api';

function useHtmlImage(src){
  const [img,setImg]=useState(null);
  useEffect(()=>{
    if(!src){setImg(null);return}
    const i=new Image();
    i.crossOrigin='anonymous';
    i.onload=()=>setImg(i);
    i.src=src;
  },[src]);
  return img;
}

function polygonPoints(apartment){
  const rel=apartment?.apartment_polygons;
  if(Array.isArray(rel)) return rel[0]?.points||[];
  return rel?.points||[];
}

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const clamp01=v=>clamp(v,0,1);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const EPS=.0008;

function cleanPoint(p){
  return {x:clamp01(Number(p.x)||0),y:clamp01(Number(p.y)||0)};
}

function applySnap(raw,points,{snapOrtho=true,snap45=false,snapVertices=true,vertexThreshold=.018}={}){
  let p=cleanPoint(raw);

  if(snapVertices&&points.length){
    const nearest=points.reduce((best,current)=>{
      const d=distance(p,current);
      return !best||d<best.d?{point:current,d}:best;
    },null);
    if(nearest&&nearest.d<=vertexThreshold)return cleanPoint(nearest.point);
  }

  if((snapOrtho||snap45)&&points.length){
    const anchor=points[points.length-1];
    const dx=p.x-anchor.x,dy=p.y-anchor.y;
    const len=Math.hypot(dx,dy);
    if(len>.000001){
      const step=snap45?Math.PI/4:Math.PI/2;
      const angle=Math.round(Math.atan2(dy,dx)/step)*step;
      p=cleanPoint({
        x:anchor.x+Math.cos(angle)*len,
        y:anchor.y+Math.sin(angle)*len
      });
    }
  }
  return p;
}

function polygonArea(points){
  let sum=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    sum+=a.x*b.y-b.x*a.y;
  }
  return sum/2;
}

function simplifyOrthogonal(points,eps=EPS){
  let out=points.map(cleanPoint);
  out=out.filter((p,i)=>i===0||distance(p,out[i-1])>eps);
  if(out.length>2&&distance(out[0],out[out.length-1])<=eps)out.pop();

  let changed=true,guard=0;
  while(changed&&out.length>3&&guard++<30){
    changed=false;
    for(let i=0;i<out.length;i++){
      const a=out[(i-1+out.length)%out.length];
      const b=out[i];
      const c=out[(i+1)%out.length];
      const vertical=Math.abs(a.x-b.x)<=eps&&Math.abs(b.x-c.x)<=eps;
      const horizontal=Math.abs(a.y-b.y)<=eps&&Math.abs(b.y-c.y)<=eps;
      if(vertical||horizontal){
        out.splice(i,1);
        changed=true;
        break;
      }
    }
  }
  return out;
}

function sharesAxis(a,b,eps=EPS){
  return Math.abs(a.x-b.x)<=eps||Math.abs(a.y-b.y)<=eps;
}

function deleteVertexAndHeal(points,index){
  if(points.length<=3)return points;
  const original=points.map(cleanPoint);
  const n=original.length;
  const prevIndex=(index-1+n)%n;
  const nextIndex=(index+1)%n;
  const prev=original[prevIndex];
  const removed=original[index];
  const next=original[nextIndex];

  // Best case: neighbours can already be joined by one H/V segment.
  if(sharesAxis(prev,next)){
    return simplifyOrthogonal(original.filter((_,i)=>i!==index));
  }

  // If a direct join would be diagonal, deleting a vertex while keeping only
  // 90-degree edges requires moving ONE adjacent vertex. We intentionally do
  // not insert the deleted corner back (the old implementation could do exactly
  // that, making deletion look like a no-op).
  const A=cleanPoint({x:prev.x,y:next.y});
  const B=cleanPoint({x:next.x,y:prev.y});
  const originalArea=Math.abs(polygonArea(original));
  const candidates=[];

  function pushCandidate(which,newPoint){
    if(distance(newPoint,removed)<=EPS*4)return; // never recreate deleted vertex
    const arr=original.filter((_,i)=>i!==index).map(cleanPoint);
    let target;
    if(which==='prev'){
      target=index===0?arr.length-1:index-1;
    }else{
      target=index===n-1?0:index;
    }
    if(target<0||target>=arr.length)return;
    const old=arr[target];
    arr[target]=newPoint;
    const cleaned=simplifyOrthogonal(arr);
    if(cleaned.length<3)return;
    const move=distance(old,newPoint);
    const areaPenalty=Math.abs(Math.abs(polygonArea(cleaned))-originalArea);
    candidates.push({points:cleaned,score:move+areaPenalty*.35});
  }

  pushCandidate('prev',A);
  pushCandidate('prev',B);
  pushCandidate('next',A);
  pushCandidate('next',B);

  if(!candidates.length){
    return simplifyOrthogonal(original.filter((_,i)=>i!==index));
  }
  candidates.sort((a,b)=>a.score-b.score);
  return candidates[0].points;
}

export default function PlanEditor({floor,onChanged}){
  const holder=useRef();
  const stageRef=useRef();
  const viewportRef=useRef();
  const panWasDragging=useRef(false);
  const vertexDragging=useRef(false);
  const draftRef=useRef([]);
  const image=useHtmlImage(floor?.plan_path);

  const [size,setSize]=useState({w:900,h:600});
  const [scale,setScale]=useState(1);
  const [pos,setPos]=useState({x:0,y:0});
  const [selectedId,setSelectedId]=useState(floor?.apartments?.[0]?.id||null);
  const [draft,setDraft]=useState([]);
  const [mode,setMode]=useState('edit');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [snapOrtho,setSnapOrtho]=useState(true);
  const [snap45,setSnap45]=useState(false);
  const [snapVertices,setSnapVertices]=useState(true);
  const [snapEdit,setSnapEdit]=useState(false);
  const [selectedVertex,setSelectedVertex]=useState(null);

  const selected=(floor?.apartments||[]).find(a=>a.id===selectedId);

  useEffect(()=>{draftRef.current=draft},[draft]);

  useEffect(()=>{
    setSelectedId(floor?.apartments?.[0]?.id||null);
    setScale(1);
    setPos({x:0,y:0});
  },[floor?.id]);

  useEffect(()=>{
    const ro=new ResizeObserver(([e])=>{
      const w=Math.max(320,e.contentRect.width);
      const ratio=image?image.height/image.width:.68;
      setSize({w,h:Math.min(760,Math.max(360,w*ratio))});
    });
    if(holder.current)ro.observe(holder.current);
    return()=>ro.disconnect();
  },[image]);

  useEffect(()=>{
    const ps=polygonPoints(selected).map(cleanPoint);
    draftRef.current=ps;
    setDraft(ps);
    setSelectedVertex(null);
    setNotice('');
  },[selectedId,selected?.apartment_polygons]);

  useEffect(()=>{
    function onKeyDown(e){
      const tag=(e.target?.tagName||'').toLowerCase();
      if(tag==='input'||tag==='textarea'||tag==='select')return;
      if((e.key==='Delete'||e.key==='Backspace')&&selectedVertex!==null){
        e.preventDefault();
        deleteVertex(selectedVertex);
      }
    }
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[selectedVertex]);

  const imgRect=useMemo(()=>{
    if(!image)return{x:0,y:0,w:size.w,h:size.h};
    const r=image.width/image.height,sr=size.w/size.h;
    if(r>sr){
      const w=size.w,h=w/r;
      return{x:0,y:(size.h-h)/2,w,h};
    }
    const h=size.h,w=h*r;
    return{x:(size.w-w)/2,y:0,w,h};
  },[image,size]);

  function pointerToNorm(){
    const st=stageRef.current,viewport=viewportRef.current,p=st?.getPointerPosition();
    if(!st||!viewport||!p)return{x:0,y:0};
    const local=viewport.getAbsoluteTransform().copy().invert().point(p);
    return cleanPoint({
      x:(local.x-imgRect.x)/imgRect.w,
      y:(local.y-imgRect.y)/imgRect.h
    });
  }

  function localNodeToNorm(node){
    const x=clamp(node.x(),imgRect.x,imgRect.x+imgRect.w);
    const y=clamp(node.y(),imgRect.y,imgRect.y+imgRect.h);
    return{
      local:{x,y},
      norm:cleanPoint({x:(x-imgRect.x)/imgRect.w,y:(y-imgRect.y)/imgRect.h})
    };
  }

  function normToLocal(p){
    return{x:imgRect.x+p.x*imgRect.w,y:imgRect.y+p.y*imgRect.h};
  }

  function clampPan(next,atScale=scale){
    const keep=Math.min(90,Math.max(44,Math.min(size.w,size.h)*.10));
    const scaledW=size.w*atScale,scaledH=size.h*atScale;
    return{
      x:Math.max(keep-scaledW,Math.min(size.w-keep,next.x)),
      y:Math.max(keep-scaledH,Math.min(size.h-keep,next.y))
    };
  }

  function addPoint(e){
    if(mode!=='draw'||panWasDragging.current)return;
    if(e.target?.getClassName?.()==='Circle')return;
    const raw=pointerToNorm();
    const force45=e?.evt?.shiftKey;
    const disableSnap=e?.evt?.altKey||e?.evt?.metaKey;
    const snapped=disableSnap?raw:applySnap(raw,draftRef.current,{
      snapOrtho:snapOrtho||force45,
      snap45:snap45||force45,
      snapVertices
    });
    setDraft(v=>{
      const next=[...v,snapped];
      draftRef.current=next;
      setSelectedVertex(next.length-1);
      return next;
    });
  }

  async function savePolygon(){
    if(!selected)return alert('Selectează un apartament.');
    if(draftRef.current.length<3)return alert('Poligonul are nevoie de cel puțin 3 puncte.');
    setBusy(true);setNotice('');
    try{
      const saved=await api(`/admin/apartments/${selected.id}/polygon`,{
        method:'PUT',body:{points:draftRef.current}
      });
      if(!saved?.apartment_id)throw new Error('Serverul nu a confirmat salvarea poligonului.');
      setNotice(`Salvat · ${draftRef.current.length} puncte`);
      await onChanged?.();
    }catch(e){
      alert(`Nu am putut salva poligonul: ${e.message}`);
    }finally{setBusy(false)}
  }

  function onWheel(e){
    e.evt.preventDefault();
    const pointer=stageRef.current?.getPointerPosition();
    if(!pointer)return;
    const old=scale;
    const local={x:(pointer.x-pos.x)/old,y:(pointer.y-pos.y)/old};
    const next=Math.max(.5,Math.min(5,e.evt.deltaY>0?old/1.08:old*1.08));
    const nextPos=clampPan({x:pointer.x-local.x*next,y:pointer.y-local.y*next},next);
    setScale(next);setPos(nextPos);
  }

  function beginVertexDrag(i,e){
    e.cancelBubble=true;
    setSelectedVertex(i);
    vertexDragging.current=true;
    panWasDragging.current=false;
    const viewport=viewportRef.current;
    viewport?.stopDrag?.();
    viewport?.draggable(false);
    e.target.moveToTop?.();
  }

  function dragVertex(i,e){
    e.cancelBubble=true;
    const node=e.target;
    const {local,norm:raw}=localNodeToNorm(node);
    node.position(local); // immediate visual response, even before React renders

    const forceSnap=!!e?.evt?.shiftKey;
    const disableSnap=!!(e?.evt?.altKey||e?.evt?.metaKey);
    let nextPoint=raw;

    const current=draftRef.current;
    if((snapEdit||forceSnap)&&!disableSnap&&current.length>1){
      const prev=current[(i-1+current.length)%current.length];
      const next=current[(i+1)%current.length];
      const anchor=distance(raw,prev)<=distance(raw,next)?prev:next;
      nextPoint=applySnap(raw,[anchor],{
        snapOrtho:true,
        snap45:snap45||forceSnap,
        snapVertices:false
      });
      node.position(normToLocal(nextPoint));
    }

    const arr=current.map((p,idx)=>idx===i?nextPoint:p);
    draftRef.current=arr;
    setDraft(arr);
  }

  function endVertexDrag(i,e){
    e.cancelBubble=true;
    dragVertex(i,e);
    vertexDragging.current=false;
    viewportRef.current?.draggable(mode==='pan');
  }

  function deleteVertex(index=selectedVertex){
    if(index===null||index===undefined)return;
    const current=draftRef.current;
    if(current.length<=3){
      setNotice('Poligonul trebuie să rămână cu minimum 3 puncte.');
      return;
    }
    const next=deleteVertexAndHeal(current,index);
    draftRef.current=next;
    setDraft(next);
    setSelectedVertex(null);
    setNotice(`Punct șters real · ${current.length} → ${next.length} puncte`);
  }

  return(
    <div className="polygon-workspace">
      <div className="polygon-toolbar">
        <div className="segmented">
          <button className={mode==='edit'?'active':''} onClick={()=>setMode('edit')}>Editează</button>
          <button className={mode==='draw'?'active':''} onClick={()=>{setMode('draw');draftRef.current=[];setDraft([]);setSelectedVertex(null)}}>Desenează nou</button>
          <button className={mode==='pan'?'active':''} onClick={()=>setMode('pan')}>Pan</button>
        </div>

        <div className="segmented snap-controls">
          <button className={snapOrtho?'active':''} onClick={()=>setSnapOrtho(v=>!v)}>Snap 0/90°</button>
          <button className={snap45?'active':''} onClick={()=>setSnap45(v=>!v)}>45°</button>
          <button className={snapVertices?'active':''} onClick={()=>setSnapVertices(v=>!v)}>Vertices</button>
          <button className={snapEdit?'active':''} onClick={()=>setSnapEdit(v=>!v)}>Snap edit</button>
        </div>

        <button onClick={()=>setDraft(v=>{
          const next=v.slice(0,-1);draftRef.current=next;setSelectedVertex(null);return next;
        })}>Undo punct</button>
        <button disabled={selectedVertex===null||draft.length<=3} onClick={()=>deleteVertex(selectedVertex)}>Șterge punct</button>
        <button onClick={()=>{setScale(1);setPos({x:0,y:0})}}>Încadrează planul</button>
        <button className="primary" disabled={busy||!selected} onClick={savePolygon}>{busy?'Salvez…':'Salvează poligon'}</button>
        {notice&&<span className="save-notice">✓ {notice}</span>}
        <span className="zoom-label">{Math.round(scale*100)}%</span>
      </div>

      <div className="polygon-layout">
        <div className="apartment-palette">
          <h4>Apartamente</h4>
          {(floor?.apartments||[]).length===0&&<div className="empty-mini">Creează întâi apartamente pentru acest etaj.</div>}
          {(floor?.apartments||[]).map(a=><button
            key={a.id}
            className={'ap-row '+(selectedId===a.id?'selected':'')}
            onClick={()=>{setSelectedId(a.id);setMode('edit')}}
          >
            <span className={'status-dot '+a.status}/><b>{a.code}</b><small>{statusLabel[a.status]}</small>
          </button>)}
        </div>

        <div className="stage-holder" ref={holder}>
          <Stage ref={stageRef} width={size.w} height={size.h} onWheel={onWheel} onClick={addPoint} onTap={addPoint}>
            <Layer>
              <Group
                ref={viewportRef}
                x={pos.x} y={pos.y} scaleX={scale} scaleY={scale}
                draggable={mode==='pan'&&!vertexDragging.current}
                dragBoundFunc={p=>clampPan(p)}
                onDragStart={e=>{
                  if(vertexDragging.current){e.target.stopDrag();return}
                  panWasDragging.current=true;
                }}
                onDragMove={e=>{
                  if(vertexDragging.current){e.target.stopDrag();return}
                  const p=clampPan({x:e.target.x(),y:e.target.y()});
                  if(p.x!==e.target.x()||p.y!==e.target.y())e.target.position(p);
                }}
                onDragEnd={e=>{
                  if(vertexDragging.current)return;
                  const p=clampPan({x:e.target.x(),y:e.target.y()});
                  e.target.position(p);setPos(p);
                  requestAnimationFrame(()=>{panWasDragging.current=false});
                }}
              >
                <Rect width={size.w} height={size.h} fill="#e9edea" listening={false}/>
                {image&&<KImage image={image} x={imgRect.x} y={imgRect.y} width={imgRect.w} height={imgRect.h} listening={false}/>} 

                {(floor?.apartments||[]).filter(a=>a.id!==selectedId).map(a=>{
                  const ps=polygonPoints(a);
                  if(ps.length<3)return null;
                  return <Line
                    key={a.id}
                    points={ps.flatMap(p=>[imgRect.x+p.x*imgRect.w,imgRect.y+p.y*imgRect.h])}
                    closed
                    fill={a.status==='available'?'rgba(33,194,101,.20)':a.status==='reserved'?'rgba(236,164,45,.20)':'rgba(220,72,72,.20)'}
                    stroke="rgba(15,20,18,.45)" strokeWidth={1/scale}
                    listening={false}
                  />;
                })}

                {draft.length>0&&<>
                  <Line
                    points={draft.flatMap(p=>[imgRect.x+p.x*imgRect.w,imgRect.y+p.y*imgRect.h])}
                    closed={draft.length>=3}
                    fill="rgba(19,173,88,.26)" stroke="#0e8f48" strokeWidth={2/scale}
                    listening={false}
                  />
                  {draft.map((p,i)=><Circle
                    key={`${selectedId||'draft'}-${i}`}
                    x={imgRect.x+p.x*imgRect.w}
                    y={imgRect.y+p.y*imgRect.h}
                    radius={(selectedVertex===i?8:7)/scale}
                    fill={selectedVertex===i?'#ffe16a':'#fff'}
                    stroke={selectedVertex===i?'#9a6a00':'#0a1811'}
                    strokeWidth={1.7/scale}
                    hitStrokeWidth={18/scale}
                    listening={true}
                    draggable={mode==='edit'}
                    onMouseEnter={e=>{const c=e.target.getStage()?.container();if(c)c.style.cursor=mode==='edit'?'grab':'pointer'}}
                    onMouseLeave={e=>{const c=e.target.getStage()?.container();if(c)c.style.cursor='default'}}
                    onMouseDown={e=>{e.cancelBubble=true;setSelectedVertex(i)}}
                    onTouchStart={e=>{e.cancelBubble=true;setSelectedVertex(i)}}
                    onClick={e=>{e.cancelBubble=true;setSelectedVertex(i)}}
                    onTap={e=>{e.cancelBubble=true;setSelectedVertex(i)}}
                    onDblClick={e=>{e.cancelBubble=true;deleteVertex(i)}}
                    onDblTap={e=>{e.cancelBubble=true;deleteVertex(i)}}
                    onContextMenu={e=>{e.evt.preventDefault();e.cancelBubble=true;deleteVertex(i)}}
                    onDragStart={e=>beginVertexDrag(i,e)}
                    onDragMove={e=>dragVertex(i,e)}
                    onDragEnd={e=>endVertexDrag(i,e)}
                  />)}
                </>}

                {!image&&<Text text="Încarcă planul etajului înainte de desenare" x={30} y={40} fontSize={18} fill="#55605b" listening={false}/>} 
              </Group>
            </Layer>
          </Stage>
        </div>
      </div>

      <p className="hint">
        În <b>Editează</b>, vertex-ul este acum mutat direct din coordonata locală Konva a handle-ului, fără conversia pointerului care putea bloca vizual drag-ul.
        Selectează un punct și folosește <b>Șterge punct</b> / Delete / Backspace / dublu click. La ștergere, punctul chiar dispare; dacă vecinii lui ar produce o diagonală,
        editorul mută minim unul dintre vecini ca închiderea să rămână la 90° și nu recreează punctul șters.
      </p>
    </div>
  );
}
