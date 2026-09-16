import React,{lazy,useEffect,useMemo,useState} from 'react';
import {Link,Navigate,Route,Routes,useLocation,useNavigate,useParams} from 'react-router-dom';
import {api,slugify,statusLabel} from '../api';
const ThreeViewer=lazy(()=>import('./ThreeViewer'));
const PlanEditor=lazy(()=>import('./PlanEditor'));
const AutoApartmentDetector=lazy(()=>import('./AutoApartmentDetector'));
const SharedModelMapper=lazy(()=>import('./SharedModelMapper'));

const STEPS=[['general','General'],['buildings','Blocuri'],['model','Model 3D'],['calibration','Calibrare'],['floors','Etaje'],['plans','Planuri & apartamente'],['preview','Preview'],['embed','Embed']];

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
function Shell({children}){const nav=useNavigate();return <div className="app-shell"><aside className="main-sidebar"><Link className="brand" to="/admin/projects"><span>ES</span><div><b>Estate Studio</b><small>Configurator 3D</small></div></Link><nav><Link to="/admin/projects">▦ Proiecte</Link></nav><div className="sidebar-foot"><button onClick={async()=>{await api('/auth/logout',{method:'POST'});location.reload()}}>Ieșire</button></div></aside><div className="shell-main">{children}</div></div>}
function Projects(){const [items,setItems]=useState([]),[show,setShow]=useState(false),[name,setName]=useState(''),[slug,setSlug]=useState(''),[loadError,setLoadError]=useState('');const nav=useNavigate();const load=()=>{setLoadError('');return api('/admin/projects').then(setItems).catch(e=>{setLoadError(e.message);setItems([])})};useEffect(()=>{load()},[]);async function create(e){e.preventDefault();const p=await api('/admin/projects',{method:'POST',body:{name,slug:slug||slugify(name)}});nav(`/admin/projects/${p.id}/general`)}return <Shell><header className="topbar"><div><small>ESTATE STUDIO</small><h1>Proiecte</h1><p>Fiecare proiect are date, modele, planuri și iframe propriu.</p></div><button className="primary" onClick={()=>setShow(true)}>＋ Proiect nou</button></header><div className="content">{loadError&&<div className="error-box" style={{marginBottom:16}}>{loadError}</div>}<div className="project-grid">{items.map(p=><article className="project-card" key={p.id}><div className="project-cover" style={p.settings?.hero_url?{backgroundImage:`linear-gradient(#0b120f33,#0b120f33),url(${p.settings.hero_url})`,backgroundSize:'cover',backgroundPosition:'center'}:{}}><span>{p.settings?.hero_url?'':p.name.slice(0,2).toUpperCase()}</span><i className={p.is_published?'live':'draft'}>{p.is_published?'Publicat':'Draft'}</i></div><div className="project-body"><small>/{p.slug}</small><h3>{p.name}</h3><p>{p.building_count||0} blocuri · {p.floor_count||0} etaje · {p.apartment_count||0} apartamente</p><div className="card-actions"><button className="primary" onClick={()=>nav(`/admin/projects/${p.id}/general`)}>Deschide</button><button onClick={async()=>{if(await siteConfirm({title:'Duplică proiectul',message:`Va fi creată o copie nouă pentru ${p.name}.`,confirmLabel:'Duplică'})){await api(`/admin/projects/${p.id}/duplicate`,{method:'POST'});load()}}}>Duplică</button><button className="danger-ghost" onClick={async()=>{if(await siteConfirm({title:'Șterge proiectul',message:`${p.name} va fi șters definitiv, împreună cu datele lui.`,confirmLabel:'Șterge definitiv',danger:true})){await api(`/admin/projects/${p.id}`,{method:'DELETE'});load()}}}>Șterge</button></div></div></article>)}{items.length===0&&<div className="empty-state"><b>Niciun proiect încă</b><span>Creează primul proiect și configurează-i modelul 3D.</span><button className="primary" onClick={()=>setShow(true)}>Creează proiect</button></div>}</div></div>{show&&<div className="modal"><form className="modal-card" onSubmit={create}><button type="button" className="x" onClick={()=>setShow(false)}>×</button><h2>Proiect nou</h2><label>Nume proiect<input autoFocus value={name} onChange={e=>{setName(e.target.value);setSlug(slugify(e.target.value))}} required/></label><label>Slug iframe<input value={slug} onChange={e=>setSlug(slugify(e.target.value))} required/></label><button className="primary big">Creează proiectul</button></form></div>}</Shell>}
function ProjectShell({project,reload,children}){const {section}=useParams();const idx=Math.max(0,STEPS.findIndex(([k])=>k===section));const complete={general:!!project.name,buildings:(project.buildings||[]).length>0,model:!!project.settings?.shared_model?.url||(project.buildings||[]).some(b=>b.model_path),calibration:project.settings?.model_mode==='shared'?!!project.settings?.shared_model?.display_height_units:(project.buildings||[]).some(b=>b.model_path&&b.real_height_m&&b.display_height_units),floors:(project.buildings||[]).some(b=>(b.floors||[]).length>0),plans:(project.buildings||[]).some(b=>(b.floors||[]).some(f=>f.plan_path&&(f.apartments||[]).length>0)),preview:false,embed:project.is_published};return <Shell><header className="project-top"><div><Link to="/admin/projects">← Proiecte</Link><small>{project.is_published?'PUBLICAT':'DRAFT'}</small><h1>{project.name}</h1><span>/{project.slug}</span></div><div className="project-top-actions"><a href={`/embed/${project.slug}?preview=1`} target="_blank" rel="noreferrer">Deschide viewer ↗</a><button className={project.is_published?'success':'primary'} onClick={async()=>{await api(`/admin/projects/${project.id}`,{method:'PATCH',body:{is_published:!project.is_published}});reload()}}>{project.is_published?'✓ Publicat':'Publică proiectul'}</button></div></header><div className="project-layout"><aside className="project-nav">{STEPS.map(([key,label],i)=><Link key={key} className={section===key?'active':''} to={`/admin/projects/${project.id}/${key}`}><span>{complete[key]?'✓':String(i+1).padStart(2,'0')}</span>{label}</Link>)}</aside><main className="project-content">{children}<div className="step-footer">{idx>0?<Link className="button-link" to={`/admin/projects/${project.id}/${STEPS[idx-1][0]}`}>← {STEPS[idx-1][1]}</Link>:<span/>}{idx<STEPS.length-1&&<Link className="primary" to={`/admin/projects/${project.id}/${STEPS[idx+1][0]}`}>{STEPS[idx+1][1]} →</Link>}</div></main></div></Shell>}
function SectionHead({kicker,title,desc,actions}){return <div className="section-head"><div><small>{kicker}</small><h2>{title}</h2><p>{desc}</p></div>{actions&&<div>{actions}</div>}</div>}
function General({p,reload}){const [form,setForm]=useState({name:p.name,slug:p.slug,description:p.description||'',embed_height:p.embed_height||760,source_mode:p.source_mode||'glb'});const save=async()=>{await api(`/admin/projects/${p.id}`,{method:'PATCH',body:form});reload()};async function uploadBrand(file,key){const fd=new FormData();fd.append('file',file);fd.append('project_id',p.id);fd.append('asset_type',key==='logo_url'?'project-logo':'project-hero');const u=await api('/admin/upload/project-images',{method:'POST',body:fd});await api(`/admin/projects/${p.id}`,{method:'PATCH',body:{settings:{...(p.settings||{}),[key]:u.url}}});reload()}return <><SectionHead kicker="01 · GENERAL" title="Identitatea proiectului" desc="Datele de bază și modul în care va fi folosit proiectul."/><div className="panel form-grid"><label>Nume proiect<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Slug public<input value={form.slug} onChange={e=>setForm({...form,slug:slugify(e.target.value)})}/></label><label className="wide">Descriere<textarea rows="4" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>Înălțime iframe implicită<input type="number" value={form.embed_height} onChange={e=>setForm({...form,embed_height:+e.target.value})}/></label><label>Sursă model<select value={form.source_mode} onChange={e=>setForm({...form,source_mode:e.target.value})}><option value="glb">GLB / GLTF existent</option><option value="documents">Documentație arhitecturală</option></select></label><div className="wide end"><button className="primary" onClick={save}>Salvează</button></div></div><div className="panel brand-assets"><div><h3>Logo proiect</h3>{p.settings?.logo_url?<img className="asset-preview logo" src={p.settings.logo_url}/>:<div className="asset-placeholder">LOGO</div>}<label className="button-file"><input type="file" accept="image/*" onChange={e=>e.target.files[0]&&uploadBrand(e.target.files[0],'logo_url')}/>Încarcă logo</label></div><div><h3>Imagine proiect</h3>{p.settings?.hero_url?<img className="asset-preview" src={p.settings.hero_url}/>:<div className="asset-placeholder">HERO</div>}<label className="button-file"><input type="file" accept="image/*" onChange={e=>e.target.files[0]&&uploadBrand(e.target.files[0],'hero_url')}/>Încarcă imagine</label></div></div>{form.source_mode==='documents'&&<Documents p={p} reload={reload}/>}</>}
function Documents({p,reload}){const [busy,setBusy]=useState(false);async function up(file){setBusy(true);try{const fd=new FormData();fd.append('file',file);fd.append('project_id',p.id);fd.append('asset_type','architectural-document');await api('/admin/upload/project-documents',{method:'POST',body:fd});reload()}finally{setBusy(false)}}return <div className="panel"><h3>Documentație arhitecturală</h3><p className="hint">Încarcă plan general, planuri de nivel, fațade, secțiuni și cote. Fișierele sunt păstrate pe proiect pentru fluxul de modelare.</p><label className="upload-zone"><input type="file" multiple accept=".pdf,image/*,.dwg,.dxf" onChange={e=>[...e.target.files].forEach(up)}/><b>{busy?'Se încarcă…':'＋ Încarcă documentație'}</b><span>PDF, imagini, DWG/DXF · max 50 MB / fișier</span></label><div className="asset-list">{(p.assets||[]).filter(a=>a.asset_type==='architectural-document').map(a=><div key={a.id}><b>{a.file_name||a.label||'Document'}</b><span>{a.mime_type||''}</span></div>)}</div><div className="notice warning">Generarea automată a unui model comercial detaliat din planuri necesită un motor de modelare/AI conectat serverului. Estate Studio păstrează documentația și workflow-ul pregătit, fără să inventeze geometrie lipsă.</div></div>}
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
        <button className="danger-ghost" onClick={async()=>{if(await siteConfirm({title:'Șterge blocul',message:'Blocul, etajele și apartamentele lui vor fi șterse definitiv.',confirmLabel:'Șterge blocul',danger:true})){await api(`/admin/buildings/${b.id}`,{method:'DELETE'});reload()}}}>Șterge</button>
      </div>)}
      <div className="panel add-row"><input placeholder="Ex. Bloc 2" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()}/><button className="primary" onClick={add}>＋ Adaugă bloc</button></div>
    </div>
  </>
}
function Model({p,reload}){
  const [bid,setBid]=useState(p.buildings?.[0]?.id);
  const b=p.buildings.find(x=>x.id===bid)||p.buildings[0];
  const mode=p.settings?.model_mode||'individual';
  const shared=p.settings?.shared_model||{up_axis:'Y',reference_real_height_m:27,display_height_units:2.7,auto_ground:true};

  async function patchProjectSettings(extra){
    await api(`/admin/projects/${p.id}`,{method:'PATCH',body:{settings:{...(p.settings||{}),...extra}}});reload()
  }
  async function setMode(next){
    await patchProjectSettings({model_mode:next});
  }
  async function patchShared(patch){
    await patchProjectSettings({shared_model:{...shared,...patch}});
  }
  async function uploadShared(file){
    const fd=new FormData();fd.append('file',file);fd.append('project_id',p.id);fd.append('asset_type','shared-complex-model');
    const u=await api('/admin/upload/models',{method:'POST',body:fd});
    await patchShared({url:u.url});
  }

  if(!b)return <div className="empty-state"><b>Adaugă întâi un bloc.</b></div>;

  async function patchBuilding(body){await api(`/admin/buildings/${b.id}`,{method:'PATCH',body});reload()}
  async function uploadIndividual(file){
    const fd=new FormData();fd.append('file',file);fd.append('project_id',p.id);fd.append('building_id',b.id);fd.append('asset_type','building-model');
    const u=await api('/admin/upload/models',{method:'POST',body:fd});await patchBuilding({model_path:u.url})
  }

  return <>
    <SectionHead kicker="03 · MODEL 3D" title="Modelul ansamblului" desc="Poți păstra fluxul clasic cu un GLB per bloc sau poți încărca un singur GLB cu întregul complex și mapa clădirile."/>
    <div className="model-mode-switch panel">
      <button className={mode==='individual'?'active':''} onClick={()=>setMode('individual')}><b>GLB separat per bloc</b><span>Fluxul existent, neschimbat</span></button>
      <button className={mode==='shared'?'active':''} onClick={()=>setMode('shared')}><b>GLB comun · complex</b><span>Un singur model, mai multe clădiri mapate</span></button>
    </div>

    {mode==='individual'?<>
      <SectionHead kicker="MODEL INDIVIDUAL" title="Modelul clădirii" desc="Încarcă GLB/GLTF pentru fiecare bloc. Modelul apare imediat în preview." actions={<select value={b.id} onChange={e=>setBid(e.target.value)}>{p.buildings.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>}/>
      <div className="model-grid"><div className="panel preview-panel"><ThreeViewer buildings={[b]} selectedBuildingId={b.id}/></div><div className="panel settings-panel"><h3>{b.name}</h3><label className="upload-zone"><input type="file" accept=".glb,.gltf,model/gltf-binary" onChange={e=>e.target.files[0]&&uploadIndividual(e.target.files[0])}/><b>{b.model_path?'Înlocuiește GLB/GLTF':'Încarcă GLB/GLTF'}</b><span>{b.model_path?'Model încărcat ✓':'max 50 MB'}</span></label>{b.model_path&&<><p className="hint break-url">{b.model_path}</p><div className="notice">Fluxul existent rămâne intact. Scalarea și orientarea se fac la runtime.</div></>}</div></div>
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
  </>
}
function Calibration({p,reload}){
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
        <div className="table">
          <div className="tr th"><span>Nivel</span><span>De la (m)</span><span>Până la (m)</span><span>Plan</span></div>
          {(b.floors||[]).map(f=><div className="tr" key={f.id}>
            <input defaultValue={f.name} onBlur={e=>api(`/admin/floors/${f.id}`,{method:'PATCH',body:{name:e.target.value}}).then(reload)}/>
            <input type="number" step=".1" defaultValue={f.height_from_m} onBlur={e=>api(`/admin/floors/${f.id}`,{method:'PATCH',body:{height_from_m:+e.target.value}}).then(reload)}/>
            <input type="number" step=".1" defaultValue={f.height_to_m} onBlur={e=>api(`/admin/floors/${f.id}`,{method:'PATCH',body:{height_to_m:+e.target.value}}).then(reload)}/>
            <span>{f.plan_path?'✓':'—'}</span>
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
          {f.plan_path&&<button className="ui-action" onClick={()=>setAutoOpen(true)}>✦ Detectează apartamente</button>}
          {f.plan_path&&(f.apartments||[]).length>0&&<button className="ui-action" onClick={()=>setCopyLayoutOpen(true)}>Copiază plan + mapare</button>}
          <button className="primary" onClick={()=>setNewOpen(true)}>＋ Apartament</button>
          {(f.plan_path||(f.apartments||[]).length>0)&&<button className="ui-action destructive-plan-action" onClick={deleteCurrentFloorPlanData}>Șterge plan etaj</button>}
          {(p.buildings||[]).some(bb=>(bb.floors||[]).some(ff=>ff.plan_path||(ff.apartments||[]).length>0))&&<button className="ui-action destructive-plan-action" onClick={deleteAllProjectPlanData}>Șterge toate planurile</button>}
        </div>
      </div>

      <div className="panel apartment-table">
        <div className="table">
          <div className="tr th"><span>Cod</span><span>Status</span><span>Camere</span><span>Suprafață</span><span></span></div>
          {(f.apartments||[]).map(a=><div className="tr" key={a.id}>
            <b>{a.code}</b>
            <span className={'status-pill '+a.status}>{statusLabel[a.status]}</span>
            <span>{a.rooms||'—'}</span>
            <span>{a.usable_area_sqm?`${a.usable_area_sqm} m²`:'—'}</span>
            <div className="row-actions">
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
function Embed({p,reload}){const origin=window.location.origin;const code=`<iframe\n  src="${origin}/embed/${p.slug}"\n  width="100%"\n  height="${p.embed_height||760}"\n  style="border:0"\n  allowfullscreen\n  loading="lazy"\n></iframe>`;return <><SectionHead kicker="07 · EMBED" title="Integrare în site" desc="Copiază codul și inserează-l în pagina clientului."/><div className="embed-admin-grid"><div className="panel"><h3>Cod iframe</h3><pre className="codebox">{code}</pre><button className="primary" onClick={()=>navigator.clipboard.writeText(code)}>Copiază codul</button></div><div className="panel"><h3>Setări</h3><label>Înălțime iframe (px)<input type="number" defaultValue={p.embed_height||760} onBlur={async e=>{await api(`/admin/projects/${p.id}`,{method:'PATCH',body:{embed_height:+e.target.value}});reload()}}/></label><label>URL direct<input readOnly value={`${origin}/embed/${p.slug}`}/></label><a className="button-link" href={`/embed/${p.slug}`} target="_blank" rel="noreferrer">Deschide viewerul ↗</a></div></div></>}
function Project(){const {id,section='general'}=useParams();const [p,setP]=useState(null),[err,setErr]=useState('');const load=()=>api(`/admin/projects/${id}`).then(data=>{setP(data);setErr('');return data}).catch(e=>{setErr(e.message);throw e});useEffect(()=>{let active=true;setP(null);setErr('');api(`/admin/projects/${id}`).then(data=>{if(active)setP(data)}).catch(e=>{if(active)setErr(e.message)});return()=>{active=false}},[id]);if(err)return <Shell><div className="content"><div className="error-box">{err}</div></div></Shell>;if(!p)return <div className="page-loading">Se încarcă proiectul…</div>;let comp={general:<General p={p} reload={load}/>,buildings:<Buildings p={p} reload={load}/>,model:<Model p={p} reload={load}/>,calibration:<Calibration p={p} reload={load}/>,floors:<Floors p={p} reload={load}/>,plans:<Plans p={p} reload={load}/>,preview:<Preview p={p}/>,embed:<Embed p={p} reload={load}/>}[section]||<General p={p} reload={load}/>;return <ProjectShell project={p} reload={load}>{comp}</ProjectShell>}
export default function AdminApp(){const [auth,setAuth]=useState(null);useEffect(()=>{api('/auth/me').then(()=>setAuth(true)).catch(()=>setAuth(false))},[]);if(auth===null)return <div className="page-loading">ESTATE STUDIO</div>;if(!auth)return <Login onLogin={()=>setAuth(true)}/>;return <Routes><Route path="/" element={<Navigate to="/admin/projects" replace/>}/><Route path="/admin" element={<Navigate to="/admin/projects" replace/>}/><Route path="/admin/projects" element={<Projects/>}/><Route path="/admin/projects/:id/:section" element={<Project/>}/><Route path="*" element={<Navigate to="/admin/projects" replace/>}/></Routes>}
