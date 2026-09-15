import React,{useMemo,useState} from 'react';
import {api} from '../api';
import {mapApartmentsFromCad} from '../cadTopology';

let librePromise=null;

function n(v,fallback=0){
  const x=Number.parseFloat(String(v??''));
  return Number.isFinite(x)?x:fallback;
}

function round6(v){
  return Math.round(v*1e6)/1e6;
}

function svgDimensions(svg){
  const vb=svg.viewBox?.baseVal;
  if(vb && vb.width>0 && vb.height>0){
    return {x:vb.x,y:vb.y,width:vb.width,height:vb.height};
  }

  const width=n(svg.getAttribute('width'),1000);
  const height=n(svg.getAttribute('height'),700);
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  return {x:0,y:0,width,height};
}

function normalizeSvg(svgInput){
  // LibreDWG normally returns a string, but depending on the wrapper/browser build
  // it can also surface a typed array. Normalize that first.
  let raw=typeof svgInput==='string'
    ? svgInput
    : svgInput instanceof Uint8Array
      ? new TextDecoder('utf-8').decode(svgInput)
      : svgInput?.buffer instanceof ArrayBuffer
        ? new TextDecoder('utf-8').decode(new Uint8Array(svgInput.buffer))
        : String(svgInput??'');

  // Some real-world DWGs contain text/control bytes that make an otherwise usable
  // SVG fail strict XML parsing. Keep only the SVG document and sanitize characters
  // that XML 1.0 cannot represent.
  raw=raw
    .replace(/^\uFEFF/,'')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');

  const start=raw.search(/<svg\b/i);
  const closeMatches=[...raw.matchAll(/<\/svg\s*>/ig)];
  const end=closeMatches.length
    ? closeMatches[closeMatches.length-1].index + closeMatches[closeMatches.length-1][0].length
    : -1;

  if(start<0){
    throw new Error('LibreDWG a citit fișierul, dar nu a produs niciun element <svg>.');
  }

  if(end>start)raw=raw.slice(start,end);
  else raw=raw.slice(start);

  // Bare ampersands are common in CAD text like "A&B" and invalidate XML.
  raw=raw.replace(
    /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi,
    '&amp;'
  );

  const parser=new DOMParser();
  let doc=parser.parseFromString(raw,'image/svg+xml');
  let svg=doc.documentElement;
  let parseError=doc.querySelector('parsererror');

  if(parseError || svg?.tagName?.toLowerCase()!=='svg'){
    // Fallback: the HTML parser is deliberately tolerant of malformed CAD text/
    // attributes. Once the SVG DOM exists, serialize it back to clean XML.
    const htmlDoc=parser.parseFromString(
      `<!doctype html><html><body>${raw}</body></html>`,
      'text/html'
    );
    const tolerantSvg=htmlDoc.querySelector('svg');

    if(!tolerantSvg){
      const detail=(parseError?.textContent||'').replace(/\s+/g,' ').trim().slice(0,180);
      throw new Error(
        `SVG-ul LibreDWG este invalid și nu a putut fi reparat${detail?`: ${detail}`:''}.`
      );
    }

    const cleanDoc=document.implementation.createDocument(
      'http://www.w3.org/2000/svg',
      'svg',
      null
    );
    const imported=cleanDoc.importNode(tolerantSvg,true);
    cleanDoc.replaceChild(imported,cleanDoc.documentElement);

    doc=cleanDoc;
    svg=doc.documentElement;
  }

  // Remove executable/foreign content. We only need vector drawing geometry.
  svg.querySelectorAll('script,foreignObject').forEach(el=>el.remove());

  const vb=svgDimensions(svg);

  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  svg.setAttribute('width',String(vb.width));
  svg.setAttribute('height',String(vb.height));
  svg.setAttribute('preserveAspectRatio','xMidYMid meet');

  // A white background makes the technical drawing predictable in both admin and embed.
  const bg=doc.createElementNS('http://www.w3.org/2000/svg','rect');
  bg.setAttribute('x',String(vb.x));
  bg.setAttribute('y',String(vb.y));
  bg.setAttribute('width',String(vb.width));
  bg.setAttribute('height',String(vb.height));
  bg.setAttribute('fill','#ffffff');
  bg.setAttribute('data-estate-studio-background','1');
  svg.insertBefore(bg,svg.firstChild);

  const serialized=new XMLSerializer().serializeToString(svg);

  // Final validation after the tolerant repair path. If this parses, the SVG is safe
  // to upload and to feed to the segment extractor.
  const verify=parser.parseFromString(serialized,'image/svg+xml');
  const verifyError=verify.querySelector('parsererror');

  if(verifyError){
    const detail=(verifyError.textContent||'').replace(/\s+/g,' ').trim().slice(0,180);
    throw new Error(`SVG-ul reparat nu este XML valid${detail?`: ${detail}`:''}.`);
  }

  return {
    svg:verify.documentElement,
    viewBox:vb,
    text:serialized
  };
}

