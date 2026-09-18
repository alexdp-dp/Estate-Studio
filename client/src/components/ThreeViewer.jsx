import React,{Suspense,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
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

function boxToPlain(box){
  if(!box || box.isEmpty())return null;
  const vals=[box.min.x,box.max.x,box.min.y,box.max.y,box.min.z,box.max.z];
  if(vals.some(v=>!Number.isFinite(v)))return null;
  return {minX:box.min.x,maxX:box.max.x,minY:box.min.y,maxY:box.max.y,minZ:box.min.z,maxZ:box.max.z};
}

function BuildingBubble({building,position,onClick,active=false}){
  if(!position)return null;
  return <Html position={position} center distanceFactor={8} zIndexRange={[6,0]}>
    <button className={'building-bubble '+(active?'active':'')} onClick={e=>{e.stopPropagation();onClick?.(building)}}>
      <span className="bubble-dot"/><b>{building.name}</b>
    </button>
  </Html>
}

function IndividualBuilding({building,selectedBuildingId,selectedFloor,hoveredFloor,hovered,onHover,onLeave,onSelectBuilding,onSelectFloor,dimOthers,onBounds}){
  const groupRef=useRef();
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


  useLayoutEffect(()=>{
    if(!groupRef.current)return;
    groupRef.current.updateWorldMatrix(true,true);
    const actual=boxToPlain(new THREE.Box3().setFromObject(groupRef.current));
    if(actual)onBounds?.(building.id,actual);
  },[
    clone,metrics.scale,
    building.id,building.position_x,building.position_y,building.position_z,building.rotation_y_deg,
    building.model_up_axis,building.auto_ground,onBounds
  ]);

  useEffect(()=>{
    clone.traverse(o=>{
      if(!o.isMesh)return;
      if(!o.userData.esOriginal)o.userData.esOriginal=o.material;
      const original=o.userData.esOriginal;
      const m=(Array.isArray(original)?original[0]:original).clone();
      m.transparent=true;
      m.opacity=1;
      m.onBeforeCompile=s=>{
        s.uniforms.uMin={value:floorMin};s.uniforms.uMax={value:floorMax};s.uniforms.uHasFloor={value:effectiveFloor?1:0};s.uniforms.uHover={value:hovered?1:0};
        s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vEstateWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvEstateWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
        s.uniforms.uDisabled={value:dimOthers?1:0};
        s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vEstateWorld; uniform float uMin; uniform float uMax; uniform float uHasFloor; uniform float uHover; uniform float uDisabled;').replace('#include <dithering_fragment>',`
          if(uDisabled>.5){
            float lum=dot(gl_FragColor.rgb,vec3(.299,.587,.114));
            gl_FragColor.rgb=mix(vec3(lum),vec3(.82,.84,.83),.58);
          }else if(uHasFloor>.5&&vEstateWorld.y>=uMin&&vEstateWorld.y<=uMax){
            gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.24,.56,.45),.68);
            gl_FragColor.a=1.;
          }else if(uHover>.5&&uHasFloor<.5){
            gl_FragColor.rgb=vec3(1.)-gl_FragColor.rgb*.52;
          }
          #include <dithering_fragment>`);
      };m.needsUpdate=true;o.material=m;
    });
    return()=>clone.traverse(o=>{if(o.isMesh&&o.userData.esOriginal)o.material=o.userData.esOriginal});
  },[clone,floorMin,floorMax,effectiveFloor,dimOthers,hovered]);

  function hover(e){
    e.stopPropagation();

    // STAGE 1 — overview:
    // while the building is not active, hover applies to the whole block.
    const isActive=selectedBuildingId===building.id;

    if(!isActive){
      onHover?.({
        building,
        floor:null,
        stage:'building',
        clientX:e.nativeEvent?.clientX??0,
        clientY:e.nativeEvent?.clientY??0
      });
      return;
    }

    // STAGE 2 — focused building:
    // only actual floor bands are interactive. If the cursor is in a gap
    // between configured floors, show NOTHING and do not highlight the block.
    const floor=floorAtWorldY(building,e.point.y,unitPerMeter,baseY);
    if(!floor){
      onLeave?.(building);
      return;
    }

    onHover?.({
      building,
      floor,
      stage:'floor',
      clientX:e.nativeEvent?.clientX??0,
      clientY:e.nativeEvent?.clientY??0
    });
  }

  function click(e){
    e.stopPropagation();
    const isActive=selectedBuildingId===building.id;

    // First click always selects/focuses the building only.
    if(!isActive){
      onSelectBuilding?.(building);
      return;
    }

    // Only after the building is already focused can a real floor be selected.
    // A click in the vertical gap between configured floors is intentionally ignored.
    const floor=floorAtWorldY(building,e.point.y,unitPerMeter,baseY);
    if(!floor)return;
    onSelectFloor?.(floor,building);
  }

  return <group ref={groupRef} position={[Number(building.position_x)||0,baseY,Number(building.position_z)||0]} rotation={[info.rotation[0],info.rotation[1]+THREE.MathUtils.degToRad(Number(building.rotation_y_deg)||0),info.rotation[2]]} onPointerMove={hover} onPointerOver={hover} onPointerOut={e=>{e.stopPropagation();onLeave?.(building)}} onClick={click}>
    <primitive object={clone} scale={metrics.scale} position={shift}/>
  </group>
}

