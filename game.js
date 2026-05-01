import * as THREE from 'https://esm.sh/three@0.160.0';

const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0xa5b7c4,.0036);
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,1000);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
document.body.appendChild(renderer.domElement);

// Post-processing (loaded dynamically so game works even if bloom fails)
let composer=null;
async function initBloom(){
  try{
    const[{EffectComposer},{RenderPass},{UnrealBloomPass}]=await Promise.all([
      import('https://esm.sh/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js'),
      import('https://esm.sh/three@0.160.0/examples/jsm/postprocessing/RenderPass.js'),
      import('https://esm.sh/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js')
    ]);
    composer=new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene,camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.48,.38,.78));
    console.log('Bloom enabled');
  }catch(e){console.warn('Bloom unavailable, using standard rendering:',e);}
}
initBloom();

window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);if(composer)composer.setSize(innerWidth,innerHeight);
});

// Audio
const AudioCtx=window.AudioContext||window.webkitAudioContext;let ctx;
function ensureAudio(){
  if(!ctx)ctx=new AudioCtx();
  ctx.resume?.();
  audio.unlock();
}
function beep(freq=440,dur=.08,g=.045,type='sine'){
  if(!ctx)return;const o=ctx.createOscillator(),gn=ctx.createGain();o.type=type;o.frequency.value=freq;
  gn.gain.setValueAtTime(g,ctx.currentTime);gn.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+dur);
  o.connect(gn);gn.connect(ctx.destination);o.start();o.stop(ctx.currentTime+dur);
}
function boom(){beep(80,.22,.08,'sawtooth');setTimeout(()=>beep(45,.18,.06,'square'),20);}
function whoosh(){beep(180,.05,.045,'triangle');setTimeout(()=>beep(520,.08,.035,'sine'),35);}
function createAudioManager(paths){
  const clips=new Map(),loops=new Map(),failed=new Set(),loopVolumes=new Map(),loopFades=new Map();
  let unlocked=false;
  for(const [name,src] of Object.entries(paths)){
    try{
      const el=new Audio(src);
      el.preload='auto';
      el.addEventListener('error',()=>failed.add(name),{once:true});
      clips.set(name,el);
      el.load?.();
    }catch(e){failed.add(name);}
  }
  function fallback(name){
    if(name?.includes('explosion'))boom();
    else if(name?.includes('whiz')||name==='slowmo_enter')whoosh();
    else beep(440,.05,.025,'sine');
  }
  function canUse(name){return unlocked&&clips.has(name)&&!failed.has(name);}
  function handlePlayResult(name,result,useFallback=true){
    if(result?.catch)result.catch(err=>{
      if(err?.name!=='NotAllowedError')failed.add(name);
      if(useFallback&&unlocked)fallback(name);
    });
  }
  function play(name,volume=1,useFallback=true){
    if(!canUse(name)){if(useFallback&&unlocked)fallback(name);return false;}
    try{
      const src=clips.get(name);
      const el=src.cloneNode(true);
      el.volume=THREE.MathUtils.clamp(volume,0,1);
      el.loop=false;
      handlePlayResult(name,el.play(),useFallback);
      return true;
    }catch(e){failed.add(name);if(useFallback&&unlocked)fallback(name);return false;}
  }
  function startLoop(name,volume=1){
    if(loopFades.has(name)){clearInterval(loopFades.get(name));loopFades.delete(name);}
    loopVolumes.set(name,THREE.MathUtils.clamp(volume,0,1));
    if(!canUse(name))return false;
    let el=loops.get(name);
    if(!el){
      try{
        el=clips.get(name).cloneNode(true);
        el.loop=true;
        el.addEventListener('error',()=>failed.add(name),{once:true});
        loops.set(name,el);
      }catch(e){failed.add(name);return false;}
    }
    el.volume=loopVolumes.get(name);
    if(el.paused)handlePlayResult(name,el.play(),false);
    return true;
  }
  function stopLoop(name){
    if(loopFades.has(name)){clearInterval(loopFades.get(name));loopFades.delete(name);}
    const el=loops.get(name);
    if(!el)return;
    try{el.pause();el.currentTime=0;}catch(e){}
  }
  function setLoopVolume(name,volume=1){
    const v=THREE.MathUtils.clamp(volume,0,1);
    loopVolumes.set(name,v);
    const el=loops.get(name);
    if(el)el.volume=v;
  }
  function fadeLoop(name,volume=0,duration=.7,stopAtEnd=false){
    if(loopFades.has(name)){clearInterval(loopFades.get(name));loopFades.delete(name);}
    const target=THREE.MathUtils.clamp(volume,0,1);
    const start=loopVolumes.get(name)??target;
    if(duration<=0){setLoopVolume(name,target);if(stopAtEnd)stopLoop(name);return;}
    const startTime=performance.now();
    const id=setInterval(()=>{
      const t=THREE.MathUtils.clamp((performance.now()-startTime)/(duration*1000),0,1);
      setLoopVolume(name,THREE.MathUtils.lerp(start,target,t));
      if(t>=1){
        clearInterval(id);loopFades.delete(name);
        if(stopAtEnd)stopLoop(name);
      }
    },50);
    loopFades.set(name,id);
  }
  function unlock(){
    if(unlocked)return;
    unlocked=true;
    startLoop('engine_loop',.25);
    startLoop('wind_loop',.12);
    startLoop('distant_battle_loop',.08);
    stopLoop('music_base_loop');
    startLoop('music_elevenlabs_loop',.32);
    startLoop('engine_damaged_loop',0);
  }
  return {play,playRandom:(names,volume=1)=>play(names[Math.floor(Math.random()*names.length)],volume),startLoop,stopLoop,setLoopVolume,fadeLoop,unlock,get unlocked(){return unlocked;}};
}
const audio=createAudioManager({
  distant_battle_loop:'audio/ambience/distant_battle_loop.mp3',
  engine_loop:'audio/engine/engine_loop.mp3',
  engine_damaged_loop:'audio/engine/engine_damaged_loop.mp3',
  wind_loop:'audio/engine/wind_loop.mp3',
  slowmo_enter:'audio/fx/slowmo_enter.mp3',
  explosion_big:'audio/impacts/explosion_big.mp3',
  explosion_small:'audio/impacts/explosion_small.mp3',
  hit_metal_01:'audio/impacts/hit_metal_01.mp3',
  hit_metal_02:'audio/impacts/hit_metal_02.mp3',
  player_hit_01:'audio/impacts/player_hit_01.mp3',
  music_base_loop:'audio/music/music_base_loop.mp3',
  music_alt_loop:'audio/music/music_alt_loop.mp3',
  music_elevenlabs_loop:'audio/music/music_elevenlabs_loop.mp3',
  repair_fail:'audio/repair/repair_fail.mp3',
  repair_good:'audio/repair/repair_good.mp3',
  repair_loop:'audio/repair/repair_loop.mp3',
  repair_perfect:'audio/repair/repair_perfect.mp3',
  repair_tick:'audio/repair/repair_tick.mp3',
  critical_beep:'audio/ui/critical_beep.mp3',
  ui_click:'audio/ui/ui_click.mp3',
  ui_confirm:'audio/ui/ui_confirm.mp3',
  bullet_whiz_01:'audio/weapons/bullet_whiz_01.mp3',
  bullet_whiz_02:'audio/weapons/bullet_whiz_02.mp3',
  enemy_mg_burst_01:'audio/weapons/enemy_mg_burst_01.mp3',
  mg_burst_01:'audio/weapons/mg_burst_01.mp3',
  mg_overdrive_loop:'audio/weapons/mg_overdrive_loop.mp3'
});
const audioTimers={shot:0,enemyShot:0,hitConfirm:0,hitMetal:0,repairTick:0,criticalBeep:0};
const audioMix={damagedEngine:0,music:.32};
const hitSounds=['hit_metal_01','hit_metal_02'];
const whizSounds=['bullet_whiz_01','bullet_whiz_02'];
function updateAudioMix(dt){
  if(!audio.unlocked)return;
  const damageTarget=player.alive&&player.hp<45?.05+(45-player.hp)/45*.15:0;
  audioMix.damagedEngine=THREE.MathUtils.lerp(audioMix.damagedEngine,damageTarget,Math.min(1,dt*2.5));
  audio.setLoopVolume('engine_damaged_loop',audioMix.damagedEngine);
  const musicTarget=player.alive&&player.hp<30?.38:player.alive?.32:.18;
  audioMix.music=THREE.MathUtils.lerp(audioMix.music,musicTarget,Math.min(1,dt*1.4));
  audio.setLoopVolume('music_elevenlabs_loop',audioMix.music);
  const now=performance.now()/1000;
  if(player.alive&&player.hp<30&&now-audioTimers.criticalBeep>1.25){
    audio.play('critical_beep',.18);
    audioTimers.criticalBeep=now;
  }
}

// Lighting
scene.add(new THREE.HemisphereLight(0xb7cdec,0x314052,.74));
const sun=new THREE.DirectionalLight(0xffb45f,2.75);sun.position.set(-70,36,-95);scene.add(sun);