function dedupeSegments(segments,max=14000){
  const seen=new Set(),out=[];

  function key(s){
    const a=[round6(s[0]),round6(s[1])];
    const b=[round6(s[2]),round6(s[3])];
    const first=(a[0]<b[0] || (a[0]===b[0]&&a[1]<=b[1]))?a:b;
    const second=first===a?b:a;
    return `${first[0]},${first[1]}:${second[0]},${second[1]}`;
  }

  for(const s of segments){
    if(out.length>=max)break;
    if(!s.every(Number.isFinite))continue;
    if(Math.hypot(s[2]-s[0],s[3]-s[1])<.00004)continue;

    const k=key(s);
    if(seen.has(k))continue;
    seen.add(k);
    out.push(s.map(round6));
  }

  return out;
}

function clipSegmentToCrop(a,b,crop){
  const xMin=crop.x,yMin=crop.y;
  const xMax=crop.x+crop.w,yMax=crop.y+crop.h;
  let t0=0,t1=1;
  const dx=b.x-a.x,dy=b.y-a.y;

  const tests=[
    [-dx,a.x-xMin],
    [ dx,xMax-a.x],
    [-dy,a.y-yMin],
    [ dy,yMax-a.y]
  ];

  for(const [p,q] of tests){
    if(Math.abs(p)<1e-12){
      if(q<0)return null;
      continue;
    }
    const r=q/p;
    if(p<0){
      if(r>t1)return null;
      if(r>t0)t0=r;
    }else{
      if(r<t0)return null;
      if(r<t1)t1=r;
    }
  }

  const p0={x:a.x+t0*dx,y:a.y+t0*dy};
  const p1={x:a.x+t1*dx,y:a.y+t1*dy};
  return [p0,p1];
}

function normalizeCrop(crop){
  const x=Math.max(0,Math.min(.9999,Number(crop?.x)||0));
  const y=Math.max(0,Math.min(.9999,Number(crop?.y)||0));
  const w=Math.max(.002,Math.min(1-x,Number(crop?.w)||1));
  const h=Math.max(.002,Math.min(1-y,Number(crop?.h)||1));
  return {x,y,w,h};
}

function cropSvgDocument(svgText,crop){
  const c=normalizeCrop(crop);
  const parser=new DOMParser();
  const doc=parser.parseFromString(svgText,'image/svg+xml');
  const svg=doc.documentElement;
  const vb=svgDimensions(svg);

  const next={
    x:vb.x+c.x*vb.width,
    y:vb.y+c.y*vb.height,
    width:c.w*vb.width,
    height:c.h*vb.height
  };

  svg.setAttribute('viewBox',`${next.x} ${next.y} ${next.width} ${next.height}`);

  // Keep browser/storage dimensions small integers. Real CAD coordinates stay in settings.
  const previewWidth=2000;
  const previewHeight=Math.max(1,Math.round(previewWidth*(next.height/next.width)));
  svg.setAttribute('width',String(previewWidth));
  svg.setAttribute('height',String(previewHeight));
  svg.setAttribute('preserveAspectRatio','xMidYMid meet');

  return {
    text:new XMLSerializer().serializeToString(svg),
    originalViewBox:vb,
    cropViewBox:next,
    previewWidth,
    previewHeight,
    crop:c
  };
}


