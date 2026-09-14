import React,{Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useThree} from '@react-three/fiber';
import {Environment,OrbitControls,useGLTF} from '@react-three/drei';
import * as THREE from 'three';

function axisInfo(axis='Y'){
  if(axis==='Z') return {key:'z', rot:[-Math.PI/2,0,0]};
  if(axis==='X') return {key:'x', rot:[0,0,Math.PI/2]};
  return {key:'y', rot:[0,0,0]};
}
function BuildingModel({building,selectedFloor,onSelectBuilding,dimOthers=false}){
  const {scene}=useGLTF(building.model_path);
  const clone=useMemo(()=>scene.clone(true),[scene]);
  const info=axisInfo(building.model_up_axis);
  const metrics=useMemo(()=>{
    const b=new THREE.Box3().setFromObject(clone); const min=b.min[info.key], max=b.max[info.key];
    const raw=Math.max(.000001,max-min); const display=Number(building.display_height_units)||2.7;
    return {scale:display/raw,min};
  },[clone,info.key,building.display_height_units]);
  const shift=[0,0,0]; shift[info.key==='x'?0:info.key==='y'?1:2]=building.auto_ground===false?0:-metrics.min*metrics.scale;
  const floorMin=selectedFloor ? (Number(building.position_y)||0)+(Number(selectedFloor.height_from_m)||0)/(Number(building.real_height_m)||1)*(Number(building.display_height_units)||2.7) : -99999;
  const floorMax=selectedFloor ? (Number(building.position_y)||0)+(Number(selectedFloor.height_to_m)||0)/(Number(building.real_height_m)||1)*(Number(building.display_height_units)||2.7) : -99998;
  useEffect(()=>{
    clone.traverse(o=>{
      if(!o.isMesh) return;
      if(!o.userData.originalMaterial) o.userData.originalMaterial=o.material;
      const m=o.userData.originalMaterial.clone();
      m.transparent=true; m.opacity=dimOthers ? .24 : 1;
      m.onBeforeCompile=s=>{
        s.uniforms.uFloorMin={value:floorMin}; s.uniforms.uFloorMax={value:floorMax}; s.uniforms.uHasFloor={value:selectedFloor?1:0};
        s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying float vEstateWorldY;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvEstateWorldY=(modelMatrix*vec4(transformed,1.0)).y;');
        s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying float vEstateWorldY; uniform float uFloorMin; uniform float uFloorMax; uniform float uHasFloor;').replace('#include <dithering_fragment>','if(uHasFloor>.5 && vEstateWorldY>=uFloorMin && vEstateWorldY<=uFloorMax){gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(0.08,0.86,0.42),0.72); gl_FragColor.a=1.0;}\n#include <dithering_fragment>');
      };
      m.needsUpdate=true; o.material=m;
    });
    return()=>clone.traverse(o=>{if(o.isMesh&&o.userData.originalMaterial)o.material=o.userData.originalMaterial});
  },[clone,floorMin,floorMax,selectedFloor,dimOthers]);
  return <group position={[Number(building.position_x)||0,Number(building.position_y)||0,Number(building.position_z)||0]} rotation={[info.rot[0],info.rot[1]+THREE.MathUtils.degToRad(Number(building.rotation_y_deg)||0),info.rot[2]]} onClick={e=>{e.stopPropagation();onSelectBuilding?.(building)}}>
    <primitive object={clone} scale={metrics.scale} position={shift}/>
  </group>
}

function CameraRig({preset,controlsRef}){
  const {camera}=useThree();
  useEffect(()=>{
    if(!preset)return;
    camera.up.set(0,1,0);
    if(preset==='top'){
      camera.position.set(0,9,.001); camera.up.set(0,0,-1);
      controlsRef.current?.target.set(0,0,0); camera.lookAt(0,0,0);
    }else if(preset==='front'){
      camera.position.set(0,2.6,7); controlsRef.current?.target.set(0,1.3,0); camera.lookAt(0,1.3,0);
    }else{
      camera.position.set(5,3.8,6); controlsRef.current?.target.set(0,1.25,0); camera.lookAt(0,1.25,0);
    }
    camera.updateProjectionMatrix(); controlsRef.current?.update();
  },[preset,camera,controlsRef]);
  return null;
}

export default function ThreeViewer({buildings=[],selectedBuildingId,selectedFloor,onSelectBuilding,compact=false,onReady}){
  const controls=useRef(); const [preset,setPreset]=useState('perspective'); const [autoRotate,setAutoRotate]=useState(false);
  function zoom(factor){const c=controls.current;if(!c)return;const cam=c.object;const v=cam.position.clone().sub(c.target).multiplyScalar(factor);cam.position.copy(c.target.clone().add(v));c.update();}
  const models=buildings.filter(b=>b.model_path);
  useEffect(()=>{onReady?.({setPreset,controls})},[onReady]);
  return <div className={'three-viewer '+(compact?'compact':'')}>
    {models.length===0 && <div className="viewer-empty"><b>Niciun model 3D încărcat</b><span>Încarcă un GLB/GLTF din secțiunea Model 3D.</span></div>}
    <Canvas camera={{position:[5,3.8,6],fov:38,near:.01,far:1000}} shadows dpr={[1,1.7]} onCreated={({gl})=>{gl.outputColorSpace=THREE.SRGBColorSpace}}>
      <color attach="background" args={['#e9edea']}/><ambientLight intensity={1.45}/><directionalLight castShadow position={[6,9,5]} intensity={2.2}/>
      <Suspense fallback={null}>{models.map(b=><BuildingModel key={b.id} building={b} selectedFloor={b.id===selectedBuildingId?selectedFloor:null} onSelectBuilding={onSelectBuilding} dimOthers={!!selectedBuildingId&&b.id!==selectedBuildingId}/>)}<Environment preset="city"/></Suspense>
      <gridHelper args={[20,40,'#aeb6b1','#d3d8d5']} position={[0,-.001,0]}/>
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.08} autoRotate={autoRotate} autoRotateSpeed={.7} minDistance={1} maxDistance={30}/>
      <CameraRig preset={preset} controlsRef={controls}/>
    </Canvas>
    {!compact&&<><div className="viewer-presets"><button className={preset==='perspective'?'active':''} onClick={()=>setPreset('perspective')}>Perspectivă</button><button className={preset==='top'?'active':''} onClick={()=>setPreset('top')}>De sus</button><button className={preset==='front'?'active':''} onClick={()=>setPreset('front')}>Față</button></div><div className="viewer-tools"><button onClick={()=>zoom(.8)}>＋</button><button onClick={()=>zoom(1.25)}>−</button><button onClick={()=>{setPreset('perspective');setTimeout(()=>controls.current?.reset(),0)}}>⌖</button><button className={autoRotate?'active':''} onClick={()=>setAutoRotate(v=>!v)}>↻</button><button onClick={()=>document.querySelector('.three-viewer')?.requestFullscreen?.()}>⛶</button></div></>}
  </div>
}
