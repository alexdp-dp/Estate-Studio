import React,{Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useThree} from '@react-three/fiber';
import {Environment,OrbitControls,useGLTF} from '@react-three/drei';
import * as THREE from 'three';
import {api} from '../api';

function axisInfo(axis='Y'){
  if(axis==='Z')return {key:'z',rotation:[-Math.PI/2,0,0]};
  if(axis==='X')return {key:'x',rotation:[0,0,Math.PI/2]};
  return {key:'y',rotation:[0,0,0]};
}
function rawToWorld(p,metrics,cfg){
  let x=p.x,y=p.y,z=p.z;
  const key=axisInfo(cfg.up_axis).key;
  if(key==='x')x-=metrics.minAxis;
  if(key==='y')y-=metrics.minAxis;
  if(key==='z')z-=metrics.minAxis;
  x*=metrics.scale;y*=metrics.scale;z*=metrics.scale;
  if(cfg.up_axis==='Z') return new THREE.Vector3(x,z,-y);
  if(cfg.up_axis==='X') return new THREE.Vector3(-y,x,z);
  return new THREE.Vector3(x,y,z);
}
function unionNodeBounds(scene,names,metrics,cfg){
  if(!names?.length)return null;
  scene.updateMatrixWorld(true);
  const wanted=new Set(names);
  const box=new THREE.Box3();let has=false;
  scene.traverse(o=>{
    if(!wanted.has(o.name))return;
    const b=new THREE.Box3().setFromObject(o);
    if(b.isEmpty())return;
    const corners=[
      [b.min.x,b.min.y,b.min.z],[b.min.x,b.min.y,b.max.z],[b.min.x,b.max.y,b.min.z],[b.min.x,b.max.y,b.max.z],
      [b.max.x,b.min.y,b.min.z],[b.max.x,b.min.y,b.max.z],[b.max.x,b.max.y,b.min.z],[b.max.x,b.max.y,b.max.z]
    ];
    for(const c of corners)box.expandByPoint(rawToWorld(new THREE.Vector3(...c),metrics,cfg));
    has=true;
  });
  return has?box:null;
}
function MappingScene({url,cfg,building,pickedMode,onPick,onFootprintPoint,footPoints}){
  const {scene}=useGLTF(url);
  const clone=useMemo(()=>scene.clone(true),[scene]);
  const info=axisInfo(cfg.up_axis);
  const metrics=useMemo(()=>{
    clone.updateMatrixWorld(true);
    const b=new THREE.Box3().setFromObject(clone);
    const minAxis=b.min[info.key],maxAxis=b.max[info.key];
    const rawH=Math.max(.000001,maxAxis-minAxis);
    const display=Number(cfg.display_height_units)||2.7;
    return {minAxis,rawH,scale:display/rawH};
  },[clone,info.key,cfg.display_height_units]);

  useEffect(()=>{
    clone.traverse(o=>{
      if(!o.isMesh)return;
      const m=Array.isArray(o.material)?o.material[0].clone():o.material.clone();
      m.transparent=true;m.opacity=.96;o.material=m;
    });
  },[clone]);

  const shift=[0,0,0];
  shift[info.key==='x'?0:info.key==='y'?1:2]=-metrics.minAxis*metrics.scale;

  function objectPick(e){
    if(pickedMode==='footprint')return;
    e.stopPropagation();
    const path=[];
    let o=e.object;
    while(o&&o!==clone){
      if(o.name&&!path.includes(o.name))path.push(o.name);
      o=o.parent;
    }
    onPick?.(path);
  }

  return <>
    <group rotation={info.rotation}>
      <primitive object={clone} scale={metrics.scale} position={shift} onClick={objectPick}/>
    </group>
    {pickedMode==='footprint'&&<mesh rotation={[-Math.PI/2,0,0]} position={[0,.005,0]} onClick={e=>{e.stopPropagation();onFootprintPoint?.({x:e.point.x,z:e.point.z})}}>
      <planeGeometry args={[200,200]}/><meshBasicMaterial transparent opacity={.025} depthWrite={false}/>
    </mesh>}
    {footPoints?.length>0&&footPoints.map((p,i)=><mesh key={i} position={[p.x,.03,p.z]}><sphereGeometry args={[.09,16,16]}/><meshBasicMaterial color="#12a85b"/></mesh>)}
  </>;
}
function TopRig({active}){
  const {camera}=useThree();
  useEffect(()=>{
    if(!active)return;
    camera.position.set(0,14,.001);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
  },[active,camera]);
  return null;
}