async function extractCadSegments(svgText,crop={x:0,y:0,w:1,h:1}){
  const parser=new DOMParser();
  const doc=parser.parseFromString(svgText,'image/svg+xml');
  const svg=doc.documentElement;
  const vb=svgDimensions(svg);

  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-100000px;top:0;width:1200px;height:900px;visibility:hidden;pointer-events:none;';
  document.body.appendChild(host);

  const liveSvg=document.importNode(svg,true);
  liveSvg.style.width='1200px';
  liveSvg.style.height='900px';
  host.appendChild(liveSvg);

  // Let the browser compute transforms / path metrics.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

  const rootScreen=liveSvg.getScreenCTM();
  if(!rootScreen){
    host.remove();
    return {segments:[],entityCount:0};
  }
  const rootInv=rootScreen.inverse();

  function rootPoint(el,x,y){
    const m=el.getScreenCTM();
    if(!m)return null;
    const screen=new DOMPoint(x,y).matrixTransform(m);
    const p=screen.matrixTransform(rootInv);
    return {
      x:(p.x-vb.x)/vb.width,
      y:(p.y-vb.y)/vb.height
    };
  }

  const segments=[];
  const texts=[];
  let entityCount=0;

  const activeCrop=normalizeCrop(crop);

  function push(a,b){
    if(!a||!b)return;

    const clipped=clipSegmentToCrop(a,b,activeCrop);
    if(!clipped)return;

    const [p0,p1]=clipped;

    // Re-normalize selected CAD geometry to the cropped plan (0..1).
    const ax=(p0.x-activeCrop.x)/activeCrop.w;
    const ay=(p0.y-activeCrop.y)/activeCrop.h;
    const bx=(p1.x-activeCrop.x)/activeCrop.w;
    const by=(p1.y-activeCrop.y)/activeCrop.h;

    segments.push([
      Math.max(0,Math.min(1,ax)),
      Math.max(0,Math.min(1,ay)),
      Math.max(0,Math.min(1,bx)),
      Math.max(0,Math.min(1,by))
    ]);
  }

  const elements=[...liveSvg.querySelectorAll('line,polyline,polygon,rect,path,circle,ellipse,text')];

  for(const el of elements){
    if(el.getAttribute('data-estate-studio-background')==='1')continue;
    entityCount++;

    const tag=el.tagName.toLowerCase();

    try{
      if(tag==='line'){
        push(
          rootPoint(el,n(el.getAttribute('x1')),n(el.getAttribute('y1'))),
          rootPoint(el,n(el.getAttribute('x2')),n(el.getAttribute('y2')))
        );
        continue;
      }

      if(tag==='rect'){
        const x=n(el.getAttribute('x')),y=n(el.getAttribute('y'));
        const w=n(el.getAttribute('width')),h=n(el.getAttribute('height'));
        const pts=[
          rootPoint(el,x,y),
          rootPoint(el,x+w,y),
          rootPoint(el,x+w,y+h),
          rootPoint(el,x,y+h)
        ];
        for(let i=0;i<4;i++)push(pts[i],pts[(i+1)%4]);
        continue;
      }

      if(tag==='polyline'||tag==='polygon'){
        const pts=[...(el.points||[])].map(p=>rootPoint(el,p.x,p.y)).filter(Boolean);
        for(let i=0;i<pts.length-1;i++)push(pts[i],pts[i+1]);
        if(tag==='polygon'&&pts.length>2)push(pts[pts.length-1],pts[0]);
        continue;
      }

      if(tag==='text'){
        const box=el.getBBox?.();
        if(box){
          const p=rootPoint(el,box.x+box.width/2,box.y+box.height/2);
          if(p){
            texts.push({
              text:String(el.textContent||'').trim(),
              x:(p.x-activeCrop.x)/activeCrop.w,
              y:(p.y-activeCrop.y)/activeCrop.h
            });
          }
        }
        continue;
      }

      if(typeof el.getTotalLength==='function'){
        const total=el.getTotalLength();
        if(!Number.isFinite(total)||total<=0)continue;

        // Curves/arcs are approximated into short vector segments. Straight CAD lines
        // stay exact because their path length is sampled only at their endpoints.
        const samples=Math.max(1,Math.min(80,Math.ceil(total/Math.max(8,total/24))));
        let prev=null;

        for(let i=0;i<=samples;i++){
          const local=el.getPointAtLength(total*i/samples);
          const p=rootPoint(el,local.x,local.y);
          if(prev&&p)push(prev,p);
          prev=p;
        }
      }
    }catch(err){
      console.warn('CAD entity skipped:',tag,err);
    }
  }

  host.remove();

  return {
    segments:dedupeSegments(segments),
    texts:texts.filter(t=>t.text&&t.x>=0&&t.x<=1&&t.y>=0&&t.y<=1),
    entityCount
  };
}