// Layer 1: cheap gradient sky dome with warm horizon and a stylized sun glare.
const skyVert=`varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const skyFrag=`
varying vec3 vP;uniform float shift;uniform float uTime;uniform float glare;
void main(){
  vec3 d=normalize(vP);float h=d.y*.5+.5;
  vec3 horizon=mix(vec3(.78,.86,.9),vec3(.62,.71,.78),shift*.35);
  vec3 mid=mix(vec3(.46,.65,.82),vec3(.35,.5,.66),shift*.36);
  vec3 top=mix(vec3(.1,.28,.52),vec3(.08,.16,.34),shift*.34);
  vec3 sky=mix(horizon,mid,smoothstep(.06,.48,h));
  sky=mix(sky,top,smoothstep(.42,1.,h));
  float haze=1.-smoothstep(.05,.36,h);
  sky=mix(sky,vec3(.88,.9,.86),haze*(.16+shift*.07));
  vec3 sDir=normalize(vec3(-.56,.28,-.78));float sD=max(0.,dot(d,sDir));
  sky+=vec3(1.,.58,.22)*pow(sD,72.)*(.32+glare*.3);
  sky+=vec3(1.,.45,.18)*pow(sD,10.)*(.055+glare*.11);
  gl_FragColor=vec4(sky,1.);}`;
const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,
  uniforms:{shift:{value:0},uTime:{value:0},glare:{value:0}},vertexShader:skyVert,fragmentShader:skyFrag});
const sky=new THREE.Mesh(new THREE.SphereGeometry(500,32,16),skyMat);scene.add(sky);

// Environment / atmosphere: cinematic illusion from layered, cheap geometry.
const environment=createBattlefieldEnvironment();
function makeRadialTexture(inner='rgba(255,210,120,1)',outer='rgba(255,120,40,0)',size=96,stretchY=1){
  const c=document.createElement('canvas');c.width=size;c.height=Math.round(size*stretchY);
  const g=c.getContext('2d'),cx=c.width/2,cy=c.height/2,r=Math.max(c.width,c.height)/2;
  const grad=g.createRadialGradient(cx,cy,0,cx,cy,r);
  grad.addColorStop(0,inner);grad.addColorStop(.34,inner);
  grad.addColorStop(1,outer);
  g.fillStyle=grad;g.fillRect(0,0,c.width,c.height);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function makeSoftTexture(color='210,220,225',alpha=.55,size=96,stretchY=1){
  const c=document.createElement('canvas');c.width=size;c.height=Math.round(size*stretchY);
  const g=c.getContext('2d'),cx=c.width/2,cy=c.height/2,r=Math.max(c.width,c.height)/2;
  const grad=g.createRadialGradient(cx,cy,0,cx,cy,r);
  grad.addColorStop(0,`rgba(${color},${alpha})`);
  grad.addColorStop(.42,`rgba(${color},${alpha*.48})`);
  grad.addColorStop(1,`rgba(${color},0)`);
  g.fillStyle=grad;g.fillRect(0,0,c.width,c.height);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function litCloudColor(base,local,cloudScale,groupWarm,contrast){
  const top=base.clone().lerp(new THREE.Color(0xffffff),.84);
  const bottom=base.clone().lerp(new THREE.Color(0xbfc9d1),.09*contrast);
  const up=THREE.MathUtils.clamp((local.y/cloudScale+.62)/1.25,0,1);
  const sunSide=THREE.MathUtils.clamp((-local.x/(cloudScale*2.9)+.5),0,1);
  const shadowSide=1.-sunSide;
  const c=bottom.lerp(top,up);
  c.lerp(new THREE.Color(0xffdeb8),groupWarm*sunSide*(.22+.11*up));
  c.lerp(new THREE.Color(0xb7c7d8),shadowSide*.055*(1.-up*.45));
  c.multiplyScalar(1.12+up*.18+sunSide*.08-shadowSide*.025);
  return c;
}
function createCloudLayer({clouds,zMin,zMax,yMin,yMax,xSpan,speed,scale,color,opacity,drift=.12,contrast=1,warmth=.15}){
  const root=new THREE.Group();
  const total=clouds.reduce((n,c)=>n+c,0);
  const geo=new THREE.IcosahedronGeometry(1,2);
  const pos=geo.attributes.position,puffColors=[];
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const top=THREE.MathUtils.clamp(y*.5+.5,0,1);
    const sunSide=THREE.MathUtils.clamp((-x*.75-z*.2)+.52,0,1);
    const c=new THREE.Color(0xbecbd5).lerp(new THREE.Color(0xffffff),top*.55+sunSide*.22);
    c.lerp(new THREE.Color(0xffe0bb),top*sunSide*.08);
    c.multiplyScalar(.82+top*.13+sunSide*.08);
    puffColors.push(c.r,c.g,c.b);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(puffColors,3));
  const mat=new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true,transparent:true,opacity,depthWrite:false,fog:true});
  const mesh=new THREE.InstancedMesh(geo,mat,total);mesh.frustumCulled=false;root.add(mesh);
  const groups=[],puffs=[],dummy=new THREE.Object3D(),baseColor=new THREE.Color(color);
  let index=0;
  for(let c=0;c<clouds.length;c++){
    const puffCount=clouds[c],s=scale[0]+Math.random()*(scale[1]-scale[0]);
    const group={pos:new THREE.Vector3((Math.random()-.5)*xSpan,yMin+Math.random()*(yMax-yMin),-(zMin+Math.random()*(zMax-zMin))),
      speed:speed*(.72+Math.random()*.56),phase:Math.random()*Math.PI*2,warm:warmth*(.35+Math.random()*.9),puffs:[]};
    if(group.pos.x<0)group.warm+=warmth*.35;
    for(let p=0;p<puffCount;p++){
      const side=(Math.random()-.5),up=(Math.random()-.5),deep=(Math.random()-.5);
      const local=new THREE.Vector3(side*s*(1.1+Math.random()*2.2),up*s*(.24+Math.random()*.75),deep*s*(.45+Math.random()*1.1));
      const puffScale=new THREE.Vector3(s*(.62+Math.random()*1.25),s*(.48+Math.random()*.9),s*(.55+Math.random()*1.05));
      const puff={group,local,scale:puffScale,phase:Math.random()*Math.PI*2,index:index++};
      group.puffs.push(puff);puffs.push(puff);
      mesh.setColorAt(puff.index,litCloudColor(baseColor,local,s,group.warm,contrast));
    }
    groups.push(group);
  }
  function update(dt,t){
    for(const g of groups){
      g.pos.x+=g.speed*dt;g.pos.y+=Math.sin(t*.17+g.phase)*drift*dt;
      const minX=camera.position.x-xSpan*.55,maxX=camera.position.x+xSpan*.55;
      if(g.pos.x>maxX)g.pos.x=minX;if(g.pos.x<minX)g.pos.x=maxX;
    }
    for(const p of puffs){
      dummy.position.copy(p.group.pos).add(p.local);
      dummy.position.y+=Math.sin(t*.23+p.phase)*drift*.9;
      dummy.scale.copy(p.scale);
      dummy.rotation.set(.12*Math.sin(t*.06+p.phase),p.phase+t*.018,.08*Math.cos(t*.08+p.phase));
      dummy.updateMatrix();mesh.setMatrixAt(p.index,dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
  }
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  update(0,0);return {root,update};
}
function createNearWisps(count=34){
  const root=new THREE.Group();
  const tex=makeSoftTexture('185,195,205',.38,96,.55);
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:.32,depthWrite:false,blending:THREE.NormalBlending,fog:false});
  const geo=new THREE.PlaneGeometry(1,1);
  const mesh=new THREE.InstancedMesh(geo,mat,count);mesh.frustumCulled=false;root.add(mesh);
  const items=[],dummy=new THREE.Object3D();
  for(let i=0;i<count;i++)items.push({
    pos:new THREE.Vector3((Math.random()-.5)*70,-10+Math.random()*28,-22-Math.random()*62),
    speed:6+Math.random()*13,
    scale:8+Math.random()*16,
    rot:Math.random()*Math.PI,
    phase:Math.random()*Math.PI*2
  });
  function update(dt,t){
    for(let i=0;i<items.length;i++){
      const it=items[i];it.pos.x-=it.speed*dt;it.pos.y+=Math.sin(t*.8+it.phase)*.35*dt;it.rot+=dt*.04;
      const minX=camera.position.x-52,maxX=camera.position.x+52;
      if(it.pos.x<minX){it.pos.x=maxX;it.pos.y=-10+Math.random()*28;it.pos.z=-22-Math.random()*62;}
      dummy.position.set(camera.position.x*.45+it.pos.x,it.pos.y,it.pos.z);
      dummy.quaternion.copy(camera.quaternion);dummy.rotateZ(it.rot);
      dummy.scale.set(it.scale*2.4,it.scale*.42,1);
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
  }
  update(0,0);return {root,update};
}
function createDistantTerrain(){
  const root=new THREE.Group();
  function makeLitMountainGeometry(segmentCount,baseColor,warmth=.04,contrast=1){
    const geo=new THREE.ConeGeometry(1,1,segmentCount,1).toNonIndexed();
    const pos=geo.attributes.position,colors=[],base=new THREE.Color(baseColor);
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      const top=THREE.MathUtils.clamp(y+.5,0,1);
      const sunSide=THREE.MathUtils.clamp((-x*.82-z*.18)+.52,0,1);
      const shadeSide=1.-sunSide;
      const c=base.clone();
      c.multiplyScalar(.76+top*.24*contrast+sunSide*.22*contrast-shadeSide*.08*contrast);
      c.lerp(new THREE.Color(0xd8e6ee),top*.12+sunSide*.07);
      c.lerp(new THREE.Color(0xffd8a8),sunSide*top*warmth);
      c.lerp(new THREE.Color(0x26384d),shadeSide*(1.-top)*.08*contrast);
      colors.push(c.r,c.g,c.b);
    }
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    return geo;
  }
  const makeBand=({count,z,yBase,span,color,opacity,hRange,wRange,depth,segments,fog=true,warmth=.035,contrast=1})=>{
    let x=-span*.5;
    for(let i=0;i<count;i++){
      x+=wRange[0]*.65+Math.random()*wRange[1]*.55;
      if(x>span*.5)x-=span;
      const h=hRange[0]+Math.random()*(hRange[1]-hRange[0]);
      const w=wRange[0]+Math.random()*(wRange[1]-wRange[0]);
      const base=new THREE.Color(color).offsetHSL((Math.random()-.5)*.018,(Math.random()-.5)*.035,(Math.random()-.5)*.04);
      const mat=new THREE.MeshBasicMaterial({vertexColors:true,transparent:opacity<1,opacity,fog});
      const m=new THREE.Mesh(makeLitMountainGeometry(segments[0]+Math.floor(Math.random()*(segments[1]-segments[0]+1)),base,warmth,contrast),mat);
      m.position.set(x+(Math.random()-.5)*18,yBase+h*.5,z+(Math.random()-.5)*depth);
      m.scale.set(w,h,w*(.26+Math.random()*.42));
      m.rotation.set(0,(Math.random()-.5)*.85,(Math.random()-.5)*.08);
      root.add(m);
    }
  };
  makeBand({count:20,z:-425,yBase:-45,span:640,color:0xd0dbe3,opacity:.22,hRange:[13,31],wRange:[18,42],depth:50,segments:[4,7],warmth:.025,contrast:.65});
  makeBand({count:20,z:-288,yBase:-47,span:525,color:0x7d8fa2,opacity:.64,hRange:[24,55],wRange:[22,58],depth:40,segments:[4,6],warmth:.035,contrast:.88});
  makeBand({count:16,z:-158,yBase:-49,span:430,color:0x3f5369,opacity:1,hRange:[36,80],wRange:[32,76],depth:30,segments:[3,5],fog:false,warmth:.045,contrast:1.05});
  return root;
}
function createGroundHints(){
  const root=new THREE.Group(),dummy=new THREE.Object3D();
  const geo=new THREE.CircleGeometry(1,12);
  const mat=new THREE.MeshBasicMaterial({color:0x1c2129,transparent:true,opacity:.12,depthWrite:false});
  const mesh=new THREE.InstancedMesh(geo,mat,18);mesh.frustumCulled=false;root.add(mesh);
  for(let i=0;i<18;i++){
    dummy.position.set((Math.random()-.5)*320,-48.8,-95-Math.random()*260);
    dummy.rotation.set(-Math.PI/2,0,Math.random()*Math.PI);
    dummy.scale.set(14+Math.random()*42,5+Math.random()*18,1);
    dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate=true;
  return root;
}
function createSmokeColumns(){
  const root=new THREE.Group(),dummy=new THREE.Object3D(),items=[],columns=10,puffs=8;
  const geo=new THREE.DodecahedronGeometry(1,1);
  const tiers=[
    {count:columns*3,opacity:.56,mesh:null,next:0},
    {count:columns*3,opacity:.38,mesh:null,next:0},
    {count:columns*2,opacity:.2,mesh:null,next:0}
  ];
  tiers.forEach(t=>{
    const mat=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,transparent:true,opacity:t.opacity,depthWrite:false});
    t.mesh=new THREE.InstancedMesh(geo,mat,t.count);t.mesh.frustumCulled=false;root.add(t.mesh);
  });
  const bottomColor=new THREE.Color(0x242a32),topColor=new THREE.Color(0x9ca7ad);
  for(let c=0;c<columns;c++){
    const base=new THREE.Vector3((Math.random()-.5)*300,-38,-105-Math.random()*225),lean=(Math.random()-.5)*1.8;
    for(let p=0;p<puffs;p++){
      const k=p/(puffs-1),tierIndex=p<3?0:p<6?1:2,tier=tiers[tierIndex];
      const item={base,p,k,lean,tier:tierIndex,index:tier.next++,phase:Math.random()*Math.PI*2,scale:2.2+p*.85+Math.random()*1.8};
      items.push(item);tier.mesh.setColorAt(item.index,bottomColor.clone().lerp(topColor,k).multiplyScalar(.86+k*.24));
    }
  }
  function update(dt,t){
    for(let i=0;i<items.length;i++){
      const it=items[i],rise=it.p*4.3,drift=Math.sin(t*.18+it.phase)*(1.4+it.p*.42)+it.lean*it.p;
      dummy.position.set(it.base.x+drift,it.base.y+rise,it.base.z+Math.cos(t*.15+it.phase)*1.2+it.p*.18);
      const s=it.scale*(1+Math.sin(t*.23+it.phase)*.08);
      dummy.scale.set(s*(1.15+it.k*.55),s*(1.1+it.k*.28),s*(.95+it.k*.35));dummy.rotation.set(t*.02+it.phase,it.phase,t*.03);
      dummy.updateMatrix();tiers[it.tier].mesh.setMatrixAt(it.index,dummy.matrix);
    }
    tiers.forEach(tier=>tier.mesh.instanceMatrix.needsUpdate=true);
  }
  tiers.forEach(tier=>{if(tier.mesh.instanceColor)tier.mesh.instanceColor.needsUpdate=true;});
  update(0,0);return {root,update};
}
function createDistantPlanes(){
  const root=new THREE.Group();
  const bodyGeo=new THREE.ConeGeometry(.22,.95,5),wingGeo=new THREE.BoxGeometry(1.35,.06,.22);
  const mat=new THREE.MeshBasicMaterial({color:0xaeb8c8,fog:true}),warm=new THREE.MeshBasicMaterial({color:0xff7a32,fog:false});
  const planes=[];
  for(let i=0;i<9;i++){
    const g=new THREE.Group();
    const body=new THREE.Mesh(bodyGeo,mat);body.rotation.x=Math.PI/2;g.add(body);
    const wing=new THREE.Mesh(wingGeo,mat);g.add(wing);
    const ember=new THREE.Mesh(new THREE.SphereGeometry(.09,6,4),warm);ember.position.z=.48;g.add(ember);
    g.scale.setScalar(.85+Math.random()*.85);root.add(g);
    planes.push({g,center:new THREE.Vector3((Math.random()-.5)*170,4+Math.random()*32,-145-Math.random()*165),
      radius:18+Math.random()*34,speed:.08+Math.random()*.08,phase:Math.random()*Math.PI*2,dive:Math.random()<.5?-1:1});
  }
  function update(dt,t){
    for(const p of planes){
      const a=t*p.speed+p.phase;
      p.g.position.set(p.center.x+Math.cos(a)*p.radius,p.center.y+Math.sin(a*1.7)*8*p.dive,p.center.z+Math.sin(a)*p.radius*.55);
      p.g.rotation.set(Math.sin(a)*.18,Math.PI+a,Math.cos(a)*.45);
      p.g.children[2].scale.setScalar(.7+Math.random()*.8);
    }
  }
  return {root,update};
}
function createBattlefieldActivity(){
  const root=new THREE.Group();
  const mat=new THREE.MeshBasicMaterial({color:0xff9a3a,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  const coreGeo=new THREE.SphereGeometry(1,8,6);
  const flashes=[];
  for(let i=0;i<10;i++){
    const core=new THREE.Mesh(coreGeo,mat.clone());core.visible=false;root.add(core);
    flashes.push({mesh:core,life:0,max:.1,next:Math.random()*2.8,baseScale:1});
  }
  function trigger(f){
    f.life=f.max=.1+Math.random()*.18;f.next=1.2+Math.random()*4.4;f.baseScale=.45+Math.random()*.95;
    f.mesh.position.set((Math.random()-.5)*270,-34+Math.random()*18,-115-Math.random()*250);
    f.mesh.scale.setScalar(f.baseScale);f.mesh.visible=true;
  }
  function update(dt,t){
    for(const f of flashes){
      if(f.life>0){
        f.life-=dt;const k=Math.max(0,f.life/f.max);
        f.mesh.material.opacity=Math.sin(k*Math.PI)*.55;
        f.mesh.scale.setScalar(f.baseScale*(1+(1-k)*.8));
        if(f.life<=0)f.mesh.visible=false;
      }else{f.next-=dt;if(f.next<=0)trigger(f);}
    }
  }
  return {root,update};
}
function createSunSprites(){
  const root=new THREE.Group(),tex=makeRadialTexture('rgba(255,235,165,1)','rgba(255,130,50,0)',128,1);
  const disc=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,opacity:.44,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,opacity:.1,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
  const dir=new THREE.Vector3(-.56,.28,-.78).normalize();
  disc.position.copy(dir).multiplyScalar(390);halo.position.copy(dir).multiplyScalar(388);
  disc.scale.set(18,18,1);halo.scale.set(76,76,1);root.add(halo,disc);
  function update(glare){disc.material.opacity=.24+glare*.14;halo.material.opacity=.045+glare*.09;}
  return {root,update,dir};
}
function createFocalGlow(){
  const root=new THREE.Group();
  const tex=makeSoftTexture('218,235,245',.32,128,.7);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
  glow.scale.set(54,28,1);root.add(glow);
  function update(dt,t){
    glow.position.set(player.group.position.x*.34,player.group.position.y*.16+7,-72);
    glow.material.opacity=.22+Math.sin(t*.8)*.025;
  }
  return {root,update};
}
function createBattlefieldEnvironment(){
  const root=new THREE.Group();scene.add(root);
  const sunSystem=createSunSprites();
  const systems=[
    createCloudLayer({clouds:Array.from({length:6},()=>5+Math.floor(Math.random()*4)),zMin:78,zMax:165,yMin:13,yMax:42,xSpan:400,speed:2.45,scale:[6.8,14],color:0xd0d7dd,opacity:.15,drift:.3,contrast:.45,warmth:.2}),
    createCloudLayer({clouds:Array.from({length:8},()=>5+Math.floor(Math.random()*5)),zMin:170,zMax:315,yMin:25,yMax:64,xSpan:640,speed:.68,scale:[10,20],color:0xe0e6ea,opacity:.095,drift:.19,contrast:.28,warmth:.13}),
    createCloudLayer({clouds:Array.from({length:6},()=>5+Math.floor(Math.random()*4)),zMin:325,zMax:485,yMin:40,yMax:88,xSpan:860,speed:-.2,scale:[16,34],color:0xf1f5f7,opacity:.035,drift:.09,contrast:.14,warmth:.06}),
    createNearWisps(),
    {root:createDistantTerrain(),update(){}},
    {root:createGroundHints(),update(){}},
    createSmokeColumns(),
    createBattlefieldActivity(),
    createDistantPlanes(),
    createFocalGlow()
  ];
  systems.forEach(s=>root.add(s.root));root.add(sunSystem.root);
  const viewDir=new THREE.Vector3();
  function update(dt,elapsed){
    skyMat.uniforms.uTime.value=elapsed;skyMat.uniforms.shift.value=Math.min(.78,elapsed/110);
    systems.forEach(s=>s.update(dt,elapsed));
    camera.getWorldDirection(viewDir);
    const glare=THREE.MathUtils.smoothstep(viewDir.dot(sunSystem.dir),.72,.94);
    skyMat.uniforms.glare.value=glare;
    renderer.toneMappingExposure=.98+glare*.06+Math.min(.035,elapsed/260);
    sunSystem.update(glare);
  }
  return {root,update};
}

// Input
const gameKeys=new Set(['Space','KeyW','KeyA','KeyS','KeyD','KeyR','ShiftLeft','ShiftRight']);
const keys=new Set();
const aimNdc=new THREE.Vector2(),aimRaycaster=new THREE.Raycaster(),aimDir=new THREE.Vector3(),aimWorldPoint=new THREE.Vector3();
const aimAssistProbe=new THREE.Vector3(),aimAssistDir=new THREE.Vector3();
const aimAssistConfig={enabled:true,radius:.26,maxStrength:.58,stickTime:.2,farScale:.05};
const aimAssistState={target:null,timer:0,active:false,strength:0};
window.addEventListener('keydown',e=>{if(gameKeys.has(e.code))e.preventDefault();keys.add(e.code);ensureAudio();});
window.addEventListener('pointerdown',()=>ensureAudio(),{passive:true});
window.addEventListener('keyup',e=>{if(gameKeys.has(e.code))e.preventDefault();keys.delete(e.code);});
const mouse={x:innerWidth/2,y:innerHeight/2,targetX:innerWidth/2,targetY:innerHeight/2,down:false};
function clampAimToPlayArea(x,y){
  const cx=innerWidth/2,cy=innerHeight/2,maxX=Math.min(innerWidth*.32,420),maxY=Math.min(innerHeight*.28,260);
  mouse.targetX=THREE.MathUtils.clamp(x,cx-maxX,cx+maxX);
  mouse.targetY=THREE.MathUtils.clamp(y,cy-maxY,cy+maxY);
}
function syncAimNdcFromMouse(){
  aimNdc.set((mouse.x/innerWidth)*2-1,-(mouse.y/innerHeight)*2+1);
}
function resetAimToCenter(){
  const cx=innerWidth/2,cy=innerHeight/2;
  clampAimToPlayArea(cx,cy);
  mouse.x=mouse.targetX;mouse.y=mouse.targetY;
  syncAimNdcFromMouse();
}
function moveAimByDelta(dx,dy){
  clampAimToPlayArea(mouse.targetX+dx,mouse.targetY+dy);
}
function releaseMouseCapture(){
  mouse.down=false;
  if(document.pointerLockElement===renderer.domElement)document.exitPointerLock?.();
}
resetAimToCenter();
window.addEventListener('pointermove',e=>{
  if(document.pointerLockElement===renderer.domElement)return;
  if(e.target===renderer.domElement)clampAimToPlayArea(e.clientX,e.clientY);
});
window.addEventListener('mousemove',e=>{
  if(document.pointerLockElement===renderer.domElement)moveAimByDelta(e.movementX||0,e.movementY||0);
});
renderer.domElement.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  e.preventDefault();mouse.down=true;ensureAudio();
});
window.addEventListener('pointerup',e=>{if(e.button===0)mouse.down=false;});
window.addEventListener('pointercancel',()=>{mouse.down=false;});
window.addEventListener('blur',releaseMouseCapture);
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==renderer.domElement)mouse.down=false;});
window.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('resize',()=>clampAimToPlayArea(mouse.targetX,mouse.targetY));

// Materials & builders
function material(c){return new THREE.MeshStandardMaterial({color:c,roughness:.42,metalness:.04});}
function box(p,c,pos,s){const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material(c));m.position.set(...pos);m.scale.set(...s);p.add(m);return m;}
function cyl(p,c,pos,r,d,rot=[0,0,0]){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d,18),material(c));m.position.set(...pos);m.rotation.set(...rot);p.add(m);return m;}

function makePlane(color=0xffa85c,accent=0xffe0a0){
  const g=new THREE.Group();
  cyl(g,color,[0,0,0],.34,2.8,[Math.PI/2,0,0]);box(g,color,[0,.18,-.1],[.7,.35,1.25]);
  box(g,accent,[0,.62,0],[3.6,.09,.72]);box(g,accent,[0,-.16,0],[3.3,.09,.62]);
  box(g,0x33231c,[0,.22,1.45],[1.2,.08,.45]);box(g,0x33231c,[0,.58,1.18],[.18,.75,.08]);
  const prop=box(g,0x15100e,[0,0,-1.55],[.08,1.25,.04]);g.userData.prop=prop;
  // Engine exhaust glow
  const exMat=new THREE.MeshBasicMaterial({color:0xff6020,transparent:true,opacity:.7});
  const ex=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),exMat);
  ex.position.set(0,0,1.5);g.add(ex);g.userData.exhaust=ex;
  return g;
}

function createPlayerDamageVisuals(plane){
  const root=new THREE.Group();plane.add(root);
  function patch(pos,scale,rot=0,color=0x15120f){
    const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
    const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),mat);
    m.position.set(...pos);m.rotation.set(-Math.PI/2,0,rot);m.scale.set(...scale);root.add(m);return m;
  }
  function chip(pos,scale,rot=0,color=0x1a120d){
    const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0}));
    m.position.set(...pos);m.rotation.set(0,0,rot);m.scale.set(...scale);root.add(m);return m;
  }
  const engineMat=new THREE.MeshBasicMaterial({color:0x160f0b,transparent:true,opacity:0,side:THREE.DoubleSide});
  const engineChar=new THREE.Mesh(new THREE.TorusGeometry(.36,.025,8,24),engineMat);
  engineChar.position.set(0,0,1.5);root.add(engineChar);
  const emberMat=new THREE.MeshBasicMaterial({color:0xff8a24,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
  const ember=new THREE.Mesh(new THREE.SphereGeometry(.11,8,6),emberMat);
  ember.position.set(0,.03,1.48);root.add(ember);
  return {
    level1:[
      patch([-.72,.675,-.16],[.74,.2,1],-.18,0x2b2925),
      patch([.82,.675,.26],[.52,.18,1],.2,0x2b2925),
      patch([-.14,.38,.76],[.34,.18,1],.08,0x2a2119)
    ],
    level2:[
      patch([-1.42,.675,.1],[.62,.22,1],.42,0x15120f),
      patch([1.36,.675,-.22],[.55,.2,1],-.36,0x15120f),
      patch([.08,.42,1.08],[.42,.22,1],-.12,0x18110d),
      chip([-1.72,.69,.36],[.28,.028,.08],.28),
      chip([1.64,.69,-.34],[.22,.028,.07],-.22),
      engineChar
    ],
    level3:[
      patch([-1.05,.69,-.38],[.92,.25,1],-.28,0x0f0c09),
      patch([1.03,.69,.42],[.8,.24,1],.24,0x0f0c09),
      patch([0,.43,1.22],[.5,.28,1],0,0x100b08),
      chip([-1.9,.69,.02],[.38,.034,.1],.16,0x0f0c09),
      chip([1.84,.69,.12],[.32,.034,.1],-.18,0x0f0c09),
      ember
    ],
    ember
  };
}
function setDamageVisualOpacity(items,opacity){
  items.forEach(item=>{if(item.material)item.material.opacity=opacity;});
}

const player={group:makePlane(),vel:new THREE.Vector3(),hp:100,score:0,combo:0,maxCombo:0,
  weapon:'single',weaponTimer:0,fireCd:0,shake:0,cameraKick:0,kills:0,nearMisses:0,alive:true,
  startTime:performance.now(),survival:0};
scene.add(player.group);player.group.rotation.y=Math.PI;
const playerDamageVisuals=createPlayerDamageVisuals(player.group);

const bullets=[],enemies=[],particles=[];
const vfx = [];
const scorePopups = [];
let ambientTracerTimer = 0;
let nextGunSide = -1;
const bulletInterceptConfig={enabled:true,radius:.9,score:10};
const playerDamageFx={smokeTimer:0,sparkTimer:0,fireTimer:0};
function spawnEnemy(){
  if(!player.alive)return;
  const e={group:makePlane(0x405986,0xcbd8ef),hp:2,
    type:Math.random()<.45?'swoop':Math.random()<.7?'dive':'straight',
    t:Math.random()*10,fire:.6+Math.random()*1.4};
  e.group.position.set((Math.random()-.5)*34,(Math.random()-.5)*16,-65-Math.random()*35);
  e.group.rotation.y=0;scene.add(e.group);enemies.push(e);
}
let enemySpawner=setInterval(()=>{if(player.alive&&enemies.length<8)spawnEnemy();},1100);
for(let i=0;i<5;i++)spawnEnemy();

function burstParticles(pos, {
  color = 0xffb15f, count = 12, speed = 12, size = [0.04, 0.12],
  life = [0.25, 0.7], gravity = 0, drag = 0.96, additive = true
} = {}) {
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(size[0] + Math.random() * (size[1] - size[0]), 8, 6), mat);
    m.position.copy(pos);
    const vel = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
    scene.add(m);
    particles.push({ mesh: m, vel, life: life[0] + Math.random() * (life[1] - life[0]), max: life[1], gravity, drag, grow: false });
  }
}
function particle(pos,color=0xffb15f,count=8){
  burstParticles(pos, { color, count });
}
function playerLocalPoint(x,y,z){
  return player.group.localToWorld(new THREE.Vector3(x,y,z));
}
function spawnDamageSmoke(level){
  const engine=playerLocalPoint(0,0,1.45);
  const count=level===1?1:level===2?2:3;
  const color=level===1?0x8b9092:level===2?0x4b4b48:0x2f2e2a;
  for(let i=0;i<count;i++){
    const smoke=new THREE.Mesh(
      new THREE.SphereGeometry((level===1 ? .16 : .22)+Math.random()*.16,8,6),
      new THREE.MeshBasicMaterial({color,transparent:true,opacity:level===1 ? .16 : level===2 ? .25 : .32,depthWrite:false})
    );
    smoke.position.copy(engine).add(new THREE.Vector3((Math.random()-.5)*.55,(Math.random()-.5)*.3,(Math.random()-.5)*.35));
    scene.add(smoke);
    particles.push({
      mesh:smoke,
      vel:new THREE.Vector3((Math.random()-.5)*.7,.45+Math.random()*.55,1.6+Math.random()*1.2),
      life:level===1 ? .9 : level===2 ? 1.12 : 1.28,
      max:level===1 ? .9 : level===2 ? 1.12 : 1.28,
      drag:.985,
      grow:true,
      baseOpacity:level===1 ? .14 : level===2 ? .24 : .32,
      damageSmoke:true
    });
  }
}
function spawnDamageSparks(level){
  const hard=level>=3;
  const origin=Math.random()>.55?playerLocalPoint((Math.random()>.5?1:-1)*(1.1+Math.random()*.45),.46,0):playerLocalPoint(0,0,1.35);
  burstParticles(origin,{
    color:hard?0xff8a2b:0xffb347,
    count:hard?7:3,
    speed:hard?9:6,
    size:[0.025,hard ? .075 : .055],
    life:[0.12,hard ? .34 : .25],
    gravity:hard?3:2,
    drag:.9,
    additive:true
  });
}
function spawnEngineFire(){
  const fire=new THREE.Sprite(new THREE.SpriteMaterial({
    map:makeRadialTexture('rgba(255,210,92,1)','rgba(255,70,16,0)',64),
    transparent:true,opacity:.72,blending:THREE.AdditiveBlending,depthWrite:false
  }));
  fire.position.copy(playerLocalPoint(0,0,1.38)).add(new THREE.Vector3((Math.random()-.5)*.18,(Math.random()-.5)*.12,0));
  const s=.55+Math.random()*.28;fire.scale.set(s,s,1);scene.add(fire);
  vfx.push({mesh:fire,life:.08,max:.08,type:'flash',grow:2.4});
}
function spawnRepairSparks(perfect=false){
  const origin=playerLocalPoint(0,.05,1.25);
  burstParticles(origin,{
    color:perfect?0x66f7ff:0xffd27a,
    count:perfect?16:6,
    speed:perfect?10:6,
    size:[0.025,perfect ? .08 : .055],
    life:[0.16,perfect ? .42 : .28],
    gravity:perfect?0:1,
    drag:.92,
    additive:true
  });
}
function playerDamageLevel(){
  if(player.hp<40)return 3;
  if(player.hp<65)return 2;
  if(player.hp<85)return 1;
  return 0;
}
function updatePlayerDamageVisuals(level){
  setDamageVisualOpacity(playerDamageVisuals.level1,level>=1 ? .45 : 0);
  setDamageVisualOpacity(playerDamageVisuals.level2,level>=2 ? .62 : 0);
  setDamageVisualOpacity(playerDamageVisuals.level3,level>=3 ? .72 : 0);
  if(playerDamageVisuals.ember.material){
    playerDamageVisuals.ember.material.opacity=level>=3 ? .28+Math.random()*.34 : 0;
    const s=level>=3 ? .86+Math.random()*.34 : .86;
    playerDamageVisuals.ember.scale.setScalar(s);
  }
}
function calmPlayerDamageSmoke(){
  const level=playerDamageLevel();
  for(const p of particles){
    if(!p.damageSmoke)continue;
    p.life=Math.min(p.life,level===0 ? .22 : level===1 ? .38 : .65);
  }
}
function updatePlayerDamageEffects(dt){
  const level=player.alive?playerDamageLevel():0;
  updatePlayerDamageVisuals(level);
  if(!player.alive)return;
  if(!level){
    playerDamageFx.smokeTimer=Math.min(playerDamageFx.smokeTimer,.28);
    playerDamageFx.sparkTimer=Math.min(playerDamageFx.sparkTimer,.45);
    playerDamageFx.fireTimer=Math.min(playerDamageFx.fireTimer,.12);
    return;
  }
  playerDamageFx.smokeTimer-=dt;
  if(playerDamageFx.smokeTimer<=0){
    spawnDamageSmoke(level);
    playerDamageFx.smokeTimer=(level===1 ? .48 : level===2 ? .3 : .2)+Math.random()*(level===1 ? .18 : .08);
  }
  if(level>=2){
    playerDamageFx.sparkTimer-=dt;
    if(playerDamageFx.sparkTimer<=0){
      spawnDamageSparks(level);
      playerDamageFx.sparkTimer=(level===2 ? .72 : .34)+Math.random()*(level===2 ? .42 : .24);
    }
  }
  if(level>=3){
    playerDamageFx.fireTimer-=dt;
    if(playerDamageFx.fireTimer<=0){
      spawnEngineFire();
      playerDamageFx.fireTimer=.09+Math.random()*.08;
    }
  }
}
function flashScreen(amount = 0.4, color = 'white') {
  if(ui.flash){
    ui.flash.style.background = color;
    ui.flash.style.opacity = amount;
    setTimeout(() => {
      if(ui.flash){ ui.flash.style.opacity = 0; ui.flash.style.background = 'white'; }
    }, 90);
  }
}
function flash(amt=.55){flashScreen(amt, 'white');}
function hitImpact(pos, color = 0xffd27a) {
  const now=performance.now()/1000;
  if(now-audioTimers.hitMetal>.09){audio.playRandom(hitSounds,.18);audioTimers.hitMetal=now;}
  if(now-audioTimers.hitConfirm>.12){audio.play('ui_confirm',.055,false);audioTimers.hitConfirm=now;}
  const center = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialTexture('rgba(255,255,245,1)', 'rgba(255,210,120,0)', 64),
    transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  center.position.copy(pos); center.scale.set(1.35, 1.35, 1); scene.add(center);
  vfx.push({ mesh: center, life: 0.07, max: 0.07, type: 'flash', grow: 3.8 });
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialTexture('rgba(255,250,190,1)', 'rgba(255,90,20,0)', 96),
    color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  const dist = pos.distanceTo(camera.position);
  const scale = THREE.MathUtils.clamp(3 + dist * 0.035, 3, 5.8);
  flash.position.copy(pos); flash.scale.set(scale, scale, 1); scene.add(flash);
  vfx.push({ mesh: flash, life: 0.13, max: 0.13, type: 'flash', grow: 4.6 });
  burstParticles(pos, { color: 0xffd36a, count: 20, speed: 22, size: [0.06, 0.14], life: [0.22, 0.55], additive: true });
  burstParticles(pos, { color: 0xff6a24, count: 10, speed: 17, size: [0.05, 0.12], life: [0.2, 0.48], additive: true });
  burstParticles(pos, { color: 0x343942, count: 6, speed: 8, size: [0.07, 0.15], life: [0.32, 0.7], additive: false });
  slowmo(0.045, 0.78);
  player.shake = Math.max(player.shake, 0.11);
}
function explosion(pos, big = false) {
  const scale = big ? 1.45 : 1;
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialTexture('rgba(255,248,190,1)', 'rgba(255,95,18,0)', 128),
    transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  const flashScale = big ? 12.5 : 8;
  flash.position.copy(pos); flash.scale.set(flashScale, flashScale, 1); scene.add(flash);
  vfx.push({ mesh: flash, life: 0.2, max: 0.2, type: 'flash', grow: 7 * scale });
  burstParticles(pos, { color: 0xffd36a, count: big ? 50 : 32, speed: big ? 28 : 20, size: [0.08, 0.2], life: [0.32, 0.9], additive: true });
  burstParticles(pos, { color: 0xff5a2a, count: big ? 30 : 18, speed: big ? 21 : 15, size: [0.11, 0.27], life: [0.28, 0.78], additive: true });
  for (let i = 0; i < (big ? 16 : 10); i++) {
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.62 + Math.random() * 0.82, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x3a3f46, transparent: true, opacity: 0.38, depthWrite: false }));
    smoke.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 1.7, (Math.random() - 0.5) * 2.2));
    scene.add(smoke);
    particles.push({ mesh: smoke, vel: new THREE.Vector3((Math.random() - 0.5) * 2.5, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 2.5),
      life: 1.2 + Math.random() * 0.7, max: 1.9, drag: 0.985, grow: true });
  }
  const l = new THREE.PointLight(0xff8a35, big ? 14 : 9, big ? 32 : 22);
  l.position.copy(pos); scene.add(l);
  particles.push({ mesh: l, vel: new THREE.Vector3(), life: 0.22, max: 0.22, light: true });
  player.shake = Math.max(player.shake, big ? 0.65 : 0.42);
  flashScreen(big ? 0.28 : 0.16, 'white');
  audio.play(big?'explosion_big':'explosion_small',big?.55:.42);
}

const weaponTiers=[
  {combo:15,id:'overdrive',name:'OVERDRIVE STORM',rule:'x15+ Perfect Chain',duration:8,cd:.035,color:0x66f7ff},
  {combo:12,id:'explosive',name:'Explosive Rounds',rule:'x12 Combo',duration:7,cd:.18,color:0xff7a3d},
  {combo:8,id:'spread',name:'Spread Shot',rule:'x8 Combo',duration:7,cd:.16,color:0xb6ff7c},
  {combo:5,id:'dual',name:'Dual Cannons',rule:'x5 Combo',duration:6,cd:.11,color:0xffe28a},
  {combo:3,id:'rapid',name:'Rapid Fire',rule:'x3 Combo',duration:5,cd:.07,color:0xffffff},
  {combo:0,id:'single',name:'Single Shot',rule:'Combo x0',duration:0,cd:.16,color:0xffdd88}
];
function tierForCombo(c){return weaponTiers.find(t=>c>=t.combo)||weaponTiers.at(-1);}
function setWeaponFromCombo(combo){
  const tier=tierForCombo(combo);if(tier.id!==player.weapon){flash(.35);audio.play('ui_click',.12);}
  player.weapon=tier.id;player.weaponTimer=tier.duration;
  if(ui.weaponName)ui.weaponName.textContent=tier.name;
  if(ui.weaponRule)ui.weaponRule.textContent=tier.rule;
}
function currentTier(){return weaponTiers.find(t=>t.id===player.weapon)||weaponTiers.at(-1);}

function updateAim(dt){
  const alpha=1-Math.exp(-dt*24);
  mouse.x=THREE.MathUtils.lerp(mouse.x,mouse.targetX,alpha);
  mouse.y=THREE.MathUtils.lerp(mouse.y,mouse.targetY,alpha);
  aimAssistState.timer=Math.max(0,aimAssistState.timer-dt);
  syncAimNdcFromMouse();
  aimRaycaster.setFromCamera(aimNdc,camera);
  aimDir.copy(aimRaycaster.ray.direction).normalize();
  aimWorldPoint.copy(aimRaycaster.ray.origin).addScaledVector(aimDir,140);
  if(ui.reticle){
    ui.reticle.style.left=mouse.x+'px';
    ui.reticle.style.top=mouse.y+'px';
  }
}
function enemyAssistRadius(enemy){
  const dist=enemy.group.position.distanceTo(camera.position);
  return THREE.MathUtils.clamp(aimAssistConfig.radius+dist*aimAssistConfig.farScale/100,.22,.31);
}
function assistTargetValid(enemy){
  return enemy&&enemies.includes(enemy);
}
function findAimAssistTarget(start){
  if(!aimAssistConfig.enabled)return null;
  let kept=null,keptD=Infinity,keptRadius=0;
  if(assistTargetValid(aimAssistState.target)&&aimAssistState.timer>0){
    aimAssistProbe.copy(aimAssistState.target.group.position).project(camera);
    keptRadius=enemyAssistRadius(aimAssistState.target)*1.18;
    keptD=Math.hypot(aimAssistProbe.x-aimNdc.x,aimAssistProbe.y-aimNdc.y);
    if(aimAssistProbe.z>-1&&aimAssistProbe.z<1&&Math.abs(aimAssistProbe.x)<=1.08&&Math.abs(aimAssistProbe.y)<=1.08&&keptD<keptRadius)kept=aimAssistState.target;
  }
  let best=kept,bestScore=kept?keptD/keptRadius:.95,bestD=keptD,bestRadius=keptRadius;
  for(const e of enemies){
    aimAssistProbe.copy(e.group.position).project(camera);
    if(aimAssistProbe.z<-1||aimAssistProbe.z>1||Math.abs(aimAssistProbe.x)>1.08||Math.abs(aimAssistProbe.y)>1.08)continue;
    const radius=enemyAssistRadius(e);
    const d=Math.hypot(aimAssistProbe.x-aimNdc.x,aimAssistProbe.y-aimNdc.y);
    if(d>radius)continue;
    aimAssistDir.copy(e.group.position).sub(start).normalize();
    const alignment=THREE.MathUtils.clamp(aimDir.dot(aimAssistDir),0,1);
    const distanceBias=THREE.MathUtils.clamp(1-e.group.position.distanceTo(player.group.position)/120,0,.18);
    const score=d/radius-alignment*.14-distanceBias;
    if(score<bestScore){best=e;bestScore=score;bestD=d;bestRadius=radius;}
  }
  if(!best){
    aimAssistState.target=null;
    return null;
  }
  aimAssistState.target=best;aimAssistState.timer=aimAssistConfig.stickTime;
  const falloff=1-THREE.MathUtils.smoothstep(bestD/bestRadius,0,1);
  const strength=THREE.MathUtils.clamp(falloff*aimAssistConfig.maxStrength,0,aimAssistConfig.maxStrength);
  return {enemy:best,strength};
}
function aimedDirectionFrom(start,angle=0){
  syncAimNdcFromMouse();
  aimRaycaster.setFromCamera(aimNdc,camera);
  aimDir.copy(aimRaycaster.ray.direction).normalize();
  aimWorldPoint.copy(aimRaycaster.ray.origin).addScaledVector(aimRaycaster.ray.direction,140);
  const dir=aimWorldPoint.clone().sub(start).normalize();
  const assist=findAimAssistTarget(start);
  aimAssistState.active=!!assist&&assist.strength>.04;
  aimAssistState.strength=assist?assist.strength:0;
  if(assist){
    aimAssistDir.copy(assist.enemy.group.position).sub(start).normalize();
    dir.lerp(aimAssistDir,assist.strength).normalize();
  }
  if(angle){
    dir.applyAxisAngle(camera.up,angle).normalize();
  }
  return dir;
}
function alignTracerMesh(mesh, start, end, minLength = 0) {
  const dir = end.clone().sub(start);
  if (dir.lengthSq() < 0.0001) return;
  dir.normalize();
  const length = Math.max(start.distanceTo(end), minLength);
  const tail = end.clone().addScaledVector(dir, -length);
  mesh.position.copy(tail).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  mesh.scale.y = length;
}
function createTracerMesh({
  color = 0xffd36a,
  radius = 0.065,
  glowMultiplier = 6,
  glowOpacity = 0.42
} = {}) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 1, 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  );
  group.add(core);
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * glowMultiplier, radius * glowMultiplier * 0.55, 1.08, 10, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: glowOpacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  );
  group.add(glow);
  group.userData.coreOpacity = 1;
  group.userData.glowOpacity = glowOpacity;
  return group;
}
function spawnTracerAfterimage(start, end, color, hostile = false) {
  const trail = createTracerMesh({
    color,
    radius: hostile ? 0.028 : 0.032,
    glowMultiplier: hostile ? 4.8 : 5.2,
    glowOpacity: hostile ? 0.24 : 0.2
  });
  alignTracerMesh(trail, start, end, hostile ? 3.6 : 4.8);
  scene.add(trail);
  vfx.push({ mesh: trail, life: 0.11, max: 0.11, type: 'beamTrail' });
}
function muzzleFlash(pos, color = 0xffd27a, size = 1.55) {
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialTexture('rgba(255,235,150,1)', 'rgba(255,120,30,0)', 64),
    color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  flash.position.copy(pos); flash.scale.set(size, size, 1); scene.add(flash);
  vfx.push({ mesh: flash, life: 0.09, max: 0.09, type: 'flash', grow: 3.2 });
}
function shootOne(offX,angle=0,color=currentTier().color,explosive=false){
  const tracerColor = explosive ? 0xff8a35 : 0xffd36a;
  const overdrive = player.weapon === 'overdrive';
  const m = createTracerMesh({
    color: tracerColor,
    radius: overdrive ? 0.068 : 0.045,
    glowMultiplier: 6.3,
    glowOpacity: overdrive ? 0.4 : 0.34
  });
  const start = player.group.position.clone().add(new THREE.Vector3(offX,.12,-2.75));
  const dir=aimedDirectionFrom(start,angle);
  const tracerLength = overdrive ? 10.5 : 7;
  alignTracerMesh(m, start.clone().addScaledVector(dir, -tracerLength), start, tracerLength);
  scene.add(m);
  bullets.push({mesh:m,pos:start.clone(),vel:dir.multiplyScalar(overdrive ? 105 : 98),life:1,maxLife:1,hostile:false,explosive,color:tracerColor,prevPos:start.clone(),tracerLength,trailT:0});
  muzzleFlash(start, color, explosive ? 1.15 : overdrive ? 1.1 : 0.92);
  player.shake = Math.max(player.shake, 0.045);
  player.cameraKick = Math.max(player.cameraKick || 0, 0.13);
}
function fireWeapon(){
  const tier=currentTier();
  if(player.weapon==='dual'){shootOne(-.28);shootOne(.28);}
  else if(player.weapon==='spread'){[-.18,-.09,0,.09,.18].forEach((a,i)=>shootOne(i%2?-0.28:0.28,a));}
  else if(player.weapon==='explosive'){shootOne(nextGunSide * .28,0,tier.color,true);nextGunSide*=-1;}
  else if(player.weapon==='overdrive'){[-.22,-.11,0,.11,.22].forEach((a,i)=>shootOne((i%2?-0.28:0.28)+(Math.random()-.5)*.08,a,tier.color,true));}
  else {shootOne(nextGunSide * .28,0,tier.color,false);nextGunSide*=-1;}
  pulseReticleFire();
  const now=performance.now()/1000;
  if(player.weapon!=='overdrive'&&now-audioTimers.shot>.095){
    audio.play('mg_burst_01',.22);
    audioTimers.shot=now;
  }
}

// UI refs
const ui={};
['hp','score','time','kills','nearCount','maxCombo','enemyCount','warn','nearMiss',
 'key','combo','status','fill','marker','flash','vignette','weaponName','weaponRule',
 'lastStand','finalTime','finalKills','finalCombo','finalNear','resultLine','restart']
.forEach(id=>ui[id]=document.getElementById(id));
ui.box=document.getElementById('repairBox');
ui.reticle=document.getElementById('aimReticle');

const reticleTimers={fire:null,hit:null,kill:null};
function restartReticlePulse(cls,duration){
  if(!ui.reticle)return;
  if(reticleTimers[cls])clearTimeout(reticleTimers[cls]);
  ui.reticle.classList.remove(cls);
  void ui.reticle.offsetWidth;
  ui.reticle.classList.add(cls);
  reticleTimers[cls]=setTimeout(()=>{
    if(ui.reticle)ui.reticle.classList.remove(cls);
    reticleTimers[cls]=null;
  },duration);
}
function pulseReticleFire(){
  restartReticlePulse('fire',80);
}
function pulseReticleHit(){
  if(ui.reticle)ui.reticle.classList.remove('fire');
  restartReticlePulse('hit',170);
}
function pulseReticleKill(){
  if(ui.reticle)ui.reticle.classList.remove('fire','hit');
  restartReticlePulse('kill',200);
}
const reticleProbe=new THREE.Vector3();
function updateReticleState(){
  if(!ui.reticle)return;
  const dim=repair.active||!player.alive;
  if(dim){aimAssistState.active=false;aimAssistState.strength=0;}
  let nearTarget=false;
  if(!dim){
    for(const e of enemies){
      reticleProbe.copy(e.group.position).project(camera);
      if(reticleProbe.z>-1&&reticleProbe.z<1&&Math.hypot(reticleProbe.x-aimNdc.x,reticleProbe.y-aimNdc.y)<.12){
        nearTarget=true;break;
      }
    }
  }
  ui.reticle.classList.toggle('repair',dim);
  ui.reticle.classList.toggle('near-target',nearTarget);
  ui.reticle.classList.toggle('assist',!dim&&aimAssistState.active);
}

const repair={active:false,target:'KeyA',phaseT:0,speed:.8};
const repairKeys=['KeyA','KeyS','KeyD','KeyW'];
function nextRepairPrompt(){
  repair.target=repairKeys[Math.floor(Math.random()*repairKeys.length)];
  if(ui.key)ui.key.textContent=repair.target.replace('Key','');
  repair.phaseT=0;repair.speed=.75+Math.min(1.65,player.combo*.08);
}
function startRepair(){
  repair.active=true;player.combo=0;
  audio.startLoop('repair_loop',.18);
  audioTimers.repairTick=0;
  if(ui.box)ui.box.classList.add('active');
  if(ui.status)ui.status.textContent='';
  if(ui.combo)ui.combo.textContent='COMBO x0';
  if(ui.fill)ui.fill.style.width='0%';
  nextRepairPrompt();
}
function endRepair(){repair.active=false;audio.stopLoop('repair_loop');if(ui.box)ui.box.classList.remove('active');}
let timeScale=1,slowTimer=0;
function slowmo(dur=.25,sc=.34){timeScale=sc;slowTimer=dur;}

function repairSuccess(perfect){
  player.combo++;player.maxCombo=Math.max(player.maxCombo,player.combo);
  const heal=perfect?10+player.combo*2.5:5+player.combo*1.6;player.hp=Math.min(100,player.hp+heal);
  if(ui.combo)ui.combo.textContent='COMBO x'+player.combo;
  if(ui.fill)ui.fill.style.width=Math.min(100,player.combo*7)+'%';
  if(ui.status)ui.status.textContent=perfect?'PERFECT WEAPON CHARGE!':'GOOD';
  particle(player.group.position.clone().add(new THREE.Vector3(0,0,.4)),perfect?0x66f7ff:0xffd27a,perfect?12:6);
  if(perfect)spawnRepairSparks(true);
  calmPlayerDamageSmoke();
  playerDamageFx.smokeTimer=Math.max(playerDamageFx.smokeTimer,.35);
  audio.play(perfect?'repair_perfect':'repair_good',perfect?.28:.24);
  if(perfect){slowmo(.25,.34);flash(.55);}
  setWeaponFromCombo(player.combo);nextRepairPrompt();
}
function repairFail(){
  player.combo=0;player.hp-=12;
  if(ui.combo)ui.combo.textContent='COMBO x0';if(ui.fill)ui.fill.style.width='0%';
  if(ui.status)ui.status.textContent='MISS - SYSTEM SPARK';
  player.shake=.35;audio.play('repair_fail',.28);particle(player.group.position,0xff4b2f,10);
  setWeaponFromCombo(0);nextRepairPrompt();
}
function updateRepair(dt){
  repair.phaseT+=dt*repair.speed;const phase=Math.sin(repair.phaseT*Math.PI*2)*.5+.5;
  audioTimers.repairTick-=dt;
  if(audioTimers.repairTick<=0){audio.play('repair_tick',.07,false);audioTimers.repairTick=.22;}
  if(ui.marker)ui.marker.style.left=(phase*300)+'px';
  const perfect=phase>.46&&phase<.54,good=phase>.31&&phase<.69;
  if(keys.has(repair.target)){if(perfect)repairSuccess(true);else if(good)repairSuccess(false);else repairFail();}
  if(player.hp>=100&&player.combo>=3){if(ui.status)ui.status.textContent='SYSTEM RESTORED';endRepair();}
}
function nearMissStreak(pos) {
  const streak = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.12, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x9ffcff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  streak.rotation.x = Math.PI / 2;
  streak.position.copy(pos).add(new THREE.Vector3((Math.random() > 0.5 ? 1 : -1) * (1.2 + Math.random() * 1.4), (Math.random() - 0.5) * 1.2, 0.5));
  scene.add(streak);
  vfx.push({ mesh: streak, vel: new THREE.Vector3((Math.random() - 0.5) * 6, 0, 25), life: 0.18, max: 0.18, type: 'streak' });
  player.shake = Math.max(player.shake, 0.2);
}
function showNearMiss(){
  player.nearMisses++;player.score+=25;player.combo=Math.max(player.combo,0)+1;
  player.maxCombo=Math.max(player.maxCombo,player.combo);
  if(ui.nearMiss){ui.nearMiss.classList.add('show');ui.nearMiss.textContent='NEAR MISS +25';setTimeout(()=>ui.nearMiss.classList.remove('show'),260);}
  if(ui.status)ui.status.textContent='NEAR MISS CHARGE!';
  if(ui.combo)ui.combo.textContent='COMBO x'+player.combo;
  if(ui.fill)ui.fill.style.width=Math.min(100,player.combo*7)+'%';
  particle(player.group.position.clone().add(new THREE.Vector3((Math.random()-.5)*1.6,.1,-.4)),0x9ffcff,8);
  nearMissStreak(player.group.position.clone());
  flashScreen(0.1, 'rgba(120,245,255,1)');
  audio.playRandom(whizSounds,.24);
  audio.play('slowmo_enter',.18);
  slowmo(.14,.55);player.shake=.12;setWeaponFromCombo(player.combo);
}

function enemyBullet(pos,dir){
  const now=performance.now()/1000;
  if(now-audioTimers.enemyShot>.2){audio.play('enemy_mg_burst_01',.18);audioTimers.enemyShot=now;}
  muzzleFlash(pos, 0xff3b1f, 0.9);
  const g = createTracerMesh({
    color: 0xff3b1f,
    radius: 0.055,
    glowMultiplier: 6,
    glowOpacity: 0.42
  });
  const tracerLength = 8.5;
  alignTracerMesh(g, pos.clone().addScaledVector(dir, -tracerLength), pos, tracerLength);
  scene.add(g);
  bullets.push({mesh:g,pos:pos.clone(),vel:dir.multiplyScalar(58),life:3,maxLife:3,hostile:true,explosive:false,nearChecked:false,color:0xff3b1f,prevPos:pos.clone(),tracerLength,trailT:0});
}
function damagePlayer(n){
  player.hp=Math.max(0,player.hp-n);
  player.shake=Math.max(player.shake, 0.5);
  flashScreen(0.32, 'rgba(255,30,20,1)');
  const pos = player.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2));
  burstParticles(pos, { color: 0xff5733, count: 12, speed: 12, size: [0.04, 0.11], life: [0.22, 0.55], additive: true });
  audio.play('player_hit_01',.24);
  const now=performance.now()/1000;
  if(player.hp<30&&now-audioTimers.criticalBeep>1.15){audio.play('critical_beep',.22);audioTimers.criticalBeep=now;}
  if(player.hp<=0)endGame();
}
function endGame(){
  if(!player.alive)return;player.alive=false;endRepair();
  audio.stopLoop('mg_overdrive_loop');
  audio.fadeLoop('engine_loop',0,.75,true);
  audio.fadeLoop('engine_damaged_loop',0,.75,true);
  audio.fadeLoop('wind_loop',0,.75,true);
  audio.fadeLoop('distant_battle_loop',.02,.75);
  audio.stopLoop('music_base_loop');
  audio.setLoopVolume('music_elevenlabs_loop',.18);
  releaseMouseCapture();
  if(ui.finalTime)ui.finalTime.textContent=player.survival.toFixed(1)+'s';
  if(ui.finalKills)ui.finalKills.textContent=player.kills;
  if(ui.finalCombo)ui.finalCombo.textContent='x'+player.maxCombo;
  if(ui.finalNear)ui.finalNear.textContent=player.nearMisses;
  const rank=player.survival>70||player.maxCombo>=15?'Legendary clutch pilot':player.survival>40||player.maxCombo>=8?'Elite panic mechanic':'Rookie ace under fire';
  if(ui.resultLine)ui.resultLine.textContent=`${rank} · Score ${player.score}`;
  if(ui.lastStand)ui.lastStand.classList.add('show');flash(.7);audio.play('explosion_big',.5);
}
function resetGame(){
  releaseMouseCapture();
  audio.stopLoop('repair_loop');
  audio.stopLoop('mg_overdrive_loop');
  audioTimers.criticalBeep=0;
  audioTimers.enemyShot=0;
  audioMix.damagedEngine=0;
  audioMix.music=.32;
  if(audio.unlocked){
    audio.startLoop('engine_loop',.25);
    audio.startLoop('wind_loop',.12);
    audio.startLoop('distant_battle_loop',.08);
    audio.stopLoop('music_base_loop');
    audio.startLoop('music_elevenlabs_loop',.32);
    audio.startLoop('engine_damaged_loop',0);
  }
  bullets.splice(0).forEach(b=>scene.remove(b.mesh));
  enemies.splice(0).forEach(e=>scene.remove(e.group));
  particles.splice(0).forEach(p=>scene.remove(p.mesh));
  vfx.splice(0).forEach(fx=>scene.remove(fx.mesh));
  scorePopups.splice(0).forEach(p=>p.el.remove());
  ambientTracerTimer = 0;
  nextGunSide = -1;
  Object.assign(aimAssistState,{target:null,timer:0,active:false,strength:0});
  Object.assign(playerDamageFx,{smokeTimer:0,sparkTimer:0,fireTimer:0});
  Object.assign(player,{hp:100,score:0,combo:0,maxCombo:0,weapon:'single',weaponTimer:0,fireCd:0,shake:0,cameraKick:0,kills:0,nearMisses:0,alive:true,startTime:performance.now(),survival:0});
  updatePlayerDamageVisuals(0);
  resetAimToCenter();
  player.group.position.set(0,0,0);player.vel.set(0,0,0);setWeaponFromCombo(0);
  if(ui.lastStand)ui.lastStand.classList.remove('show');for(let i=0;i<5;i++)spawnEnemy();
}
if(ui.restart)ui.restart.addEventListener('click',resetGame);

function updatePlayer(dt){
  if(!player.alive)return;
  const ms=repair.active?7:15;const boost=keys.has('ShiftLeft')||keys.has('ShiftRight')?1.55:1;
  const tgt=new THREE.Vector3((keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),0).multiplyScalar(ms*boost);
  player.vel.lerp(tgt,dt*4.2);player.group.position.addScaledVector(player.vel,dt);
  player.group.position.x=THREE.MathUtils.clamp(player.group.position.x,-22,22);
  player.group.position.y=THREE.MathUtils.clamp(player.group.position.y,-12,15);
  player.group.rotation.z=THREE.MathUtils.lerp(player.group.rotation.z,-player.vel.x*.045,dt*7);
  player.group.rotation.x=THREE.MathUtils.lerp(player.group.rotation.x,player.vel.y*.03,dt*7);
  player.group.userData.prop.rotation.z+=(repair.active?18:42)*dt;
  // Exhaust flicker
  const ex=player.group.userData.exhaust;
  if(ex){ex.scale.setScalar(.8+Math.random()*.5);ex.material.opacity=.5+Math.random()*.4;}
  if(keys.has('KeyR')&&!repair.active&&player.hp<100)startRepair();if(repair.active)updateRepair(dt);
  player.fireCd-=dt;const tier=currentTier();
  if((keys.has('Space')||mouse.down)&&!repair.active&&player.fireCd<=0){fireWeapon();player.fireCd=tier.cd;}
  if(player.weapon==='overdrive'&&(keys.has('Space')||mouse.down)&&!repair.active)audio.startLoop('mg_overdrive_loop',.18);
  else audio.stopLoop('mg_overdrive_loop');
  if(player.weaponTimer>0){player.weaponTimer-=dt;if(player.weaponTimer<=0){player.weapon='single';if(ui.weaponName)ui.weaponName.textContent='Single Shot';if(ui.weaponRule)ui.weaponRule.textContent='Combo expired';}}
  player.survival=(performance.now()-player.startTime)/1000;
}
function updateEnemies(dt){
  if(!player.alive)return;
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i];e.t+=dt;
    const dx=e.type==='swoop'?Math.sin(e.t*2.4)*dt*8:0;
    const dy=e.type==='dive'?Math.sin(e.t*1.5)*dt*5:0;
    e.group.position.x+=dx+(player.group.position.x-e.group.position.x)*dt*.18;
    e.group.position.y+=dy+(player.group.position.y-e.group.position.y)*dt*.12;
    e.group.position.z+=dt*(11+Math.min(8,player.score/300));
    e.group.rotation.z=Math.sin(e.t*2)*.28;e.group.userData.prop.rotation.z+=34*dt;
    const eEx=e.group.userData.exhaust;if(eEx){eEx.scale.setScalar(.6+Math.random()*.4);eEx.material.opacity=.4+Math.random()*.3;}
    e.fire-=dt;if(e.fire<=0&&e.group.position.z<-6){
      enemyBullet(e.group.position.clone().add(new THREE.Vector3(0,0,1.2)),player.group.position.clone().sub(e.group.position).normalize());
      e.fire=.8+Math.random()*1.3;
    }
    if(e.group.position.distanceTo(player.group.position)<1.5){damagePlayer(22);explosion(e.group.position);scene.remove(e.group);enemies.splice(i,1);continue;}
    if(e.group.position.z>12){damagePlayer(10);scene.remove(e.group);enemies.splice(i,1);}
  }
}
function floatingText(text, pos, color = '#ffd27a') {
  const div = document.createElement('div');
  div.textContent = text; div.style.position = 'fixed'; div.style.color = color;
  div.style.fontWeight = '900'; div.style.fontSize = '22px'; div.style.textShadow = '0 0 12px currentColor';
  div.style.pointerEvents = 'none'; div.style.zIndex = '9';
  document.body.appendChild(div);
  scorePopups.push({ el: div, pos: pos.clone(), life: 0.8, max: 0.8, offsetY: 0 });
}
function updateScorePopups(dt) {
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    const p = scorePopups[i]; p.life -= dt; p.offsetY += dt * 38;
    const screen = p.pos.clone().project(camera);
    const x = (screen.x * 0.5 + 0.5) * innerWidth; const y = (-screen.y * 0.5 + 0.5) * innerHeight - p.offsetY;
    p.el.style.left = `${x}px`; p.el.style.top = `${y}px`; p.el.style.opacity = Math.max(0, p.life / p.max);
    if (p.life <= 0) { p.el.remove(); scorePopups.splice(i, 1); }
  }
}
function updateVFX(dt) {
  for (let i = vfx.length - 1; i >= 0; i--) {
    const fx = vfx[i]; fx.life -= dt; const k = Math.max(0, fx.life / fx.max);
    if (fx.vel) fx.mesh.position.addScaledVector(fx.vel, dt);
    if (fx.type === 'flash') {
      fx.mesh.material.opacity = k; const grow = fx.grow || 1; fx.mesh.scale.multiplyScalar(1 + dt * grow);
    } else if (fx.type === 'streak') {
      fx.mesh.material.opacity = 0.55 * k; fx.mesh.scale.z = 0.5 + k;
    } else if (fx.type === 'beamTrail') {
      if (fx.mesh.children) {
        fx.mesh.children.forEach((child, idx) => {
          if (child.material) child.material.opacity = (idx === 0 ? 0.65 : (fx.mesh.userData.glowOpacity || 0.2)) * k;
        });
      }
    } else { if (fx.mesh.material) fx.mesh.material.opacity = k; }
    if (fx.life <= 0) { scene.remove(fx.mesh); vfx.splice(i, 1); }
  }
}
function spawnAmbientTracer() {
  const hostile = Math.random() > 0.35;
  const color = hostile ? 0xff3b1f : 0xffc65a;
  const dir = new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.12, hostile ? 1 : -1).normalize();
  const head = new THREE.Vector3((Math.random() - 0.5) * 48, -4 + Math.random() * 16, -70 - Math.random() * 62);
  const tracer = createTracerMesh({
    color,
    radius: hostile ? 0.026 : 0.03,
    glowMultiplier: 4.8,
    glowOpacity: hostile ? 0.18 : 0.15
  });
  alignTracerMesh(tracer, head.clone().addScaledVector(dir, -8 - Math.random() * 4), head, hostile ? 8 : 9.5);
  scene.add(tracer);
  vfx.push({ mesh: tracer, vel: dir.multiplyScalar(16 + Math.random() * 10), life: 0.18 + Math.random() * 0.07, max: 0.25, type: 'beamTrail' });
}
function updateAmbientCombat(dt) {
  if (!player.alive) return;
  ambientTracerTimer -= dt;
  if (ambientTracerTimer <= 0) {
    spawnAmbientTracer();
    ambientTracerTimer = 0.26 + Math.random() * 0.26;
  }
}
function distancePointToSegment(point,a,b){
  const ab=b.clone().sub(a);
  const lenSq=ab.lengthSq();
  if(lenSq<=0.000001)return {distance:point.distanceTo(a),closest:a.clone()};
  const t=THREE.MathUtils.clamp(point.clone().sub(a).dot(ab)/lenSq,0,1);
  const closest=a.clone().addScaledVector(ab,t);
  return {distance:point.distanceTo(closest),closest};
}
function distanceSegmentToSegment(a0,a1,b0,b1){
  const u=a1.clone().sub(a0),v=b1.clone().sub(b0),w=a0.clone().sub(b0);
  const a=u.dot(u),b=u.dot(v),c=v.dot(v),d=u.dot(w),e=v.dot(w);
  const denom=a*c-b*b;
  let s=0,t=0;
  if(a<=0.000001&&c<=0.000001){
    const midpoint=a0.clone().add(b0).multiplyScalar(.5);
    return {distance:a0.distanceTo(b0),closestA:a0.clone(),closestB:b0.clone(),midpoint};
  }
  if(a<=0.000001)t=THREE.MathUtils.clamp(e/c,0,1);
  else if(c<=0.000001)s=THREE.MathUtils.clamp(-d/a,0,1);
  else{
    s=THREE.MathUtils.clamp((b*e-c*d)/denom,0,1);
    t=THREE.MathUtils.clamp((a*e-b*d)/denom,0,1);
    const s2=THREE.MathUtils.clamp((b*t-d)/a,0,1);
    if(Math.abs(s2-s)>.0001){s=s2;t=THREE.MathUtils.clamp((b*s+e)/c,0,1);}
  }
  const closestA=a0.clone().addScaledVector(u,s),closestB=b0.clone().addScaledVector(v,t);
  return {distance:closestA.distanceTo(closestB),closestA,closestB,midpoint:closestA.clone().add(closestB).multiplyScalar(.5)};
}
function interceptBullets(){
  if(!player.alive||!bulletInterceptConfig.enabled)return;
  for(const playerBullet of bullets){
    if(playerBullet.hostile||playerBullet.consumed||!playerBullet.prevPos||!playerBullet.pos)continue;
    for(const hostileBullet of bullets){
      if(!hostileBullet.hostile||hostileBullet.consumed||!hostileBullet.prevPos||!hostileBullet.pos)continue;
      const hit=distanceSegmentToSegment(playerBullet.prevPos,playerBullet.pos,hostileBullet.prevPos,hostileBullet.pos);
      if(hit.distance>bulletInterceptConfig.radius)continue;
      playerBullet.consumed=true;hostileBullet.consumed=true;
      burstParticles(hit.midpoint,{color:0xfff4c8,count:10,speed:11,size:[0.035,0.09],life:[0.14,0.32],additive:true});
      burstParticles(hit.midpoint,{color:0x9ffcff,count:5,speed:8,size:[0.025,0.06],life:[0.12,0.25],additive:true});
      floatingText(`INTERCEPT +${bulletInterceptConfig.score}`,hit.midpoint,'#fff1b8');
      player.score+=bulletInterceptConfig.score;
      player.shake=Math.max(player.shake,.08);
      audio.playRandom(whizSounds,.16);audio.play('ui_confirm',.06,false);
      break;
    }
  }
}
function enemyHitRadius(enemy){
  const scale=Math.max(enemy.group.scale.x,enemy.group.scale.y,enemy.group.scale.z,1);
  const dist=enemy.group.position.distanceTo(camera.position);
  return THREE.MathUtils.clamp(1.9*scale+dist*.004,1.9,2.4);
}
function updateBullets(dt){
  if(!player.alive)return;
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    if(!b.pos)b.pos=b.mesh.position.clone();
    b.prevPos = b.pos.clone();
    b.pos.addScaledVector(b.vel,dt);b.life-=dt;
    alignTracerMesh(b.mesh, b.prevPos, b.pos, b.tracerLength || 0);
    b.trailT=(b.trailT || 0)-dt;
    if(b.trailT<=0){
      spawnTracerAfterimage(b.prevPos, b.pos, b.color || (b.hostile ? 0xff3b1f : 0xffd36a), b.hostile);
      b.trailT=b.hostile ? 0.07 : 0.055;
    }
    if (b.maxLife) {
      const k = Math.max(0, b.life / b.maxLife);
      const fade = THREE.MathUtils.smoothstep(k, 0.02, 0.28);
      if (b.mesh.children) {
        b.mesh.children.forEach((child, idx) => {
          if (child.material) child.material.opacity = (idx === 0 ? (b.mesh.userData.coreOpacity || 1) : (b.mesh.userData.glowOpacity || 0.4)) * fade;
        });
      }
    }
  }
  interceptBullets();
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    if(b.consumed||b.life<=0){scene.remove(b.mesh);bullets.splice(i,1);continue;}
    if(b.hostile){
      const d=b.pos.distanceTo(player.group.position);
      if(d<.9){damagePlayer(7);scene.remove(b.mesh);bullets.splice(i,1);if(!player.alive)break;continue;}
      if(repair.active&&!b.nearChecked&&d>1.0&&d<2.15&&Math.abs(b.pos.z-player.group.position.z)<1.2){b.nearChecked=true;showNearMiss();}
    }else{
      for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];
        const hit=distancePointToSegment(e.group.position,b.prevPos,b.pos);
        if(hit.distance<enemyHitRadius(e)){
          e.hp-=b.explosive?3:1;
          hitImpact(hit.closest, b.color || 0xffd27a);
          pulseReticleHit();
          if(b.explosive)explosion(e.group.position.clone(), true);
          b.consumed=true;
          if(e.hp<=0){
            pulseReticleKill();
            explosion(e.group.position, true);scene.remove(e.group);enemies.splice(j,1);player.kills++;player.score+=50;
            floatingText('+50', e.group.position, '#ffd27a'); flashScreen(0.12, 'white'); audio.play('ui_confirm',.08,false);
          }break;
        }
      }
    }
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt;
    if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); continue; }
    if (p.light) { p.mesh.intensity = 7 * (p.life / p.max); continue; }
    if (p.gravity) p.vel.y -= p.gravity * dt;
    if (p.drag) p.vel.multiplyScalar(p.drag);
    p.mesh.position.addScaledVector(p.vel, dt);
    const k = Math.max(0, p.life / p.max);
    if (p.mesh.material) p.mesh.material.opacity = k;
    if (p.grow) { p.mesh.scale.multiplyScalar(1 + dt * 1.4); if (p.mesh.material) p.mesh.material.opacity = (p.baseOpacity ?? 0.34) * k; }
  }
}
function updateCamera(dt){
  const base=player.group.position.clone().add(new THREE.Vector3(0,3.7,11));
  const s=player.shake>0?new THREE.Vector3((Math.random()-.5)*player.shake,(Math.random()-.5)*player.shake,0):new THREE.Vector3();
  const kickOffset = new THREE.Vector3(0, 0, player.cameraKick || 0);
  camera.position.lerp(base.add(s).add(kickOffset), dt * 4.5);
  camera.lookAt(player.group.position.clone().add(new THREE.Vector3(0,.8,-15)));
  player.shake=Math.max(0,player.shake-dt*1.8);
  player.cameraKick = Math.max(0, (player.cameraKick || 0) - dt * 0.5);
}
function updateUI(){
  if(ui.hp)ui.hp.textContent=Math.round(player.hp);
  if(ui.score)ui.score.textContent=player.score;
  if(ui.time)ui.time.textContent=player.survival.toFixed(1);
  if(ui.kills)ui.kills.textContent=player.kills;
  if(ui.nearCount)ui.nearCount.textContent=player.nearMisses;
  if(ui.maxCombo)ui.maxCombo.textContent=player.maxCombo;
  if(ui.enemyCount)ui.enemyCount.textContent=enemies.length;
  if(ui.warn)ui.warn.style.opacity=player.hp<30&&player.alive?1:0;
  if(ui.vignette)ui.vignette.style.opacity=player.hp<32&&player.alive?.9:0;
  updateReticleState();
}
let last=performance.now();
function animate(now=performance.now()){
  requestAnimationFrame(animate);let dt=Math.min((now-last)/1000,.033);last=now;
  if(slowTimer>0){slowTimer-=dt;if(slowTimer<=0)timeScale=1;}dt*=timeScale;
  updateAim(dt);updatePlayer(dt);updatePlayerDamageEffects(dt);updateAudioMix(dt);updateEnemies(dt);updateBullets(dt);updateAmbientCombat(dt);updateParticles(dt);updateVFX(dt);updateScorePopups(dt);updateCamera(dt);environment.update(dt,player.survival);updateUI();
  if(composer)composer.render();else renderer.render(scene,camera);
}
animate();
