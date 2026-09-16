import React,{useEffect,useRef,useState} from 'react';
import {useParams} from 'react-router-dom';
import {api,statusLabel} from '../api';
import ThreeViewer from './ThreeViewer';

function polygonPoints(apartment){
  const rel=apartment?.apartment_polygons;
  if(Array.isArray(rel))return rel[0]?.points||[];
  return rel?.points||[];
}

function roomColorClass(a){
  if(a?.status!=='available')return '';
  const rooms=Number(a?.rooms);
  if(!Number.isFinite(rooms))return ' rooms-other';
  if(rooms<=1)return ' rooms-studio';
  if(rooms===2)return ' rooms-2';
  if(rooms===3)return ' rooms-3';
  if(rooms>=4)return ' rooms-4';
  return ' rooms-other';
}
function FloorOverlay({floor,onClose,onApartment}){
  const [hover,setHover]=useState(null);
  const [planZoom,setPlanZoom]=useState(1);
  const planViewport=useRef(null);

  useEffect(()=>{
    setPlanZoom(1);
  },[floor?.id]);

  useEffect(()=>{
    const el=planViewport.current;
    if(!el)return;
    requestAnimationFrame(()=>{
      el.scrollLeft=Math.max(0,(el.scrollWidth-el.clientWidth)/2);
      el.scrollTop=Math.max(0,(el.scrollHeight-el.clientHeight)/2);
    });
  },[planZoom]);

  function priceText(a){
    if(a.price===null||a.price===undefined||a.price==='')return null;
    const n=Number(a.price);
    return `${Number.isFinite(n)?n.toLocaleString('ro-RO'):a.price} ${a.currency||'EUR'}`;
  }

  function hoverApartment(a,e){
    setHover({a,x:e.clientX,y:e.clientY});
  }

  return <div className="embed-overlay"><div className="floor-sheet"><button className="sheet-close" onClick={onClose}>×</button>
    <div className="sheet-head"><div><span>PLAN ETAJ</span><h2>{floor.name}</h2></div><div className="legend room-legend"><i className="studio"/>Studio <i className="room2"/>2 camere <i className="room3"/>3 camere <i className="room4"/>4 camere <i className="reserved"/>Rezervat <i className="sold"/>Vândut</div></div>
    <div className="plan-public" ref={planViewport}>
      {floor.plan_path&&<div className="plan-zoom-controls">
        <button disabled={planZoom<=1} onClick={()=>setPlanZoom(z=>Math.max(1,+(z-.1).toFixed(2)))} aria-label="Micșorează planul">−</button>
        <span>{Math.round(planZoom*100)}%</span>
        <button disabled={planZoom>=1.5} onClick={()=>setPlanZoom(z=>Math.min(1.5,+(z+.1).toFixed(2)))} aria-label="Mărește planul">＋</button>
      </div>}
      {floor.plan_path?<div
        className="plan-image-wrap"
        style={{width:`${planZoom*100}%`}}
        onDoubleClick={()=>setPlanZoom(z=>z>1?1:1.5)}
      ><img
      src={floor.plan_path}
      style={{
        transform:`scaleX(${floor?.settings?.plan_flip_h?-1:1}) scaleY(${floor?.settings?.plan_flip_v?-1:1})`,
        transformOrigin:'center center'
      }}
    /><svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {(floor.apartments||[]).map(a=>{
        const ps=polygonPoints(a);
        if(ps.length<=2)return null;
        return <polygon
          key={a.id}
          className={`${a.status}${roomColorClass(a)}${hover?.a?.id===a.id?' hovered':''}`}
          points={ps.map(p=>`${p.x*100},${p.y*100}`).join(' ')}
          onMouseEnter={e=>hoverApartment(a,e)}
          onMouseMove={e=>hoverApartment(a,e)}
          onMouseLeave={()=>setHover(null)}
          onClick={()=>onApartment(a)}
        />
      })}
    </svg></div>:<div className="plan-missing">Planul etajului nu este încărcat.</div>}</div>
    <div className="apartments-strip">{(floor.apartments||[]).map(a=><button key={a.id} onMouseEnter={e=>hoverApartment(a,e)} onMouseMove={e=>hoverApartment(a,e)} onMouseLeave={()=>setHover(null)} onClick={()=>onApartment(a)}><b>{a.code}</b><span>{a.rooms?`${a.rooms} camere · `:''}{a.usable_area_sqm?`${a.usable_area_sqm} m² · `:''}{statusLabel[a.status]}</span></button>)}</div>

    {hover&&<div className="apartment-hover-tooltip" style={{left:Math.min(window.innerWidth-285,hover.x+15),top:Math.min(window.innerHeight-205,hover.y+15)}}>
      <div className="apt-tip-head"><div><small>{hover.a.code}</small><b>{hover.a.title||'Apartament'}</b></div><span className={'status-pill '+hover.a.status}>{statusLabel[hover.a.status]}</span></div>
      <div className="apt-tip-grid">
        {hover.a.rooms&&<div><span>Camere</span><b>{hover.a.rooms}</b></div>}
        {hover.a.usable_area_sqm&&<div><span>Suprafață utilă</span><b>{hover.a.usable_area_sqm} m²</b></div>}
        {hover.a.total_area_sqm&&<div><span>Suprafață totală</span><b>{hover.a.total_area_sqm} m²</b></div>}
        {priceText(hover.a)&&<div><span>Preț</span><b>{priceText(hover.a)}</b></div>}
      </div>
      {hover.a.description&&<p>{hover.a.description.length>120?hover.a.description.slice(0,117)+'…':hover.a.description}</p>}
      <small className="apt-tip-click">Click pentru detalii</small>
    </div>}
  </div></div>
}
function ApartmentCard({a,onClose}){
  return <div className="embed-overlay"><div className="apartment-card"><button className="sheet-close" onClick={onClose}>×</button>{a.image_path&&<img src={a.image_path}/>}<span className={'status-pill '+a.status}>{statusLabel[a.status]}</span><h2>{a.title||a.code}</h2><div className="apartment-stats"><div><b>{a.rooms||'—'}</b><span>camere</span></div><div><b>{a.usable_area_sqm||'—'}</b><span>m² utili</span></div><div><b>{a.total_area_sqm||'—'}</b><span>m² total</span></div></div>{a.price&&<div className="price">{Number(a.price).toLocaleString('ro-RO')} {a.currency||'EUR'}</div>}<p>{a.description}</p>{a.external_url&&<a className="primary button-link" href={a.external_url} target="_blank" rel="noreferrer">Vezi apartamentul</a>}</div></div>
}