async function getLibreDwg(){
  if(!librePromise){
    librePromise=(async()=>{
      const mod=await import('@mlightcad/libredwg-web');
      // Vite copies libredwg-web.wasm to /assets/ during build.
      const instance=await mod.LibreDwg.create('/assets/');
      return {instance,Dwg_File_Type:mod.Dwg_File_Type};
    })();
  }
  return librePromise;
}

async function dwgToSvg(file,onStage){
  const {instance,Dwg_File_Type}=await getLibreDwg();
  const buffer=await file.arrayBuffer();

  onStage?.('Citesc geometria DWG…');

  let ptr=null;
  try{
    ptr=instance.dwg_read_data(buffer,Dwg_File_Type.DWG);
    if(!ptr)throw new Error('LibreDWG nu a putut citi fișierul.');

    const db=instance.convert(ptr);
    onStage?.('Generez planul vectorial SVG…');

    const svgOutput=instance.dwg_to_svg(db);
    if(svgOutput==null){
      throw new Error('DWG-ul a fost citit, dar LibreDWG nu a returnat conținut SVG.');
    }

    onStage?.('Curăț și normalizez SVG-ul generat…');
    return normalizeSvg(svgOutput);
  }finally{
    if(ptr){
      try{instance.dwg_free(ptr)}catch{}
    }
  }
}

