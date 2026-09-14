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

function clamp01(v){
  return Math.max(0,Math.min(1,v));
}

function distance(a,b){
  return Math.hypot(a.x-b.x,a.y-b.y);
}

function applySnap(raw, points, {
  snapOrtho=true,
  snap45=false,
  snapVertices=true,
  vertexThreshold=0.018
}={}){
  let p={x:clamp01(raw.x),y:clamp01(raw.y)};

  if(snapVertices && points.length){
    const first=points[0];
    const nearest=points.reduce((best,current)=>{
      const d=distance(p,current);
      if(!best || d<best.d) return {point:current,d};
      return best;
    }, null);

    if(nearest && nearest.d<=vertexThreshold){
      return {x:nearest.point.x,y:nearest.point.y};
    }

    if(points.length>=2 && distance(p,first)<=vertexThreshold){
      return {x:first.x,y:first.y};
    }
  }

  if((snapOrtho || snap45) && points.length){
    const anchor=points[points.length-1];
    const dx=p.x-anchor.x;
    const dy=p.y-anchor.y;
    const len=Math.hypot(dx,dy);

    if(len>0.000001){
      const step=snap45 ? Math.PI/4 : Math.PI/2;
      const angle=Math.atan2(dy,dx);
      const snapped=Math.round(angle/step)*step;

      p={
        x:clamp01(anchor.x + Math.cos(snapped)*len),
        y:clamp01(anchor.y + Math.sin(snapped)*len)
      };
    }
  }

  return p;
}