function SharedComplex({url,cfg,buildings,selectedBuildingId,selectedFloor,hoverInfo,onHover,onLeave,onSelectBuilding,onSelectFloor,onBounds}){
  const groupRef=useRef();
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

  useLayoutEffect(()=>{
    if(!groupRef.current)return;
    groupRef.current.updateWorldMatrix(true,true);

    const sceneBounds=boxToPlain(new THREE.Box3().setFromObject(groupRef.current));
    if(sceneBounds)onBounds?.('__scene',sceneBounds);

    for(const b of buildings){
      const map=b.settings?.shared_mapping||{};
      const nodeNames=map.node_names||[];

      if(nodeNames.length){
        const wanted=new Set(nodeNames);
        const union=new THREE.Box3();
        let found=false;
        clone.traverse(o=>{
          if(!wanted.has(o.name))return;
          const bb=new THREE.Box3().setFromObject(o);
          if(!bb.isEmpty()){union.union(bb);found=true}
        });
        if(found){
          const actual=boxToPlain(union);
          if(actual){onBounds?.(b.id,actual);continue}
        }
      }

      const f=map.footprint;
      if(f){
        onBounds?.(b.id,{
          minX:Number(f.minX),maxX:Number(f.maxX),
          minZ:Number(f.minZ),maxZ:Number(f.maxZ),
          minY:Number(b.position_y)||sceneBounds?.minY||0,
          maxY:(Number(b.position_y)||0)+(Number(b.real_height_m)||27)*unitPerMeter
        });
      }
    }
  },[clone,buildings,unitPerMeter,onBounds,cfg.up_axis,cfg.display_height_units,cfg.auto_ground]);

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
        s.uniforms.uHasSelectedBuilding={value:activeBuilding?1:0};
        s.uniforms.uFp={value:new THREE.Vector4(fp?.minX??0,fp?.maxX??0,fp?.minZ??0,fp?.maxZ??0)};
        s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vEstateWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvEstateWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
        s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vEstateWorld; uniform float uMin; uniform float uMax; uniform float uHasFloor; uniform float uHoverBuilding; uniform float uNodeMatch; uniform float uUseNodes; uniform float uHasFp; uniform float uHasSelectedBuilding; uniform vec4 uFp;').replace('#include <dithering_fragment>',`
          float inFp=step(uFp.x,vEstateWorld.x)*step(vEstateWorld.x,uFp.y)*step(uFp.z,vEstateWorld.z)*step(vEstateWorld.z,uFp.w);
          float belongsBuilding=max(uUseNodes*uNodeMatch,(1.0-uUseNodes)*uHasFp*inFp);

          if(uHasSelectedBuilding>.5 && belongsBuilding<.5){
            float lum=dot(gl_FragColor.rgb,vec3(.299,.587,.114));
            gl_FragColor.rgb=mix(vec3(lum),vec3(.82,.84,.83),.58);
          }else if(uHasFloor>.5&&belongsBuilding>.5&&vEstateWorld.y>=uMin&&vEstateWorld.y<=uMax){
            gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.24,.56,.45),.70);
          }else if(uHoverBuilding>.5&&belongsBuilding>.5&&uHasFloor<.5){
            gl_FragColor.rgb=vec3(1.)-gl_FragColor.rgb*.52;
          }
          #include <dithering_fragment>`);
      };m.needsUpdate=true;o.material=m;
    });
    return()=>clone.traverse(o=>{if(o.isMesh&&o.userData.esOriginal)o.material=o.userData.esOriginal});
  },[clone,floorMin,floorMax,focusBuilding?.id,activeBuilding?.id,activeFloor?.id,hoveredBuilding?.id,JSON.stringify(fp),[...nodeSet].join('|')]);

  function findBuilding(e){
    const byNode=mappingForObject(e.object,buildings);
    if(byNode)return byNode;
    return buildings.find(b=>insideFootprint(e.point,b.settings?.shared_mapping?.footprint))||null;
  }
  function hover(e){
    e.stopPropagation();
    const b=findBuilding(e);
    if(!b){onLeave?.();return}

    const isActive=selectedBuildingId===b.id;

    if(!isActive){
      onHover?.({
        building:b,
        floor:null,
        stage:'building',
        clientX:e.nativeEvent?.clientX??0,
        clientY:e.nativeEvent?.clientY??0
      });
      return;
    }

    // Once the building is selected, only a real floor range is hoverable.
    // Gaps between floors are intentionally inert: no tooltip, no highlight,
    // and clicking there cannot re-select the same building.
    const floor=floorAtWorldY(b,e.point.y,unitPerMeter,Number(b.position_y)||0);
    if(!floor){
      onLeave?.();
      return;
    }

    onHover?.({
      building:b,
      floor,
      stage:'floor',
      clientX:e.nativeEvent?.clientX??0,
      clientY:e.nativeEvent?.clientY??0
    });
  }

  function click(e){
    e.stopPropagation();
    const b=findBuilding(e);
    if(!b)return;

    const isActive=selectedBuildingId===b.id;

    // Stage 1: select the building, trigger cinematic focus, do not select a floor.
    if(!isActive){
      onSelectBuilding?.(b);
      return;
    }

    // Stage 2: only a real floor band can be selected.
    // Clicking a gap between floors does nothing.
    const floor=floorAtWorldY(b,e.point.y,unitPerMeter,Number(b.position_y)||0);
    if(!floor)return;
    onSelectFloor?.(floor,b);
  }

  return <group ref={groupRef} rotation={info.rotation} onPointerMove={hover} onPointerOver={hover} onPointerOut={()=>onLeave?.()} onClick={click}>
    <primitive object={clone} scale={metrics.scale} position={shift}/>
  </group>
}


