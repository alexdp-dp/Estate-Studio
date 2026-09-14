import React,{Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Environment,Html,OrbitControls,useGLTF} from '@react-three/drei';
import * as THREE from 'three';

function axisInfo(axis='Y'){
  if(axis==='Z')return {key:'z',rotation:[-Math.PI/2,0,0]};
  if(axis==='X')return {key:'x',rotation:[0,0,Math.PI/2]};
  return {key:'y',rotation:[0,0,0]};
}
function floorAtWorldY(building,worldY,unitsPerMeter=.1,baseY=0){
  const metres=(worldY-baseY)/Math.max(.000001,unitsPerMeter);
  const floors=building.floors||[];
  return floors.find((f,index)=>{
    const from=Number(f.height_from_m)||0,to=Number(f.height_to_m)||0,last=index===floors.length-1;
    return metres>=from&&(metres<to||(last&&metres<=to+.001));
  })||null;
}
function insideFootprint(p,fp){
  return !!fp&&p.x>=Number(fp.minX)&&p.x<=Number(fp.maxX)&&p.z>=Number(fp.minZ)&&p.z<=Number(fp.maxZ);
}
function mappingForObject(object,buildings){
  const names=[];
  let o=object;
  while(o){if(o.name)names.push(o.name);o=o.parent}
  for(const b of buildings){
    const mapped=b.settings?.shared_mapping?.node_names||[];
    if(mapped.some(n=>names.includes(n)))return b;
  }
  return null;
}

function BuildingBubble({building,position,onClick,active=false}){
  if(!position)return null;
  return <Html position={position} center distanceFactor={8} zIndexRange={[12,0]}>
    <button className={'building-bubble '+(active?'active':'')} onClick={e=>{e.stopPropagation();onClick?.(building)}}>
      <span className="bubble-dot"/><b>{building.name}</b>
    </button>
  </Html>
}

