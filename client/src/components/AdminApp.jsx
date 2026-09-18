import React,{lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {Link,Navigate,Route,Routes,useLocation,useNavigate,useParams} from 'react-router-dom';
import {api,slugify,statusLabel} from '../api';
const ThreeViewer=lazy(()=>import('./ThreeViewer'));
const PlanEditor=lazy(()=>import('./PlanEditor'));
const AutoApartmentDetector=lazy(()=>import('./AutoApartmentDetector'));
const SharedModelMapper=lazy(()=>import('./SharedModelMapper'));

const STEPS=[['general','General'],['buildings','Blocuri'],['model','Model 2D / 3D'],['calibration','Calibrare'],['floors','Etaje'],['plans','Planuri & apartamente'],['preview','Preview'],['embed','Embed'],['dashboard','Dashboard'],['links','Linkuri publice']];
const STEP_ICONS={
  general:'fa-sliders',
  buildings:'fa-building',
  model:'fa-cube',
  calibration:'fa-ruler-combined',
  floors:'fa-layer-group',
  plans:'fa-draw-polygon',
  preview:'fa-eye',
  embed:'fa-code',
  dashboard:'fa-chart-pie',
  links:'fa-link'
};


function publicPageBase(project){
  const raw=String(project?.settings?.public_page_url||'').trim();
  if(!raw)return '';
  try{
    const u=new URL(raw);
    u.hash='';
    return u.toString();
  }catch{return ''}
}
function publicEntitySlug(entity,type){
  if(type==='apartment')return slugify(entity?.code||entity?.title||'');
  return slugify(entity?.name||'');
}
function publicDeepLink(project,{building=null,floor=null,apartment=null}={}){
  const base=publicPageBase(project);
  if(!base)return '';
  const u=new URL(base);
  if(building)u.searchParams.set('building',publicEntitySlug(building,'building'));
  else u.searchParams.delete('building');
  if(floor)u.searchParams.set('floor',publicEntitySlug(floor,'floor'));
  else u.searchParams.delete('floor');
  if(apartment)u.searchParams.set('apartment',publicEntitySlug(apartment,'apartment'));
  else u.searchParams.delete('apartment');
  return u.toString();
}
async function copyPublicLink(value){
  if(!value)return;
  await navigator.clipboard.writeText(value);
}

function siteConfirm({
  title='Confirmare',
  message='Ești sigur?',
  confirmLabel='Confirmă',
  cancelLabel='Renunță',
  danger=false
}={}){
  return new Promise(resolve=>{
    const overlay=document.createElement('div');
    overlay.className='site-confirm-backdrop';
    overlay.innerHTML=`
      <div class="site-confirm-card" role="dialog" aria-modal="true" aria-labelledby="site-confirm-title">
        <button type="button" class="site-confirm-x" aria-label="Închide">×</button>
        <div class="site-confirm-icon ${danger?'danger':''}">${danger?'!':'✓'}</div>
        <small>ESTATE STUDIO</small>
        <h3 id="site-confirm-title"></h3>
        <p></p>
        <div class="site-confirm-actions">
          <button type="button" class="ui-action site-confirm-cancel"></button>
          <button type="button" class="${danger?'ui-danger':'primary'} site-confirm-ok"></button>
        </div>
      </div>`;
    overlay.querySelector('h3').textContent=title;
    overlay.querySelector('p').textContent=message;
    overlay.querySelector('.site-confirm-cancel').textContent=cancelLabel;
    overlay.querySelector('.site-confirm-ok').textContent=confirmLabel;

    let closed=false;
    const finish=value=>{
      if(closed)return;
      closed=true;
      document.removeEventListener('keydown',onKey);
      overlay.remove();
      resolve(value);
    };
    const onKey=e=>{
      if(e.key==='Escape')finish(false);
      if(e.key==='Enter')finish(true);
    };
    overlay.querySelector('.site-confirm-x').onclick=()=>finish(false);
    overlay.querySelector('.site-confirm-cancel').onclick=()=>finish(false);
    overlay.querySelector('.site-confirm-ok').onclick=()=>finish(true);
    overlay.addEventListener('mousedown',e=>{if(e.target===overlay)finish(false)});
    document.addEventListener('keydown',onKey);
    document.body.appendChild(overlay);
    requestAnimationFrame(()=>overlay.classList.add('visible'));
    overlay.querySelector('.site-confirm-ok')?.focus();
  });
}

function siteTypedConfirm({
  title='Confirmare definitivă',
  message='Această acțiune șterge date.',
  keyword='SIGUR',
  confirmLabel='Șterge definitiv'
}={}){
  return new Promise(resolve=>{
    const overlay=document.createElement('div');
    overlay.className='site-confirm-backdrop';
    overlay.innerHTML=`
      <div class="site-confirm-card site-typed-confirm" role="dialog" aria-modal="true">
        <button type="button" class="site-confirm-x" aria-label="Închide">×</button>
        <div class="site-confirm-icon danger">!</div>
        <small>ESTATE STUDIO · ACȚIUNE IREVERSIBILĂ</small>
        <h3></h3>
        <p></p>
        <label class="typed-confirm-label">
          Scrie <b></b> pentru confirmare
          <input class="typed-confirm-input" autocomplete="off" spellcheck="false"/>
        </label>
        <div class="site-confirm-actions">
          <button type="button" class="ui-action site-confirm-cancel">Renunță</button>
          <button type="button" class="ui-danger site-confirm-ok" disabled></button>
        </div>
      </div>`;
    overlay.querySelector('h3').textContent=title;
    overlay.querySelector('p').textContent=message;
    overlay.querySelector('.typed-confirm-label b').textContent=keyword;
    const input=overlay.querySelector('.typed-confirm-input');
    const ok=overlay.querySelector('.site-confirm-ok');
    ok.textContent=confirmLabel;

    let closed=false;
    const finish=value=>{
      if(closed)return;
      closed=true;
      document.removeEventListener('keydown',onKey);
      overlay.remove();
      resolve(value);
    };
    const refresh=()=>{ok.disabled=input.value!==keyword};
    const onKey=e=>{
      if(e.key==='Escape')finish(false);
      if(e.key==='Enter'&&!ok.disabled)finish(true);
    };
    input.addEventListener('input',refresh);
    overlay.querySelector('.site-confirm-x').onclick=()=>finish(false);
    overlay.querySelector('.site-confirm-cancel').onclick=()=>finish(false);
    ok.onclick=()=>{if(!ok.disabled)finish(true)};
    overlay.addEventListener('mousedown',e=>{if(e.target===overlay)finish(false)});
    document.addEventListener('keydown',onKey);
    document.body.appendChild(overlay);
    requestAnimationFrame(()=>{
      overlay.classList.add('visible');
      input.focus();
    });
  });
}


function Login({onLogin}){const [username,setUsername]=useState('alexdarie'),[password,setPassword]=useState(''),[err,setErr]=useState('');const submit=async e=>{e.preventDefault();setErr('');try{await api('/auth/login',{method:'POST',body:{username,password}});onLogin()}catch(e){setErr(e.message)}};return <div className="login-page"><form onSubmit={submit} className="login-card"><div className="logo-mark">ES</div><h1>Estate Studio</h1><p>Platformă de configurare pentru experiențe imobiliare 3D.</p><label>Utilizator<input value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Parolă<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary big">Autentificare</button>{err&&<div className="error-box">{err}</div>}</form></div>}
function Shell({children}){const nav=useNavigate();return <div className="app-shell"><aside className="main-sidebar"><Link className="brand" to="/admin/projects"><span>ES</span><div><b>Estate Studio</b><small>Real Estate Experience</small></div></Link><nav><Link className="main-nav-link" to="/admin/projects"><span className="main-nav-icon">▦</span><span>Proiecte</span></Link></nav><div className="sidebar-foot"><button onClick={async()=>{await api('/auth/logout',{method:'POST'});location.reload()}}>↗ Ieșire</button></div></aside><div className="shell-main">{children}</div></div>}
function Projects(){const [items,setItems]=useState([]),[show,setShow]=useState(false),[name,setName]=useState(''),[slug,setSlug]=useState(''),[loadError,setLoadError]=useState('');const nav=useNavigate();const load=()=>{setLoadError('');return api('/admin/projects').then(setItems).catch(e=>{setLoadError(e.message);setItems([])})};useEffect(()=>{load()},[]);async function create(e){e.preventDefault();const p=await api('/admin/projects',{method:'POST',body:{name,slug:slug||slugify(name)}});nav(`/admin/projects/${p.id}/general`)}return <Shell><header className="topbar"><div><small>ESTATE STUDIO</small><h1>Proiecte</h1><p>Fiecare proiect are date, modele, planuri și iframe propriu.</p></div><button className="primary" onClick={()=>setShow(true)}>＋ Proiect nou</button></header><div className="content">{loadError&&<div className="error-box" style={{marginBottom:16}}>{loadError}</div>}<div className="project-grid">{items.map(p=><article className="project-card" key={p.id}><div className="project-cover" style={p.settings?.hero_url?{backgroundImage:`linear-gradient(#1d3a3033,#1d3a3033),url(${p.settings.hero_url})`,backgroundSize:'cover',backgroundPosition:'center'}:{}}><span>{p.settings?.hero_url?'':p.name.slice(0,2).toUpperCase()}</span><i className={p.is_published?'live':'draft'}>{p.is_published?'Publicat':'Draft'}</i></div><div className="project-body"><small>/{p.slug}</small><h3>{p.name}</h3><p>{p.building_count||0} blocuri · {p.floor_count||0} etaje · {p.apartment_count||0} apartamente</p><div className="card-actions"><button className="primary" onClick={()=>nav(`/admin/projects/${p.id}/general`)}>Deschide</button><button onClick={async()=>{if(await siteConfirm({title:'Duplică proiectul',message:`Va fi creată o copie nouă pentru ${p.name}.`,confirmLabel:'Duplică'})){await api(`/admin/projects/${p.id}/duplicate`,{method:'POST'});load()}}}>Duplică</button><button className="danger-ghost" onClick={async()=>{if(await siteConfirm({title:'Șterge proiectul',message:`${p.name} va fi șters definitiv, împreună cu datele lui.`,confirmLabel:'Șterge definitiv',danger:true})){await api(`/admin/projects/${p.id}`,{method:'DELETE'});load()}}}>Șterge</button></div></div></article>)}{items.length===0&&<div className="empty-state"><b>Niciun proiect încă</b><span>Creează primul proiect și configurează-i modelul 3D.</span><button className="primary" onClick={()=>setShow(true)}>Creează proiect</button></div>}</div></div>{show&&<div className="modal"><form className="modal-card" onSubmit={create}><button type="button" className="x" onClick={()=>setShow(false)}>×</button><h2>Proiect nou</h2><label>Nume proiect<input autoFocus value={name} onChange={e=>{setName(e.target.value);setSlug(slugify(e.target.value))}} required/></label><label>Slug iframe<input value={slug} onChange={e=>setSlug(slugify(e.target.value))} required/></label><button className="primary big">Creează proiectul</button></form></div>}</Shell>}
function ProjectShell({project,reload,children}){const {section}=useParams();const idx=Math.max(0,STEPS.findIndex(([k])=>k===section));const complete={general:!!project.name,buildings:(project.buildings||[]).length>0,model:!!project.settings?.shared_model?.url||(project.buildings||[]).some(b=>b.model_path),calibration:project.settings?.model_mode==='shared'?!!project.settings?.shared_model?.display_height_units:(project.buildings||[]).some(b=>b.model_path&&b.real_height_m&&b.display_height_units),floors:(project.buildings||[]).some(b=>(b.floors||[]).length>0),plans:(project.buildings||[]).some(b=>(b.floors||[]).some(f=>f.plan_path&&(f.apartments||[]).length>0)),preview:false,embed:project.is_published,dashboard:true,links:!!project.settings?.public_page_url};return <Shell><header className="project-top"><div><Link to="/admin/projects">← Proiecte</Link><small>{project.is_published?'PUBLICAT':'DRAFT'}</small><h1>{project.name}</h1><span>/{project.slug}</span></div><div className="project-top-actions"><a href={`/embed/${project.slug}?preview=1`} target="_blank" rel="noreferrer">Deschide viewer ↗</a><button className={project.is_published?'success':'primary'} onClick={async()=>{await api(`/admin/projects/${project.id}`,{method:'PATCH',body:{is_published:!project.is_published}});reload()}}>{project.is_published?'✓ Publicat':'Publică proiectul'}</button></div></header><div className="project-layout"><aside className="project-nav">{STEPS.map(([key,label])=><Link key={key} className={`${section===key?'active':''}${complete[key]?' complete':''}`} to={`/admin/projects/${project.id}/${key}`}><span className="project-nav-icon"><i className={`fa-solid ${STEP_ICONS[key]}`}/></span>{label}</Link>)}</aside><main className="project-content">{children}<div className="step-footer">{idx>0?<Link className="button-link" to={`/admin/projects/${project.id}/${STEPS[idx-1][0]}`}>← {STEPS[idx-1][1]}</Link>:<span/>}{idx<STEPS.length-1&&<Link className="primary" to={`/admin/projects/${project.id}/${STEPS[idx+1][0]}`}>{STEPS[idx+1][1]} →</Link>}</div></main></div></Shell>}
function SectionHead({kicker,title,desc,actions}){return <div className="section-head"><div><small>{kicker}</small><h2>{title}</h2><p>{desc}</p></div>{actions&&<div>{actions}</div>}</div>}
function General({p,reload}){
  const [form,setForm]=useState({
    name:p.name,
    slug:p.slug,
    description:p.description||'',
    embed_height:p.embed_height||760,
    source_mode:p.source_mode||'glb',
    public_page_url:p.settings?.public_page_url||''
  });

  const save=async()=>{
    const {public_page_url,...projectFields}=form;
    await api(`/admin/projects/${p.id}`,{
      method:'PATCH',
      body:{
        ...projectFields,
        settings:{...(p.settings||{}),public_page_url:String(public_page_url||'').trim()}
      }
    });
    reload();
  };

  async function uploadBrand(file,key){
    const fd=new FormData();
    fd.append('file',file);
    fd.append('project_id',p.id);
    fd.append('asset_type',key==='logo_url'?'project-logo':'project-hero');
    const u=await api('/admin/upload/project-images',{method:'POST',body:fd});
    await api(`/admin/projects/${p.id}`,{method:'PATCH',body:{settings:{...(p.settings||{}),[key]:u.url}}});
    reload();
  }

  return <>
    <SectionHead kicker="01 · GENERAL" title="Identitatea proiectului" desc="Datele de bază și modul în care va fi folosit proiectul."/>
    <div className="panel form-grid">
      <label>Nume proiect<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label>Slug public<input value={form.slug} onChange={e=>setForm({...form,slug:slugify(e.target.value)})}/></label>
      <label className="wide">Descriere<textarea rows="4" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      <label>Înălțime iframe implicită<input type="number" value={form.embed_height} onChange={e=>setForm({...form,embed_height:+e.target.value})}/></label>
      <label>Sursă model<select value={form.source_mode} onChange={e=>setForm({...form,source_mode:e.target.value})}><option value="glb">GLB / GLTF existent</option><option value="documents">Documentație arhitecturală</option></select></label>

      <label className="wide public-page-url-field">
        URL public al paginii cu embed
        <input
          type="url"
          placeholder="https://client.ro/apartamente"
          value={form.public_page_url}
          onChange={e=>setForm({...form,public_page_url:e.target.value})}
        />
        <small>Acesta este linkul pe care îl vede și îl distribuie clientul. Estate Studio va genera automat linkurile către blocuri, etaje și apartamente.</small>
      </label>

      <div className="wide end"><button className="primary" onClick={save}>Salvează</button></div>
    </div>

    <div className="panel brand-assets">
      <div><h3>Logo proiect</h3>{p.settings?.logo_url?<img className="asset-preview logo" src={p.settings.logo_url}/>:<div className="asset-placeholder">LOGO</div>}<label className="button-file"><input type="file" accept="image/*" onChange={e=>e.target.files[0]&&uploadBrand(e.target.files[0],'logo_url')}/>Încarcă logo</label></div>
      <div><h3>Imagine proiect</h3>{p.settings?.hero_url?<img className="asset-preview" src={p.settings.hero_url}/>:<div className="asset-placeholder">HERO</div>}<label className="button-file"><input type="file" accept="image/*" onChange={e=>e.target.files[0]&&uploadBrand(e.target.files[0],'hero_url')}/>Încarcă imagine</label></div>
    </div>
    {form.source_mode==='documents'&&<Documents p={p} reload={reload}/>}
  </>
}

function Buildings({p,reload}){
  const [name,setName]=useState('');
  const shared=p.settings?.model_mode==='shared';
  async function add(){if(!name.trim())return;await api('/admin/buildings',{method:'POST',body:{project_id:p.id,name,sort_order:p.buildings.length}});setName('');reload()}
  return <>
    <SectionHead kicker="02 · BLOCURI" title="Structura ansamblului" desc={shared?'Modelul comun păstrează pozițiile originale ale blocurilor din GLB. Aici definești entitățile care vor fi mapate pe geometrie.':'Un proiect poate conține unul sau mai multe blocuri, fiecare cu model și etaje proprii.'}/>
    <div className="stack">
      {p.buildings.map((b,i)=><div className={'panel building-row '+(shared?'shared-building-row':'')} key={b.id}>
        <div className="building-index">{String(i+1).padStart(2,'0')}</div>
        <label>Nume<input defaultValue={b.name} onBlur={e=>api(`/admin/buildings/${b.id}`,{method:'PATCH',body:{name:e.target.value}}).then(reload)}/></label>
        {shared
          ? <><label>Offset bază Y<input type="number" step=".1" defaultValue={b.position_y||0} onBlur={e=>api(`/admin/buildings/${b.id}`,{method:'PATCH',body:{position_y:+e.target.value}}).then(reload)}/></label><div className="mapping-state">{b.settings?.shared_mapping?.node_names?.length||b.settings?.shared_mapping?.footprint?<b>✓ mapat</b>:<span>nemapat</span>}</div></>
          : <><label>Poziție X<input type="number" step=".1" defaultValue={b.position_x||0} onBlur={e=>api(`/admin/buildings/${b.id}`,{method:'PATCH',body:{position_x:+e.target.value}}).then(reload)}/></label><label>Poziție Z<input type="number" step=".1" defaultValue={b.position_z||0} onBlur={e=>api(`/admin/buildings/${b.id}`,{method:'PATCH',body:{position_z:+e.target.value}}).then(reload)}/></label><label>Rotație Y°<input type="number" defaultValue={b.rotation_y_deg||0} onBlur={e=>api(`/admin/buildings/${b.id}`,{method:'PATCH',body:{rotation_y_deg:+e.target.value}}).then(reload)}/></label></>}
        {publicPageBase(p)&&<button className="ui-action copy-link-button" title={publicDeepLink(p,{building:b})} onClick={()=>copyPublicLink(publicDeepLink(p,{building:b}))}><i className="fa-solid fa-link"/> Copiază link</button>}
        <button className="danger-ghost" onClick={async()=>{if(await siteConfirm({title:'Șterge blocul',message:'Blocul, etajele și apartamentele lui vor fi șterse definitiv.',confirmLabel:'Șterge blocul',danger:true})){await api(`/admin/buildings/${b.id}`,{method:'DELETE'});reload()}}}>Șterge</button>
      </div>)}
      <div className="panel add-row"><input placeholder="Ex. Bloc 2" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()}/><button className="primary" onClick={add}>＋ Adaugă bloc</button></div>
    </div>
  </>
}
function Model({p,reload}){
  const [bid,setBid]=useState(p.buildings?.[0]?.id);
  const b=p.buildings.find(x=>x.id===bid)||p.buildings[0];

  const visualMode=p.settings?.visual_mode||'3d';
  const defaultVisual=p.settings?.default_visual||(visualMode==='2d'?'2d':'3d');
  const modelMode=p.settings?.model_mode||'individual';
  const shared=p.settings?.shared_model||{up_axis:'Y',reference_real_height_m:27,display_height_units:2.7,auto_ground:true};
  const twoD=p.settings?.two_d||{overview:{},buildings:{}};
  const overview=twoD.overview||{};
  const buildingScene=(twoD.buildings||{})[b?.id]||{};

  const palette=[
    {fill:'rgba(168,207,163,.27)',active:'rgba(113,174,116,.48)',dot:'#9fcea0'},
    {fill:'rgba(138,115,184,.25)',active:'rgba(112,83,164,.46)',dot:'#9c84c7'},
    {fill:'rgba(122,164,207,.23)',active:'rgba(85,132,178,.46)',dot:'#7aa4cf'},
    {fill:'rgba(225,189,100,.22)',active:'rgba(190,148,52,.43)',dot:'#e1bd64'}
  ];

  async function patchProjectSettings(extra,{reloadAfter=true}={}){
    await api(`/admin/projects/${p.id}`,{method:'PATCH',body:{settings:{...(p.settings||{}),...extra}}});
    if(reloadAfter)await reload();
  }
  async function setVisualMode(next){
    const patch={visual_mode:next};
    if(next!=='both')patch.default_visual=next;
    await patchProjectSettings(patch);
  }
  async function patchShared(patch){
    await patchProjectSettings({shared_model:{...shared,...patch}});
  }
  async function uploadShared(file){
    const fd=new FormData();
    fd.append('file',file);fd.append('project_id',p.id);fd.append('asset_type','shared-complex-model');
    const u=await api('/admin/upload/models',{method:'POST',body:fd});
    await patchShared({url:u.url});
  }

  async function saveTwoD(nextTwoD,{reloadAfter=true}={}){
    await patchProjectSettings({two_d:nextTwoD},{reloadAfter});
  }
  async function uploadOverview(file){
    const fd=new FormData();
    fd.append('file',file);fd.append('project_id',p.id);fd.append('asset_type','2d-overview-render');
    const u=await api('/admin/upload/project-images',{method:'POST',body:fd});
    await saveTwoD({...twoD,overview:{...overview,image_url:u.url}});
  }
  async function uploadBuildingImage(file){
    if(!b)return;
    const fd=new FormData();
    fd.append('file',file);fd.append('project_id',p.id);fd.append('building_id',b.id);fd.append('asset_type','2d-building-render');
    const u=await api('/admin/upload/project-images',{method:'POST',body:fd});
    await saveTwoD({...twoD,buildings:{...(twoD.buildings||{}),[b.id]:{...buildingScene,image_url:u.url}}});
  }
  async function saveOverviewPolygon(targetId,points){
    const nextOverview={...overview,polygons:{...(overview.polygons||{}),[targetId]:points}};
    await saveTwoD({...twoD,overview:nextOverview},{reloadAfter:false});
  }
  async function deleteOverviewPolygon(targetId){
    const polygons={...(overview.polygons||{})};
    delete polygons[targetId];
    await saveTwoD({...twoD,overview:{...overview,polygons}},{reloadAfter:false});
  }
  async function saveFloorPolygon(targetId,points){
    if(!b)return;
    const nextScene={...buildingScene,polygons:{...(buildingScene.polygons||{}),[targetId]:points}};
    await saveTwoD({...twoD,buildings:{...(twoD.buildings||{}),[b.id]:nextScene}},{reloadAfter:false});
  }
  async function deleteFloorPolygon(targetId){
    if(!b)return;
    const polygons={...(buildingScene.polygons||{})};
    delete polygons[targetId];
    const nextScene={...buildingScene,polygons};
    await saveTwoD({...twoD,buildings:{...(twoD.buildings||{}),[b.id]:nextScene}},{reloadAfter:false});
  }

  if(!b)return <div className="empty-state"><b>Adaugă întâi un bloc.</b></div>;

  async function patchBuilding(body){await api(`/admin/buildings/${b.id}`,{method:'PATCH',body});reload()}
  async function uploadIndividual(file){
    const fd=new FormData();
    fd.append('file',file);fd.append('project_id',p.id);fd.append('building_id',b.id);fd.append('asset_type','building-model');
    const u=await api('/admin/upload/models',{method:'POST',body:fd});
    await patchBuilding({model_path:u.url});
  }

  const buildingTargets=(p.buildings||[]).map((item,index)=>({
    id:item.id,
    name:item.name,
    points:overview.polygons?.[item.id]||[],
    _map_color:palette[index%palette.length],
    _map_dot:palette[index%palette.length].dot
  }));
  const floorTargets=(b.floors||[]).map((item,index)=>({
    id:item.id,
    name:item.name,
    points:buildingScene.polygons?.[item.id]||[],
    _map_color:palette[index%palette.length],
    _map_dot:palette[index%palette.length].dot
  }));

  const includes2D=visualMode==='2d'||visualMode==='both';
  const includes3D=visualMode==='3d'||visualMode==='both';

  return <>
    <SectionHead
      kicker="03 · MODEL 2D / 3D"
      title="Vizualizarea ansamblului"
      desc="Proiectul poate funcționa doar cu randări 2D, doar cu model 3D sau în mod hibrid, cu selector 2D / 3D în frontend."
    />

    <div className="visual-mode-switch panel">
      <button className={visualMode==='2d'?'active':''} onClick={()=>setVisualMode('2d')}>
        <i className="fa-solid fa-image"/><b>Doar 2D</b><span>Randări + poligoane interactive</span>
      </button>
      <button className={visualMode==='3d'?'active':''} onClick={()=>setVisualMode('3d')}>
        <i className="fa-solid fa-cube"/><b>Doar 3D</b><span>GLB individual sau comun</span>
      </button>
      <button className={visualMode==='both'?'active':''} onClick={()=>setVisualMode('both')}>
        <i className="fa-solid fa-layer-group"/><b>2D + 3D</b><span>Utilizatorul poate comuta între ele</span>
      </button>
    </div>

    {visualMode==='both'&&<div className="panel default-visual-choice">
      <div><small>VEDERE IMPLICITĂ ÎN FRONTEND</small><b>Cu ce vedere se deschide proiectul?</b></div>
      <div className="segmented">
        <button className={defaultVisual==='2d'?'active':''} onClick={()=>patchProjectSettings({default_visual:'2d'})}>2D</button>
        <button className={defaultVisual==='3d'?'active':''} onClick={()=>patchProjectSettings({default_visual:'3d'})}>3D</button>
      </div>
    </div>}

    {includes2D&&<div className="model-2d-section">
      <SectionHead
        kicker="RANDĂRI 2D · ANSAMBLU"
        title="Imagine generală și maparea blocurilor"
        desc="Încarcă randarea ansamblului și trasează peste fiecare bloc un poligon. Editorul este exact motorul folosit la maparea apartamentelor."
      />

      {!overview.image_url?<div className="panel">
        <label className="upload-zone model-2d-upload">
          <input type="file" accept="image/*" onChange={e=>e.target.files[0]&&uploadOverview(e.target.files[0])}/>
          <i className="fa-solid fa-image"/>
          <b>Încarcă randarea ansamblului</b>
          <span>PNG / JPG / WEBP · perspectivă, bird's-eye sau randare comercială</span>
        </label>
      </div>:<>
        <div className="panel model-2d-image-head">
          <div><small>RANDĂRI 2D</small><b>Ansamblu · mapare blocuri</b><span>{buildingTargets.filter(x=>x.points.length>=3).length}/{buildingTargets.length} blocuri mapate</span></div>
          <label className="button-file"><input type="file" accept="image/*" onChange={e=>e.target.files[0]&&uploadOverview(e.target.files[0])}/><i className="fa-solid fa-rotate"/> Înlocuiește imaginea</label>
        </div>
        <PlanEditor
          imageUrl={overview.image_url}
          targets={buildingTargets}
          editorKey={`overview-${overview.image_url}`}
          paletteTitle="Blocuri"
          emptyText="Adaugă întâi blocurile proiectului."
          targetKind="bloc"
          onSaveTargetPolygon={saveOverviewPolygon}
          onDeleteTargetPolygon={deleteOverviewPolygon}
          onChanged={reload}
        />
      </>}

      <SectionHead
        kicker="RANDĂRI 2D · BLOC"
        title="Imaginea blocului și maparea etajelor"
        desc="Încarcă o randare pentru fiecare bloc. Pe ea mapezi etajele cu același editor de poligoane."
        actions={<select value={b.id} onChange={e=>setBid(e.target.value)}>{p.buildings.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>}
      />

      {!buildingScene.image_url?<div className="panel">
        <label className="upload-zone model-2d-upload">
          <input type="file" accept="image/*" onChange={e=>e.target.files[0]&&uploadBuildingImage(e.target.files[0])}/>
          <i className="fa-solid fa-building"/>
          <b>Încarcă randarea pentru {b.name}</b>
          <span>Poate fi frontală, în perspectivă sau o elevație randată.</span>
        </label>
      </div>:<>
        <div className="panel model-2d-image-head">
          <div><small>{b.name.toUpperCase()}</small><b>Mapare etaje</b><span>{floorTargets.filter(x=>x.points.length>=3).length}/{floorTargets.length} etaje mapate</span></div>
          <label className="button-file"><input type="file" accept="image/*" onChange={e=>e.target.files[0]&&uploadBuildingImage(e.target.files[0])}/><i className="fa-solid fa-rotate"/> Înlocuiește imaginea</label>
        </div>
        <PlanEditor
          imageUrl={buildingScene.image_url}
          targets={floorTargets}
          editorKey={`building-${b.id}-${buildingScene.image_url}`}
          paletteTitle="Etaje"
          emptyText="Generează întâi etajele blocului."
          targetKind="etaj"
          onSaveTargetPolygon={saveFloorPolygon}
          onDeleteTargetPolygon={deleteFloorPolygon}
          onChanged={reload}
        />
      </>}
    </div>}

    {includes3D&&<div className="model-3d-section">
      <SectionHead kicker="MODEL 3D" title="Sursa modelului 3D" desc="Poți folosi un GLB separat pentru fiecare bloc sau un singur GLB cu întregul complex."/>

      <div className="model-mode-switch panel">
        <button className={modelMode==='individual'?'active':''} onClick={()=>patchProjectSettings({model_mode:'individual'})}><b>GLB separat per bloc</b><span>Un model pentru fiecare clădire</span></button>
        <button className={modelMode==='shared'?'active':''} onClick={()=>patchProjectSettings({model_mode:'shared'})}><b>GLB comun · complex</b><span>Un singur model, mai multe clădiri mapate</span></button>
      </div>

      {modelMode==='individual'?<>
        <SectionHead kicker="MODEL INDIVIDUAL" title="Modelul clădirii" desc="Încarcă GLB/GLTF pentru fiecare bloc. Modelul apare imediat în preview." actions={<select value={b.id} onChange={e=>setBid(e.target.value)}>{p.buildings.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>}/>
        <div className="model-grid"><div className="panel preview-panel"><ThreeViewer buildings={[b]} selectedBuildingId={b.id}/></div><div className="panel settings-panel"><h3>{b.name}</h3><label className="upload-zone"><input type="file" accept=".glb,.gltf,model/gltf-binary" onChange={e=>e.target.files[0]&&uploadIndividual(e.target.files[0])}/><b>{b.model_path?'Înlocuiește GLB/GLTF':'Încarcă GLB/GLTF'}</b><span>{b.model_path?'Model încărcat ✓':'max 50 MB'}</span></label>{b.model_path&&<><p className="hint break-url">{b.model_path}</p><div className="notice">Scalarea și orientarea se fac la runtime.</div></>}</div></div>
      </>:<>
        <div className="model-grid shared-model-top">
          <div className="panel preview-panel"><ThreeViewer buildings={p.buildings} sharedModel={shared.url?shared:null} selectedBuildingId={null}/></div>
          <div className="panel settings-panel">
            <h3>GLB comun al ansamblului</h3>
            <label className="upload-zone"><input type="file" accept=".glb,.gltf,model/gltf-binary" onChange={e=>e.target.files[0]&&uploadShared(e.target.files[0])}/><b>{shared.url?'Înlocuiește GLB comun':'Încarcă GLB comun'}</b><span>{shared.url?'Model comun încărcat ✓':'toate blocurile în pozițiile lor originale'}</span></label>
            <div className="form-grid one shared-calibration">
              <label>Înălțime reală de referință (m)<input type="number" step=".01" defaultValue={shared.reference_real_height_m||27} onBlur={e=>patchShared({reference_real_height_m:+e.target.value})}/></label>
              <label>Înălțime internă / display units<input type="number" step=".1" defaultValue={shared.display_height_units||2.7} onBlur={e=>patchShared({display_height_units:+e.target.value})}/></label>
              <label>Axa verticală<select defaultValue={shared.up_axis||'Y'} onChange={e=>patchShared({up_axis:e.target.value})}><option>Y</option><option>Z</option><option>X</option></select></label>
            </div>
            <div className="notice">GLB-ul se încarcă o singură dată. Maparea de mai jos spune Estate Studio ce geometrie aparține fiecărui bloc, fără să taie sau să dubleze fișierul.</div>
          </div>
        </div>
        {shared.url&&<div className="panel shared-mapper-panel"><SharedModelMapper project={p} reload={reload}/></div>}
      </>}
    </div>}
  </>
}
function Calibration({p,reload}){
  if((p.settings?.visual_mode||'3d')==='2d')return <>
    <SectionHead kicker="04 · CALIBRARE" title="Calibrarea 3D nu este necesară" desc="Proiectul este configurat în modul Doar 2D. Randările și poligoanele folosesc coordonate relative 0–100% și nu au nevoie de scară 3D."/>
    <div className="panel calibration-2d-note"><i className="fa-solid fa-image"/><div><b>Mod 2D activ</b><span>Poți continua direct cu Etaje și Planuri & apartamente.</span></div></div>
  </>;
  const sharedMode=p.settings?.model_mode==='shared';
  const shared=p.settings?.shared_model||{};
  const [bid,setBid]=useState(p.buildings?.[0]?.id);
  const b=p.buildings.find(x=>x.id===bid)||p.buildings[0];
  if(!b)return null;

  async function patchBuilding(body){await api(`/admin/buildings/${b.id}`,{method:'PATCH',body});reload()}
  async function patchShared(body){await api(`/admin/projects/${p.id}`,{method:'PATCH',body:{settings:{...(p.settings||{}),shared_model:{...shared,...body}}}});reload()}

  if(sharedMode)return <>
    <SectionHead kicker="04 · CALIBRARE" title="Scara modelului comun" desc="Toate blocurile folosesc aceeași scalare, astfel pozițiile relative din GLB rămân neschimbate."/>
    <div className="model-grid">
      <div className="panel preview-panel"><ThreeViewer buildings={p.buildings} sharedModel={shared} selectedBuildingId={null}/></div>
      <div className="panel settings-panel"><h3>Ansamblu</h3><div className="form-grid one">
        <label>Înălțime reală de referință (m)<input type="number" step=".01" defaultValue={shared.reference_real_height_m||27} onBlur={e=>patchShared({reference_real_height_m:+e.target.value})}/></label>
        <label>Înălțime internă / display units<input type="number" step=".1" defaultValue={shared.display_height_units||2.7} onBlur={e=>patchShared({display_height_units:+e.target.value})}/></label>
        <label>Axa verticală<select defaultValue={shared.up_axis||'Y'} onChange={e=>patchShared({up_axis:e.target.value})}><option>Y</option><option>Z</option><option>X</option></select></label>
      </div><div className="notice">Intervalele etajelor fiecărui bloc sunt în metri. Viewerul folosește raportul comun <b>{shared.reference_real_height_m||27} m → {shared.display_height_units||2.7} unități</b>.</div></div>
    </div>
  </>;

  return <>
    <SectionHead kicker="04 · CALIBRARE" title="Scară, axă și cota 0" desc="Adminul lucrează în metri reali; viewerul convertește automat în unitățile interne ale modelului." actions={<select value={b.id} onChange={e=>setBid(e.target.value)}>{p.buildings.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>}/>
    <div className="model-grid"><div className="panel preview-panel"><ThreeViewer buildings={[b]} selectedBuildingId={b.id}/></div><div className="panel settings-panel"><h3>{b.name}</h3><div className="form-grid one"><label>Înălțime reală clădire (m)<input type="number" step=".01" defaultValue={b.real_height_m||27} onBlur={e=>patchBuilding({real_height_m:+e.target.value})}/></label><label>Înălțime internă / display units<input type="number" step=".1" defaultValue={b.display_height_units||2.7} onBlur={e=>patchBuilding({display_height_units:+e.target.value})}/></label><label>Axa verticală<select defaultValue={b.model_up_axis||'Y'} onChange={e=>patchBuilding({model_up_axis:e.target.value})}><option>Y</option><option>Z</option><option>X</option></select></label><label className="check"><input type="checkbox" defaultChecked={b.auto_ground!==false} onChange={e=>patchBuilding({auto_ground:e.target.checked})}/> Așază baza modelului la cota 0</label></div><div className="notice">Scalare uniformă la runtime: <b>{b.real_height_m||27} m reali → {b.display_height_units||2.7} unități interne</b>.</div></div></div>
  </>
}

function CopyFloorStructureModal({project,source,onClose,onDone}){
  const targets=(project.buildings||[]).filter(b=>b.id!==source.id);
  const [selected,setSelected]=useState(targets.map(b=>b.id));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const allSelected=targets.length>0&&selected.length===targets.length;
  function toggle(id){setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])}
  async function apply(){
    if(!selected.length)return setError('Selectează cel puțin un bloc țintă.');
    if(!await siteConfirm({title:'Copiază structura etajelor',message:`Copiez ${source.floors?.length||0} etaje din ${source.name} în ${selected.length} bloc(uri). Nivelurile suplimentare din blocurile țintă vor fi șterse.`,confirmLabel:'Copiază structura'}))return;
    setBusy(true);setError('');
    try{
      await api(`/admin/buildings/${source.id}/copy-floor-structure`,{method:'POST',body:{target_building_ids:selected}});
      await onDone?.();
      onClose();
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <div className="modal"><div className="modal-card copy-modal">
    <button className="x" onClick={onClose}>×</button>
    <h2>Copiază structura etajelor</h2>
    <p className="hint">Sursă: <b>{source.name}</b>. Se copiază numărul de niveluri, denumirile și intervalele verticale. Planurile și apartamentele de pe etajele care există deja nu se modifică. Nivelurile suplimentare din blocurile țintă vor fi eliminate.</p>
    <div className="copy-actions-row"><button className="ui-action" onClick={()=>setSelected(allSelected?[]:targets.map(b=>b.id))}>{allSelected?'Deselectează toate':'Selectează toate'}</button></div>
    <div className="copy-check-list">
      {targets.map(b=><label className="check copy-check" key={b.id}><input type="checkbox" checked={selected.includes(b.id)} onChange={()=>toggle(b.id)}/><span><b>{b.name}</b><small>{(b.floors||[]).length} etaje acum</small></span></label>)}
    </div>
    {error&&<div className="error-box">{error}</div>}
    <button className="primary big" disabled={busy||!selected.length} onClick={apply}>{busy?'Copiez…':`Copiază în ${selected.length} bloc(uri)`}</button>
  </div></div>
}

function CopyLayoutModal({project,sourceBuilding,sourceFloor,onClose,onDone}){
  const allTargets=(project.buildings||[]).flatMap(b=>(b.floors||[]).filter(f=>f.id!==sourceFloor.id).map(f=>({...f,building:b})));
  const sameBuildingTargets=allTargets.filter(x=>x.building.id===sourceBuilding.id);
  const [selected,setSelected]=useState(sameBuildingTargets.map(x=>x.id));
  const [copyMode,setCopyMode]=useState('rooms');
  const [flipH,setFlipH]=useState(false),[flipV,setFlipV]=useState(false);
  const [prefix,setPrefix]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  function toggle(id){setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])}
  function selectGroup(items){setSelected(items.map(x=>x.id))}
  async function apply(){
    if(!selected.length)return setError('Selectează cel puțin un etaj țintă.');
    const modeLabel=copyMode==='geometry'?'doar geometria':copyMode==='rooms'?'geometria + numărul de camere':'geometria + datele comerciale';
    if(!await siteConfirm({title:'Copiază planul și maparea',message:`Copiez planul și maparea din ${sourceFloor.name} în ${selected.length} etaj(e), cu ${modeLabel}. Apartamentele existente din ținte vor fi înlocuite cu apartamente noi.`,confirmLabel:'Copiază plan + mapare'}))return;
    setBusy(true);setError('');
    try{
      await api(`/admin/floors/${sourceFloor.id}/copy-layout`,{method:'POST',body:{
        target_floor_ids:selected,
        copy_mode:copyMode,
        flip_h:flipH,
        flip_v:flipV,
        code_prefix:prefix
      }});
      await onDone?.();
      onClose();
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <div className="modal"><div className="modal-card copy-modal copy-layout-modal">
    <button className="x" onClick={onClose}>×</button>
    <h2>Copiază planul + maparea</h2>
    <p className="hint">Sursă: <b>{sourceBuilding.name} · {sourceFloor.name}</b>. Pe fiecare etaj țintă se creează <b>apartamente noi</b>, cu ID-uri și coduri noi. Statusul nu se copiază: noile apartamente sunt Disponibile.</p>

    <div className="copy-quick">
      <button className="ui-action" onClick={()=>selectGroup(sameBuildingTargets)}>Toate din {sourceBuilding.name}</button>
      <button className="ui-action" onClick={()=>selectGroup(allTargets)}>Toate din proiect</button>
      <button className="ui-action" onClick={()=>setSelected([])}>Niciunul</button>
    </div>

    <div className="copy-target-groups">
      {(project.buildings||[]).map(b=>{
        const floors=(b.floors||[]).filter(f=>f.id!==sourceFloor.id);
        if(!floors.length)return null;
        return <div className="copy-target-group" key={b.id}>
          <b>{b.name}</b>
          {floors.map(f=><label className="check copy-check" key={f.id}>
            <input type="checkbox" checked={selected.includes(f.id)} onChange={()=>toggle(f.id)}/>
            <span><strong>{f.name}</strong><small>{(f.apartments||[]).length} apartamente · {f.plan_path?'are plan':'fără plan'}</small></span>
          </label>)}
        </div>
      })}
    </div>

    <div className="copy-options-grid">
      <label>Date apartamente
        <select value={copyMode} onChange={e=>setCopyMode(e.target.value)}>
          <option value="geometry">Doar geometrie / poligoane</option>
          <option value="rooms">Geometrie + număr camere</option>
          <option value="all">Geometrie + toate datele comerciale</option>
        </select>
      </label>
      <label>Prefix coduri (opțional)
        <input value={prefix} onChange={e=>setPrefix(e.target.value)} placeholder="automat; ex. B2-"/>
      </label>
      <label className="check"><input type="checkbox" checked={flipH} onChange={e=>setFlipH(e.target.checked)}/> Flip orizontal</label>
      <label className="check"><input type="checkbox" checked={flipV} onChange={e=>setFlipV(e.target.checked)}/> Flip vertical</label>
    </div>

    <div className="copy-note">
      <b>Coduri noi automat</b>
      <span>Parter: P01, P02… · Etaj 1: 101, 102… · Etaj 2: 201, 202… La alt bloc se adaugă automat B2-, B3- etc., dacă nu introduci tu un prefix.</span>
    </div>

    {error&&<div className="error-box">{error}</div>}
    <button className="primary big" disabled={busy||!selected.length} onClick={apply}>{busy?'Copiez…':`Copiază în ${selected.length} etaj(e)`}</button>
  </div></div>
}


function CopyCompleteBuildingModal({project,source,onClose,onDone}){
  const candidates=(project.buildings||[]).filter(b=>b.id!==source.id);
  const [targets,setTargets]=useState(()=>candidates.map(b=>({building_id:b.id,enabled:true,orientation:'normal'})));
  const [copyMode,setCopyMode]=useState('rooms');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');

  function patchTarget(id,patch){
    setTargets(v=>v.map(t=>t.building_id===id?{...t,...patch}:t));
  }
  const enabled=targets.filter(t=>t.enabled);
  const allEnabled=candidates.length>0&&enabled.length===candidates.length;

  async function apply(){
    if(!enabled.length)return setError('Selectează cel puțin un bloc țintă.');
    const modeLabel=copyMode==='geometry'?'doar planurile și poligoanele':copyMode==='rooms'?'planurile, poligoanele și numărul de camere':'planurile, poligoanele și datele comerciale';
    if(!await siteConfirm({title:'Copiază blocul complet',message:`Copiez structura, planurile și mapările din ${source.name} în ${enabled.length} bloc(uri): ${modeLabel}. Datele existente din blocurile țintă vor fi înlocuite.`,confirmLabel:'Copiază blocul complet'}))return;
    setBusy(true);setError('');
    try{
      await api(`/admin/buildings/${source.id}/copy-complete-building-layout`,{method:'POST',body:{
        copy_mode:copyMode,
        targets:enabled.map(t=>({
          building_id:t.building_id,
          flip_h:t.orientation==='h'||t.orientation==='hv',
          flip_v:t.orientation==='v'||t.orientation==='hv'
        }))
      }});
      await onDone?.();
      onClose();
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }

  return <div className="modal"><div className="modal-card copy-modal copy-building-modal">
    <button className="x" onClick={onClose}>×</button>
    <h2>Copiază blocul complet</h2>
    <p className="hint">Sursă: <b>{source.name}</b>. Se copiază dintr-un foc structura etajelor, planul fiecărui etaj și maparea apartamentelor. În blocurile țintă se creează întotdeauna <b>apartamente noi</b>, cu ID-uri, coduri și denumiri noi; statusul pornește Disponibil.</p>

    <label>Date preluate de la apartamente
      <select value={copyMode} onChange={e=>setCopyMode(e.target.value)}>
        <option value="geometry">Doar geometrie / poligoane</option>
        <option value="rooms">Geometrie + număr camere</option>
        <option value="all">Geometrie + toate datele comerciale</option>
      </select>
    </label>

    <div className="copy-actions-row">
      <button className="ui-action" onClick={()=>setTargets(v=>v.map(t=>({...t,enabled:!allEnabled})))}>{allEnabled?'Deselectează toate':'Selectează toate'}</button>
    </div>

    <div className="complete-building-targets">
      {candidates.map(b=>{
        const cfg=targets.find(t=>t.building_id===b.id)||{enabled:false,orientation:'normal'};
        return <div className={'complete-building-target '+(cfg.enabled?'enabled':'')} key={b.id}>
          <label className="check">
            <input type="checkbox" checked={cfg.enabled} onChange={e=>patchTarget(b.id,{enabled:e.target.checked})}/>
            <span><b>{b.name}</b><small>{(b.floors||[]).length} etaje acum</small></span>
          </label>
          <label>Orientare
            <select disabled={!cfg.enabled} value={cfg.orientation} onChange={e=>patchTarget(b.id,{orientation:e.target.value})}>
              <option value="normal">Normal</option>
              <option value="h">Flip H</option>
              <option value="v">Flip V</option>
              <option value="hv">Flip H + V</option>
            </select>
          </label>
        </div>
      })}
    </div>

    <div className="copy-note">
      <b>Ce NU se copiază</b>
      <span>ID-urile, codurile, denumirile și statusurile apartamentelor. Codurile sunt regenerate automat pentru blocul și etajul destinație.</span>
    </div>
    {error&&<div className="error-box">{error}</div>}
    <button className="primary big" disabled={busy||!enabled.length} onClick={apply}>{busy?'Copiez blocurile…':`Copiază complet în ${enabled.length} bloc(uri)`}</button>
  </div></div>
}

function Floors({p,reload}){
  const [bid,setBid]=useState(p.buildings?.[0]?.id);
  const b=p.buildings.find(x=>x.id===bid)||p.buildings[0];
  const [copyOpen,setCopyOpen]=useState(false),[copyCompleteOpen,setCopyCompleteOpen]=useState(false);
  const [cfg,setCfg]=useState({count:b?.floors_count||9,standard:b?.default_floor_height_m||3,groundDifferent:b?.ground_floor_different||false,ground:b?.ground_floor_height_m||3});
  useEffect(()=>{if(b)setCfg({count:b.floors_count||9,standard:b.default_floor_height_m||3,groundDifferent:b.ground_floor_different||false,ground:b.ground_floor_height_m||3})},[bid,p]);
  if(!b)return null;
  async function generate(){
    if((b.floors||[]).some(f=>(f.apartments||[]).length)&&!await siteConfirm({title:'Regenerare etaje',message:'Regenerarea etajelor va șterge apartamentele existente din acest bloc.',confirmLabel:'Regenează etajele',danger:true}))return;
    await api(`/admin/buildings/${b.id}/generate-floors`,{method:'POST',body:cfg});
    reload();
  }
  return <>
    <SectionHead
      kicker="04 · ETAJE"
      title="Etaje și intervale verticale"
      desc="Etajele sunt independente de structura mesh-urilor din GLB. Intervalele pot fi ajustate individual."
      actions={<div className="inline-selects">
        <select value={b.id} onChange={e=>setBid(e.target.value)}>{p.buildings.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
        {(p.buildings||[]).length>1&&<button className="ui-action" onClick={()=>setCopyOpen(true)}>Copiază doar structura</button>}
        {(p.buildings||[]).length>1&&<button className="ui-action primary" onClick={()=>setCopyCompleteOpen(true)}>Copiază blocul complet</button>}
      </div>}
    />
    <div className="floors-layout">
      <div className="panel floor-generator">
        <h3>Generator</h3>
        <label>Număr etaje / niveluri<input type="number" min="1" value={cfg.count} onChange={e=>setCfg({...cfg,count:+e.target.value})}/></label>
        <label>Înălțime standard (m)<input type="number" step=".1" value={cfg.standard} onChange={e=>setCfg({...cfg,standard:+e.target.value})}/></label>
        <label className="check"><input type="checkbox" checked={cfg.groundDifferent} onChange={e=>setCfg({...cfg,groundDifferent:e.target.checked})}/> Parterul are înălțime diferită</label>
        {cfg.groundDifferent&&<label>Înălțime parter (m)<input type="number" step=".1" value={cfg.ground} onChange={e=>setCfg({...cfg,ground:+e.target.value})}/></label>}
        <button className="primary big" onClick={generate}>Generează etajele</button>
      </div>
      <div className="panel">
        <div className="table floor-links-table">
          <div className="tr th"><span>Nivel</span><span>De la (m)</span><span>Până la (m)</span><span>Plan</span><span>Link</span></div>
          {(b.floors||[]).map(f=><div className="tr" key={f.id}>
            <input defaultValue={f.name} onBlur={e=>api(`/admin/floors/${f.id}`,{method:'PATCH',body:{name:e.target.value}}).then(reload)}/>
            <input type="number" step=".1" defaultValue={f.height_from_m} onBlur={e=>api(`/admin/floors/${f.id}`,{method:'PATCH',body:{height_from_m:+e.target.value}}).then(reload)}/>
            <input type="number" step=".1" defaultValue={f.height_to_m} onBlur={e=>api(`/admin/floors/${f.id}`,{method:'PATCH',body:{height_to_m:+e.target.value}}).then(reload)}/>
            <span>{f.plan_path?'✓':'—'}</span>
            <span>{publicPageBase(p)?<button className="ui-action mini-link-button" title={publicDeepLink(p,{building:b,floor:f})} onClick={()=>copyPublicLink(publicDeepLink(p,{building:b,floor:f}))}><i className="fa-solid fa-link"/> Copiază</button>:'—'}</span>
          </div>)}
        </div>
        {(b.floors||[]).length===0&&<div className="empty-mini">Generează structura de etaje.</div>}
      </div>
    </div>
    {copyOpen&&<CopyFloorStructureModal project={p} source={b} onClose={()=>setCopyOpen(false)} onDone={reload}/>}
    {copyCompleteOpen&&<CopyCompleteBuildingModal project={p} source={b} onClose={()=>setCopyCompleteOpen(false)} onDone={reload}/>}
  </>
}
function ApartmentForm({project,floor,apartment,onSaved,onCancel}){const [f,setF]=useState(apartment||{code:'',title:'',status:'available',rooms:'',usable_area_sqm:'',total_area_sqm:'',price:'',currency:'EUR',description:'',external_url:''});const [imageFile,setImageFile]=useState(null);async function save(){const body={...f,floor_id:floor.id,rooms:f.rooms?+f.rooms:null,usable_area_sqm:f.usable_area_sqm?+f.usable_area_sqm:null,total_area_sqm:f.total_area_sqm?+f.total_area_sqm:null,price:f.price?+f.price:null};let saved=apartment;if(apartment)saved=await api(`/admin/apartments/${apartment.id}`,{method:'PATCH',body});else saved=await api('/admin/apartments',{method:'POST',body});if(imageFile&&saved?.id){const fd=new FormData();fd.append('file',imageFile);fd.append('project_id',project.id);fd.append('floor_id',floor.id);fd.append('apartment_id',saved.id);fd.append('asset_type','apartment-image');const u=await api('/admin/upload/apartment-images',{method:'POST',body:fd});await api(`/admin/apartments/${saved.id}`,{method:'PATCH',body:{image_path:u.url}})}onSaved()}return <div className="drawer"><div className="drawer-card"><button className="x" onClick={onCancel}>×</button><h2>{apartment?'Editează':'Apartament nou'}</h2>{(apartment?.image_path||f.image_path)&&<img className="apartment-form-image" src={apartment?.image_path||f.image_path}/>}<label className="button-file image-upload"><input type="file" accept="image/*" onChange={e=>setImageFile(e.target.files[0]||null)}/>{imageFile?`Imagine selectată: ${imageFile.name}`:'Încarcă imagine apartament'}</label><div className="form-grid"><label>Cod<input value={f.code} onChange={e=>setF({...f,code:e.target.value})}/></label><label>Status<select value={f.status} onChange={e=>setF({...f,status:e.target.value})}><option value="available">Disponibil</option><option value="reserved">Rezervat</option><option value="sold">Vândut</option></select></label><label className="wide">Titlu<input value={f.title||''} onChange={e=>setF({...f,title:e.target.value})}/></label><label>Camere<input type="number" value={f.rooms||''} onChange={e=>setF({...f,rooms:e.target.value})}/></label><label>Suprafață utilă<input type="number" step=".01" value={f.usable_area_sqm||''} onChange={e=>setF({...f,usable_area_sqm:e.target.value})}/></label><label>Suprafață totală<input type="number" step=".01" value={f.total_area_sqm||''} onChange={e=>setF({...f,total_area_sqm:e.target.value})}/></label><label>Preț<input type="number" value={f.price||''} onChange={e=>setF({...f,price:e.target.value})}/></label><label>Monedă<input value={f.currency||'EUR'} onChange={e=>setF({...f,currency:e.target.value})}/></label><label className="wide">URL apartament<input value={f.external_url||''} onChange={e=>setF({...f,external_url:e.target.value})}/></label><label className="wide">Descriere<textarea rows="4" value={f.description||''} onChange={e=>setF({...f,description:e.target.value})}/></label></div><button className="primary big" onClick={save}>Salvează apartamentul</button></div></div>}
function Plans({p,reload}){
  const [bid,setBid]=useState(p.buildings?.[0]?.id);
  const b=p.buildings.find(x=>x.id===bid)||p.buildings[0];
  const [fid,setFid]=useState(b?.floors?.[0]?.id);
  const [edit,setEdit]=useState(null),[newOpen,setNewOpen]=useState(false),[autoOpen,setAutoOpen]=useState(false),[copyLayoutOpen,setCopyLayoutOpen]=useState(false);

  useEffect(()=>{
    if(!b?.floors?.find(x=>x.id===fid))setFid(b?.floors?.[0]?.id)
  },[bid,p]);

  const f=b?.floors?.find(x=>x.id===fid)||b?.floors?.[0];
  if(!b)return null;

  async function uploadPlan(file){
    const fd=new FormData();
    fd.append('file',file);
    fd.append('project_id',p.id);
    fd.append('building_id',b.id);
    fd.append('floor_id',f.id);
    fd.append('asset_type','floor-plan');
    const u=await api('/admin/upload/floor-plans',{method:'POST',body:fd});
    await api(`/admin/floors/${f.id}`,{method:'PATCH',body:{plan_path:u.url}});
    reload();
  }

  async function deleteCurrentFloorPlanData(){
    const ok=await siteTypedConfirm({
      title:`Șterge planul ${f.name}`,
      message:`Se vor șterge planul activ, toate apartamentele de pe ${f.name}, toate poligoanele și toate informațiile comerciale asociate. Etajul ca structură rămâne.`,
      keyword:'SIGUR',
      confirmLabel:'Șterge planul etajului'
    });
    if(!ok)return;
    await api(`/admin/floors/${f.id}/plan-data`,{method:'DELETE'});
    setEdit(null);setNewOpen(false);setAutoOpen(false);setCopyLayoutOpen(false);
    await reload();
  }

  async function deleteAllProjectPlanData(){
    const ok=await siteTypedConfirm({
      title:'Șterge toate planurile',
      message:`Se vor șterge TOATE planurile din proiectul ${p.name}, toate apartamentele, poligoanele și toate informațiile comerciale asociate. Blocurile și structura etajelor rămân.`,
      keyword:'SIGUR',
      confirmLabel:'Șterge toate planurile'
    });
    if(!ok)return;
    await api(`/admin/projects/${p.id}/plan-data`,{method:'DELETE'});
    setEdit(null);setNewOpen(false);setAutoOpen(false);setCopyLayoutOpen(false);
    await reload();
  }

  return <>
    <SectionHead
      kicker="05 · PLANURI & APARTAMENTE"
      title="Plan interactiv"
      desc="Încarcă planul, detectează automat apartamentele sau trasează manual poligoanele."
      actions={<div className="inline-selects">
        <select value={b.id} onChange={e=>setBid(e.target.value)}>{p.buildings.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select value={f?.id||''} onChange={e=>setFid(e.target.value)}>{(b.floors||[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
      </div>}
    />

    {!f?<div className="empty-state"><b>Nu există etaje.</b><span>Generează etajele înainte de a adăuga planuri.</span></div>:<>
      <div className="panel plan-head">
        <div><h3>{f.name}</h3><p>{f.height_from_m}–{f.height_to_m} m · {(f.apartments||[]).length} apartamente</p></div>
        <div>
          <label className="button-file">
            <input type="file" accept="image/*" onChange={e=>e.target.files[0]&&uploadPlan(e.target.files[0])}/>
            {f.plan_path?'Înlocuiește planul':'Încarcă planul'}
          </label>
          {f.plan_path&&<button className="ui-action plan-action detect-action" onClick={()=>setAutoOpen(true)}>✦ Detectează apartamente</button>}
          {f.plan_path&&(f.apartments||[]).length>0&&<button className="ui-action plan-action copy-action" onClick={()=>setCopyLayoutOpen(true)}>Copiază plan + mapare</button>}
          <button className="primary plan-action add-action" onClick={()=>setNewOpen(true)}>＋ Apartament</button>
          {(f.plan_path||(f.apartments||[]).length>0)&&<button className="ui-action plan-action destructive-plan-action" onClick={deleteCurrentFloorPlanData}>Șterge plan etaj</button>}
          {(p.buildings||[]).some(bb=>(bb.floors||[]).some(ff=>ff.plan_path||(ff.apartments||[]).length>0))&&<button className="ui-action plan-action destructive-plan-action all-plans-action" onClick={deleteAllProjectPlanData}>Șterge toate planurile</button>}
        </div>
      </div>

      <div className="panel apartment-table">
        <div className="table">
          <div className="tr th"><span>Cod</span><span>Status</span><span>Camere</span><span>Suprafață</span><span>Acțiuni</span></div>
          {(f.apartments||[]).map(a=><div className="tr" key={a.id}>
            <b>{a.code}</b>
            <span className={'status-pill '+a.status}>{statusLabel[a.status]}</span>
            <span>{a.rooms||'—'}</span>
            <span>{a.usable_area_sqm?`${a.usable_area_sqm} m²`:'—'}</span>
            <div className="row-actions">
              {publicPageBase(p)&&<button className="copy-link-button" title={publicDeepLink(p,{building:b,floor:f,apartment:a})} onClick={()=>copyPublicLink(publicDeepLink(p,{building:b,floor:f,apartment:a}))}><i className="fa-solid fa-link"/> Link</button>}
              <button onClick={()=>setEdit(a)}>Editează</button>
              <button className="danger-ghost" onClick={async()=>{if(await siteConfirm({title:'Șterge apartamentul',message:`Apartamentul ${a.code} și maparea lui vor fi șterse.`,confirmLabel:'Șterge',danger:true})){await api(`/admin/apartments/${a.id}`,{method:'DELETE'});reload()}}}>Șterge</button>
            </div>
          </div>)}
        </div>
      </div>

      <PlanEditor floor={f} onChanged={reload}/>

      {autoOpen&&<AutoApartmentDetector floor={f} onClose={()=>setAutoOpen(false)} onCommitted={reload}/>}
      {copyLayoutOpen&&<CopyLayoutModal project={p} sourceBuilding={b} sourceFloor={f} onClose={()=>setCopyLayoutOpen(false)} onDone={reload}/>}
      {(newOpen||edit)&&<ApartmentForm project={p} floor={f} apartment={edit} onSaved={()=>{setEdit(null);setNewOpen(false);reload()}} onCancel={()=>{setEdit(null);setNewOpen(false)}}/>}
    </>}
  </>
}

function Preview({p}){return <><SectionHead kicker="06 · PREVIEW" title="Exact ce va vedea clientul" desc="Viewerul de mai jos este aceeași rută folosită în iframe."/><div className="panel iframe-preview"><iframe src={`/embed/${p.slug}?preview=1`} title="Preview"/></div></>}
function Embed({p,reload}){
  const origin=window.location.origin;
  const mountId=`estate-studio-${slugify(p.slug||p.name)}`;
  const smartCode=`<div id="${mountId}"></div>
<script>
(function(){
  var mount=document.getElementById('${mountId}');
  var viewer=new URL('${origin}/embed/${p.slug}');
  var pageParams=new URLSearchParams(window.location.search);

  ['building','floor','apartment'].forEach(function(key){
    var value=pageParams.get(key);
    if(value)viewer.searchParams.set(key,value);
  });

  var iframe=document.createElement('iframe');
  iframe.src=viewer.toString();
  iframe.width='100%';
  iframe.height='${p.embed_height||760}';
  iframe.style.border='0';
  iframe.loading='lazy';
  iframe.setAttribute('allowfullscreen','');
  mount.appendChild(iframe);
})();
<\/script>`;

  return <>
    <SectionHead kicker="07 · EMBED" title="Integrare în site" desc="Copiază codul inteligent. El transmite viewerului doar parametrii building / floor / apartment din URL-ul paginii clientului."/>
    <div className="embed-admin-grid">
      <div className="panel">
        <h3>Cod embed inteligent</h3>
        <pre className="codebox">{smartCode}</pre>
        <button className="primary" onClick={()=>navigator.clipboard.writeText(smartCode)}>Copiază codul</button>
        <div className="notice embed-deeplink-notice">UTM-urile și ceilalți parametri ai paginii clientului nu sunt modificați și nu sunt trimiși automat către Estate Studio.</div>
      </div>
      <div className="panel">
        <h3>Setări</h3>
        <label>Înălțime iframe (px)<input type="number" defaultValue={p.embed_height||760} onBlur={async e=>{await api(`/admin/projects/${p.id}`,{method:'PATCH',body:{embed_height:+e.target.value}});reload()}}/></label>
        <label>URL intern viewer<input readOnly value={`${origin}/embed/${p.slug}`}/></label>
        <label>URL public client<input readOnly value={publicPageBase(p)||'Configurează în General'}/></label>
        <a className="button-link" href={`/embed/${p.slug}`} target="_blank" rel="noreferrer">Deschide viewerul ↗</a>
      </div>
    </div>
  </>
}

function Dashboard({p}){
  const apartments=(p.buildings||[]).flatMap(b=>(b.floors||[]).flatMap(f=>(f.apartments||[]).map(a=>({...a,_building:b,_floor:f}))));
  const total=apartments.length;
  const countStatus=status=>apartments.filter(a=>a.status===status).length;
  const available=countStatus('available');
  const reserved=countStatus('reserved');
  const sold=countStatus('sold');
  const availability=total?Math.round((available/total)*100):0;

  const roomCount=rooms=>apartments.filter(a=>Number(a.rooms)===rooms).length;
  const studios=apartments.filter(a=>Number(a.rooms)<=1&&Number(a.rooms)>0).length;
  const room2=roomCount(2),room3=roomCount(3);
  const room4=apartments.filter(a=>Number(a.rooms)>=4).length;
  const roomsKnown=apartments.map(a=>Number(a.rooms||0)).filter(v=>v>0);
  const avgRooms=roomsKnown.length?(roomsKnown.reduce((s,v)=>s+v,0)/roomsKnown.length).toFixed(1):'—';

  const priced=apartments.filter(a=>Number(a.price)>0);
  const avgPrice=priced.length?Math.round(priced.reduce((s,a)=>s+Number(a.price||0),0)/priced.length):0;
  const availableValue=apartments.filter(a=>a.status==='available').reduce((s,a)=>s+Number(a.price||0),0);
  const areaValues=apartments.map(a=>Number(a.usable_area_sqm||a.total_area_sqm||0)).filter(Boolean);
  const avgArea=areaValues.length?Math.round(areaValues.reduce((s,v)=>s+v,0)/areaValues.length):0;


  const buildingStats=(p.buildings||[]).map(b=>{
    const aps=(b.floors||[]).flatMap(f=>f.apartments||[]);
    const av=aps.filter(a=>a.status==='available').length;
    const rs=aps.filter(a=>a.status==='reserved').length;
    const sd=aps.filter(a=>a.status==='sold').length;
    return {id:b.id,name:b.name,total:aps.length,available:av,reserved:rs,sold:sd,rate:aps.length?Math.round(av/aps.length*100):0};
  });

  const money=v=>v?new Intl.NumberFormat('ro-RO',{maximumFractionDigits:0}).format(v)+' €':'—';
  const sharedModel=p.settings?.shared_model?.url?p.settings.shared_model:null;
  const overview2D=p.settings?.two_d?.overview?.image_url||null;
  const visualMode=p.settings?.visual_mode||'3d';
  const hasAny3D=!!sharedModel||(p.buildings||[]).some(b=>!!b.model_path);
  const use2DHero=!!overview2D&&(visualMode==='2d'||!hasAny3D);

  const roomMetrics=[
    {label:'Studio / 1 cameră',value:studios,className:'studio'},
    {label:'2 camere',value:room2,className:'r2'},
    {label:'3 camere',value:room3,className:'r3'},
    {label:'4+ camere',value:room4,className:'r4'}
  ];

  return <>
    <SectionHead
      kicker="08 · DASHBOARD"
      title="Project Intelligence"
      desc="Imagine de ansamblu pentru inventar, disponibilitate și distribuția apartamentelor."
    />

    <div className="dashboard-hero-grid">
      <div className="dashboard-3d-card">
        <div className="dashboard-card-head">
          <div><small>CADRU 3D PROIECT</small><b>{p.name}</b></div>
          <span>{(p.buildings||[]).length} blocuri</span>
        </div>
        <div className="dashboard-3d-frame">
          {use2DHero?<img className="dashboard-2d-hero" src={overview2D} alt={p.name}/>:<Suspense fallback={<div className="dashboard-3d-loading">Se încarcă modelul 3D…</div>}>
            <ThreeViewer buildings={p.buildings||[]} sharedModel={sharedModel} compact staticView showGrid={false} showBubbles={false}/>
          </Suspense>}
        </div>
      </div>

      <div className="dashboard-main-kpi">
        <div className="dashboard-kpi-top">
          <span>DISPONIBILITATE PROIECT</span>
          <i className="fa-solid fa-chart-pie"/>
        </div>
        <div className="dashboard-rate-row">
          <div className="dashboard-rate-ring" style={{'--rate':`${availability*3.6}deg`}}>
            <div><b>{availability}%</b><span>disponibil</span></div>
          </div>
          <div className="dashboard-rate-copy">
            <strong>{available} din {total}</strong>
            <span>apartamente disponibile acum</span>
          </div>
        </div>
        <div className="dashboard-status-mini">
          <div><i className="dot available"/><span>Disponibile</span><b>{available}</b></div>
          <div><i className="dot reserved"/><span>Rezervate</span><b>{reserved}</b></div>
          <div><i className="dot sold"/><span>Vândute</span><b>{sold}</b></div>
        </div>
      </div>
    </div>

    <div className="dashboard-kpi-grid">
      <div className="dashboard-kpi-card mint">
        <div className="dashboard-kpi-icon"><i className="fa-solid fa-building"/></div>
        <span>Total apartamente</span><b>{total}</b>
        <small>{(p.buildings||[]).length} blocuri · {(p.buildings||[]).reduce((s,b)=>s+(b.floors||[]).length,0)} etaje</small>
      </div>
      <div className="dashboard-kpi-card lilac">
        <div className="dashboard-kpi-icon"><i className="fa-solid fa-door-open"/></div>
        <span>Număr mediu camere</span><b>{avgRooms}</b>
        <small>medie calculată pentru unitățile cu tipologie definită</small>
      </div>
      <div className="dashboard-kpi-card blue">
        <div className="dashboard-kpi-icon"><i className="fa-solid fa-ruler-combined"/></div>
        <span>Suprafață medie</span><b>{avgArea?`${avgArea} m²`:'—'}</b>
        <small>suprafață utilă / totală disponibilă</small>
      </div>
      <div className="dashboard-kpi-card yellow">
        <div className="dashboard-kpi-icon"><i className="fa-solid fa-tag"/></div>
        <span>Preț mediu</span><b>{money(avgPrice)}</b>
        <small>valoare disponibilă: {money(availableValue)}</small>
      </div>
    </div>

    <div className="dashboard-mid-grid">
      <div className="dashboard-panel room-distribution">
        <div className="dashboard-card-head">
          <div><small>TIPOLOGII</small><b>Distribuție pe camere</b></div>
          <span>{total} unități</span>
        </div>
        <div className="room-metric-list">
          {roomMetrics.map(m=>{
            const pct=total?Math.round(m.value/total*100):0;
            return <div className={'room-metric '+m.className} key={m.label}>
              <div><span>{m.label}</span><b>{m.value}</b></div>
              <div className="room-bar"><i style={{width:`${pct}%`}}/></div>
              <small>{pct}% din proiect</small>
            </div>
          })}
        </div>
      </div>

      <div className="dashboard-panel inventory-overview">
        <div className="dashboard-card-head">
          <div><small>INVENTAR</small><b>Stare comercială</b></div>
        </div>
        <div className="inventory-stack">
          <div className="available" style={{width:`${total?available/total*100:0}%`}}/>
          <div className="reserved" style={{width:`${total?reserved/total*100:0}%`}}/>
          <div className="sold" style={{width:`${total?sold/total*100:0}%`}}/>
        </div>
        <div className="inventory-legend">
          <div><i className="dot available"/><span>Disponibile</span><b>{available}</b></div>
          <div><i className="dot reserved"/><span>Rezervate</span><b>{reserved}</b></div>
          <div><i className="dot sold"/><span>Vândute</span><b>{sold}</b></div>
        </div>
        <div className="dashboard-highlight-box">
          <small>KPI PRINCIPAL</small>
          <strong>{availability}% disponibilitate</strong>
          <span>{total-available} unități sunt rezervate sau vândute.</span>
        </div>
      </div>
    </div>

    <div className="dashboard-panel building-performance">
      <div className="dashboard-card-head">
        <div><small>PER BLOC</small><b>Disponibilitate și inventar</b></div>
      </div>
      <div className="dashboard-building-table">
        <div className="dashboard-building-row head"><span>Bloc</span><span>Total</span><span>Disponibile</span><span>Rezervate</span><span>Vândute</span><span>Disponibilitate</span></div>
        {buildingStats.map(b=><div className="dashboard-building-row" key={b.id}>
          <strong>{b.name}</strong>
          <span>{b.total}</span>
          <span>{b.available}</span>
          <span>{b.reserved}</span>
          <span>{b.sold}</span>
          <div className="building-rate"><i style={{width:`${b.rate}%`}}/><b>{b.rate}%</b></div>
        </div>)}
      </div>
    </div>

  </>
}


function PublicLinks({p}){
  const base=publicPageBase(p);
  const totalLinks=(p.buildings||[]).reduce((sum,b)=>sum+1+(b.floors||[]).reduce((s,f)=>s+1+(f.apartments||[]).length,0),0);

  if(!base)return <>
    <SectionHead kicker="09 · LINKURI PUBLICE" title="Deep links pentru campanii" desc="Linkurile sunt generate pe domeniul clientului, nu pe Estate Studio."/>
    <div className="empty-state public-links-empty">
      <i className="fa-solid fa-link"/>
      <b>Configurează URL-ul public</b>
      <span>În pagina General completează câmpul „URL public al paginii cu embed”, de exemplu https://client.ro/apartamente.</span>
      <Link className="primary" to={`/admin/projects/${p.id}/general`}>Mergi la General</Link>
    </div>
  </>;

  return <>
    <SectionHead
      kicker="09 · LINKURI PUBLICE"
      title="Deep links pentru proiect"
      desc="Linkuri gata de folosit către ansamblu, blocuri, etaje și apartamente. Slug-urile sunt generate automat din denumirile introduse în admin."
      actions={<button className="ui-action" onClick={()=>copyPublicLink(base)}><i className="fa-solid fa-copy"/> Copiază link ansamblu</button>}
    />

    <div className="panel public-link-summary">
      <div><small>PAGINĂ PUBLICĂ</small><b>{base}</b></div>
      <div><small>LINKURI GENERATE</small><b>{totalLinks}</b></div>
      <div><small>ALIASURI</small><b>automate la redenumire</b></div>
    </div>

    <div className="public-links-tree">
      {(p.buildings||[]).map(b=>{
        const buildingLink=publicDeepLink(p,{building:b});
        return <section className="panel public-link-building" key={b.id}>
          <div className="public-link-building-head">
            <div>
              <small>BLOC · {publicEntitySlug(b,'building')}</small>
              <h3>{b.name}</h3>
            </div>
            <div className="public-link-actions">
              <code>{buildingLink}</code>
              <button className="ui-action" onClick={()=>copyPublicLink(buildingLink)}><i className="fa-solid fa-copy"/> Copiază</button>
            </div>
          </div>

          <div className="public-link-floor-list">
            {(b.floors||[]).map(f=>{
              const floorLink=publicDeepLink(p,{building:b,floor:f});
              return <div className="public-link-floor" key={f.id}>
                <div className="public-link-floor-head">
                  <div><i className="fa-solid fa-layer-group"/><span>{f.name}</span><small>{publicEntitySlug(f,'floor')}</small></div>
                  <div className="public-link-actions">
                    <code>{floorLink}</code>
                    <button className="mini-link-button" onClick={()=>copyPublicLink(floorLink)}><i className="fa-solid fa-copy"/> Copiază</button>
                  </div>
                </div>

                {(f.apartments||[]).length>0&&<div className="public-link-apartments">
                  {(f.apartments||[]).map(a=>{
                    const apartmentLink=publicDeepLink(p,{building:b,floor:f,apartment:a});
                    return <div className="public-link-apartment" key={a.id}>
                      <div><b>{a.code}</b><span>{a.title||'Apartament'}</span><small>{publicEntitySlug(a,'apartment')}</small></div>
                      <code>{apartmentLink}</code>
                      <button className="mini-link-button" onClick={()=>copyPublicLink(apartmentLink)}><i className="fa-solid fa-copy"/> Copiază</button>
                    </div>
                  })}
                </div>}
              </div>
            })}
          </div>
        </section>
      })}
    </div>

    <div className="notice public-links-note">
      Dacă redenumești un bloc, etaj sau cod de apartament, Estate Studio păstrează automat slug-ul vechi ca alias. Linkurile deja folosite în campanii continuă astfel să funcționeze.
    </div>
  </>
}

function Project(){const {id,section='general'}=useParams();const [p,setP]=useState(null),[err,setErr]=useState('');const load=()=>api(`/admin/projects/${id}`).then(data=>{setP(data);setErr('');return data}).catch(e=>{setErr(e.message);throw e});useEffect(()=>{let active=true;setP(null);setErr('');api(`/admin/projects/${id}`).then(data=>{if(active)setP(data)}).catch(e=>{if(active)setErr(e.message)});return()=>{active=false}},[id]);if(err)return <Shell><div className="content"><div className="error-box">{err}</div></div></Shell>;if(!p)return <div className="page-loading">Se încarcă proiectul…</div>;let comp={general:<General p={p} reload={load}/>,buildings:<Buildings p={p} reload={load}/>,model:<Model p={p} reload={load}/>,calibration:<Calibration p={p} reload={load}/>,floors:<Floors p={p} reload={load}/>,plans:<Plans p={p} reload={load}/>,preview:<Preview p={p}/>,embed:<Embed p={p} reload={load}/>,dashboard:<Dashboard p={p}/>,links:<PublicLinks p={p}/>}[section]||<General p={p} reload={load}/>;return <ProjectShell project={p} reload={load}>{comp}</ProjectShell>}
export default function AdminApp(){const [auth,setAuth]=useState(null);useEffect(()=>{api('/auth/me').then(()=>setAuth(true)).catch(()=>setAuth(false))},[]);if(auth===null)return <div className="page-loading">ESTATE STUDIO</div>;if(!auth)return <Login onLogin={()=>setAuth(true)}/>;return <Routes><Route path="/" element={<Navigate to="/admin/projects" replace/>}/><Route path="/admin" element={<Navigate to="/admin/projects" replace/>}/><Route path="/admin/projects" element={<Projects/>}/><Route path="/admin/projects/:id/:section" element={<Project/>}/><Route path="*" element={<Navigate to="/admin/projects" replace/>}/></Routes>}
