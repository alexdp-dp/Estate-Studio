import React,{useMemo,useState} from 'react';
import {api} from '../api';

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

function normalizeSvg(svgString){
  const parser=new DOMParser();
  const doc=parser.parseFromString(svgString,'image/svg+xml');
  const parseError=doc.querySelector('parsererror');
  if(parseError)throw new Error('SVG-ul generat din DWG nu a putut fi citit.');

  const svg=doc.documentElement;
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

  return {
    svg,
    viewBox:vb,
    text:new XMLSerializer().serializeToString(svg)
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

async function extractCadSegments(svgText){
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
  let entityCount=0;

  function push(a,b){
    if(!a||!b)return;
    const ax=Math.max(-.1,Math.min(1.1,a.x));
    const ay=Math.max(-.1,Math.min(1.1,a.y));
    const bx=Math.max(-.1,Math.min(1.1,b.x));
    const by=Math.max(-.1,Math.min(1.1,b.y));
    segments.push([ax,ay,bx,by]);
  }

  const elements=[...liveSvg.querySelectorAll('line,polyline,polygon,rect,path,circle,ellipse')];

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

    const svgString=instance.dwg_to_svg(db);
    if(!svgString||!svgString.includes('<svg')){
      throw new Error('DWG-ul nu a produs un plan SVG valid.');
    }

    return normalizeSvg(svgString);
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

  const sourceName=useMemo(()=>floor?.settings?.cad?.source_file||null,[floor?.settings]);

  async function importCad(){
    if(!file)return;
    setBusy(true);setError('');setStats(null);

    try{
      if(!/\.dwg$/i.test(file.name)){
        throw new Error('În acest build importul CAD este pentru fișiere .DWG.');
      }

      const converted=await dwgToSvg(file,setStage);

      setStage('Extrag linii și puncte pentru CAD Snap…');
      const geometry=await extractCadSegments(converted.text);

      setStats({
        entities:geometry.entityCount,
        segments:geometry.segments.length
      });

      setStage('Salvez DWG-ul original…');
      const rawFd=new FormData();
      rawFd.append('file',file);
      rawFd.append('project_id',project.id);
      rawFd.append('building_id',building.id);
      rawFd.append('floor_id',floor.id);
      rawFd.append('asset_type','floor-cad-source');
      rawFd.append('label',`${floor.name} · DWG sursă`);
      const raw=await api('/admin/upload/project-documents',{method:'POST',body:rawFd});

      setStage('Salvez planul SVG…');
      const svgName=file.name.replace(/\.dwg$/i,'.svg');
      const svgFile=new File(
        [converted.text],
        svgName,
        {type:'image/svg+xml'}
      );

      const svgFd=new FormData();
      svgFd.append('file',svgFile);
      svgFd.append('project_id',project.id);
      svgFd.append('building_id',building.id);
      svgFd.append('floor_id',floor.id);
      svgFd.append('asset_type','floor-plan-cad-svg');
      svgFd.append('label',`${floor.name} · plan vectorial`);
      const preview=await api('/admin/upload/floor-plans',{method:'POST',body:svgFd});

      setStage('Configurez editorul de poligoane…');

      const settings={
        ...(floor.settings||{}),
        cad:{
          version:'04.0',
          source_file:file.name,
          source_bucket:raw.bucket,
          source_path:raw.path,
          svg_path:preview.path,
          svg_url:preview.url,
          view_box:[
            converted.viewBox.x,
            converted.viewBox.y,
            converted.viewBox.width,
            converted.viewBox.height
          ],
          entity_count:geometry.entityCount,
          segments:geometry.segments,
          segment_count:geometry.segments.length,
          imported_at:new Date().toISOString()
        }
      };

      await api(`/admin/floors/${floor.id}`,{
        method:'PATCH',
        body:{
          plan_path:preview.url,
          plan_width:converted.viewBox.width,
          plan_height:converted.viewBox.height,
          settings
        }
      });

      setStage('DWG importat.');
      await onImported?.();
      setTimeout(()=>onClose?.(),500);
    }catch(e){
      console.error(e);
      setError(e.message||String(e));
      setStage('');
    }finally{
      setBusy(false);
    }
  }

  return <div className="modal">
    <div className="modal-card cad-import-modal">
      <button className="x" onClick={onClose} disabled={busy}>×</button>

      <small className="kicker">CAD FLOOR WORKFLOW</small>
      <h2>Importă plan DWG</h2>
      <p>
        DWG-ul este citit vectorial în browser, convertit în SVG pentru afișare și
        păstrat ca geometrie CAD pentru snap-ul poligoanelor.
      </p>

      {sourceName&&<div className="cad-current">
        <b>Plan CAD actual</b>
        <span>{sourceName}</span>
      </div>}

      <label className="cad-drop">
        <input
          type="file"
          accept=".dwg,application/acad,application/x-acad,application/autocad_dwg,image/vnd.dwg"
          onChange={e=>setFile(e.target.files?.[0]||null)}
        />
        <b>{file?file.name:'Alege fișierul .DWG'}</b>
        <span>{file?`${(file.size/1024/1024).toFixed(1)} MB`:'DWG 2D · plan tehnic de etaj'}</span>
      </label>

      <div className="cad-flow">
        <span>DWG</span><i>→</i><span>SVG vectorial</span><i>→</i><span>CAD Snap</span><i>→</i><span>Poligoane</span>
      </div>

      {stage&&<div className="info-box">{stage}</div>}
      {stats&&<div className="success-box">
        {stats.entities} entități SVG · {stats.segments} segmente disponibile pentru snap
      </div>}
      {error&&<div className="error-box">{error}</div>}

      <div className="modal-actions">
        <button onClick={onClose} disabled={busy}>Renunță</button>
        <button className="primary" onClick={importCad} disabled={!file||busy}>
          {busy?'Procesez DWG…':'Importă și pregătește planul'}
        </button>
      </div>

      <small className="cad-license-note">
        Importul DWG folosește LibreDWG WebAssembly. Fișierul original este păstrat separat,
        iar în viewer folosim SVG-ul generat.
      </small>
    </div>
  </div>;
}