function IndividualBuilding({building,selectedFloor,hoveredFloor,hovered,onHover,onLeave,onSelectBuilding,onSelectFloor,dimOthers,showBubble,bubbleActive,onBounds}){
  const {scene}=useGLTF(building.model_path);
  const clone=useMemo(()=>scene.clone(true),[scene]);
  const info=axisInfo(building.model_up_axis);
  const metrics=useMemo(()=>{
    clone.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(clone);
    const min=box.min[info.key],max=box.max[info.key],raw=Math.max(.000001,max-min);
    const display=Number(building.display_height_units)||2.7;
    return {box,scale:display/raw,min,display};
  },[clone,info.key,building.display_height_units]);

  const shift=[0,0,0];shift[info.key==='x'?0:info.key==='y'?1:2]=building.auto_ground===false?0:-metrics.min*metrics.scale;
  const effectiveFloor=hoveredFloor||selectedFloor||null;
  const unitPerMeter=(Number(building.display_height_units)||2.7)/Math.max(.001,Number(building.real_height_m)||27);
  const baseY=Number(building.position_y)||0;
  const floorMin=effectiveFloor?baseY+(Number(effectiveFloor.height_from_m)||0)*unitPerMeter:-99999;
  const floorMax=effectiveFloor?baseY+(Number(effectiveFloor.height_to_m)||0)*unitPerMeter:-99998;

  const bubblePos=useMemo(()=>{
    const y=baseY+(Number(building.display_height_units)||2.7)+.28;
    return [Number(building.position_x)||0,y,Number(building.position_z)||0];
  },[building.position_x,building.position_y,building.position_z,building.display_height_units]);

  useEffect(()=>{
    const width=Math.max(.8,metrics.display*.65),depth=width;
    onBounds?.(building.id,{minX:(Number(building.position_x)||0)-width/2,maxX:(Number(building.position_x)||0)+width/2,minZ:(Number(building.position_z)||0)-depth/2,maxZ:(Number(building.position_z)||0)+depth/2,minY:baseY,maxY:baseY+metrics.display});
  },[building.id,building.position_x,building.position_z,baseY,metrics.display,onBounds]);

  useEffect(()=>{
    clone.traverse(o=>{
      if(!o.isMesh)return;
      if(!o.userData.esOriginal)o.userData.esOriginal=o.material;
      const original=o.userData.esOriginal;
      const m=(Array.isArray(original)?original[0]:original).clone();
      m.transparent=true;m.opacity=dimOthers?.20:1;
      m.onBeforeCompile=s=>{
        s.uniforms.uMin={value:floorMin};s.uniforms.uMax={value:floorMax};s.uniforms.uHasFloor={value:effectiveFloor?1:0};s.uniforms.uHover={value:hovered?1:0};
        s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vEstateWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvEstateWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
        s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vEstateWorld; uniform float uMin; uniform float uMax; uniform float uHasFloor; uniform float uHover;').replace('#include <dithering_fragment>',`if(uHasFloor>.5&&vEstateWorld.y>=uMin&&vEstateWorld.y<=uMax){gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.04,.88,.39),.76);gl_FragColor.a=1.;}else if(uHover>.5&&uHasFloor<.5){gl_FragColor.rgb=vec3(1.)-gl_FragColor.rgb*.52;}#include <dithering_fragment>`);
      };m.needsUpdate=true;o.material=m;
    });
    return()=>clone.traverse(o=>{if(o.isMesh&&o.userData.esOriginal)o.material=o.userData.esOriginal});
  },[clone,floorMin,floorMax,effectiveFloor,dimOthers,hovered]);

  function hover(e){
    e.stopPropagation();
    onHover?.({building,floor:floorAtWorldY(building,e.point.y,unitPerMeter,baseY),clientX:e.nativeEvent?.clientX??0,clientY:e.nativeEvent?.clientY??0});
  }
  function click(e){
    e.stopPropagation();
    const floor=floorAtWorldY(building,e.point.y,unitPerMeter,baseY);
    onSelectBuilding?.(building);if(floor)onSelectFloor?.(floor,building);
  }

  return <group position={[Number(building.position_x)||0,baseY,Number(building.position_z)||0]} rotation={[info.rotation[0],info.rotation[1]+THREE.MathUtils.degToRad(Number(building.rotation_y_deg)||0),info.rotation[2]]} onPointerMove={hover} onPointerOver={hover} onPointerOut={e=>{e.stopPropagation();onLeave?.(building)}} onClick={click}>
    <primitive object={clone} scale={metrics.scale} position={shift}/>
    {showBubble&&<BuildingBubble building={building} position={[0,(Number(building.display_height_units)||2.7)+.35,0]} active={bubbleActive} onClick={onSelectBuilding}/>}
  </group>
}