export default function SharedModelMapper({project,reload}){
  const shared=project.settings?.shared_model||{};
  const [bid,setBid]=useState(project.buildings?.[0]?.id||null);
  const [pickedPath,setPickedPath]=useState([]);
  const [mode,setMode]=useState('nodes');
  const [footPoints,setFootPoints]=useState([]);
  const [saving,setSaving]=useState(false);
  const building=project.buildings.find(b=>b.id===bid)||project.buildings[0];
  const mapping=building?.settings?.shared_mapping||{};

  useEffect(()=>{setPickedPath([]);setFootPoints([])},[bid,shared.url]);

  if(!shared.url)return <div className="notice warning">Încarcă întâi GLB-ul comun al ansamblului.</div>;

  async function patchBuilding(nextMapping){
    setSaving(true);
    try{
      await api(`/admin/buildings/${building.id}`,{
        method:'PATCH',
        body:{settings:{...(building.settings||{}),shared_mapping:nextMapping}}
      });
      await reload();
    }finally{setSaving(false)}
  }

  function deriveFootprintFromNode(name){
    // Actual bbox is calculated in the mapper scene by using the same calibrated model.
    // For the saved camera focus we can fall back to a footprint entered manually if the GLB hierarchy is unusual.
    return null;
  }

  async function assignNode(name){
    const nodes=[...(mapping.node_names||[])];
    if(!nodes.includes(name))nodes.push(name);
    await patchBuilding({...mapping,mode:'nodes',node_names:nodes});
    setPickedPath([]);
  }
  async function removeNode(name){
    await patchBuilding({...mapping,node_names:(mapping.node_names||[]).filter(n=>n!==name)});
  }
  async function addFootPoint(p){
    const next=[...footPoints,p].slice(-2);
    setFootPoints(next);
    if(next.length===2){
      const a=next[0],b=next[1];
      const footprint={minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z)};
      const label={x:(footprint.minX+footprint.maxX)/2,y:(Number(building.real_height_m)||27)*(Number(shared.display_height_units||2.7)/Math.max(.001,Number(shared.reference_real_height_m)||27))+.35,z:(footprint.minZ+footprint.maxZ)/2};
      await patchBuilding({...mapping,mode:'footprint',footprint,label});
      setFootPoints([]);
    }
  }

  return <div className="shared-mapper">
    <div className="mapper-sidebar">
      <h3>Mapare clădiri</h3>
      <p className="hint">GLB-ul rămâne o singură scenă. Atribuie noduri/mesh-uri către blocuri; pentru un GLB monolitic definește o zonă X/Z.</p>
      <label>Bloc<select value={building?.id||''} onChange={e=>setBid(e.target.value)}>{project.buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <div className="segmented mapper-mode">
        <button className={mode==='nodes'?'active':''} onClick={()=>setMode('nodes')}>Noduri GLB</button>
        <button className={mode==='footprint'?'active':''} onClick={()=>{setMode('footprint');setFootPoints([])}}>Zonă X/Z</button>
      </div>

      {mode==='nodes'&&<>
        <div className="mapper-instruction">Click pe geometrie, apoi alege nivelul potrivit din ierarhia GLB.</div>
        {pickedPath.length>0&&<div className="picked-path">{pickedPath.map((n,i)=><button key={n+i} onClick={()=>assignNode(n)}><b>{n}</b><small>{i===0?'mesh selectat':'părinte'}</small></button>)}</div>}
        <div className="mapped-list"><b>Noduri atribuite</b>{(mapping.node_names||[]).map(n=><div key={n}><span>{n}</span><button onClick={()=>removeNode(n)}>×</button></div>)}{!(mapping.node_names||[]).length&&<small>Nimic atribuit încă.</small>}</div>
      </>}

      {mode==='footprint'&&<div className="mapper-instruction">
        Camera este de sus. Click două colțuri opuse ale dreptunghiului care cuprinde blocul. După al doilea click zona se salvează.
      </div>}

      {mapping.footprint&&<div className="mapping-ok"><b>✓ Zonă de focus salvată</b><small>X {mapping.footprint.minX.toFixed?.(2)??mapping.footprint.minX}…{mapping.footprint.maxX.toFixed?.(2)??mapping.footprint.maxX} · Z {mapping.footprint.minZ.toFixed?.(2)??mapping.footprint.minZ}…{mapping.footprint.maxZ.toFixed?.(2)??mapping.footprint.maxZ}</small></div>}
      {saving&&<div className="hint">Salvez maparea…</div>}
    </div>

    <div className="mapper-canvas">
      <Canvas camera={{position:[7,6,8],fov:42,near:.01,far:1000}} dpr={[1,1.5]}>
        <color attach="background" args={['#e9edea']}/>
        <ambientLight intensity={1.5}/><directionalLight position={[7,10,6]} intensity={2}/>
        <Suspense fallback={null}><MappingScene url={shared.url} cfg={shared} building={building} pickedMode={mode} onPick={setPickedPath} onFootprintPoint={addFootPoint} footPoints={footPoints}/><Environment preset="city"/></Suspense>
        <OrbitControls makeDefault enableDamping enabled={mode!=='footprint'}/>
        <TopRig active={mode==='footprint'}/>
      </Canvas>
    </div>
  </div>
}
