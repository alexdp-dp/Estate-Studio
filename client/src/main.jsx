import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {Canvas} from '@react-three/fiber';
import {Environment,OrbitControls,useGLTF} from '@react-three/drei';
import './styles.css';

const API='/api';
const statusLabel={available:'Disponibil',reserved:'Rezervat',sold:'Vândut'};
const statusClass={available:'available',reserved:'reserved',sold:'sold'};

function Model({url,activeFloor,realHeight,displayHeight}){
 const {scene}=useGLTF(url); const clone=useMemo(()=>scene.clone(true),[scene]);
 useEffect(()=>{
  clone.traverse(o=>{if(!o.isMesh)return;o.userData.base=o.material;
   if(activeFloor){const min=activeFloor.height_from_m/realHeight*displayHeight,max=activeFloor.height_to_m/realHeight*displayHeight,mat=o.material.clone();
    mat.onBeforeCompile=s=>{s.uniforms.uMin={value:min};s.uniforms.uMax={value:max};
     s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying float vWorldY;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWorldY=(modelMatrix*vec4(transformed,1.0)).y;');
     s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying float vWorldY; uniform float uMin; uniform float uMax;').replace('#include <dithering_fragment>','if(vWorldY>=uMin&&vWorldY<=uMax){gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.08,.82,.39),.72);}\n#include <dithering_fragment>');};
    o.material=mat;
   }});
  return()=>clone.traverse(o=>{if(o.isMesh&&o.userData.base)o.material=o.userData.base});
 },[clone,activeFloor,realHeight,displayHeight]);
 return <primitive object={clone}/>;
}
function Viewer({project,onFloor}){
 const b=project.buildings?.[0], floors=b?.floors||[]; const [active,setActive]=useState(null); const controls=useRef();
 return <div className="viewer"><Canvas camera={{position:[4,3.4,5],fov:38}}><ambientLight intensity={1.7}/><directionalLight position={[4,7,5]} intensity={2}/>
  <React.Suspense fallback={null}>{project.model_path&&<Model url={project.model_path} activeFloor={active} realHeight={Number(project.real_height_m)||27} displayHeight={Number(project.display_height_units)||2.7}/>}<Environment preset="city"/></React.Suspense>
  <gridHelper args={[12,24]}/><OrbitControls ref={controls} target={[0,1.2,0]} enableDamping/></Canvas>
  <div className="brand"><b>ESTATE</b> STUDIO<div>{project.name}</div></div>
  <div className="view-switch"><button className="sel">Perspectivă</button><button onClick={()=>controls.current?.reset()}>De sus</button></div>
  <div className="floors-card"><div className="floors-title">{b?.name||'Etaje'}</div>{[...floors].reverse().map(f=><button key={f.id} onMouseEnter={()=>setActive(f)} onMouseLeave={()=>setActive(null)} onClick={()=>onFloor(f)}>{f.name}<small>{f.height_from_m}–{f.height_to_m} m</small></button>)}</div>
  <div className="tools"><button onClick={()=>controls.current?.dollyOut(1.25)}>＋</button><button onClick={()=>controls.current?.dollyIn(1.25)}>−</button><button onClick={()=>controls.current?.reset()}>⌖</button><button onClick={()=>document.querySelector('.viewer')?.requestFullscreen()}>⛶</button></div>
 </div>
}
function FloorPublic({floor,close}){
 return <div className="floor-modal" onClick={close}><div onClick={e=>e.stopPropagation()}><button className="close" onClick={close}>×</button><h2>{floor.name}</h2>
  <div className="publicplan">{floor.plan_path?<img src={floor.plan_path}/>:<div className="planplaceholder">Planul etajului nu este încărcat.</div>}<svg viewBox="0 0 100 100" preserveAspectRatio="none">
   {(floor.apartments||[]).map(a=>{const pts=a.apartment_polygons?.[0]?.points||[];return pts.length>2?<polygon key={a.id} className={statusClass[a.status]} points={pts.map(p=>`${p.x*100},${p.y*100}`).join(' ')}><title>{a.code} · {statusLabel[a.status]}</title></polygon>:null})}
  </svg></div><div className="legend"><span className="available">Disponibil</span><span className="reserved">Rezervat</span><span className="sold">Vândut</span></div></div></div>
}
function Login({done}){const[u,setU]=useState('alexdarie'),[p,setP]=useState(''),[err,setErr]=useState('');async function go(e){e.preventDefault();const r=await fetch(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});r.ok?done():setErr('User sau parolă incorecte')}return <div className="login"><form onSubmit={go}><h1>Estate Studio</h1><p>Administrare Supabase</p><input value={u} onChange={e=>setU(e.target.value)}/><input type="password" value={p} onChange={e=>setP(e.target.value)} placeholder="Parolă"/><button>Autentificare</button>{err&&<em>{err}</em>}</form></div>}
function PlanEditor({floor,reload}){
 const [pts,setPts]=useState([]),[drag,setDrag]=useState(-1),[code,setCode]=useState('A01'),[status,setStatus]=useState('available'),box=useRef();
 function point(e){const r=box.current.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}}
 async function save(){if(pts.length<3)return;let r=await fetch(API+'/admin/apartments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({floor_id:floor.id,code,status})});let a=await r.json();if(!r.ok)return alert(a.error);await fetch(API+`/admin/apartments/${a.id}/polygon`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({points:pts})});setPts([]);reload()}
 return <><div className="editorbar"><input value={code} onChange={e=>setCode(e.target.value)}/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="available">Disponibil</option><option value="reserved">Rezervat</option><option value="sold">Vândut</option></select><button onClick={()=>setPts(v=>v.slice(0,-1))}>↶</button><button className="primary" onClick={save}>Salvează apartamentul</button></div>
 <div ref={box} className="planbox" onClick={e=>{if(e.target.dataset.vertex)return;setPts(v=>[...v,point(e)])}}>{floor.plan_path?<img src={floor.plan_path}/>:<div className="planplaceholder">Încarcă întâi planul etajului</div>}<svg viewBox="0 0 100 100" preserveAspectRatio="none">
 {(floor.apartments||[]).map(a=>{let ps=a.apartment_polygons?.[0]?.points||[];return ps.length>2?<polygon key={a.id} className={statusClass[a.status]} points={ps.map(p=>`${p.x*100},${p.y*100}`).join(' ')}/>:null})}
 {pts.length>1&&<polyline points={pts.map(p=>`${p.x*100},${p.y*100}`).join(' ')} fill={pts.length>2?'rgba(31,190,104,.2)':'none'} stroke="#111" strokeWidth=".35"/>}
 {pts.map((p,i)=><circle key={i} data-vertex="1" cx={p.x*100} cy={p.y*100} r=".7" fill="#fff" stroke="#111" strokeWidth=".3" onPointerDown={e=>{e.stopPropagation();setDrag(i);e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(drag===i){e.stopPropagation();const q=point(e);setPts(v=>v.map((x,j)=>j===i?q:x))}} onPointerUp={e=>{setDrag(-1);e.currentTarget.releasePointerCapture(e.pointerId)}}/>)}</svg></div></>
}
function Admin({project,reload}){
 const b=project.buildings?.[0], [floorId,setFloorId]=useState(b?.floors?.[0]?.id||''); const floor=b?.floors?.find(f=>f.id===floorId)||b?.floors?.[0];
 async function upload(bucket,file,cb){const fd=new FormData();fd.append('file',file);const r=await fetch(API+'/admin/upload/'+bucket,{method:'POST',body:fd});const d=await r.json();if(!r.ok)return alert(d.error);await cb(d.url);reload()}
 async function updateProject(patch){await fetch(API+'/admin/projects/'+project.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});reload()}
 async function updateFloor(id,patch){await fetch(API+'/admin/floors/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});reload()}
 return <div className="admin"><aside><h2>ESTATE <span>STUDIO</span></h2><a href="/">← Machetă publică</a></aside><main><div className="adminhead"><div><h1>Administrare Supabase</h1><p>{project.name} · Build 02</p></div><span className="dbok">● Supabase conectat</span></div>
 <div className="grid2"><section className="panel"><h3>Model GLB</h3><p className="hint">Model curent: {project.model_path||'—'}</p><input type="file" accept=".glb,.gltf" onChange={e=>e.target.files[0]&&upload('models',e.target.files[0],url=>updateProject({model_path:url}))}/><div className="row"><label>Înălțime reală<input type="number" defaultValue={project.real_height_m||27} onBlur={e=>updateProject({real_height_m:+e.target.value})}/></label><label>Display units<input type="number" step=".1" defaultValue={project.display_height_units||2.7} onBlur={e=>updateProject({display_height_units:+e.target.value})}/></label></div></section>
 <section className="panel"><h3>Etaje</h3><select value={floor?.id||''} onChange={e=>setFloorId(e.target.value)}>{b?.floors?.map(f=><option key={f.id} value={f.id}>{f.name} · {f.height_from_m}–{f.height_to_m}m</option>)}</select>{floor&&<><label>Plan etaj<input type="file" accept="image/*,.pdf" onChange={e=>e.target.files[0]&&upload('floor-plans',e.target.files[0],url=>updateFloor(floor.id,{plan_path:url}))}/></label><div className="row"><label>De la<input type="number" step=".1" defaultValue={floor.height_from_m} onBlur={e=>updateFloor(floor.id,{height_from_m:+e.target.value})}/></label><label>Până la<input type="number" step=".1" defaultValue={floor.height_to_m} onBlur={e=>updateFloor(floor.id,{height_to_m:+e.target.value})}/></label></div></>}</section>
 {floor&&<section className="panel wide"><h3>Poligoane apartamente · {floor.name}</h3><PlanEditor floor={floor} reload={reload}/></section>}</div></main></div>
}
function App(){
 const [project,setProject]=useState(null),[floor,setFloor]=useState(null),[logged,setLogged]=useState(false),isAdmin=location.pathname.startsWith('/admin');
 const reload=()=>fetch(API+'/project/demo-residence').then(r=>r.json()).then(setProject);
 useEffect(reload,[]);
 if(!project)return <div className="loading">ESTATE STUDIO · SUPABASE</div>;
 if(isAdmin&&!logged)return <Login done={()=>setLogged(true)}/>;
 if(isAdmin)return <Admin project={project} reload={reload}/>;
 return <div className="public"><Viewer project={project} onFloor={setFloor}/>{floor&&<FloorPublic floor={floor} close={()=>setFloor(null)}/>}<a className="adminlink" href="/admin">Admin</a></div>
}
createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);