function SharedComplex({url,cfg,buildings,selectedBuildingId,selectedFloor,hoverInfo,onHover,onLeave,onSelectBuilding,onSelectFloor,showBubbles,onBounds}){
  const {scene}=useGLTF(url);
  const clone=useMemo(()=>scene.clone(true),[scene]);
  const info=axisInfo(cfg.up_axis||'Y');
  const metrics=useMemo(()=>{
    clone.updateMatrixWorld(true);
    const b=new THREE.Box3().setFromObject(clone);
    const minAxis=b.min[info.key],maxAxis=b.max[info.key],rawH=Math.max(.000001,maxAxis-minAxis);
    const display=Number(cfg.display_height_units)||2.7;
    return {minAxis,scale:display/rawH,display};
  },[clone,info.key,cfg.display_height_units]);
  const shift=[0,0,0];shift[info.key==='x'?0:info.key==='y'?1:2]=cfg.auto_ground===false?0:-metrics.minAxis*metrics.scale;
  const unitPerMeter=(Number(cfg.display_height_units)||2.7)/Math.max(.001,Number(cfg.reference_real_height_m)||27);
  const hoveredBuilding=hoverInfo?.building||null;
  const activeBuilding=buildings.find(b=>b.id===selectedBuildingId)||null;
  const activeFloor=hoverInfo?.floor||selectedFloor||null;
  const focusBuilding=hoveredBuilding||activeBuilding;
  const fp=focusBuilding?.settings?.shared_mapping?.footprint||null;
  const nodeSet=new Set(focusBuilding?.settings?.shared_mapping?.node_names||[]);
  const floorMin=focusBuilding&&activeFloor?(Number(focusBuilding.position_y)||0)+(Number(activeFloor.height_from_m)||0)*unitPerMeter:-99999;
  const floorMax=focusBuilding&&activeFloor?(Number(focusBuilding.position_y)||0)+(Number(activeFloor.height_to_m)||0)*unitPerMeter:-99998;

  useEffect(()=>{
    for(const b of buildings){
      const m=b.settings?.shared_mapping||{};
      const f=m.footprint;
      if(f)onBounds?.(b.id,{minX:Number(f.minX),maxX:Number(f.maxX),minZ:Number(f.minZ),maxZ:Number(f.maxZ),minY:Number(b.position_y)||0,maxY:(Number(b.position_y)||0)+(Number(b.real_height_m)||27)*unitPerMeter});
    }
  },[buildings,unitPerMeter,onBounds]);

  useEffect(()=>{
    clone.traverse(o=>{
      if(!o.isMesh)return;
      if(!o.userData.esOriginal)o.userData.esOriginal=o.material;
      const original=o.userData.esOriginal;
      const m=(Array.isArray(original)?original[0]:original).clone();
      const ancestry=[];let q=o;while(q){if(q.name)ancestry.push(q.name);q=q.parent}
      const belongs=nodeSet.size>0&&ancestry.some(n=>nodeSet.has(n));
      m.onBeforeCompile=s=>{
        s.uniforms.uMin={value:floorMin};s.uniforms.uMax={value:floorMax};
        s.uniforms.uHasFloor={value:focusBuilding&&activeFloor?1:0};
        s.uniforms.uHoverBuilding={value:hoveredBuilding&&hoveredBuilding.id===focusBuilding?.id?1:0};
        s.uniforms.uNodeMatch={value:belongs?1:0};
        s.uniforms.uUseNodes={value:nodeSet.size?1:0};
        s.uniforms.uHasFp={value:fp?1:0};
        s.uniforms.uFp={value:new THREE.Vector4(fp?.minX??0,fp?.maxX??0,fp?.minZ??0,fp?.maxZ??0)};
        s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vEstateWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvEstateWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
        s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vEstateWorld; uniform float uMin; uniform float uMax; uniform float uHasFloor; uniform float uHoverBuilding; uniform float uNodeMatch; uniform float uUseNodes; uniform float uHasFp; uniform vec4 uFp;').replace('#include <dithering_fragment>',`
          float inFp=step(uFp.x,vEstateWorld.x)*step(vEstateWorld.x,uFp.y)*step(uFp.z,vEstateWorld.z)*step(vEstateWorld.z,uFp.w);
          float belongsBuilding=max(uUseNodes*uNodeMatch,(1.0-uUseNodes)*uHasFp*inFp);
          if(uHasFloor>.5&&belongsBuilding>.5&&vEstateWorld.y>=uMin&&vEstateWorld.y<=uMax){gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.04,.88,.39),.78);}
          else if(uHoverBuilding>.5&&belongsBuilding>.5&&uHasFloor<.5){gl_FragColor.rgb=vec3(1.)-gl_FragColor.rgb*.52;}
          #include <dithering_fragment>`);
      };m.needsUpdate=true;o.material=m;
    });
    return()=>clone.traverse(o=>{if(o.isMesh&&o.userData.esOriginal)o.material=o.userData.esOriginal});
  },[clone,floorMin,floorMax,focusBuilding?.id,activeFloor?.id,hoveredBuilding?.id,JSON.stringify(fp),[...nodeSet].join('|')]);

  function findBuilding(e){
    const byNode=mappingForObject(e.object,buildings);
    if(byNode)return byNode;
    return buildings.find(b=>insideFootprint(e.point,b.settings?.shared_mapping?.footprint))||null;
  }
  function hover(e){
    e.stopPropagation();
    const b=findBuilding(e);
    if(!b){onLeave?.();return}
    const floor=floorAtWorldY(b,e.point.y,unitPerMeter,Number(b.position_y)||0);
    onHover?.({building:b,floor,clientX:e.nativeEvent?.clientX??0,clientY:e.nativeEvent?.clientY??0});
  }
  function click(e){
    e.stopPropagation();
    const b=findBuilding(e);if(!b)return;
    const floor=floorAtWorldY(b,e.point.y,unitPerMeter,Number(b.position_y)||0);
    onSelectBuilding?.(b);if(floor)onSelectFloor?.(floor,b);
  }

  return <group rotation={info.rotation} onPointerMove={hover} onPointerOver={hover} onPointerOut={()=>onLeave?.()} onClick={click}>
    <primitive object={clone} scale={metrics.scale} position={shift}/>
    {showBubbles&&buildings.map((b,i)=>{
      const map=b.settings?.shared_mapping||{},f=map.footprint,l=map.label;
      const x=l?.x??(f?(Number(f.minX)+Number(f.maxX))/2:(i-(buildings.length-1)/2)*2.5);
      const z=l?.z??(f?(Number(f.minZ)+Number(f.maxZ))/2:0);
      const y=l?.y??((Number(b.real_height_m)||27)*unitPerMeter+.35);
      return <BuildingBubble key={b.id} building={b} position={[x,y,z]} active={b.id===selectedBuildingId} onClick={onSelectBuilding}/>;
    })}
  </group>
}