export default function PlanEditor({floor,onChanged}){
  const holder=useRef();
  const stageRef=useRef();
  const viewportRef=useRef();
  const panWasDragging=useRef(false);
  const vertexDragging=useRef(false);
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

  const selected=(floor?.apartments||[]).find(a=>a.id===selectedId);

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
    if(holder.current) ro.observe(holder.current);
    return()=>ro.disconnect();
  },[image]);

  useEffect(()=>{
    const ps=polygonPoints(selected);
    setDraft(ps.map(p=>({x:+p.x,y:+p.y})));
    setNotice('');
  },[selectedId,selected?.apartment_polygons]);

  const imgRect=useMemo(()=>{
    if(!image) return {x:0,y:0,w:size.w,h:size.h};
    const r=image.width/image.height;
    const sr=size.w/size.h;
    if(r>sr){
      const w=size.w,h=w/r;
      return {x:0,y:(size.h-h)/2,w,h};
    }
    const h=size.h,w=h*r;
    return {x:(size.w-w)/2,y:0,w,h};
  },[image,size]);

  function pointerToNorm(){
    const st=stageRef.current;
    const viewport=viewportRef.current;
    const p=st?.getPointerPosition();
    if(!st || !viewport || !p) return {x:0,y:0};

    // Always convert the CURRENT pointer through the inverse viewport transform.
    // Never trust a dragged Circle's local x/y, because Konva can update those
    // before React re-renders and that was the source of the "plan flies away" bug.
    const local=viewport.getAbsoluteTransform().copy().invert().point(p);
    return {
      x:clamp01((local.x-imgRect.x)/imgRect.w),
      y:clamp01((local.y-imgRect.y)/imgRect.h)
    };
  }

  function clampPan(next,atScale=scale){
    // Keep at least a visible strip of the canvas on screen. Pan can never throw
    // the whole plan outside the viewport.
    const keep=Math.min(90,Math.max(44,Math.min(size.w,size.h)*.10));
    const scaledW=size.w*atScale;
    const scaledH=size.h*atScale;
    return {
      x:Math.max(keep-scaledW,Math.min(size.w-keep,next.x)),
      y:Math.max(keep-scaledH,Math.min(size.h-keep,next.y))
    };
  }

  function addPoint(e){
    if(mode!=='draw' || panWasDragging.current) return;
    const kind=e.target?.getClassName?.();
    if(kind==='Circle') return;

    const raw=pointerToNorm();
    const force45=e?.evt?.shiftKey;
    const disableSnap=e?.evt?.altKey || e?.evt?.metaKey;
    const snapped=disableSnap
      ? raw
      : applySnap(raw,draft,{
          snapOrtho:snapOrtho || force45,
          snap45:snap45 || force45,
          snapVertices
        });

    setDraft(v=>[...v,snapped]);
  }

  async function savePolygon(){
    if(!selected) return alert('Selectează un apartament.');
    if(draft.length<3) return alert('Poligonul are nevoie de cel puțin 3 puncte.');

    setBusy(true);
    setNotice('');
    try{
      const saved=await api(`/admin/apartments/${selected.id}/polygon`,{
        method:'PUT',
        body:{points:draft}
      });

      if(!saved?.apartment_id){
        throw new Error('Serverul nu a confirmat salvarea poligonului.');
      }

      setNotice(`Salvat · ${draft.length} puncte`);
      await onChanged?.();
    }catch(e){
      setNotice('');
      alert(`Nu am putut salva poligonul: ${e.message}`);
    }finally{
      setBusy(false);
    }
  }

  function onWheel(e){
    e.evt.preventDefault();
    const st=stageRef.current;
    const pointer=st?.getPointerPosition();
    if(!pointer) return;

    const old=scale;
    const local={x:(pointer.x-pos.x)/old,y:(pointer.y-pos.y)/old};
    const next=Math.max(.5,Math.min(5,e.evt.deltaY>0?old/1.08:old*1.08));

    const nextPos=clampPan({
      x:pointer.x-local.x*next,
      y:pointer.y-local.y*next
    },next);

    setScale(next);
    setPos(nextPos);
  }

  function dragVertex(i,e){
    e.cancelBubble=true;

    const raw=pointerToNorm();
    const forceSnap=!!e?.evt?.shiftKey;
    const disableSnap=!!(e?.evt?.altKey || e?.evt?.metaKey);

    setDraft(v=>{
      const arr=[...v];

      // Editing is FREE by default. This is intentionally different from drawing.
      // Hold Shift (or enable "Snap edit") only when you actually want geometry snap.
      if(!snapEdit && !forceSnap){
        arr[i]=raw;
        return arr;
      }

      if(disableSnap){
        arr[i]=raw;
        return arr;
      }

      const neighbours=[];
      if(arr.length>1){
        neighbours.push(arr[(i-1+arr.length)%arr.length]);
        neighbours.push(arr[(i+1)%arr.length]);
      }

      // Pick the nearest neighbour as the temporary snap anchor.
      let anchor=neighbours[0]||null;
      if(neighbours.length===2){
        anchor=distance(raw,neighbours[0])<=distance(raw,neighbours[1])
          ? neighbours[0]
          : neighbours[1];
      }

      arr[i]=anchor
        ? applySnap(raw,[anchor],{
            snapOrtho:true,
            snap45:snap45 || forceSnap,
            snapVertices:false
          })
        : raw;

      return arr;
    });
  }

  function beginVertexDrag(e){
    vertexDragging.current=true;
    panWasDragging.current=false;
    e.cancelBubble=true;

    // Freeze viewport transform while editing a vertex.
    const viewport=viewportRef.current;
    if(viewport){
      viewport.stopDrag?.();
      viewport.draggable(false);
    }
  }

  function endVertexDrag(e){
    e.cancelBubble=true;

    // Re-read the final pointer once, rather than accepting a stale Konva node position.
    const st=stageRef.current;
    if(st && e?.evt)st.setPointersPositions(e.evt);

    vertexDragging.current=false;

    const viewport=viewportRef.current;
    if(viewport)viewport.draggable(mode==='pan');

    // Force the actual Konva handle back to the canonical React coordinate.
    requestAnimationFrame(()=>{
      const p=draft[e.target?.index];
      if(!p)return;
      e.target.position({
        x:imgRect.x+p.x*imgRect.w,
        y:imgRect.y+p.y*imgRect.h
      });
    });
  }


  return (
    <div className="polygon-workspace">
      <div className="polygon-toolbar">
        <div className="segmented">
          <button className={mode==='edit'?'active':''} onClick={()=>setMode('edit')}>Editează</button>
          <button className={mode==='draw'?'active':''} onClick={()=>{setMode('draw');setDraft([])}}>Desenează nou</button>
          <button className={mode==='pan'?'active':''} onClick={()=>setMode('pan')}>Pan</button>
        </div>

        <div className="segmented snap-controls">
          <button className={snapOrtho?'active':''} onClick={()=>setSnapOrtho(v=>!v)}>Snap 0/90°</button>
          <button className={snap45?'active':''} onClick={()=>setSnap45(v=>!v)}>45°</button>
          <button className={snapVertices?'active':''} onClick={()=>setSnapVertices(v=>!v)}>Vertices</button>
          <button className={snapEdit?'active':''} onClick={()=>setSnapEdit(v=>!v)}>Snap edit</button>
        </div>

        <button onClick={()=>setDraft(v=>v.slice(0,-1))}>Undo punct</button>
        <button onClick={()=>{setScale(1);setPos({x:0,y:0})}}>Încadrează planul</button>
        <button className="primary" disabled={busy||!selected} onClick={savePolygon}>
          {busy?'Salvez…':'Salvează poligon'}
        </button>

        {notice && <span className="save-notice">✓ {notice}</span>}
        <span className="zoom-label">{Math.round(scale*100)}%</span>
      </div>

      <div className="polygon-layout">
        <div className="apartment-palette">
          <h4>Apartamente</h4>
          {(floor?.apartments||[]).length===0 && <div className="empty-mini">Creează întâi apartamente pentru acest etaj.</div>}
          {(floor?.apartments||[]).map(a=>(
            <button
              key={a.id}
              className={'ap-row '+(selectedId===a.id?'selected':'')}
              onClick={()=>{setSelectedId(a.id);setMode('edit')}}
            >
              <span className={'status-dot '+a.status}/>
              <b>{a.code}</b>
              <small>{statusLabel[a.status]}</small>
            </button>
          ))}
        </div>

        <div className="stage-holder" ref={holder}>
          <Stage
            ref={stageRef}
            width={size.w}
            height={size.h}
            onWheel={onWheel}
            onClick={addPoint}
            onTap={addPoint}
          >
            <Layer>
              <Group
                ref={viewportRef}
                x={pos.x}
                y={pos.y}
                scaleX={scale}
                scaleY={scale}
                draggable={mode==='pan' && !vertexDragging.current}
                dragBoundFunc={p=>clampPan(p)}
                onDragStart={e=>{
                  if(vertexDragging.current){
                    e.target.stopDrag();
                    return;
                  }
                  panWasDragging.current=true;
                }}
                onDragMove={e=>{
                  if(vertexDragging.current){
                    e.target.stopDrag();
                    return;
                  }
                  const p=clampPan({x:e.target.x(),y:e.target.y()});
                  if(p.x!==e.target.x()||p.y!==e.target.y())e.target.position(p);
                }}
                onDragEnd={e=>{
                  if(vertexDragging.current)return;
                  // Stage-ul rămâne fix. Doar viewportul intern primește poziția finală.
                  const p=clampPan({x:e.target.x(),y:e.target.y()});
                  e.target.position(p);
                  setPos(p);
                  requestAnimationFrame(()=>{
                    panWasDragging.current=false;
                  });
                }}
              >
                <Rect width={size.w} height={size.h} fill="#e9edea"/>
                {image && <KImage image={image} x={imgRect.x} y={imgRect.y} width={imgRect.w} height={imgRect.h}/>}

              {(floor?.apartments||[]).filter(a=>a.id!==selectedId).map(a=>{
                const ps=polygonPoints(a);
                if(ps.length<3) return null;
                const arr=ps.flatMap(p=>[imgRect.x+p.x*imgRect.w,imgRect.y+p.y*imgRect.h]);
                return (
                  <Line
                    key={a.id}
                    points={arr}
                    closed
                    fill={a.status==='available'?'rgba(33,194,101,.20)':a.status==='reserved'?'rgba(236,164,45,.20)':'rgba(220,72,72,.20)'}
                    stroke="rgba(15,20,18,.45)"
                    strokeWidth={1/scale}
                  />
                );
              })}

              {draft.length>0 && <>
                <Line
                  points={draft.flatMap(p=>[imgRect.x+p.x*imgRect.w,imgRect.y+p.y*imgRect.h])}
                  closed={draft.length>=3}
                  fill="rgba(19,173,88,.26)"
                  stroke="#0e8f48"
                  strokeWidth={2/scale}
                />
                {draft.map((p,i)=>(
                  <Circle
                    key={i}
                    x={imgRect.x+p.x*imgRect.w}
                    y={imgRect.y+p.y*imgRect.h}
                    radius={6/scale}
                    fill="#fff"
                    stroke="#0a1811"
                    strokeWidth={1.5/scale}
                    draggable={mode==='edit'}
                    dragBoundFunc={p=>({
                      x:Math.max(imgRect.x,Math.min(imgRect.x+imgRect.w,p.x)),
                      y:Math.max(imgRect.y,Math.min(imgRect.y+imgRect.h,p.y))
                    })}
                    onMouseDown={e=>{e.cancelBubble=true}}
                    onTouchStart={e=>{e.cancelBubble=true}}
                    onDragStart={beginVertexDrag}
                    onDragMove={e=>dragVertex(i,e)}
                    onDragEnd={e=>{
                      e.cancelBubble=true;
                      vertexDragging.current=false;
                      const viewport=viewportRef.current;
                      if(viewport)viewport.draggable(mode==='pan');
                    }}
                  />
                ))}
              </>}

                {!image && <Text text="Încarcă planul etajului înainte de desenare" x={30} y={40} fontSize={18} fill="#55605b"/>}
              </Group>
            </Layer>
          </Stage>
        </div>
      </div>

      <p className="hint">
        La <b>Editează</b>, punctele se mișcă liber, exact unde le tragi. Snap-ul la editare este oprit implicit;
        îl activezi din <b>Snap edit</b> sau ții <b>Shift</b> temporar. La desenare rămân active 0/90°, 45° și lipirea pe vertex-uri.
        Punctele sunt limitate strict la suprafața planului, iar pan-ul este limitat astfel încât planul nu mai poate ieși complet din viewport.
      </p>
    </div>
  );
}