export default function CadPlanImporter({project,building,floor,onClose,onImported}){
  const [file,setFile]=useState(null);
  const [busy,setBusy]=useState(false);
  const [stage,setStage]=useState('');
  const [error,setError]=useState('');
  const [stats,setStats]=useState(null);
  const [cadData,setCadData]=useState(null);
  const [mapping,setMapping]=useState(null);
  const [showWalls,setShowWalls]=useState(false);

  // Prepared DWG stays in browser until user chooses the actual floor plan from the sheet.
  const [prepared,setPrepared]=useState(null);
  const [previewUrl,setPreviewUrl]=useState('');
  const [crop,setCrop]=useState({x:0,y:0,w:1,h:1});
  const [dragStart,setDragStart]=useState(null);

  const sourceName=useMemo(()=>floor?.settings?.cad?.source_file||null,[floor?.settings]);

  function clearPreviewUrl(){
    if(previewUrl){
      try{URL.revokeObjectURL(previewUrl)}catch{}
    }
    setPreviewUrl('');
  }

  async function prepareCad(){
    if(!file)return;
    setBusy(true);setError('');setStats(null);
    clearPreviewUrl();

    try{
      if(!/\.dwg$/i.test(file.name)){
        throw new Error('În acest build importul CAD este pentru fișiere .DWG.');
      }

      const converted=await dwgToSvg(file,setStage);

      const url=URL.createObjectURL(
        new Blob([converted.text],{type:'image/svg+xml'})
      );

      setPrepared(converted);
      setPreviewUrl(url);
      setCrop({x:0,y:0,w:1,h:1});
      setStage('DWG pregătit. Selectează din planșă etajul pe care vrei să-l folosești.');
    }catch(e){
      console.error(e);
      setError(e.message||String(e));
      setStage('');
    }finally{
      setBusy(false);
    }
  }

  function pointerNorm(e){
    const el=e.currentTarget;
    const r=el.getBoundingClientRect();
    return {
      x:Math.max(0,Math.min(1,(e.clientX-r.left)/Math.max(1,r.width))),
      y:Math.max(0,Math.min(1,(e.clientY-r.top)/Math.max(1,r.height)))
    };
  }

  function cropStart(e){
    if(!prepared||busy)return;
    setMapping(null);setCadData(null);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p=pointerNorm(e);
    setDragStart(p);
    setCrop({x:p.x,y:p.y,w:.002,h:.002});
  }

  function cropMove(e){
    if(!dragStart||!prepared||busy)return;
    setMapping(null);setCadData(null);
    const p=pointerNorm(e);
    const x=Math.min(dragStart.x,p.x);
    const y=Math.min(dragStart.y,p.y);
    const w=Math.max(.002,Math.abs(p.x-dragStart.x));
    const h=Math.max(.002,Math.abs(p.y-dragStart.y));
    setCrop(normalizeCrop({x,y,w,h}));
  }

  function cropEnd(e){
    if(!dragStart)return;
    try{e.currentTarget.releasePointerCapture?.(e.pointerId)}catch{}
    setDragStart(null);
  }

  async function analyzeCadSelection(){
    if(!prepared)return;
    setBusy(true);setError('');setStats(null);setMapping(null);

    try{
      const selected=normalizeCrop(crop);
      setStage('Citesc pereții, ușile și textele din geometria DWG…');

      const geometry=await extractCadSegments(prepared.text,selected);
      if(!geometry.segments.length)throw new Error('Nu am găsit linii CAD în selecție.');

      const cropped=cropSvgDocument(prepared.text,selected);
      const aspect=cropped.previewWidth/Math.max(1,cropped.previewHeight);
      const mapped=mapApartmentsFromCad(geometry.segments,geometry.texts||[],aspect);

      setCadData({geometry,cropped,selected});
      setMapping(mapped);
      setStats({entities:geometry.entityCount,segments:geometry.segments.length});

      setStage(
        mapped.detections.length
          ? `Mapare CAD: ${mapped.detections.length} apartamente propuse.`
          : 'Am citit geometria, dar nu am reușit să separ apartamentele automat.'
      );
    }catch(e){
      console.error(e);
      setError(e.message||String(e));
      setStage('');
    }finally{
      setBusy(false);
    }
  }

  async function saveCadSelection(){
    if(!file||!prepared)return;
    setBusy(true);setError('');setStats(null);

    try{
      const selected=normalizeCrop(crop);
      const cropped=cadData?.cropped||cropSvgDocument(prepared.text,selected);

      setStage('Extrag doar geometria CAD din zona selectată…');
      const geometry=cadData?.geometry||await extractCadSegments(prepared.text,selected);

      setStats({
        entities:geometry.entityCount,
        segments:geometry.segments.length
      });

      if(!geometry.segments.length){
        throw new Error(
          'Selecția nu conține geometrie CAD utilizabilă pentru snap. Trage dreptunghiul exact peste planul etajului.'
        );
      }

      setStage('Salvez DWG-ul original…');
      const rawFd=new FormData();
      rawFd.append('file',file);
      rawFd.append('project_id',project.id);
      rawFd.append('building_id',building.id);
      rawFd.append('floor_id',floor.id);
      rawFd.append('asset_type','floor-cad-source');
      rawFd.append('label',`${floor.name} · DWG sursă`);
      const raw=await api('/admin/upload/project-documents',{method:'POST',body:rawFd});

      setStage('Salvez doar planul selectat ca SVG…');
      const svgName=file.name.replace(/\.dwg$/i,'')+`-${floor.id}.svg`;
      const svgFile=new File(
        [cropped.text],
        svgName,
        {type:'image/svg+xml'}
      );

      const svgFd=new FormData();
      svgFd.append('file',svgFile);
      svgFd.append('project_id',project.id);
      svgFd.append('building_id',building.id);
      svgFd.append('floor_id',floor.id);
      svgFd.append('asset_type','floor-plan-cad-svg');
      svgFd.append('label',`${floor.name} · plan CAD decupat`);
      const preview=await api('/admin/upload/floor-plans',{method:'POST',body:svgFd});

      setStage('Configurez editorul de poligoane…');

      const settings={
        ...(floor.settings||{}),
        cad:{
          version:'04.0.2',
          source_file:file.name,
          source_bucket:raw.bucket,
          source_path:raw.path,
          svg_path:preview.path,
          svg_url:preview.url,

          // Full DWG world coordinates are preserved here, never forced into integer DB fields.
          original_view_box:[
            cropped.originalViewBox.x,
            cropped.originalViewBox.y,
            cropped.originalViewBox.width,
            cropped.originalViewBox.height
          ],
          crop_normalized:[
            selected.x,selected.y,selected.w,selected.h
          ],
          crop_view_box:[
            cropped.cropViewBox.x,
            cropped.cropViewBox.y,
            cropped.cropViewBox.width,
            cropped.cropViewBox.height
          ],

          entity_count:geometry.entityCount,
          segments:geometry.segments,
          texts:geometry.texts||[],
          segment_count:geometry.segments.length,
          map_debug:mapping?.debug||null,
          imported_at:new Date().toISOString()
        }
      };

      await api(`/admin/floors/${floor.id}`,{
        method:'PATCH',
        body:{
          plan_path:preview.url,

          // IMPORTANT: Supabase columns are integers. Never put DWG world coordinates here.
          plan_width:Math.round(cropped.previewWidth),
          plan_height:Math.round(cropped.previewHeight),
          settings
        }
      });

      if(mapping?.detections?.length){
        setStage(`Salvez ${mapping.detections.length} poligoane de apartament…`);
        await api(`/admin/floors/${floor.id}/cad-map`,{
          method:'POST',
          body:{
            apartments:mapping.detections.map(d=>({
              code:d.code,
              points:d.points,
              room_count:d.roomCount||0
            }))
          }
        });
      }

      setStage('Plan CAD și poligoane salvate.');
      await onImported?.();
      clearPreviewUrl();
      setTimeout(()=>onClose?.(),450);
    }catch(e){
      console.error(e);
      setError(e.message||String(e));
      setStage('');
    }finally{
      setBusy(false);
    }
  }

  function resetPrepared(){
    clearPreviewUrl();
    setPrepared(null);
    setStats(null);
    setCadData(null);
    setMapping(null);
    setStage('');
    setError('');
    setCrop({x:0,y:0,w:1,h:1});
  }

  const cropStyle={
    left:`${crop.x*100}%`,
    top:`${crop.y*100}%`,
    width:`${crop.w*100}%`,
    height:`${crop.h*100}%`
  };

  return <div className="modal">
    <div className="modal-card cad-import-modal cad-crop-modal">
      <button className="x" onClick={onClose} disabled={busy}>×</button>

      <small className="kicker">CAD FLOOR WORKFLOW</small>
      <h2>{prepared?'Selectează planul etajului':'Importă plan DWG'}</h2>

      {!prepared&&<>
        <p>
          DWG-ul poate conține mai multe planuri pe aceeași planșă. Îl deschidem întâi complet,
          apoi alegi cu mouse-ul exact planul etajului pe care vrei să-l folosești.
        </p>

        {sourceName&&<div className="cad-current">
          <b>Plan CAD actual</b>
          <span>{sourceName}</span>
        </div>}

        <label className="cad-drop">
          <input
            type="file"
            accept=".dwg,application/acad,application/x-acad,application/autocad_dwg,image/vnd.dwg"
            onChange={e=>{
              setFile(e.target.files?.[0]||null);
              setError('');
            }}
          />
          <b>{file?file.name:'Alege fișierul .DWG'}</b>
          <span>{file?`${(file.size/1024/1024).toFixed(1)} MB`:'DWG 2D · poate conține mai multe planuri'}</span>
        </label>

        <div className="cad-flow">
          <span>DWG complet</span><i>→</i><span>Selectezi etajul</span><i>→</i><span>SVG decupat</span><i>→</i><span>CAD Snap</span>
        </div>
      </>}

      {prepared&&<>
        <p className="cad-crop-help">
          Trage un dreptunghi <b>doar peste planul etajului dorit</b>. Restul planșei nu va intra
          în editor și nici în geometria de snap.
        </p>

        <div
          className="cad-sheet-preview"
          onPointerDown={cropStart}
          onPointerMove={cropMove}
          onPointerUp={cropEnd}
          onPointerCancel={cropEnd}
        >
          <img src={previewUrl} alt="Previzualizare DWG complet"/>

          {mapping&&<svg className="cad-map-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            {showWalls&&(cadData?.geometry?.segments||[]).slice(0,6000).map((seg,i)=>
              <line key={'wall'+i}
                x1={(crop.x+seg[0]*crop.w)*1000}
                y1={(crop.y+seg[1]*crop.h)*1000}
                x2={(crop.x+seg[2]*crop.w)*1000}
                y2={(crop.y+seg[3]*crop.h)*1000}
                className="cad-wall-debug"/>
            )}
            {mapping.detections.map((d,i)=>
              <g key={'apt'+i}>
                <polygon
                  points={d.points.map(p=>`${(crop.x+p.x*crop.w)*1000},${(crop.y+p.y*crop.h)*1000}`).join(' ')}
                  className="cad-apartment-map"
                />
                <text
                  x={(crop.x+d.cx*crop.w)*1000}
                  y={(crop.y+d.cy*crop.h)*1000}
                  className="cad-apartment-label"
                >{d.code}</text>
              </g>
            )}
          </svg>}

          <div className="cad-crop-rect" style={cropStyle}>
            <span>PLAN SELECTAT</span>
          </div>
        </div>

        <div className="cad-selection-info">
          <span>X {Math.round(crop.x*100)}%</span>
          <span>Y {Math.round(crop.y*100)}%</span>
          <span>W {Math.round(crop.w*100)}%</span>
          <span>H {Math.round(crop.h*100)}%</span>
          <button onClick={()=>setCrop({x:0,y:0,w:1,h:1})} disabled={busy}>Toată planșa</button>
        </div>

        <div className="cad-important">
          DWG-ul original rămâne salvat integral. Pentru etaj folosim numai selecția de mai sus.
        </div>

        <div className="cad-map-actions">
          <button className="primary" onClick={analyzeCadSelection} disabled={busy}>
            {busy?'Analizez CAD…':'Mapează apartamentele din DWG'}
          </button>
          {mapping&&<button className={showWalls?'active':''} onClick={()=>setShowWalls(v=>!v)}>
            {showWalls?'Ascunde pereții CAD':'Arată pereții CAD'}
          </button>}
        </div>

        {mapping&&<div className="cad-map-report">
          <b>{mapping.detections.length} apartamente propuse</b>
          <span>{mapping.debug.structuralSegments} segmente structurale</span>
          <span>{mapping.debug.rooms} camere/celule</span>
          <span>{mapping.debug.doors} conexiuni de ușă</span>
          <span>{mapping.debug.commonIds.length} zone comune</span>
        </div>}
      </>}

      {stage&&<div className="info-box">{stage}</div>}
      {stats&&<div className="success-box">
        {stats.entities.toLocaleString('ro-RO')} entități SVG în sursă · {stats.segments.toLocaleString('ro-RO')} segmente CAD în selecție
      </div>}
      {error&&<div className="error-box">{error}</div>}

      <div className="modal-actions">
        {prepared
          ? <>
              <button onClick={resetPrepared} disabled={busy}>← Alt DWG</button>
              <button className="primary" onClick={saveCadSelection} disabled={busy||crop.w<.002||crop.h<.002}>
                {busy?'Salvez planul…':mapping?.detections?.length?`Salvează + creează ${mapping.detections.length} apartamente`:'Salvează doar planul'}
              </button>
            </>
          : <>
              <button onClick={onClose} disabled={busy}>Renunță</button>
              <button className="primary" onClick={prepareCad} disabled={!file||busy}>
                {busy?'Deschid DWG-ul…':'Deschide DWG-ul'}
              </button>
            </>
        }
      </div>

      <small className="cad-license-note">
        Coordonatele CAD reale pot avea valori foarte mari și zecimale. Ele sunt păstrate în metadata CAD;
        câmpurile de preview din baza de date primesc doar dimensiuni normalizate întregi.
      </small>
    </div>
  </div>;
}