function CameraDirector({buildings,boundsMap,selectedBuildingId,preset,controlsRef}){
  const {camera}=useThree();
  const anim=useRef(null);

  useEffect(()=>{
    let boxes=[];
    if(selectedBuildingId&&boundsMap[selectedBuildingId])boxes=[boundsMap[selectedBuildingId]];
    else boxes=Object.values(boundsMap);
    if(!boxes.length){
      boxes=buildings.map((b,i)=>({minX:(Number(b.position_x)||i*3)-1,maxX:(Number(b.position_x)||i*3)+1,minZ:(Number(b.position_z)||0)-1,maxZ:(Number(b.position_z)||0)+1,minY:0,maxY:Number(b.display_height_units)||2.7}));
    }
    const minX=Math.min(...boxes.map(b=>b.minX)),maxX=Math.max(...boxes.map(b=>b.maxX)),minZ=Math.min(...boxes.map(b=>b.minZ)),maxZ=Math.max(...boxes.map(b=>b.maxZ)),minY=Math.min(...boxes.map(b=>b.minY)),maxY=Math.max(...boxes.map(b=>b.maxY));
    const center=new THREE.Vector3((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2);
    const span=Math.max(maxX-minX,maxZ-minZ,maxY-minY,1);
    const distance=span*(selectedBuildingId?2.15:1.85)+1.5;
    let dest;
    if(preset==='top')dest=new THREE.Vector3(center.x,center.y+distance*1.45,center.z+.001);
    else if(preset==='front')dest=new THREE.Vector3(center.x,center.y+span*.18,center.z+distance);
    else dest=new THREE.Vector3(center.x+distance*.88,center.y+distance*.48,center.z+distance*.95);
    anim.current={t:0,fromPos:camera.position.clone(),toPos:dest,fromTarget:controlsRef.current?.target.clone()||center.clone(),toTarget:center};
  },[selectedBuildingId,preset,JSON.stringify(boundsMap),buildings.length,camera,controlsRef]);

  useFrame((_,dt)=>{
    const a=anim.current;if(!a)return;
    a.t=Math.min(1,a.t+dt/0.78);
    const k=1-Math.pow(1-a.t,3);
    camera.position.lerpVectors(a.fromPos,a.toPos,k);
    if(controlsRef.current){controlsRef.current.target.lerpVectors(a.fromTarget,a.toTarget,k);controlsRef.current.update()}
    camera.lookAt(controlsRef.current?.target||a.toTarget);
    if(a.t>=1)anim.current=null;
  });
  return null;
}

export default function ThreeViewer({
  buildings=[],
  selectedBuildingId=null,
  selectedFloor=null,
  onSelectBuilding,
  onSelectFloor,
  compact=false,
  onReady,
  sharedModel=null,
  publicMode=false,
  showGrid=true,
  showBubbles=false
}){
  const controls=useRef();
  const [preset,setPreset]=useState('perspective');
  const [autoRotate,setAutoRotate]=useState(false);
  const [hoverInfo,setHoverInfo]=useState(null);
  const [boundsMap,setBoundsMap]=useState({});
  const setBound=(id,b)=>setBoundsMap(v=>{const prev=v[id];if(prev&&JSON.stringify(prev)===JSON.stringify(b))return v;return {...v,[id]:b}});

  function zoom(factor){
    const c=controls.current;if(!c)return;
    const cam=c.object,v=cam.position.clone().sub(c.target).multiplyScalar(factor);
    cam.position.copy(c.target.clone().add(v));c.update();
  }
  function reset(){setPreset('perspective');setBoundsMap(v=>({...v}))}
  useEffect(()=>{onReady?.({setPreset,setAutoRotate,zoom,reset,controls})},[onReady]);

  const individual=buildings.filter(b=>b.model_path);
  const hasShared=!!sharedModel?.url;

  return <div className={'three-viewer '+(compact?'compact ':'')+(publicMode?'public-viewer':'')} style={{cursor:hoverInfo?'pointer':'grab'}}>
    {!hasShared&&individual.length===0&&<div className="viewer-empty"><b>Niciun model 3D încărcat</b><span>Încarcă un GLB/GLTF din secțiunea Model 3D.</span></div>}
    <Canvas camera={{position:[5,3.8,6],fov:38,near:.01,far:1500}} shadows dpr={[1,1.7]} onPointerMissed={()=>setHoverInfo(null)} onCreated={({gl})=>{gl.outputColorSpace=THREE.SRGBColorSpace}}>
      <color attach="background" args={[publicMode?'#ecefec':'#e9edea']}/>
      <ambientLight intensity={1.48}/><directionalLight castShadow position={[7,11,6]} intensity={2.15}/>
      <Suspense fallback={null}>
        {hasShared
          ? <SharedComplex url={sharedModel.url} cfg={sharedModel} buildings={buildings} selectedBuildingId={selectedBuildingId} selectedFloor={selectedFloor} hoverInfo={hoverInfo} onHover={setHoverInfo} onLeave={()=>setHoverInfo(null)} onSelectBuilding={onSelectBuilding} onSelectFloor={onSelectFloor} showBubbles={showBubbles} onBounds={setBound}/>
          : individual.map(b=><IndividualBuilding key={b.id} building={b} selectedFloor={b.id===selectedBuildingId?selectedFloor:null} hoveredFloor={hoverInfo?.building?.id===b.id?hoverInfo.floor:null} hovered={hoverInfo?.building?.id===b.id} onHover={setHoverInfo} onLeave={bb=>setHoverInfo(v=>v?.building?.id===bb.id?null:v)} onSelectBuilding={onSelectBuilding} onSelectFloor={onSelectFloor} dimOthers={!!selectedBuildingId&&b.id!==selectedBuildingId} showBubble={showBubbles} bubbleActive={b.id===selectedBuildingId} onBounds={setBound}/>)
        }
        <Environment preset="city"/>
      </Suspense>
      {showGrid&&!publicMode&&<gridHelper args={[20,40,'#aeb6b1','#d3d8d5']} position={[0,-.001,0]}/>}
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.08} autoRotate={autoRotate} autoRotateSpeed={.65} minDistance={.7} maxDistance={80}/>
      <CameraDirector buildings={buildings} boundsMap={boundsMap} selectedBuildingId={selectedBuildingId} preset={preset} controlsRef={controls}/>
    </Canvas>

    {hoverInfo&&<div className="model-tooltip" style={{left:Math.min(window.innerWidth-220,hoverInfo.clientX+16),top:Math.min(window.innerHeight-80,hoverInfo.clientY+16)}}>
      <strong>{hoverInfo.building.name}</strong><span>{hoverInfo.floor?hoverInfo.floor.name:'Selectează clădirea'}</span>{hoverInfo.floor&&<small>Click pentru planul etajului</small>}
    </div>}

    {!compact&&!publicMode&&<>
      <div className="viewer-presets"><button className={preset==='perspective'?'active':''} onClick={()=>setPreset('perspective')}>Perspectivă</button><button className={preset==='top'?'active':''} onClick={()=>setPreset('top')}>De sus</button><button className={preset==='front'?'active':''} onClick={()=>setPreset('front')}>Față</button></div>
      <div className="viewer-tools"><button onClick={()=>zoom(.8)}>＋</button><button onClick={()=>zoom(1.25)}>−</button><button onClick={reset}>⌖</button><button className={autoRotate?'active':''} onClick={()=>setAutoRotate(v=>!v)}>↻</button><button onClick={()=>document.querySelector('.three-viewer')?.requestFullscreen?.()}>⛶</button></div>
    </>}
  </div>
}