function BuildingBubbleLayer({buildings,boundsMap,selectedBuildingId,onSelectBuilding}){
  return <>
    {buildings.map(building=>{
      const box=boundsMap[building.id];
      if(!box)return null;

      const width=Math.max(.001,box.maxX-box.minX);
      const height=Math.max(.001,box.maxY-box.minY);
      const depth=Math.max(.001,box.maxZ-box.minZ);

      // Position comes only from the final world-space bounding box of the actual
      // rendered geometry. No model origin / GLB pivot / mapper label is used.
      const position=[
        (box.minX+box.maxX)/2,
        box.maxY + Math.max(.12,Math.min(.45,height*.08)),
        (box.minZ+box.maxZ)/2
      ];

      return <BuildingBubble
        key={building.id}
        building={building}
        position={position}
        active={building.id===selectedBuildingId}
        onClick={onSelectBuilding}
      />;
    })}
  </>;
}

function CameraDirector({buildings,boundsMap,selectedBuildingId,preset,controlsRef,focusTick=0,cinematic=false}){
  const {camera}=useThree();
  const tween=useRef(null);

  function unionBounds(boxes){
    if(!boxes.length)return null;
    return {
      minX:Math.min(...boxes.map(b=>b.minX)),
      maxX:Math.max(...boxes.map(b=>b.maxX)),
      minY:Math.min(...boxes.map(b=>b.minY)),
      maxY:Math.max(...boxes.map(b=>b.maxY)),
      minZ:Math.min(...boxes.map(b=>b.minZ)),
      maxZ:Math.max(...boxes.map(b=>b.maxZ))
    };
  }

  function centerOf(box){
    return new THREE.Vector3(
      (box.minX+box.maxX)/2,
      (box.minY+box.maxY)/2,
      (box.minZ+box.maxZ)/2
    );
  }

  function smoothstep(t){
    return t*t*(3-2*t);
  }

  useEffect(()=>{
    const realBoxes=Object.entries(boundsMap)
      .filter(([id])=>!id.startsWith('__'))
      .map(([,box])=>box);

    const sceneBox=boundsMap.__scene || unionBounds(realBoxes);
    if(!sceneBox)return;

    const sceneCenter=centerOf(sceneBox);
    const sceneW=Math.max(.001,sceneBox.maxX-sceneBox.minX);
    const sceneH=Math.max(.001,sceneBox.maxY-sceneBox.minY);
    const sceneD=Math.max(.001,sceneBox.maxZ-sceneBox.minZ);
    const sceneSpan=Math.max(sceneW,sceneD,sceneH,1);

    let target;
    let position;
    let finalFov=40;

    if(selectedBuildingId){
      const box=boundsMap[selectedBuildingId];
      if(!box)return;

      const center=centerOf(box);
      const w=Math.max(.001,box.maxX-box.minX);
      const h=Math.max(.001,box.maxY-box.minY);
      const d=Math.max(.001,box.maxZ-box.minZ);
      const footprint=Math.max(w,d,1);

      // Same motion logic as the original /macheta/:
      // target = selected building centre, camera = fixed elevated perspective offset.
      target=new THREE.Vector3(
        center.x,
        box.minY+h*.46,
        center.z
      );

      if(preset==='top'){
        position=target.clone().add(new THREE.Vector3(0,Math.max(h*3.2,footprint*3.4,4.5),.001));
        finalFov=36;
        camera.up.set(0,0,-1);
      }else if(preset==='front'){
        position=target.clone().add(new THREE.Vector3(0,h*.18,Math.max(footprint*2.25,h*1.65,3.2)));
        finalFov=37;
        camera.up.set(0,1,0);
      }else{
        camera.up.set(0,1,0);

        // Reference uses left/right based on where the lot is in the ensemble.
        // Keep that idea, but scale it from the actual GLB bounding box.
        const sideSign=(center.x<sceneCenter.x)?1:-1;

        // If the block is almost centered, preserve the side nearest to the current camera
        // rather than flipping unpredictably.
        let sx=sideSign;
        if(Math.abs(center.x-sceneCenter.x)<sceneW*.08){
          sx=camera.position.x>=target.x?1:-1;
        }

        const xOff=Math.max(footprint*1.65,h*1.15,2.4)*sx;
        const yOff=Math.max(h*1.42,footprint*.92,2.2);
        const zOff=Math.max(footprint*1.82,h*1.35,2.8);

        position=target.clone().add(new THREE.Vector3(xOff,yOff,zOff));
        finalFov=38;
      }
    }else{
      // Whole ensemble: same elevated-perspective character as the reference,
      // but normalized to the actual complex size.
      target=new THREE.Vector3(
        sceneCenter.x,
        sceneBox.minY+sceneH*.18,
        sceneCenter.z
      );

      if(preset==='top'){
        position=target.clone().add(new THREE.Vector3(0,sceneSpan*1.55,.001));
        finalFov=39;
        camera.up.set(0,0,-1);
      }else{
        camera.up.set(0,1,0);
        position=target.clone().add(new THREE.Vector3(
          sceneSpan*.63,
          sceneSpan*.68,
          sceneSpan*.88
        ));
        finalFov=40;
      }
    }

    if(!position||!target)return;

    if(controlsRef.current)controlsRef.current.enabled=false;

    tween.current={
      from:camera.position.clone(),
      to:position.clone(),
      targetFrom:controlsRef.current?.target.clone()||target.clone(),
      targetTo:target.clone(),
      fovFrom:camera.fov,
      fovTo:finalFov,
      elapsed:0,
      duration:cinematic?0.85:0.65
    };
  },[
    selectedBuildingId,preset,focusTick,JSON.stringify(boundsMap),
    camera,controlsRef,cinematic
  ]);

  useFrame((_,dt)=>{
    const tw=tween.current;
    if(!tw)return;

    tw.elapsed=Math.min(tw.duration,tw.elapsed+dt);
    const t=tw.duration?tw.elapsed/tw.duration:1;
    const e=smoothstep(t);

    camera.position.lerpVectors(tw.from,tw.to,e);

    const target=tw.targetFrom.clone().lerp(tw.targetTo,e);
    if(controlsRef.current){
      controlsRef.current.target.copy(target);
    }

    camera.fov=THREE.MathUtils.lerp(tw.fovFrom,tw.fovTo,e);
    camera.updateProjectionMatrix();
    camera.lookAt(target);

    if(t>=1){
      camera.position.copy(tw.to);
      camera.fov=tw.fovTo;
      camera.updateProjectionMatrix();

      if(controlsRef.current){
        controlsRef.current.target.copy(tw.targetTo);
        controlsRef.current.enabled=true;
        controlsRef.current.update();
      }

      camera.lookAt(tw.targetTo);
      tween.current=null;
    }
  });

  useEffect(()=>()=>{if(controlsRef.current)controlsRef.current.enabled=true},[controlsRef]);

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
  const [focusTick,setFocusTick]=useState(0);
  const setBound=(id,b)=>setBoundsMap(v=>{
    const prev=v[id];
    if(prev&&Math.abs(prev.minX-b.minX)<.0001&&Math.abs(prev.maxX-b.maxX)<.0001&&Math.abs(prev.minY-b.minY)<.0001&&Math.abs(prev.maxY-b.maxY)<.0001&&Math.abs(prev.minZ-b.minZ)<.0001&&Math.abs(prev.maxZ-b.maxZ)<.0001)return v;
    return {...v,[id]:b};
  });

  function zoom(factor){
    const c=controls.current;if(!c)return;
    const cam=c.object,v=cam.position.clone().sub(c.target).multiplyScalar(factor);
    cam.position.copy(c.target.clone().add(v));c.update();
  }
  function reset(){setPreset('perspective');setFocusTick(v=>v+1)}
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
          ? <SharedComplex url={sharedModel.url} cfg={sharedModel} buildings={buildings} selectedBuildingId={selectedBuildingId} selectedFloor={selectedFloor} hoverInfo={hoverInfo} onHover={setHoverInfo} onLeave={()=>setHoverInfo(null)} onSelectBuilding={onSelectBuilding} onSelectFloor={onSelectFloor} onBounds={setBound}/>
          : individual.map(b=><IndividualBuilding key={b.id} building={b} selectedBuildingId={selectedBuildingId} selectedFloor={b.id===selectedBuildingId?selectedFloor:null} hoveredFloor={hoverInfo?.building?.id===b.id?hoverInfo.floor:null} hovered={hoverInfo?.building?.id===b.id} onHover={setHoverInfo} onLeave={bb=>setHoverInfo(v=>v?.building?.id===bb.id?null:v)} onSelectBuilding={onSelectBuilding} onSelectFloor={onSelectFloor} dimOthers={!!selectedBuildingId&&b.id!==selectedBuildingId} onBounds={setBound}/>)
        }
        {showBubbles&&<BuildingBubbleLayer buildings={buildings} boundsMap={boundsMap} selectedBuildingId={selectedBuildingId} onSelectBuilding={onSelectBuilding}/>}
        <Environment preset="city"/>
      </Suspense>
      {showGrid&&!publicMode&&<gridHelper args={[20,40,'#aeb6b1','#d3d8d5']} position={[0,-.001,0]}/>}
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.08} autoRotate={autoRotate} autoRotateSpeed={.65} minDistance={.7} maxDistance={80}/>
      <CameraDirector buildings={buildings} boundsMap={boundsMap} selectedBuildingId={selectedBuildingId} preset={preset} controlsRef={controls} focusTick={focusTick} cinematic={publicMode}/>
    </Canvas>

    {hoverInfo&&<div className="model-tooltip" style={{left:Math.min(window.innerWidth-235,hoverInfo.clientX+16),top:Math.min(window.innerHeight-90,hoverInfo.clientY+16)}}>
      <strong>{hoverInfo.building.name}</strong>
      {hoverInfo.stage==='building'
        ? <><span>Clădire</span><small>Click pentru prim-plan și etaje</small></>
        : <><span>{hoverInfo.floor?hoverInfo.floor.name:'Alege un etaj'}</span>{hoverInfo.floor&&<small>Click pentru planul etajului</small>}</>
      }
    </div>}

    {!compact&&!publicMode&&<>
      <div className="viewer-presets"><button className={preset==='perspective'?'active':''} onClick={()=>setPreset('perspective')}>Perspectivă</button><button className={preset==='top'?'active':''} onClick={()=>setPreset('top')}>De sus</button><button className={preset==='front'?'active':''} onClick={()=>setPreset('front')}>Față</button></div>
      <div className="viewer-tools"><button onClick={()=>zoom(.8)}>＋</button><button onClick={()=>zoom(1.25)}>−</button><button onClick={reset}>⌖</button><button className={autoRotate?'active':''} onClick={()=>setAutoRotate(v=>!v)}>↻</button><button onClick={()=>document.querySelector('.three-viewer')?.requestFullscreen?.()}>⛶</button></div>
    </>}
  </div>
}