export default function EmbedApp(){
  const {slug}=useParams();
  const [project,setProject]=useState(null),[error,setError]=useState('');
  const [buildingId,setBuildingId]=useState(null),[floor,setFloor]=useState(null),[apartment,setApartment]=useState(null),[activeFloor,setActiveFloor]=useState(null);
  const [viewer,setViewer]=useState(null),[autoRotate,setAutoRotate]=useState(false),[view,setView]=useState('perspective');

  useEffect(()=>{
    const preview=new URLSearchParams(window.location.search).get('preview')==='1';
    api(`/public/projects/${slug}${preview?'?preview=1':''}`).then(p=>{setProject(p);setBuildingId(null)}).catch(e=>setError(e.message));
  },[slug]);

  const building=project?.buildings?.find(b=>b.id===buildingId)||null;
  const shared=project?.settings?.model_mode==='shared'?project.settings?.shared_model:null;

  if(error)return <div className="embed-error"><b>Viewer indisponibil</b><span>{error}</span></div>;
  if(!project)return <div className="embed-loading">ESTATE STUDIO</div>;

  function selectBuilding(b){
    setActiveFloor(null);
    setFloor(null);

    if(b){
      // Every building selection starts from a perspective hero shot.
      // Floors become interactive only after this building is the active selection.
      setView('perspective');
      viewer?.setPreset?.('perspective');
      setBuildingId(b.id);
    }else{
      setBuildingId(null);
      setView('perspective');
      viewer?.setPreset?.('perspective');
    }
  }
  function setPreset(p){setView(p);viewer?.setPreset?.(p)}
  function toggleRotate(){const next=!autoRotate;setAutoRotate(next);viewer?.setAutoRotate?.(next)}

  return <div className="embed-root macheta-ui">
    <ThreeViewer
      buildings={project.buildings||[]}
      sharedModel={shared}
      selectedBuildingId={buildingId}
      selectedFloor={activeFloor}
      onSelectBuilding={selectBuilding}
      onSelectFloor={(f,b)=>{setBuildingId(b.id);setActiveFloor(f);setFloor(f)}}
      publicMode
      showGrid={false}
      showBubbles
      onReady={setViewer}
    />

    <div className="macheta-brand">
      {project.settings?.logo_url?<img src={project.settings.logo_url}/>:<div className="macheta-monogram">{project.name.slice(0,2).toLowerCase()}</div>}
      <div><b>{project.name}</b><span>ANSAMBLU · EXPLORARE 3D</span></div>
    </div>

    <button className="macheta-fullscreen" onClick={()=>document.querySelector('.embed-root')?.requestFullscreen?.()}>⛶ <span>Fullscreen</span></button>

    <aside className="macheta-nav">
      <small>PLAN GENERAL</small>
      <h1>O nouă perspectivă.</h1>
      <button className={!buildingId?'active':''} onClick={()=>selectBuilding(null)}><span>Toate clădirile</span><i>↗</i></button>
      {(project.buildings||[]).map((b,i)=><button key={b.id} className={buildingId===b.id?'active':''} onClick={()=>selectBuilding(b)}><span>{b.name}</span><em>{String(i+1).padStart(2,'0')}</em></button>)}
    </aside>

    {building&&<aside className="macheta-floors">
      <div><small>{building.name} · PRIM-PLAN</small><b>Selectează etajul</b></div>
      <div>{[...(building.floors||[])].reverse().map(f=><button key={f.id} onMouseEnter={()=>setActiveFloor(f)} onMouseLeave={()=>!floor&&setActiveFloor(null)} onClick={()=>{setActiveFloor(f);setFloor(f)}}><span>{f.name}</span><small>{f.apartments?.filter(a=>a.status==='available').length||0} disponibile</small></button>)}</div>
    </aside>}

    <div className="macheta-view-controls">
      <button className={view==='perspective'?'active':''} onClick={()=>setPreset('perspective')}>Perspectivă</button>
      <button className={view==='top'?'active':''} onClick={()=>setPreset('top')}>De sus</button>
      <button className={autoRotate?'active':''} onClick={toggleRotate}>↻ <span>Auto</span></button>
    </div>

    <div className="macheta-tools">
      <button onClick={()=>viewer?.zoom?.(.82)}>＋</button>
      <button onClick={()=>viewer?.zoom?.(1.22)}>−</button>
      <button onClick={()=>{setView('perspective');viewer?.reset?.()}}>⌖</button>
    </div>

    <div className="macheta-north"><b>N</b><span>↑</span></div>
    <div className="macheta-hint">
      <span>↖</span> Trage pentru rotire <i/> Scroll pentru zoom <i/>
      {building?'Hover + click pe etaj':'Hover + click pentru a selecta blocul'}
    </div>

    {floor&&<FloorOverlay floor={floor} onClose={()=>{setFloor(null);setActiveFloor(null)}} onApartment={setApartment}/>}
    {apartment&&<ApartmentCard a={apartment} onClose={()=>setApartment(null)}/>}
  </div>
}
