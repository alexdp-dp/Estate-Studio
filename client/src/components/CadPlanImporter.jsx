import React,{useEffect,useMemo,useRef,useState} from 'react';
import {api} from '../api';
import {mapApartmentsFromCad} from '../cadTopology';

let librePromise=null;
let activeCadViewer=null;

function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}
function n(v,fallback=0){const x=Number.parseFloat(String(v??''));return Number.isFinite(x)?x:fallback}

async function getLibreDwg(){
  if(!librePromise){
    librePromise=(async()=>{
      const mod=await import('@mlightcad/libredwg-web');
      const instance=await mod.LibreDwg.create('/assets/');
      return {instance,Dwg_File_Type:mod.Dwg_File_Type};
    })();
  }
  return librePromise;
}

async function dwgToDxf(file,onStage){
  const {instance}=await getLibreDwg();
  const buffer=await file.arrayBuffer();
  onStage?.('Convertesc DWG → DXF pentru viewerul CAD real…');
  const out=instance.dwg_write_dxf(buffer);
  if(!out||!out.byteLength)throw new Error('LibreDWG nu a putut converti DWG-ul în DXF.');
  return out instanceof Uint8Array?out:new Uint8Array(out);
}

function arrayBufferOf(bytes){
  return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}

function normText(v){
  return String(v||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toUpperCase().trim();
}

function parsePoint(entity,xCode='10',yCode='20'){
  const x=n(entity.values.get(xCode)?.[0],NaN),y=n(entity.values.get(yCode)?.[0],NaN);
  return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
}

function valuesMap(pairs){
  const m=new Map();
  for(const [code,val] of pairs){
    const k=String(code);
    if(!m.has(k))m.set(k,[]);
    m.get(k).push(val);
  }
  return m;
}

function dxfPairs(text){
  const lines=text.replace(/\r/g,'').split('\n');
  const out=[];
  for(let i=0;i+1<lines.length;i+=2){
    const code=Number.parseInt(lines[i].trim(),10);
    if(!Number.isFinite(code))continue;
    out.push([code,lines[i+1]??'']);
  }
  return out;
}

function parseDxfDocument(bytes){
  const text=new TextDecoder('utf-8').decode(bytes);
  const pairs=dxfPairs(text);
  const blocks=new Map();
  const entities=[];

  let section='';
  let i=0;

  function readEntity(start){
    const type=String(pairs[start]?.[1]||'').trim().toUpperCase();
    const vals=[];
    let j=start+1;
    while(j<pairs.length && pairs[j][0]!==0){vals.push(pairs[j]);j++}
    return [{type,values:valuesMap(vals),pairs:vals},j];
  }

  while(i<pairs.length){
    const [code,valRaw]=pairs[i];
    const val=String(valRaw||'').trim();

    if(code===0&&val==='SECTION'){
      const next=pairs[i+1];
      section=next&&next[0]===2?String(next[1]).trim().toUpperCase():'';
      i+=2;continue;
    }
    if(code===0&&val==='ENDSEC'){section='';i++;continue}

    if(section==='BLOCKS'&&code===0&&val==='BLOCK'){
      const header=[];let j=i+1;
      while(j<pairs.length&&pairs[j][0]!==0){header.push(pairs[j]);j++}
      const hm=valuesMap(header);
      const name=String(hm.get('2')?.[0]||hm.get('3')?.[0]||'').trim();
      const base={x:n(hm.get('10')?.[0],0),y:n(hm.get('20')?.[0],0)};
      const list=[];
      while(j<pairs.length){
        if(pairs[j][0]===0&&String(pairs[j][1]).trim().toUpperCase()==='ENDBLK'){
          j++;while(j<pairs.length&&pairs[j][0]!==0)j++;break;
        }
        if(pairs[j][0]===0){
          const [e,next]=readEntity(j);list.push(e);j=next;
        }else j++;
      }
      if(name)blocks.set(name,{name,base,entities:list});
      i=j;continue;
    }

    if(section==='ENTITIES'&&code===0){
      const [e,next]=readEntity(i);entities.push(e);i=next;continue;
    }
    i++;
  }

  return {entities,blocks};
}

function transformPoint(p,t){
  const sx=t.sx??1,sy=t.sy??1,rot=t.rot??0;
  const ox=(p.x-(t.baseX||0))*sx,oy=(p.y-(t.baseY||0))*sy;
  const c=Math.cos(rot),s=Math.sin(rot);
  return {x:(t.tx||0)+ox*c-oy*s,y:(t.ty||0)+ox*s+oy*c};
}

function composeTransform(parent,local){
  // Good enough for 2D architectural blocks; handles translation/scale/rotation recursively.
  const origin=transformPoint({x:local.tx||0,y:local.ty||0},parent);
  return {
    tx:origin.x,ty:origin.y,
    sx:(parent.sx??1)*(local.sx??1),
    sy:(parent.sy??1)*(local.sy??1),
    rot:(parent.rot??0)+(local.rot??0),
    baseX:local.baseX||0,baseY:local.baseY||0
  };
}

function sampleArc(center,r,startDeg,endDeg,transform,push){
  if(!center||!Number.isFinite(r)||r<=0)return;
  let a0=startDeg*Math.PI/180,a1=endDeg*Math.PI/180;
  while(a1<a0)a1+=Math.PI*2;
  const sweep=Math.min(Math.PI*2,a1-a0);
  const steps=Math.max(5,Math.min(28,Math.ceil(sweep/(Math.PI/24))));
  let prev=null;
  for(let i=0;i<=steps;i++){
    const a=a0+sweep*i/steps;
    const p=transformPoint({x:center.x+r*Math.cos(a),y:center.y+r*Math.sin(a)},transform);
    if(prev)push(prev,p);
    prev=p;
  }
}

function collectCadGeometry(doc,cropWorld){
  const segments=[];const texts=[];const doors=[];
  const xmin=cropWorld.minX,ymin=cropWorld.minY,xmax=cropWorld.maxX,ymax=cropWorld.maxY;
  const cw=Math.max(1e-9,xmax-xmin),ch=Math.max(1e-9,ymax-ymin);

  const layerFurniture=/MOB|FURN|SANIT|ECHIP|EQUIP|COTE|DIM|TEXT|AXE|GRID|HATCH|VEG|PLANT|CAR|AUTO/i;
  const layerDoor=/USA|USI|DOOR|TAMPL|JOINERY|CARP/i;

  function normalize(p){return {x:(p.x-xmin)/cw,y:1-(p.y-ymin)/ch}}
  function inside(p,margin=.05){return p.x>=xmin-cw*margin&&p.x<=xmax+cw*margin&&p.y>=ymin-ch*margin&&p.y<=ymax+ch*margin}
  function pushLine(a,b,layer=''){
    if(!a||!b)return;
    if(!inside(a)&&!inside(b))return;
    const A=normalize(a),B=normalize(b);
    const len=Math.hypot(B.x-A.x,B.y-A.y);
    if(len<.00003)return;
    segments.push([clamp(A.x,-.08,1.08),clamp(A.y,-.08,1.08),clamp(B.x,-.08,1.08),clamp(B.y,-.08,1.08),String(layer||'')]);
  }
  function pushText(p,text,layer=''){
    if(!p||!inside(p,.02)||!String(text||'').trim())return;
    const q=normalize(p);texts.push({text:String(text).trim(),x:clamp(q.x),y:clamp(q.y),layer:String(layer||'')});
  }
  function pushDoor(center,r,layer,start,end){
    if(!center||!inside(center,.06))return;
    const q=normalize(center);
    doors.push({x:clamp(q.x),y:clamp(q.y),rx:Math.abs(r/cw),ry:Math.abs(r/ch),layer:String(layer||''),start,end});
  }

  function walk(entity,transform={tx:0,ty:0,sx:1,sy:1,rot:0,baseX:0,baseY:0},depth=0){
    if(depth>8||!entity)return;
    const type=entity.type;
    const v=entity.values;
    const layer=String(v.get('8')?.[0]||'');

    if(type==='LINE'){
      const a=parsePoint(entity,'10','20'),b=parsePoint(entity,'11','21');
      if(a&&b)pushLine(transformPoint(a,transform),transformPoint(b,transform),layer);
      return;
    }

    if(type==='LWPOLYLINE'){
      const xs=v.get('10')||[],ys=v.get('20')||[];
      const pts=[];
      for(let k=0;k<Math.min(xs.length,ys.length);k++)pts.push(transformPoint({x:n(xs[k]),y:n(ys[k])},transform));
      for(let k=0;k<pts.length-1;k++)pushLine(pts[k],pts[k+1],layer);
      const flags=n(v.get('70')?.[0],0);
      if((flags&1)&&pts.length>2)pushLine(pts[pts.length-1],pts[0],layer);
      return;
    }

    if(type==='POLYLINE'){
      // LibreDWG DXF usually serializes child VERTEX entities separately; if vertices are embedded, accept them.
      const xs=v.get('10')||[],ys=v.get('20')||[];
      const pts=[];
      for(let k=0;k<Math.min(xs.length,ys.length);k++)pts.push(transformPoint({x:n(xs[k]),y:n(ys[k])},transform));
      for(let k=0;k<pts.length-1;k++)pushLine(pts[k],pts[k+1],layer);
      return;
    }

    if(type==='ARC'){
      const center=parsePoint(entity,'10','20'),r=n(v.get('40')?.[0],NaN);
      const a0=n(v.get('50')?.[0],0),a1=n(v.get('51')?.[0],90);
      if(center&&Number.isFinite(r)){
        sampleArc(center,r,a0,a1,transform,(a,b)=>pushLine(a,b,layer));
        const span=((a1-a0+360)%360)||360;
        const c=transformPoint(center,transform);
        if(layerDoor.test(layer)||(span>=55&&span<=125))pushDoor(c,r*Math.max(Math.abs(transform.sx||1),Math.abs(transform.sy||1)),layer,a0,a1);
      }
      return;
    }

    if(type==='CIRCLE'){
      const center=parsePoint(entity,'10','20'),r=n(v.get('40')?.[0],NaN);
      if(center&&Number.isFinite(r)&&!layerFurniture.test(layer))sampleArc(center,r,0,360,transform,(a,b)=>pushLine(a,b,layer));
      return;
    }

    if(type==='TEXT'||type==='MTEXT'||type==='ATTRIB'||type==='ATTDEF'){
      const p=parsePoint(entity,'10','20');
      const text=(v.get('1')||[]).concat(v.get('3')||[]).join(' ');
      if(p)pushText(transformPoint(p,transform),text,layer);
      return;
    }

    if(type==='INSERT'){
      const name=String(v.get('2')?.[0]||'').trim();
      const p=parsePoint(entity,'10','20')||{x:0,y:0};
      const block=doc.blocks.get(name);
      if(!block)return;
      const local={
        tx:p.x,ty:p.y,
        sx:n(v.get('41')?.[0],1),sy:n(v.get('42')?.[0],1),
        rot:n(v.get('50')?.[0],0)*Math.PI/180,
        baseX:block.base.x,baseY:block.base.y
      };
      const composed=composeTransform(transform,local);
      for(const child of block.entities)walk(child,composed,depth+1);
      return;
    }

    if(type==='SOLID'||type==='TRACE'||type==='3DFACE'){
      const pts=[];
      for(const c of [['10','20'],['11','21'],['12','22'],['13','23']]){
        const p=parsePoint(entity,c[0],c[1]);if(p)pts.push(transformPoint(p,transform));
      }
      for(let k=0;k<pts.length;k++)pushLine(pts[k],pts[(k+1)%pts.length],layer);
    }
  }

  for(const e of doc.entities)walk(e);

  // Remove obvious furniture-only layers only from mapping linework, not from viewer.
  const cleanSegments=segments.filter(s=>!layerFurniture.test(String(s[4]||'')));
  return {segments:cleanSegments,texts,doors,entityCount:doc.entities.length};
}

function makePlanSvg(geometry,width=2000){
  const segs=geometry.segments||[],texts=geometry.texts||[];
  let maxY=1;
  const height=Math.max(600,Math.round(width/maxY));
  const lines=segs.slice(0,45000).map(s=>`<line x1="${s[0]*width}" y1="${s[1]*height}" x2="${s[2]*width}" y2="${s[3]*height}"/>`).join('');
  const labels=texts.slice(0,5000).map(t=>`<text x="${t.x*width}" y="${t.y*height}">${String(t.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</text>`).join('');
  return {text:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none"><rect width="100%" height="100%" fill="white"/><g fill="none" stroke="#222" stroke-width="1.2" vector-effect="non-scaling-stroke">${lines}</g><g fill="#444" font-family="Arial,sans-serif" font-size="9">${labels}</g></svg>`,width,height};
}

function CadTrueViewer({dxfBytes,onReady,onError}){
  const hostRef=useRef(null);

  useEffect(()=>{
    let dead=false;
    let localManager=null;

    (async()=>{
      try{
        const {AcApDocManager}=await import('@mlightcad/cad-simple-viewer');
        if(activeCadViewer){
          try{activeCadViewer.destroy?.()}catch{}
          activeCadViewer=null;
        }

        const created=AcApDocManager.createInstance({
          container:hostRef.current,
          baseUrl:'/',
          webworkerFileUrls:{mtextRender:'/assets/mtext-renderer-worker.js'}
        });
        localManager=created||AcApDocManager.instance;
        activeCadViewer=localManager;

        const ok=await localManager.openDocument('estate-studio-preview.dxf',arrayBufferOf(dxfBytes),{
          minimumChunkSize:1200,
          readOnly:true
        });
        if(!ok)throw new Error('Viewerul CAD nu a putut deschide DXF-ul intermediar.');
        if(dead)return;

        try{localManager.curView.backgroundColor=0xffffff}catch{}
        try{localManager.curView.zoomToFitDrawing(12000)}catch{}
        setTimeout(()=>{if(!dead)onReady?.(localManager)},350);
      }catch(e){
        console.error(e);if(!dead)onError?.(e);
      }
    })();

    return ()=>{
      dead=true;
      if(localManager&&activeCadViewer===localManager){
        try{localManager.destroy?.()}catch{}
        activeCadViewer=null;
      }
    };
  },[dxfBytes]);

  return <div ref={hostRef} className="cad-true-viewer"/>;
}

function bboxValues(box){
  const min=box?.minPoint||box?.min||{};
  const max=box?.maxPoint||box?.max||{};
  return {
    minX:n(min.x,0),minY:n(min.y,0),
    maxX:n(max.x,1),maxY:n(max.y,1)
  };
}

function normalizeWorldCrop(crop,bbox){
  const b=bboxValues(bbox);
  const w=Math.max(1e-9,b.maxX-b.minX),h=Math.max(1e-9,b.maxY-b.minY);
  return {
    x:clamp((crop.minX-b.minX)/w),
    y:clamp((b.maxY-crop.maxY)/h),
    w:clamp((crop.maxX-crop.minX)/w,.002,1),
    h:clamp((crop.maxY-crop.minY)/h,.002,1)
  };
}

export default function CadPlanImporter({project,building,floor,onClose,onImported}){
  const [file,setFile]=useState(null);
  const [busy,setBusy]=useState(false);
  const [stage,setStage]=useState('');
  const [error,setError]=useState('');
  const [prepared,setPrepared]=useState(null);
  const [viewer,setViewer]=useState(null);
  const [viewerBbox,setViewerBbox]=useState(null);
  const [cropWorld,setCropWorld]=useState(null);
  const [screenCrop,setScreenCrop]=useState(null);
  const [dragStart,setDragStart]=useState(null);
  const [selecting,setSelecting]=useState(false);
  const [geometry,setGeometry]=useState(null);
  const [mapping,setMapping]=useState(null);
  const [mapPreview,setMapPreview]=useState('');
  const [showWalls,setShowWalls]=useState(false);

  const sourceName=useMemo(()=>floor?.settings?.cad?.source_file||null,[floor?.settings]);

  function cleanupPreview(){if(mapPreview){try{URL.revokeObjectURL(mapPreview)}catch{}setMapPreview('')}}

  async function prepareCad(){
    if(!file)return;
    setBusy(true);setError('');setStage('');cleanupPreview();
    try{
      if(!/\.dwg$/i.test(file.name))throw new Error('Alege un fișier .DWG.');
      const dxfBytes=await dwgToDxf(file,setStage);
      setPrepared({dxfBytes});
      setSelecting(false);setCropWorld(null);setScreenCrop(null);setGeometry(null);setMapping(null);
      setStage('Viewer CAD real pregătit. Poți face zoom/pan și apoi selecta planul etajului.');
    }catch(e){console.error(e);setError(e.message||String(e));setStage('')}
    finally{setBusy(false)}
  }

  function viewerReady(mgr){
    setViewer(mgr);
    const b=mgr?.curView?.bbox;
    setViewerBbox(b||null);
    setStage('DWG afișat prin renderer CAD. Folosește zoom/pan, apoi „Selectează etajul”.');
  }

  function localPoint(e){
    const r=e.currentTarget.getBoundingClientRect();
    return {x:e.clientX-r.left,y:e.clientY-r.top,w:r.width,h:r.height};
  }

  function startCrop(e){
    if(!selecting||!viewer)return;
    e.preventDefault();e.stopPropagation();
    const p=localPoint(e);
    const world=viewer.curView.screenToWorld({x:p.x,y:p.y});
    setDragStart({screen:p,world});
    setScreenCrop({x:p.x,y:p.y,w:1,h:1});
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function moveCrop(e){
    if(!selecting||!dragStart||!viewer)return;
    e.preventDefault();e.stopPropagation();
    const p=localPoint(e);
    setScreenCrop({x:Math.min(dragStart.screen.x,p.x),y:Math.min(dragStart.screen.y,p.y),w:Math.abs(p.x-dragStart.screen.x),h:Math.abs(p.y-dragStart.screen.y)});
  }

  function endCrop(e){
    if(!selecting||!dragStart||!viewer)return;
    e.preventDefault();e.stopPropagation();
    const p=localPoint(e);
    const world=viewer.curView.screenToWorld({x:p.x,y:p.y});
    const c={
      minX:Math.min(dragStart.world.x,world.x),maxX:Math.max(dragStart.world.x,world.x),
      minY:Math.min(dragStart.world.y,world.y),maxY:Math.max(dragStart.world.y,world.y)
    };
    setCropWorld(c);setDragStart(null);setSelecting(false);setGeometry(null);setMapping(null);cleanupPreview();
    try{e.currentTarget.releasePointerCapture?.(e.pointerId)}catch{}
    setStage('Etaj selectat. Acum pot grupa camerele în apartamente folosind ușile și holul comun.');
  }

  function useWholeDrawing(){
    if(!viewer?.curView?.bbox)return;
    const b=bboxValues(viewer.curView.bbox);
    setCropWorld(b);setScreenCrop(null);setSelecting(false);setGeometry(null);setMapping(null);cleanupPreview();
    setStage('Folosesc întreg desenul ca plan de etaj.');
  }

  async function analyze(){
    if(!prepared||!cropWorld)return;
    setBusy(true);setError('');setMapping(null);cleanupPreview();
    try{
      setStage('Citesc DXF-ul și expandez blocurile/INSERT-urile…');
      const doc=parseDxfDocument(prepared.dxfBytes);
      const g=collectCadGeometry(doc,cropWorld);
      if(!g.segments.length)throw new Error('Nu am găsit suficient linework CAD în selecție.');

      const aspect=Math.max(.2,Math.min(5,(cropWorld.maxX-cropWorld.minX)/Math.max(1e-9,cropWorld.maxY-cropWorld.minY)));
      setStage('Grupez camerele prin uși și elimin holul comun…');
      const mapped=mapApartmentsFromCad(g.segments,g.texts,aspect,g.doors);
      setGeometry(g);setMapping(mapped);

      const plan=makePlanSvg(g,2000);
      const url=URL.createObjectURL(new Blob([plan.text],{type:'image/svg+xml'}));
      setMapPreview(url);

      setStage(mapped.detections.length?`Mapare: ${mapped.detections.length} apartamente propuse.`:'Nu am reușit încă să formez apartamente complete.');
    }catch(e){console.error(e);setError(e.message||String(e));setStage('')}
    finally{setBusy(false)}
  }

  async function save(){
    if(!file||!prepared||!cropWorld||!geometry)return;
    setBusy(true);setError('');
    try{
      const plan=makePlanSvg(geometry,2000);
      setStage('Salvez DWG-ul original…');
      const rawFd=new FormData();
      rawFd.append('file',file);rawFd.append('project_id',project.id);rawFd.append('building_id',building.id);rawFd.append('floor_id',floor.id);
      rawFd.append('asset_type','floor-cad-source');rawFd.append('label',`${floor.name} · DWG sursă`);
      const raw=await api('/admin/upload/project-documents',{method:'POST',body:rawFd});

      setStage('Salvez planul vectorial reconstruit din DXF…');
      const svgFile=new File([plan.text],file.name.replace(/\.dwg$/i,'')+`-${floor.id}.svg`,{type:'image/svg+xml'});
      const fd=new FormData();
      fd.append('file',svgFile);fd.append('project_id',project.id);fd.append('building_id',building.id);fd.append('floor_id',floor.id);
      fd.append('asset_type','floor-plan-cad-svg');fd.append('label',`${floor.name} · plan CAD`);
      const preview=await api('/admin/upload/floor-plans',{method:'POST',body:fd});

      const settings={...(floor.settings||{}),cad:{
        version:'04.2.0',source_file:file.name,source_bucket:raw.bucket,source_path:raw.path,
        crop_world:[cropWorld.minX,cropWorld.minY,cropWorld.maxX,cropWorld.maxY],
        segments:geometry.segments,texts:geometry.texts,door_hints:geometry.doors,
        segment_count:geometry.segments.length,map_debug:mapping?.debug||null,imported_at:new Date().toISOString()
      }};

      await api(`/admin/floors/${floor.id}`,{method:'PATCH',body:{plan_path:preview.url,plan_width:plan.width,plan_height:plan.height,settings}});

      if(mapping?.detections?.length){
        setStage(`Salvez ${mapping.detections.length} apartamente și poligoanele lor…`);
        await api(`/admin/floors/${floor.id}/cad-map`,{method:'POST',body:{apartments:mapping.detections.map(d=>({code:d.code,points:d.points,room_count:d.roomCount||0}))}});
      }

      setStage('Plan CAD și poligoane salvate.');
      await onImported?.();
      setTimeout(()=>onClose?.(),450);
    }catch(e){console.error(e);setError(e.message||String(e));setStage('')}
    finally{setBusy(false)}
  }

  const normCrop=cropWorld&&viewerBbox?normalizeWorldCrop(cropWorld,viewerBbox):null;

  return <div className="modal">
    <div className="modal-card cad-import-modal cad-crop-modal cad-real-modal">
      <button className="x" onClick={onClose} disabled={busy}>×</button>
      <small className="kicker">CAD FLOOR WORKFLOW · REAL DXF VIEWER</small>
      <h2>{prepared?'Selectează etajul și mapează apartamentele':'Importă DWG'}</h2>

      {!prepared&&<>
        <p>DWG-ul este convertit intern în DXF și afișat cu un renderer CAD adevărat, nu cu vechiul SVG LibreDWG. Asta păstrează mult mai bine pereții, blocurile, hatch-urile și planurile mari.</p>
        {sourceName&&<div className="cad-current"><b>Plan CAD actual</b><span>{sourceName}</span></div>}
        <label className="cad-drop">
          <input type="file" accept=".dwg" onChange={e=>{setFile(e.target.files?.[0]||null);setError('')}}/>
          <b>{file?file.name:'Alege fișierul .DWG'}</b>
          <span>{file?`${(file.size/1024/1024).toFixed(1)} MB`:'DWG 2D · un plan sau o planșă mare'}</span>
        </label>
      </>}

      {prepared&&<>
        <div className="cad-real-toolbar">
          <button onClick={()=>{try{viewer?.curView?.zoomToFitDrawing?.(10000)}catch{}}}>Încadrează tot</button>
          <button className={selecting?'active primary':''} onClick={()=>{setSelecting(v=>!v);setScreenCrop(null);setDragStart(null)}}>{selecting?'Trage dreptunghiul…':'Selectează etajul'}</button>
          <button onClick={useWholeDrawing}>Folosește tot desenul</button>
        </div>

        <div className="cad-real-shell">
          <CadTrueViewer dxfBytes={prepared.dxfBytes} onReady={viewerReady} onError={e=>setError(e.message||String(e))}/>
          <div className={`cad-world-crop-layer ${selecting?'active':''}`} onPointerDown={startCrop} onPointerMove={moveCrop} onPointerUp={endCrop} onPointerCancel={endCrop}>
            {screenCrop&&<div className="cad-screen-crop" style={{left:screenCrop.x,top:screenCrop.y,width:screenCrop.w,height:screenCrop.h}}><span>ETAJ SELECTAT</span></div>}
          </div>
        </div>

        <div className="cad-selection-info">
          {normCrop?<><span>X {Math.round(normCrop.x*100)}%</span><span>Y {Math.round(normCrop.y*100)}%</span><span>W {Math.round(normCrop.w*100)}%</span><span>H {Math.round(normCrop.h*100)}%</span></>:<span>Nicio zonă selectată încă</span>}
        </div>

        <div className="cad-map-actions">
          <button className="primary" onClick={analyze} disabled={!cropWorld||busy}>{busy?'Analizez…':'Mapează apartamentele'}</button>
          {mapping&&<button className={showWalls?'active':''} onClick={()=>setShowWalls(v=>!v)}>{showWalls?'Ascunde linework':'Arată linework CAD'}</button>}
        </div>

        {mapping&&<div className="cad-map-report">
          <b>{mapping.detections.length} apartamente propuse</b>
          <span>{mapping.debug.structuralSegments} segmente structurale</span>
          <span>{mapping.debug.rooms} camere</span>
          <span>{mapping.debug.doors} conexiuni</span>
          <span>{mapping.debug.doorHints||0} uși din arce CAD</span>
          <span>{mapping.debug.commonIds.length} zone comune</span>
        </div>}

        {mapPreview&&<div className="cad-result-preview">
          <img src={mapPreview} alt="Plan CAD reconstruit"/>
          {mapping&&<svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
            {showWalls&&(geometry?.segments||[]).slice(0,12000).map((s,i)=><line key={'s'+i} x1={s[0]*1000} y1={s[1]*1000} x2={s[2]*1000} y2={s[3]*1000} className="cad-wall-debug"/>)}
            {mapping.detections.map((d,i)=><g key={'d'+i}><polygon points={d.points.map(p=>`${p.x*1000},${p.y*1000}`).join(' ')} className="cad-apartment-map"/><text x={d.cx*1000} y={d.cy*1000} className="cad-apartment-label">{d.code}</text></g>)}
          </svg>}
        </div>}
      </>}

      {stage&&<div className="info-box">{stage}</div>}
      {error&&<div className="error-box">{error}</div>}

      <div className="modal-actions">
        {prepared?<><button onClick={()=>{setPrepared(null);setViewer(null);setCropWorld(null);setGeometry(null);setMapping(null);cleanupPreview()}} disabled={busy}>← Alt DWG</button><button className="primary" onClick={save} disabled={busy||!geometry}>{busy?'Salvez…':mapping?.detections?.length?`Salvează ${mapping.detections.length} apartamente`:'Salvează planul'}</button></>:<><button onClick={onClose} disabled={busy}>Renunță</button><button className="primary" onClick={prepareCad} disabled={!file||busy}>{busy?'Pregătesc…':'Deschide DWG-ul'}</button></>}
      </div>

      <small className="cad-license-note">Viewerul deschide DXF-ul intermediar folosind renderer CAD. Maparea folosește LINE/LWPOLYLINE/ARC/INSERT/TEXT din DXF; arcele de ușă sunt folosite explicit pentru a lega camerele aceluiași apartament.</small>
    </div>
  </div>;
}
