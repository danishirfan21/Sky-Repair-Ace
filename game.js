import * as THREE from 'https://esm.sh/three@0.160.0';

const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0xa5b7c4,.0036);
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,1000);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
document.body.appendChild(renderer.domElement);

const dopamineConfig = {
  enableBomber: true,
  enableAce: true,
  enableMiniBoss: true,
  enableLastStand: true,
  enableFlowState: true,
  enableWeaponUnlockCrest: true,
  enablePerfectRepairBuff: true,
  enableRepairWarningArcs: true,
  enableExplosionUpgrade: true,
  enableAimAssistReticle: true,
  enableDynamicMusicLayers: true,
  enableStereoPanning: true,
  enablePooling: true,
  enableTerrainSkim: true,
  enableMiniEvents: true,
  enableRunRecords: true,
  enableAdaptiveDirector: true
};

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
function isUnsupportedDevice() {
  const smallViewport = window.innerWidth < 1024 || window.innerHeight < 620;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  return smallViewport || (coarsePointer && noHover);
}

function ensureAudio(){
  if(isUnsupportedDevice()) return;
  if(!ctx)ctx=new AudioCtx();
  ctx.resume?.();
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
  function play(name,volume=1,useFallback=true,playbackRate=1){
    if(!canUse(name)){if(useFallback&&unlocked)fallback(name);return false;}
    try{
      const src=clips.get(name);
      const el=src.cloneNode(true);
      el.volume=THREE.MathUtils.clamp(volume,0,1);
      el.playbackRate=THREE.MathUtils.clamp(playbackRate,.88,1.12);
      el.loop=false;
      handlePlayResult(name,el.play(),useFallback);
      return true;
    }catch(e){failed.add(name);if(useFallback&&unlocked)fallback(name);return false;}
  }
  function playPanned(name,volume=1,pan=0,useFallback=true,playbackRate=1){
    if(!ctx||!canUse(name))return play(name,volume,useFallback,playbackRate);
    try{
      const el=clips.get(name).cloneNode(true);
      const source=ctx.createMediaElementSource(el);
      const panner=ctx.createStereoPanner();
      const gain=ctx.createGain();
      gain.gain.value=THREE.MathUtils.clamp(volume,0,1);
      panner.pan.value=THREE.MathUtils.clamp(pan,-.75,.75);
      source.connect(panner);panner.connect(gain);gain.connect(ctx.destination);
      el.volume=1;
      el.loop=false;
      el.playbackRate=THREE.MathUtils.clamp(playbackRate,.88,1.12);
      el.addEventListener('ended',()=>{try{source.disconnect();panner.disconnect();gain.disconnect();}catch(e){}},{once:true});
      handlePlayResult(name,el.play(),useFallback);
      return true;
    }catch(e){
      return play(name,volume,useFallback,playbackRate);
    }
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
  function setLoopPlaybackRate(name,rate=1){
    const el=loops.get(name);
    if(el)el.playbackRate=THREE.MathUtils.clamp(rate,.82,1.18);
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
    if(unlocked || isUnsupportedDevice())return;
    unlocked=true;
    startLoop('start_background',.45);
  }
  return {play,playPanned,playRandom:(names,volume=1,useFallback=true,playbackRate=1)=>play(names[Math.floor(Math.random()*names.length)],volume,useFallback,playbackRate),startLoop,stopLoop,setLoopVolume,setLoopPlaybackRate,fadeLoop,unlock,get unlocked(){return unlocked;}};
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
  music_elevenlabs_loop:'audio/music/gameplay_background.mp3',
  start_background:'audio/music/start_background.mp3',
  start_button:'audio/music/start_button.mp3',
  hit_marker:'audio/music/shoot_sound.mp3',
  play_again:'audio/music/play_again.mp3',
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
  mg_overdrive_loop:'audio/weapons/mg_overdrive_loop.mp3',
  reward_enemy_hit:'audio/rewards/enemy_hit.mp3',
  reward_hit_chain:'audio/rewards/hit_chain.mp3',
  reward_kill_confirm:'audio/rewards/kill_confirm.mp3',
  reward_combo_increase:'audio/rewards/combo_increase.mp3',
  reward_near_miss:'audio/rewards/near_miss_reward.mp3',
  reward_repair:'audio/rewards/repair_reward.mp3',
  reward_perfect_repair:'audio/rewards/perfect_repair.mp3',
  reward_weapon_unlock:'audio/rewards/weapon_unlock_stinger.mp3',
  reward_incoming_fire:'audio/rewards/incoming_enemy_fire_cue.mp3',
  reward_bullet_intercept:'audio/rewards/bullet_intercept_reward.mp3',
  reward_combo_broken:'audio/rewards/combo_broken.mp3'
});
const audioTimers={shot:0,enemyShot:0,hitConfirm:0,hitMetal:0,repairTick:0,criticalBeep:0};
const rewardCueIds={
  hit:'reward_enemy_hit',
  chain:'reward_hit_chain',
  kill:'reward_kill_confirm',
  combo:'reward_combo_increase',
  nearMiss:'reward_near_miss',
  repair:'reward_repair',
  perfectRepair:'reward_perfect_repair',
  unlock:'reward_weapon_unlock',
  incomingFire:'reward_incoming_fire',
  intercept:'reward_bullet_intercept',
  comboBroken:'reward_combo_broken'
};
const rewardCueVolumes={hit:.11,chain:.16,kill:.24,combo:.13,nearMiss:.18,repair:.16,perfectRepair:.24,unlock:.24,incomingFire:.13,intercept:.17,comboBroken:.15};
const rewardCueThrottle={hit:.22,chain:.26,combo:.3,nearMiss:.34,repair:.42,incomingFire:1.15,intercept:.28,comboBroken:.42};
const rewardCueLast={};
const duckingRewardCues=new Set(['kill','perfectRepair','unlock','nearMiss']);
function resetRewardCueState(){
  for(const key of Object.keys(rewardCueLast))delete rewardCueLast[key];
}
function playRewardCue(type,options={}){
  const id=rewardCueIds[type];
  if(!id)return false;
  const now=performance.now()/1000;
  if(type==='combo'&&now-(rewardCueLast.kill||0)<.36)return false;
  const throttle=rewardCueThrottle[type]??.24;
  if(!options.force&&now-(rewardCueLast[type]||0)<throttle)return false;
  rewardCueLast[type]=now;
  if(duckingRewardCues.has(type)||options.duck)duckMusic(options.duckAmount ?? .32,options.duckTime ?? .34);
  return audio.play(id,options.volume ?? rewardCueVolumes[type] ?? .15,false);
}
const musicVolumeConfig={
  gameplay:0.55,
  critical:0.68,
  gameOver:0.28
};
const audioMix={damagedEngine:0,music:musicVolumeConfig.gameplay,duck:0,duckTimer:0,intensity:0,musicRate:1};
const hitSounds=['hit_metal_01','hit_metal_02'];
const whizSounds=['bullet_whiz_01','bullet_whiz_02'];
function duckMusic(amount=.3,duration=.32){
  audioMix.duck=Math.max(audioMix.duck,THREE.MathUtils.clamp(amount,0,.5));
  audioMix.duckTimer=Math.max(audioMix.duckTimer,duration);
}
function playSpatialCue(name,worldPosition,volume=1,useFallback=true,playbackRate=1){
  if(!dopamineConfig.enableStereoPanning||!worldPosition)return audio.play(name,volume,useFallback,playbackRate);
  const ref=player?.group?.position ?? camera.position;
  const pan=THREE.MathUtils.clamp((worldPosition.x-ref.x)/24,-.75,.75);
  return audio.playPanned(name,volume,pan,useFallback,playbackRate);
}
function updateAudioMix(dt){
  if(!audio.unlocked)return;
  const damageTarget=(player.alive&&(player.hp<45||player.lastStand))
    ? .05+(45-Math.min(player.hp,45))/45*.15+(player.lastStand ? .08 : 0)
    : 0;
  audioMix.damagedEngine=THREE.MathUtils.lerp(audioMix.damagedEngine,damageTarget,Math.min(1,dt*2.5));
  audio.setLoopVolume('engine_damaged_loop',audioMix.damagedEngine);
  const engineWarp=player.alive&&player.hp<30?1+Math.sin(feedbackState.pulse*Math.PI*2)*.035*feedbackState.critical:1;
  audio.setLoopPlaybackRate('engine_loop',engineWarp);
  audio.setLoopPlaybackRate('engine_damaged_loop',player.alive&&player.hp<30?engineWarp*.96:1);
  let musicTarget=player.alive&&player.hp<30?musicVolumeConfig.critical:player.alive?musicVolumeConfig.gameplay:musicVolumeConfig.gameOver;
  let musicRate=1;
  if(dopamineConfig.enableDynamicMusicLayers&&player.alive){
    if(player.lastStand){musicTarget=.76;musicRate=1.055;}
    else if(player.hp<30){musicTarget=musicVolumeConfig.critical;musicRate=1.025;}
    else if(player.combo>=8){musicTarget=.64;musicRate=1.024;}
    else if(player.combo>=3){musicTarget=.59;musicRate=1.012;}
  }
  if(audioMix.duckTimer>0)audioMix.duckTimer=Math.max(0,audioMix.duckTimer-dt);
  else audioMix.duck=THREE.MathUtils.lerp(audioMix.duck,0,Math.min(1,dt*5.5));
  audioMix.music=THREE.MathUtils.lerp(audioMix.music,musicTarget,Math.min(1,dt*1.4));
  audioMix.musicRate=THREE.MathUtils.lerp(audioMix.musicRate,musicRate,Math.min(1,dt*1.8));
  audio.setLoopVolume('music_elevenlabs_loop',audioMix.music*(1-audioMix.duck));
  audio.setLoopPlaybackRate('music_elevenlabs_loop',audioMix.musicRate);
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
window.addEventListener('keydown',e=>{if(gameKeys.has(e.code))e.preventDefault();keys.add(e.code);ensureAudio();if(['KeyW','KeyA','KeyS','KeyD','Space','KeyR'].includes(e.code))hideStartHint();});
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
  e.preventDefault();mouse.down=true;ensureAudio();hideStartHint();
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
  lastStand:false,lastStandTimer:0,lastStandUsed:false,
  startTime:performance.now(),survival:0};
scene.add(player.group);player.group.rotation.y=Math.PI;
const playerDamageVisuals=createPlayerDamageVisuals(player.group);
const feedbackState={critical:0,pulse:0,perfectGlow:0,perfectZoom:0,comboPulse:0,flow:0,nearMissZoom:0,skimZoom:0};
const combatComboState={hitCount:0,hitTimer:0};
let freezeTimer=0;

const bullets=[],enemies=[],particles=[],mines=[];
const vfx = [];
const scorePopups = [];
let ambientTracerTimer = 0;
let nextGunSide = -1;
let runToken = 0;
const perfCaps={bullets:120,hostileBullets:72,mines:10,particles:180,vfx:100,ambientTracers:12,scorePopups:14,flakHazards:9,friendlies:2,escortBullets:10,supplyDrops:1};
const bulletInterceptConfig={enabled:true,radius:.9,score:10};
const interceptComboState={count:0};
const playerDamageFx={smokeTimer:0,sparkTimer:0,fireTimer:0};
const specialEnemyState={bomberSpawned:false,aceSpawned:false,miniBossSpawned:false};
const repairOvercharge={timer:0,duration:5};
const terrainSkimState={hold:0,cooldown:1.6,successes:0};
const directorState={hype:0,kills:[],recentPerfect:0,recentSpecial:0,lastRewardAt:0,lastThreatAt:0,lullTimer:0,lastMajorEventAt:-99,lastHeavyAt:-99,lastFlakAt:-99,lastEscortAt:-99,lastSupplyAt:-99};
const flakBarrageState={active:false,timer:0,spawnTimer:0,shotsLeft:0,survived:true,nextAt:24};
const friendlyEscorts=[];
const escortState={active:false,timer:0,nextAt:36};
const supplyDropState={active:false,drop:null,nextAt:30};
const runStats={firstKillTime:null,specialKills:0,finalStandKills:0,newRecords:[]};
const runScoreBreakdown={killScore:0,nearMissScore:0,repairScore:0,specialScore:0,otherScore:0};
const resultAnimationState={rafs:[],timers:[]};
const liveRecordState={cache:{},shown:new Set(),lastToastAt:0};
const tutorialHintState={el:null,timer:null};
const recordSpecs=[
  {key:'skyRepairAce.bestScore',label:'NEW BEST SCORE',mode:'max',value:()=>player.score},
  {key:'skyRepairAce.bestTime',label:'NEW BEST TIME',mode:'max',value:()=>player.survival},
  {key:'skyRepairAce.bestCombo',label:'NEW BEST COMBO',mode:'max',value:()=>player.maxCombo},
  {key:'skyRepairAce.bestKills',label:'NEW BEST KILLS',mode:'max',value:()=>player.kills},
  {key:'skyRepairAce.bestNearMisses',label:'NEW BEST NEAR MISSES',mode:'max',value:()=>player.nearMisses},
  {key:'skyRepairAce.fastestFirstKill',label:'FASTEST FIRST KILL',mode:'min',value:()=>runStats.firstKillTime},
  {key:'skyRepairAce.bestSpecialKills',label:'BEST SPECIAL HUNT',mode:'max',positive:true,value:()=>runStats.specialKills},
  {key:'skyRepairAce.bestFinalStandKills',label:'BEST FINAL STAND',mode:'max',positive:true,value:()=>runStats.finalStandKills}
];
function resetRunScoreBreakdown(){
  Object.keys(runScoreBreakdown).forEach(key=>{runScoreBreakdown[key]=0;});
}
function awardScore(category,points){
  const amount=Number(points)||0;
  player.score+=amount;
  if(category&&Object.prototype.hasOwnProperty.call(runScoreBreakdown,category))runScoreBreakdown[category]+=amount;
  else runScoreBreakdown.otherScore+=amount;
}
function resetRunStats(){
  runStats.firstKillTime=null;
  runStats.specialKills=0;
  runStats.finalStandKills=0;
  runStats.newRecords=[];
  resetRunScoreBreakdown();
}
function readRecordValue(key){
  try{
    const raw=localStorage.getItem(key);
    const value=raw===null?null:Number(raw);
    return Number.isFinite(value)?value:null;
  }catch(e){return null;}
}
function writeRecordValue(key,value){
  try{localStorage.setItem(key,String(value));}catch(e){}
}
function cacheRunRecords(){
  liveRecordState.cache={};
  for(const spec of recordSpecs)liveRecordState.cache[spec.key]=readRecordValue(spec.key);
  liveRecordState.shown.clear();
  liveRecordState.lastToastAt=0;
}
function resetLiveRecordState(){
  liveRecordState.shown.clear();
  liveRecordState.lastToastAt=0;
}
function pushLiveRecordToast(key,label){
  if(!dopamineConfig.enableRunRecords||liveRecordState.shown.has(key)||!player.alive||player.lastStand)return;
  const now=performance.now()/1000;
  if(now-liveRecordState.lastToastAt<1.4)return;
  liveRecordState.shown.add(key);
  liveRecordState.lastToastAt=now;
  pushRewardFeed(label,'',{color:'#fff1b8',icon:'*',emphasis:true,life:1.05,cueType:'combo',priority:6});
  audio.play('ui_confirm',.08,false);
}
function checkLiveRecords(type){
  if(!dopamineConfig.enableRunRecords)return;
  if(type==='combo'){
    const key='skyRepairAce.bestCombo';
    const prev=liveRecordState.cache[key];
    if(player.maxCombo>0&&(prev===null||prev===undefined||player.maxCombo>prev))pushLiveRecordToast(key,'NEW BEST COMBO');
  }else if(type==='kills'){
    const key='skyRepairAce.bestKills';
    const prev=liveRecordState.cache[key];
    if(player.kills>0&&(prev===null||prev===undefined||player.kills>prev))pushLiveRecordToast(key,'NEW KILL RECORD');
  }else if(type==='nearMisses'){
    const key='skyRepairAce.bestNearMisses';
    const prev=liveRecordState.cache[key];
    if(player.nearMisses>0&&(prev===null||prev===undefined||player.nearMisses>prev))pushLiveRecordToast(key,'NEW NEAR MISS RECORD');
  }else if(type==='firstKill'){
    const key='skyRepairAce.fastestFirstKill';
    const prev=liveRecordState.cache[key];
    if(runStats.firstKillTime&&runStats.firstKillTime>0&&(prev===null||prev===undefined||runStats.firstKillTime<prev))pushLiveRecordToast(key,'FASTEST FIRST KILL');
  }
}
function finalizeRunRecords(){
  runStats.newRecords=[];
  if(!dopamineConfig.enableRunRecords)return runStats.newRecords;
  for(const spec of recordSpecs){
    const value=spec.value();
    if(value===null||value===undefined||!Number.isFinite(value))continue;
    if(spec.mode==='min'&&value<=0)continue;
    if(spec.positive&&value<=0)continue;
    const prev=readRecordValue(spec.key);
    const improved=prev===null||(spec.mode==='max'?value>prev:value<prev);
    if(improved){
      writeRecordValue(spec.key,value);
      liveRecordState.cache[spec.key]=value;
      runStats.newRecords.push(spec.label);
    }
  }
  return runStats.newRecords;
}
function renderRecordBadges(records){
  if(!ui.recordBadges)return;
  ui.recordBadges.textContent='';
  for(const label of records.slice(0,5)){
    const badge=document.createElement('span');
    badge.className='record-badge';
    badge.textContent=label;
    ui.recordBadges.appendChild(badge);
  }
}
function clearResultAnimations(){
  resultAnimationState.rafs.forEach(id=>cancelAnimationFrame(id));
  resultAnimationState.rafs=[];
  resultAnimationState.timers.forEach(timer=>clearTimeout(timer));
  resultAnimationState.timers=[];
}
function setResultTimer(fn,delay){
  const timer=setTimeout(()=>{
    resultAnimationState.timers=resultAnimationState.timers.filter(id=>id!==timer);
    fn();
  },delay);
  resultAnimationState.timers.push(timer);
  return timer;
}
function countResultValue(el,target,{prefix='',suffix='',decimals=0,duration=760}={}){
  if(!el)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const format=value=>`${prefix}${decimals>0?value.toFixed(decimals):Math.round(value)}${suffix}`;
  if(reduced||duration<=0){el.textContent=format(target);return;}
  const start=performance.now();
  let rafId=null;
  const step=now=>{
    const t=THREE.MathUtils.clamp((now-start)/duration,0,1);
    const eased=1-Math.pow(1-t,3);
    el.textContent=format(target*eased);
    if(t<1){
      rafId=requestAnimationFrame(step);
      resultAnimationState.rafs.push(rafId);
    }else{
      resultAnimationState.rafs=resultAnimationState.rafs.filter(id=>id!==rafId);
    }
  };
  rafId=requestAnimationFrame(step);
  resultAnimationState.rafs.push(rafId);
}
function nextMilestone(value,milestones,prefix='',suffix=''){
  const target=milestones.find(mark=>value<mark) ?? milestones[milestones.length-1];
  const previous=[0,...milestones.filter(mark=>mark<target)].pop() ?? 0;
  const span=Math.max(1,target-previous);
  const progress=target===previous?1:THREE.MathUtils.clamp((value-previous)/span,0,1);
  return {label:`NEXT MILESTONE: ${prefix}${target}${suffix}`,progress};
}
function resultTitleAndSubtitle(){
  const finalStand=player.lastStandUsed||runStats.finalStandKills>0;
  let title='FINAL SORTIE';
  if(finalStand)title='LAST STAND';
  else if(player.score>=900||player.maxCombo>=15)title='ACE PILOT!';
  else if(player.kills>=10)title='SKY ACE';

  let subtitle=`Mission result · Score ${player.score}`;
  if(finalStand)subtitle=`Legendary clutch pilot · Final stand kills ${runStats.finalStandKills}`;
  else if(player.kills>=10)subtitle=`Heavy fighter hunter · Score ${player.score}`;
  else if(player.nearMisses>=8)subtitle=`Near-miss specialist · ${player.nearMisses} close calls`;
  if(finalStand)subtitle=`Legendary clutch pilot - Final stand survived ${Math.min(3,player.survival).toFixed(1)}s`;
  subtitle=subtitle.replace(/[^\x20-\x7E]+/g,'-');
  return {title,subtitle};
}
function resultFooterHook(){
  if(player.maxCombo<30)return 'Reach x30 combo to unlock <strong>OVERDRIVE STORM</strong>';
  if(player.survival<30)return 'Survive 30s to reach the next milestone';
  return 'Beat your best combo to earn ACE rank';
}
function breakdownItems(){
  const known=runScoreBreakdown.killScore+runScoreBreakdown.nearMissScore+runScoreBreakdown.repairScore+runScoreBreakdown.specialScore;
  runScoreBreakdown.otherScore=Math.max(0,player.score-known);
  const items=[
    ['Kills',runScoreBreakdown.killScore],
    ['Near Misses',runScoreBreakdown.nearMissScore],
    ['Repairs',runScoreBreakdown.repairScore],
    ['Specials',runScoreBreakdown.specialScore]
  ];
  if(runScoreBreakdown.otherScore>0)items.push(['Other',runScoreBreakdown.otherScore]);
  items.push(['Total Score',player.score,'total']);
  return items;
}
function renderBreakdown(){
  if(!ui.resultsBreakdown)return;
  ui.resultsBreakdown.textContent='';
  const items=breakdownItems();
  ui.resultsBreakdown.style.setProperty('--breakdown-cols',String(items.length));
  for(const [label,value,kind] of items){
    const item=document.createElement('div');
    item.className=`results-breakdown-item${kind==='total'?' total':''}`;
    const labelEl=document.createElement('span');
    labelEl.textContent=label;
    const valueEl=document.createElement('b');
    valueEl.textContent=kind==='total'?String(value):`+${value}`;
    item.append(labelEl,valueEl);
    ui.resultsBreakdown.appendChild(item);
  }
}
function renderResultStatRows(records){
  const rows=[
    {key:'time',value:player.survival,display:ui.finalTime,prefix:'',suffix:'s',decimals:1,milestones:[30,60,90,120],record:'NEW BEST TIME',recordable:player.survival>0},
    {key:'kills',value:player.kills,display:ui.finalKills,prefix:'',suffix:'',decimals:0,milestones:[10,20,30,50],record:'NEW BEST KILLS',recordable:player.kills>0},
    {key:'combo',value:player.maxCombo,display:ui.finalCombo,prefix:'x',suffix:'',decimals:0,milestones:[15,30,50],record:'NEW BEST COMBO',recordable:player.maxCombo>0},
    {key:'near',value:player.nearMisses,display:ui.finalNear,prefix:'',suffix:'',decimals:0,milestones:[15,30,50],record:'NEW BEST NEAR MISSES',recordable:player.nearMisses>0}
  ];
  rows.forEach((stat,index)=>{
    const row=document.querySelector(`.results-stat-row[data-stat="${stat.key}"]`);
    if(!row)return;
    const milestone=nextMilestone(stat.value,stat.milestones,stat.prefix,stat.suffix);
    row.classList.toggle('is-record',stat.recordable&&records.includes(stat.record));
    const milestoneEl=row.querySelector('.results-stat-milestone');
    if(milestoneEl)milestoneEl.textContent=milestone.label;
    const fill=row.querySelector('.results-progress span');
    if(fill){
      fill.style.width='0%';
      setResultTimer(()=>{fill.style.width=`${Math.round(milestone.progress*100)}%`;},170+index*70);
    }
    countResultValue(stat.display,stat.value,{prefix:stat.prefix,suffix:stat.suffix,decimals:stat.decimals,duration:430+index*70});
  });
}
function renderResultsScreen(records){
  clearResultAnimations();
  const {title,subtitle}=resultTitleAndSubtitle();
  if(ui.resultsTitle)ui.resultsTitle.textContent=title;
  if(ui.resultLine)ui.resultLine.textContent=subtitle;
  if(ui.resultsFooterHook)ui.resultsFooterHook.innerHTML=resultFooterHook();
  if(ui.lastStand)ui.lastStand.classList.toggle('critical',player.lastStandUsed||player.hp<=0||runStats.finalStandKills>0);
  renderBreakdown();
  renderResultStatRows(records);
  countResultValue(ui.finalScore,player.score,{duration:820});
}
function sessionFlag(key){
  try{return sessionStorage.getItem(`skyRepairAce.${key}`)==='1';}catch(e){return false;}
}
function setSessionFlag(key){
  try{sessionStorage.setItem(`skyRepairAce.${key}`,'1');}catch(e){}
}
function showTutorialHint(key,text,{allowInactive=false}={}){
  if(sessionFlag(key)||(!allowInactive&&(!player.alive||player.lastStand)))return;
  setSessionFlag(key);
  if(!tutorialHintState.el){
    tutorialHintState.el=document.createElement('div');
    tutorialHintState.el.id='tutorialHint';
    document.getElementById('hud')?.appendChild(tutorialHintState.el);
  }
  if(tutorialHintState.timer)clearTimeout(tutorialHintState.timer);
  tutorialHintState.el.textContent=text;
  tutorialHintState.el.classList.add('show');
  tutorialHintState.timer=setTimeout(clearTutorialHint,3100);
}
function clearTutorialHint(){
  if(tutorialHintState.timer)clearTimeout(tutorialHintState.timer);
  tutorialHintState.timer=null;
  tutorialHintState.el?.classList.remove('show');
}
function specialSpawnCue(enemy,label,kind='warm'){
  centerToast(label,kind==='cyan'?'#9ffcff':'#ffcf8a',720,kind);
  pushRewardFeed(label,'',{color:kind==='cyan'?'#9ffcff':'#ffcf8a',icon:'!',emphasis:true,life:.92,cueType:'incomingFire'});
  if(enemy){
    enemy.warningTimer=1.35;
    enemy.entryTimer=1.1;
    burstParticles(enemy.group.position,{color:kind==='cyan'?0x9ffcff:0xffa24d,count:14,speed:10,size:[.035,.1],life:[.18,.42],additive:true});
  }
  player.cameraKick=Math.max(player.cameraKick||0,kind==='danger'?.28:.16);
  if(kind==='danger')playRewardCue('unlock',{force:true,duck:true,duckAmount:.34});
  else playRewardCue('incomingFire',{force:true});
}
function resetDirectorState(){
  directorState.hype=0;
  directorState.kills.length=0;
  directorState.recentPerfect=0;
  directorState.recentSpecial=0;
  directorState.lastRewardAt=performance.now()/1000;
  directorState.lastThreatAt=0;
  directorState.lullTimer=0;
  directorState.lastMajorEventAt=-99;
  directorState.lastHeavyAt=-99;
  directorState.lastFlakAt=-99;
  directorState.lastEscortAt=-99;
  directorState.lastSupplyAt=-99;
}
function directorTuningSnapshot(hype=directorState.hype){
  if(!dopamineConfig.enableAdaptiveDirector)return {hype:0,pressure:0,relief:0,spawnScale:1,aggressionAdd:0,targetAdd:0,specialLead:0,flakLead:0,escortChance:1};
  const now=performance.now()/1000;
  const comboScore=THREE.MathUtils.clamp(player.combo/12,0,1);
  const killScore=THREE.MathUtils.clamp(directorState.kills.length/7,0,1);
  const hpScore=THREE.MathUtils.clamp((player.hp-45)/45,0,1);
  const repairScore=directorState.recentPerfect>0?.18:0;
  const specialScore=directorState.recentSpecial>0?.14:0;
  const noReward=THREE.MathUtils.clamp((now-(directorState.lastRewardAt||now)-4)/5,0,1);
  const pressure=THREE.MathUtils.clamp(comboScore*.42+killScore*.3+hpScore*.18+repairScore+specialScore,0,1);
  const relief=THREE.MathUtils.clamp((32-player.hp)/24,0,1);
  return {
    hype,
    pressure,
    relief,
    spawnScale:THREE.MathUtils.clamp(1-hype*.16+relief*.12,.82,1.18),
    aggressionAdd:hype*.13-relief*.09,
    targetAdd:hype>.68&&player.hp>45?1:0,
    specialLead:hype>.55&&player.hp>55?THREE.MathUtils.lerp(4,7,hype):0,
    flakLead:hype>.62&&player.hp>50?THREE.MathUtils.lerp(2,5,hype):0,
    escortChance:THREE.MathUtils.clamp(1+relief*1.25+(repair.dangerRecent>0 ? .55 : 0)-hype*.25,.45,2.4)
  };
}
function directorTuning(dt=0){
  if(!dopamineConfig.enableAdaptiveDirector)return directorTuningSnapshot(0);
  const now=performance.now()/1000;
  directorState.kills=directorState.kills.filter(t=>now-t<10);
  directorState.recentPerfect=Math.max(0,directorState.recentPerfect-dt);
  directorState.recentSpecial=Math.max(0,directorState.recentSpecial-dt);
  const raw=directorTuningSnapshot(directorState.hype);
  const target=THREE.MathUtils.clamp(raw.pressure+(now-(directorState.lastRewardAt||now)>4?THREE.MathUtils.clamp((now-(directorState.lastRewardAt||now)-4)/5,0,1)*.18:0)-raw.relief*.26,0,1);
  directorState.hype=THREE.MathUtils.lerp(directorState.hype,target,1-Math.exp(-dt*5.4));
  return directorTuningSnapshot(directorState.hype);
}
function canStartMajorEvent(kind,minGap=6){
  if(player.lastStand)return true;
  const elapsed=player.survival||0;
  if(elapsed-directorState.lastMajorEventAt<minGap)return false;
  if(kind==='flak'){
    if(elapsed-directorState.lastHeavyAt<6)return false;
    if(escortState.active||supplyDropState.active)return false;
    if(player.hp<28&&directorState.hype<.72)return false;
  }
  if(kind==='escort'&&(flakBarrageState.active||elapsed-directorState.lastFlakAt<4.5))return false;
  if(kind==='supply'&&(flakBarrageState.active||elapsed-directorState.lastFlakAt<5||elapsed-directorState.lastHeavyAt<6))return false;
  return true;
}
function markMajorEvent(kind){
  const elapsed=player.survival||0;
  directorState.lastMajorEventAt=elapsed;
  if(kind==='heavy')directorState.lastHeavyAt=elapsed;
  if(kind==='flak')directorState.lastFlakAt=elapsed;
  if(kind==='escort')directorState.lastEscortAt=elapsed;
  if(kind==='supply')directorState.lastSupplyAt=elapsed;
}
function triggerJackpot(label,points,pos,{tier='legendary',chance=1}={}){
  if(!player.alive||performance.now()/1000-jackpotState.lastAt<jackpotState.cooldown)return false;
  if(Math.random()>chance)return false;
  jackpotState.lastAt=performance.now()/1000;
  jackpotState.cooldown=8+Math.random()*4;
  awardScore('specialScore',points);
  pushRewardFeed(label,`+${points}`,{color:tier==='legendary'?'#fff1b8':'#9ffcff',icon:'*',emphasis:true,priority:tier==='legendary'?9:7,tier,cueType:tier==='legendary'?'unlock':'perfectRepair',forceCue:true,variant:false,streak:false});
  addCombo(1,pos||player.group.position,null,'#fff1b8',{feed:false});
  burstParticles(pos||player.group.position,{color:tier==='legendary'?0xfff1b8:0x9ffcff,count:tier==='legendary'?14:10,speed:12,size:[.035,.11],life:[.16,.38],additive:true});
  player.cameraKick=Math.max(player.cameraKick||0,tier==='legendary'?.24:.16);
  player.shake=Math.max(player.shake,tier==='legendary'?.15:.1);
  if(tier==='legendary')freezeTimer=Math.max(freezeTimer,.045);
  return true;
}
function maybeJackpot(kind,pos,detail={}){
  if(kind==='nearMiss'){
    if(repair.active||repair.dangerRecent>0)return triggerJackpot('ACE REFLEX',100,pos,{chance:.42});
    if(player.hp<35)return triggerJackpot(player.hp<20?'CLUTCH THREAD':'PERFECT DODGE',player.hp<20?125:75,pos,{chance:.38});
  }else if(kind==='perfectRepair'){
    if(detail.danger||repair.dangerRecent>0)return triggerJackpot('MIRACLE REPAIR',150,pos,{chance:.68});
  }else if(kind==='kill'){
    const risky=player.hp<35&&(detail.enemyKind==='ace'||detail.enemyKind==='miniBoss');
    const burst=directorState.kills.length>=3;
    const finalStreak=player.lastStand&&runStats.finalStandKills>=2;
    if(risky)return triggerJackpot('SKY ACE BONUS',150,pos,{chance:.58});
    if(finalStreak)return triggerJackpot('CLUTCH THREAD',125,pos,{chance:.48});
    if(burst)return triggerJackpot('SKY ACE BONUS',100,pos,{tier:'major',chance:.34});
  }
  return false;
}
function noteRunKill(kind='normal'){
  const now=performance.now()/1000;
  directorState.kills.push(now);
  const first=runStats.firstKillTime===null;
  if(first)runStats.firstKillTime=player.survival;
  if(kind!=='normal'){
    runStats.specialKills++;
    directorState.recentSpecial=6;
  }
  if(player.lastStand)runStats.finalStandKills++;
  if(first)checkLiveRecords('firstKill');
  checkLiveRecords('kills');
}
function removeBulletAt(index){
  const b=bullets[index];
  if(!b)return;
  scene.remove(b.mesh);
  bullets.splice(index,1);
}
function removeExpiredBulletForCap(){
  const idx=bullets.findIndex(b=>b?.consumed||b?.life<=0);
  if(idx>=0){
    removeBulletAt(idx);
    return true;
  }
  return false;
}
function removeFarthestBulletForCap(predicate=null){
  if(!bullets.length)return false;
  let farthestIdx=-1;
  let farthestScore=-Infinity;
  const playerPos=player?.group?.position;
  const cameraPos=camera?.position;
  for(let i=0;i<bullets.length;i++){
    const b=bullets[i];
    if(predicate&&!predicate(b))continue;
    const pos=b?.pos ?? b?.mesh?.position;
    if(!pos)continue;
    const playerDist=playerPos?pos.distanceToSquared(playerPos):0;
    const cameraDist=cameraPos?pos.distanceToSquared(cameraPos):0;
    const score=Math.max(playerDist,cameraDist);
    if(score>farthestScore){
      farthestScore=score;
      farthestIdx=i;
    }
  }
  if(farthestIdx>=0){
    removeBulletAt(farthestIdx);
    return true;
  }
  return false;
}
function countBullets(predicate){
  let count=0;
  for(const b of bullets)if(predicate(b))count++;
  return count;
}
function addBullet(bullet){
  if(dopamineConfig.enablePooling&&bullet?.hostile){
    while(countBullets(b=>b.hostile)>=perfCaps.hostileBullets){
      const idx=bullets.findIndex(b=>b.hostile&&(b.consumed||b.life<=0));
      if(idx>=0){removeBulletAt(idx);continue;}
      if(removeFarthestBulletForCap(b=>b.hostile))continue;
      const hostileIdx=bullets.findIndex(b=>b.hostile);
      if(hostileIdx>=0)removeBulletAt(hostileIdx);
      else break;
    }
  }
  while(dopamineConfig.enablePooling&&bullets.length>=perfCaps.bullets){
    if(removeExpiredBulletForCap())continue;
    if(removeFarthestBulletForCap())continue;
    removeBulletAt(0);
  }
  bullets.push(bullet);
}
function addVfx(item){
  if(vfx.length>=perfCaps.vfx){
    const old=vfx.shift();
    if(old?.mesh)scene.remove(old.mesh);
  }
  vfx.push(item);
}
function activeAmbientTracerCount(){
  return vfx.reduce((sum,fx)=>sum+(fx.ambient?1:0),0);
}
function spawnEnemy(options={}){
  if(!player.alive)return;
  const elapsed=(performance.now()-player.startTime)/1000;
  const phase=waveDirectorPhase(elapsed);
  const type=options.type ?? phase.types[Math.floor(Math.random()*phase.types.length)] ?? 'straight';
  const kind=options.kind ?? 'normal';
  const xSpread=options.xSpread ?? phase.xSpread ?? 34;
  const ySpread=options.ySpread ?? 16;
  const zMin=options.zMin ?? phase.zMin ?? -65;
  const zMax=options.zMax ?? phase.zMax ?? -100;
  let x=options.x ?? ((Math.random()-.5)*xSpread);
  if(Math.abs(x-player.group.position.x)<4)x+=x<player.group.position.x?-5:5;
  const palette=kind==='bomber'?[0x293347,0xffb15f]:kind==='ace'?[0x577aa9,0xeaffff]:kind==='miniBoss'?[0x2f3b55,0xffd27a]:[0x405986,0xcbd8ef];
  const e={group:makePlane(palette[0],palette[1]),
    hp:kind==='miniBoss'?12:kind==='bomber'?6:kind==='ace'?3:2,
    maxHp:kind==='miniBoss'?12:kind==='bomber'?6:kind==='ace'?3:2,
    kind,
    type,
    t:Math.random()*10,
    fire:(options.fireDelay ?? (.55+Math.random()*1.2))/phase.aggression,
    mineTimer:kind==='bomber'?1.2+Math.random()*.7:Infinity,
    dodgeTimer:0,
    burstShots:0,
    aggression:options.aggression ?? phase.aggression};
  const z=zMax<zMin?zMin-Math.random()*Math.abs(zMax-zMin):zMin+Math.random()*(zMax-zMin);
  e.group.position.set(x,(options.y ?? ((Math.random()-.5)*ySpread)),z);
  e.group.rotation.y=0;
  if(kind==='bomber')e.group.scale.setScalar(1.38);
  if(kind==='ace')e.group.scale.setScalar(.84);
  if(kind==='miniBoss')e.group.scale.setScalar(1.7);
  if(kind!=='normal'){
    const glow=new THREE.Mesh(new THREE.SphereGeometry(kind==='ace' ? .18 : .28,10,8),
      new THREE.MeshBasicMaterial({color:kind==='ace'?0x9ffcff:0xff7a3d,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false}));
    glow.position.set(0,-.28,.55);
    e.group.add(glow);
    e.specialGlow=glow;
  }
  scene.add(e.group);enemies.push(e);
  return e;
}
const waveDirector={spawnTimer:0,burstTimer:0,opened:false,lastPhase:-1};
function waveDirectorPhase(elapsed,tuning=directorTuningSnapshot()){
  let phase;
  if(elapsed<5)phase={target:3,max:3,interval:.72,aggression:.78,types:['straight','straight','swoop'],zMin:-42,zMax:-58,xSpread:24};
  else if(elapsed<15)phase={target:4,max:5,interval:.88,aggression:.95,types:['straight','straight','swoop'],zMin:-48,zMax:-72,xSpread:30};
  else if(elapsed<30)phase={target:6,max:6,interval:.72,aggression:1.12,types:['straight','swoop','swoop','dive'],zMin:-46,zMax:-76,xSpread:34};
  else if(elapsed<45)phase={target:7,max:7,interval:.64,aggression:1.22,types:['swoop','dive','straight','swoop'],zMin:-44,zMax:-76,xSpread:38,group:true};
  else phase={target:8,max:8,interval:.58,aggression:1.32,types:['swoop','dive','swoop','straight'],zMin:-42,zMax:-74,xSpread:42,group:true};
  return {
    ...phase,
    target:Math.max(2,phase.target+tuning.targetAdd-(tuning.relief>.74?1:0)),
    max:Math.max(phase.max,phase.max+tuning.targetAdd),
    interval:phase.interval*tuning.spawnScale,
    aggression:THREE.MathUtils.clamp(phase.aggression+tuning.aggressionAdd,.72,1.48)
  };
}
function getTargetEnemyCount(){
  return waveDirectorPhase(player.survival||0,directorTuningSnapshot()).target;
}
function spawnWave(count=1,pattern='single'){
  const phase=waveDirectorPhase(player.survival||0,directorTuningSnapshot());
  const room=Math.max(0,phase.max-enemies.length);
  const n=Math.min(count,room);
  if(n<=0)return;
  if(pattern==='group'){
    const baseX=THREE.MathUtils.clamp(player.group.position.x+(Math.random()>.5?1:-1)*(8+Math.random()*9),-20,20);
    for(let i=0;i<n;i++){
      spawnEnemy({
        x:baseX+(i-(n-1)/2)*(4+Math.random()*2),
        y:player.group.position.y+(Math.random()-.5)*10,
        zMin:phase.zMin-2-i*3,
        zMax:phase.zMin-12-i*4,
        aggression:phase.aggression,
        fireDelay:.45+Math.random()*.85
      });
    }
    return;
  }
  for(let i=0;i<n;i++)spawnEnemy({aggression:phase.aggression});
}
function updateWaveDirector(dt){
  if(!player.alive)return;
  const tuning=directorTuning(dt);
  const phase=waveDirectorPhase(player.survival||0,tuning);
  directorState.lullTimer+=dt;
  if(!waveDirector.opened){
    spawnWave(3,'single');
    waveDirector.opened=true;
    waveDirector.spawnTimer=.55;
    return;
  }
  waveDirector.spawnTimer-=dt;
  waveDirector.burstTimer-=dt;
  if(enemies.length<phase.target&&waveDirector.spawnTimer<=0){
    const deficit=phase.target-enemies.length;
    const useGroup=phase.group&&deficit>=2&&waveDirector.burstTimer<=0&&Math.random()<.46;
    spawnWave(useGroup?Math.min(3,deficit):1,useGroup?'group':'single');
    waveDirector.spawnTimer=phase.interval*(.76+Math.random()*.38);
    if(useGroup)waveDirector.burstTimer=3.2+Math.random()*2.4;
  }
  if(player.survival>8&&directorState.lullTimer>5&&performance.now()/1000-(directorState.lastRewardAt||0)>6.2&&waveDirector.spawnTimer>.45&&enemies.length<phase.max){
    spawnWave(1,'single');
    directorState.lullTimer=0;
    waveDirector.spawnTimer=Math.min(waveDirector.spawnTimer,.9);
    directorState.lastThreatAt=player.survival;
  }
  if(dopamineConfig.enableAce&&!specialEnemyState.aceSpawned&&player.survival>18-tuning.specialLead&&enemies.length<phase.max&&canStartMajorEvent('ace',5.5)){
    specialEnemyState.aceSpawned=true;
    markMajorEvent('ace');
    const ace=spawnEnemy({kind:'ace',type:'swoop',zMin:-54,zMax:-72,aggression:1.22+tuning.aggressionAdd,fireDelay:.5});
    specialSpawnCue(ace,'ACE APPROACHING','cyan');
  }
  if(dopamineConfig.enableBomber&&!specialEnemyState.bomberSpawned&&player.survival>28-tuning.specialLead&&enemies.length<phase.max+1&&canStartMajorEvent('bomber',6)){
    specialEnemyState.bomberSpawned=true;
    markMajorEvent('bomber');
    const bomber=spawnEnemy({kind:'bomber',type:'straight',zMin:-62,zMax:-82,aggression:.82+tuning.aggressionAdd*.6,fireDelay:1.1,xSpread:28});
    specialSpawnCue(bomber,'BOMBER INBOUND','warm');
    if(bomber)setTimeout(()=>{if(enemies.includes(bomber))spawnMine(bomber);},650);
  }
  if(dopamineConfig.enableMiniBoss&&!specialEnemyState.miniBossSpawned&&player.survival>46-tuning.specialLead&&enemies.length<7&&canStartMajorEvent('heavy',6.5)){
    specialEnemyState.miniBossSpawned=true;
    markMajorEvent('heavy');
    const heavy=spawnEnemy({kind:'miniBoss',type:'straight',zMin:-74,zMax:-88,aggression:1.05+tuning.aggressionAdd*.5,fireDelay:.42,xSpread:20});
    specialSpawnCue(heavy,'HEAVY FIGHTER INBOUND','danger');
    eventCrest('HEAVY FIGHTER INBOUND',{sub:'BREAK FORMATION',kind:'danger',duration:980});
  }
  maybeStartFlakBarrage(tuning,dt);
  maybeStartFriendlyEscort(tuning,dt);
  maybeStartSupplyDrop(tuning,dt);
}

function spawnFlakHazard(){
  if(countBullets(b=>b.flak)>=perfCaps.flakHazards)return;
  const side=(Math.random()>.5?1:-1);
  const x=THREE.MathUtils.clamp(player.group.position.x+(Math.random()-.5)*18+side*(4+Math.random()*9),-24,24);
  const y=THREE.MathUtils.clamp(player.group.position.y+(Math.random()-.5)*9,-11,14);
  const start=new THREE.Vector3(x,y,-58-Math.random()*18);
  const lead=player.group.position.clone().add(new THREE.Vector3((Math.random()-.5)*7,(Math.random()-.5)*3,5));
  const dir=lead.sub(start).normalize();
  const mesh=createTracerMesh({color:0xff552a,radius:.07,glowMultiplier:7,glowOpacity:.5});
  const tracerLength=10+Math.random()*4;
  alignTracerMesh(mesh,start.clone().addScaledVector(dir,-tracerLength),start,tracerLength);
  scene.add(mesh);
  addBullet({mesh,pos:start.clone(),vel:dir.multiplyScalar(50+Math.random()*10),life:2.4,maxLife:2.4,hostile:true,flak:true,explosive:false,nearChecked:false,color:0xff552a,prevPos:start.clone(),tracerLength,trailT:0,damage:9});
  burstParticles(start,{color:0xff7a3d,count:4,speed:7,size:[.035,.1],life:[.12,.28],additive:true});
}
function startFlakBarrage(){
  if(!dopamineConfig.enableMiniEvents||flakBarrageState.active||player.lastStand||!player.alive||!canStartMajorEvent('flak',6))return;
  flakBarrageState.active=true;
  flakBarrageState.timer=2.7;
  flakBarrageState.spawnTimer=.15;
  flakBarrageState.shotsLeft=5+Math.floor(Math.random()*5);
  flakBarrageState.survived=true;
  flakBarrageState.nextAt=player.survival+24+Math.random()*7;
  markMajorEvent('flak');
  centerToast('FLAK BARRAGE','#ffcf8a',840,'danger');
  eventCrest('FLAK BARRAGE',{sub:'DODGE THE BURST',kind:'danger',duration:980});
  pushRewardFeed('FLAK BARRAGE','',{color:'#ffcf8a',icon:'!',emphasis:true,life:1.1,cueType:'incomingFire',priority:5});
  player.cameraKick=Math.max(player.cameraKick||0,.22);
  playRewardCue('incomingFire',{force:true});
  showTutorialHint('seenFlakTip','DODGE FLAK TO EARN BONUS');
}
function maybeStartFlakBarrage(tuning,dt){
  if(!dopamineConfig.enableMiniEvents||player.lastStand||flakBarrageState.active)return;
  if(player.survival<22-(tuning.flakLead||0))return;
  if(player.survival<flakBarrageState.nextAt)return;
  if(!canStartMajorEvent('flak',6))return;
  if(player.hp<28&&tuning.hype<.72)return;
  const chance=(.16+tuning.hype*.36)*(player.hp>50?1:.45);
  if(Math.random()<chance*dt)startFlakBarrage();
}
function updateFlakBarrage(dt){
  if(!flakBarrageState.active)return;
  if(!player.alive||player.lastStand){
    flakBarrageState.active=false;
    clearEventHazardBullets();
    return;
  }
  flakBarrageState.timer-=dt;
  flakBarrageState.spawnTimer-=dt;
  if(flakBarrageState.shotsLeft>0&&flakBarrageState.spawnTimer<=0){
    spawnFlakHazard();
    flakBarrageState.shotsLeft--;
    flakBarrageState.spawnTimer=.18+Math.random()*.22;
  }
  if(flakBarrageState.timer<=0&&flakBarrageState.shotsLeft<=0&&countBullets(b=>b.flak)===0){
    flakBarrageState.active=false;
    if(flakBarrageState.survived&&player.alive){
      awardScore('specialScore',50);
      pushRewardFeed('BARRAGE EVADED','+50',{color:'#fff1b8',icon:'*',emphasis:true,life:1.12,cueType:'nearMiss',priority:6});
      addCombo(1,null,'COMBO','#fff1b8',{feedValue:'+1',life:.82,icon:'*'});
      player.cameraKick=Math.max(player.cameraKick||0,.15);
    }
  }
}
function removeFriendlyEscort(escort){
  if(!escort)return;
  scene.remove(escort.group);
  const idx=friendlyEscorts.indexOf(escort);
  if(idx>=0)friendlyEscorts.splice(idx,1);
}
function spawnFriendlyEscort(){
  if(!dopamineConfig.enableMiniEvents||escortState.active||player.lastStand||!player.alive||!canStartMajorEvent('escort',5.5))return;
  escortState.active=true;
  escortState.timer=5.4+Math.random()*1.4;
  escortState.nextAt=player.survival+36+Math.random()*9;
  markMajorEvent('escort');
  const count=player.hp<35?2:1+(Math.random()>.55?1:0);
  for(let i=0;i<Math.min(count,perfCaps.friendlies);i++){
    const side=i===0?-1:1;
    const group=makePlane(0x557f9f,0xb8ffff);
    group.scale.setScalar(.72);
    group.rotation.y=Math.PI;
    group.position.copy(player.group.position).add(new THREE.Vector3(side*(3.2+Math.random()*.7),-.6-Math.random()*.8,1.7+Math.random()*.5));
    scene.add(group);
    friendlyEscorts.push({group,side,fire:.55+Math.random()*.45,life:escortState.timer,entry:1});
  }
  centerToast('FRIENDLY ESCORT','#9ffcff',860,'cyan');
  eventCrest('FRIENDLY ESCORT',{sub:'COVER FIRE ACTIVE',kind:'cyan',duration:980});
  pushRewardFeed('FRIENDLY ESCORT','',{color:'#9ffcff',icon:'!',emphasis:true,life:1.05,cueType:'incomingFire',priority:5});
  playRewardCue('incomingFire',{force:true,volume:.1});
  showTutorialHint('seenEscortTip','ESCORTS PROVIDE COVER FIRE');
}
function maybeStartFriendlyEscort(tuning,dt){
  if(!dopamineConfig.enableMiniEvents||escortState.active||player.lastStand)return;
  if(player.survival<32||player.survival<escortState.nextAt)return;
  if(!canStartMajorEvent('escort',5.5))return;
  const need=player.hp<38||repair.dangerRecent>0||tuning.relief>.35;
  const chance=(need ? .38 : .08)*(tuning.escortChance||1);
  if(Math.random()<chance*dt)spawnFriendlyEscort();
}
function escortShoot(escort){
  if(!enemies.length)return;
  let target=null,best=Infinity;
  for(const e of enemies){
    const d=e.group.position.distanceToSquared(escort.group.position);
    if(d<best){best=d;target=e;}
  }
  if(!target||countBullets(b=>b.source==='escort')>=perfCaps.escortBullets)return;
  const start=escort.group.position.clone().add(new THREE.Vector3(escort.side*.2,.05,-1.8));
  const dir=target.group.position.clone().sub(start).normalize();
  const mesh=createTracerMesh({color:0x9ffcff,radius:.032,glowMultiplier:5.5,glowOpacity:.28});
  alignTracerMesh(mesh,start.clone().addScaledVector(dir,-6.8),start,6.8);
  scene.add(mesh);
  addBullet({mesh,pos:start.clone(),vel:dir.multiplyScalar(86),life:.9,maxLife:.9,hostile:false,source:'escort',damage:.42,color:0x9ffcff,prevPos:start.clone(),tracerLength:6.8,trailT:0});
  muzzleFlash(start,0x9ffcff,.62);
}
function updateFriendlyEscorts(dt){
  if(!escortState.active&&!friendlyEscorts.length)return;
  if(!player.alive||player.lastStand){
    escortState.timer=0;
    if(player.lastStand){
      friendlyEscorts.splice(0).forEach(e=>scene.remove(e.group));
      clearEventHazardBullets();
      escortState.active=false;
      return;
    }
  }
  escortState.timer=Math.max(0,escortState.timer-dt);
  for(let i=friendlyEscorts.length-1;i>=0;i--){
    const escort=friendlyEscorts[i];
    escort.life-=dt;
    escort.entry=Math.max(0,(escort.entry||0)-dt);
    const exit=escortState.timer<=0?Math.min(1,1-escort.life/.75):0;
    const target=player.group.position.clone().add(new THREE.Vector3(escort.side*(3.4+Math.sin(player.survival*2+escort.side)*.18),-1.15,.95+exit*10));
    escort.group.position.lerp(target,1-Math.exp(-dt*5.5));
    escort.group.rotation.z=THREE.MathUtils.lerp(escort.group.rotation.z,-escort.side*.12,dt*5);
    escort.group.userData.prop.rotation.z+=48*dt;
    const ex=escort.group.userData.exhaust;
    if(ex){ex.scale.setScalar(.6+Math.random()*.35);ex.material.opacity=.42+Math.random()*.25;}
    escort.fire-=dt;
    if(escort.fire<=0&&escortState.timer>.65){
      escortShoot(escort);
      escort.fire=.9+Math.random()*.65;
    }
    if(escort.life<=0||escortState.timer<=0&&escort.group.position.z-player.group.position.z>8)removeFriendlyEscort(escort);
  }
  if(escortState.timer<=0&&!friendlyEscorts.length)escortState.active=false;
}
function clearMiniEvents(){
  flakBarrageState.active=false;
  flakBarrageState.timer=0;
  flakBarrageState.spawnTimer=0;
  flakBarrageState.shotsLeft=0;
  flakBarrageState.survived=true;
  flakBarrageState.nextAt=24;
  escortState.active=false;
  escortState.timer=0;
  escortState.nextAt=36;
  clearSupplyDrop();
  supplyDropState.nextAt=30;
  friendlyEscorts.splice(0).forEach(e=>scene.remove(e.group));
}
function clearEventHazardBullets(){
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    if(b.flak||b.source==='escort'){
      scene.remove(b.mesh);
      bullets.splice(i,1);
    }
  }
}
function createSupplyDropMesh(){
  const group=new THREE.Group();
  const crate=new THREE.Mesh(
    new THREE.BoxGeometry(.75,.55,.75),
    new THREE.MeshBasicMaterial({color:0xffd27a,transparent:true,opacity:.88,blending:THREE.AdditiveBlending,depthWrite:false})
  );
  const core=new THREE.Mesh(
    new THREE.BoxGeometry(.42,.32,.42),
    new THREE.MeshBasicMaterial({color:0x9ffcff,transparent:true,opacity:.72,blending:THREE.AdditiveBlending,depthWrite:false})
  );
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({
    map:makeRadialTexture('rgba(150,250,255,.9)','rgba(255,210,100,0)',96),
    color:0x9ffcff,transparent:true,opacity:.52,blending:THREE.AdditiveBlending,depthWrite:false
  }));
  glow.scale.set(3.4,3.4,1);
  group.add(glow,crate,core);
  return group;
}
function startSupplyDrop(){
  if(!dopamineConfig.enableMiniEvents||supplyDropState.active||!player.alive||player.lastStand||!canStartMajorEvent('supply',5.5))return;
  const group=createSupplyDropMesh();
  const side=Math.random()>.5?1:-1;
  const pos=new THREE.Vector3(
    THREE.MathUtils.clamp(player.group.position.x+side*(8+Math.random()*8),-22,22),
    THREE.MathUtils.clamp(player.group.position.y+(Math.random()-.5)*6,-8,12),
    -46-Math.random()*12
  );
  group.position.copy(pos);
  scene.add(group);
  supplyDropState.active=true;
  supplyDropState.nextAt=player.survival+36+Math.random()*9;
  supplyDropState.drop={group,pos,vel:player.group.position.clone().sub(pos).normalize().multiplyScalar(10+Math.random()*2),life:6.2,max:6.2,trail:.08,collected:false};
  supplyDropState.drop.vel.z=16+Math.random()*3;
  markMajorEvent('supply');
  centerToast('SUPPLY DROP','#fff1b8',820,'warm');
  eventCrest('SUPPLY DROP',{sub:'INTERCEPT FOR REPAIR BOOST',kind:'warm',duration:980});
  pushRewardFeed('SUPPLY DROP','',{color:'#fff1b8',icon:'!',emphasis:true,life:1.0,cueType:'incomingFire',priority:5});
}
function maybeStartSupplyDrop(tuning,dt){
  if(!dopamineConfig.enableMiniEvents||supplyDropState.active||player.lastStand)return;
  if(player.survival<25||player.survival<supplyDropState.nextAt)return;
  if(!canStartMajorEvent('supply',5.5))return;
  const need=player.hp<45||repair.dangerRecent>0||(repair.feedbackT>0&&repair.feedbackType==='interrupted')||tuning.relief>.25;
  const chance=(need ? .34 : .06)*(1+tuning.relief*.9);
  if(Math.random()<chance*dt)startSupplyDrop();
}
function collectSupplyDrop(){
  const drop=supplyDropState.drop;
  if(!drop||drop.collected)return;
  drop.collected=true;
  const heal=12+Math.floor(Math.random()*7);
  player.hp=Math.min(100,player.hp+heal);
  awardScore('repairScore',30);
  repair.feedbackT=Math.max(0,repair.feedbackT-.45);
  repair.dangerRecent=0;
  pushRewardFeed('SUPPLY CLAIMED','+30',{color:'#fff1b8',icon:'*',emphasis:true,life:1.08,cueType:'repair',priority:6});
  addCombo(1,drop.pos,'COMBO','#fff1b8',{feedValue:'+1',life:.72,icon:'*'});
  burstParticles(drop.pos,{color:0x9ffcff,count:12,speed:11,size:[.035,.1],life:[.16,.36],additive:true});
  burstParticles(drop.pos,{color:0xffd27a,count:10,speed:9,size:[.04,.12],life:[.18,.42],additive:true});
  player.cameraKick=Math.max(player.cameraKick||0,.13);
  audio.play('repair_good',.18,false);
  clearSupplyDrop();
}
function clearSupplyDrop(){
  if(supplyDropState.drop?.group)scene.remove(supplyDropState.drop.group);
  supplyDropState.active=false;
  supplyDropState.drop=null;
}
function updateSupplyDrop(dt){
  const drop=supplyDropState.drop;
  if(!drop)return;
  if(!player.alive||player.lastStand){clearSupplyDrop();return;}
  drop.life-=dt;
  drop.pos.addScaledVector(drop.vel,dt);
  drop.group.position.copy(drop.pos);
  drop.group.rotation.y+=dt*2.1;
  drop.group.rotation.z=Math.sin((drop.max-drop.life)*4)*.18;
  const k=THREE.MathUtils.clamp(drop.life/drop.max,0,1);
  drop.group.scale.setScalar(.85+.14*Math.sin((drop.max-drop.life)*8));
  drop.group.children.forEach(child=>{if(child.material)child.material.opacity=(child.type==='Sprite' ? .48 : .76)*k+.12;});
  drop.trail-=dt;
  if(drop.trail<=0){
    burstParticles(drop.pos.clone().add(new THREE.Vector3(0,0,.5)),{color:0xffd27a,count:1,speed:2,size:[.07,.13],life:[.22,.42],drag:.98,additive:true});
    drop.trail=.12;
  }
  if(drop.pos.distanceTo(player.group.position)<1.75){collectSupplyDrop();return;}
  for(const b of bullets){
    if(b.hostile||b.consumed||!b.prevPos||!b.pos)continue;
    const hit=distancePointToSegment(drop.pos,b.prevPos,b.pos);
    if(hit.distance<1.1){
      b.consumed=true;
      collectSupplyDrop();
      return;
    }
  }
  if(drop.life<=0||drop.pos.z>16||drop.pos.distanceTo(camera.position)>120)clearSupplyDrop();
}

function removeMineAt(index,detonate=false,reward=false){
  const m=mines[index];
  if(!m)return;
  if(detonate){
    burstParticles(m.pos,{color:0xff8a35,count:10,speed:10,size:[.05,.13],life:[.16,.34],additive:true});
    deathShockwave(m.pos,0xff7a3d,.55);
    playSpatialCue('explosion_small',m.pos,.2,false);
  }
  if(reward){
    pushRewardFeed('INTERCEPT','+15',{color:'#fff1b8',icon:'*',emphasis:false,life:.72,cueType:'intercept'});
    awardScore('specialScore',15);
    addCombo(1,m.pos,'COMBO','#fff1b8',{feedValue:'+1',life:.7,icon:'*'});
  }
  scene.remove(m.mesh);
  mines.splice(index,1);
}
function spawnMine(enemy){
  if(!dopamineConfig.enableBomber||!enemy||mines.length>=perfCaps.mines)return;
  const pos=enemy.group.position.clone().add(new THREE.Vector3((Math.random()-.5)*1.2,-.4,1.4));
  const mat=new THREE.MeshBasicMaterial({color:0xff6a2a,transparent:true,opacity:.86,blending:THREE.AdditiveBlending,depthWrite:false});
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(.42,14,10),mat);
  mesh.position.copy(pos);
  const glow=new THREE.PointLight(0xff5a24,2.4,7);
  mesh.add(glow);
  scene.add(mesh);
  const drift=player.group.position.clone().sub(pos).multiplyScalar(.055);
  drift.z=18+Math.random()*5;
  drift.x+=Math.sin(enemy.t)*2.2;
  drift.y+=Math.cos(enemy.t*.7)*.9;
  mines.push({mesh,pos,vel:drift,life:4.8,max:4.8,trail:0,damage:14,nearChecked:false});
}
function updateMines(dt){
  if(!player.alive)return;
  for(let i=mines.length-1;i>=0;i--){
    const m=mines[i];
    m.life-=dt;
    m.pos.addScaledVector(m.vel,dt);
    m.mesh.position.copy(m.pos);
    m.mesh.scale.setScalar(1+.08*Math.sin((m.max-m.life)*10));
    if(m.mesh.material)m.mesh.material.opacity=.45+.35*Math.max(0,m.life/m.max);
    m.trail-=dt;
    if(m.trail<=0){
      burstParticles(m.pos,{color:0x4a342b,count:1,speed:1.8,size:[.12,.22],life:[.28,.54],drag:.98,additive:false});
      m.trail=.12;
    }
    const d=m.pos.distanceTo(player.group.position);
    if(!m.nearChecked&&d>1.35&&d<2.55&&Math.abs(m.pos.z-player.group.position.z)<1.9){
      m.nearChecked=true;
      showNearMiss();
      if(repair.active)repair.dangerRecent=Math.max(repair.dangerRecent,.9);
    }
    if(d<1.35){
      removeMineAt(i,true,false);
      damagePlayer(m.damage);
      continue;
    }
    if(m.life<=0||m.pos.z>18||m.pos.distanceTo(camera.position)>120)removeMineAt(i,false,false);
  }
}

function burstParticles(pos, {
  color = 0xffb15f, count = 12, speed = 12, size = [0.04, 0.12],
  life = [0.25, 0.7], gravity = 0, drag = 0.96, additive = true
} = {}) {
  const room=Math.max(0,perfCaps.particles-particles.length);
  const n=Math.min(count,room);
  for (let i = 0; i < n; i++) {
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
  addVfx({mesh:fire,life:.08,max:.08,type:'flash',grow:2.4});
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
function perfectRepairBurst(){
  const origin=player.group.position.clone().add(new THREE.Vector3(0,.15,.25));
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({
    map:makeRadialTexture('rgba(180,255,255,1)','rgba(80,245,255,0)',128),
    transparent:true,opacity:.92,blending:THREE.AdditiveBlending,depthWrite:false
  }));
  halo.position.copy(origin);
  halo.scale.set(4.2,4.2,1);
  scene.add(halo);
  addVfx({mesh:halo,life:.22,max:.22,type:'flash',grow:6.2});
  const ring=new THREE.Mesh(
    new THREE.TorusGeometry(1.25,.035,8,72),
    new THREE.MeshBasicMaterial({color:0x9ffcff,transparent:true,opacity:.86,blending:THREE.AdditiveBlending,depthWrite:false})
  );
  ring.position.copy(origin);
  ring.rotation.x=Math.PI/2;
  scene.add(ring);
  addVfx({mesh:ring,life:.28,max:.28,type:'ring',grow:4.8});
  const l=new THREE.PointLight(0x9ffcff,10,18);
  l.position.copy(origin);
  scene.add(l);
  particles.push({mesh:l,vel:new THREE.Vector3(),life:.18,max:.18,light:true});
  burstParticles(origin,{color:0x9ffcff,count:26,speed:13,size:[0.03,.1],life:[.18,.44],gravity:0,drag:.93,additive:true});
}
function deathShockwave(pos,color=0xffd27a,scale=1){
  if(vfx.length>perfCaps.vfx-4)return;
  const ring=new THREE.Mesh(
    new THREE.TorusGeometry(1.15*scale,.025*scale,8,80),
    new THREE.MeshBasicMaterial({color,transparent:true,opacity:.72,blending:THREE.AdditiveBlending,depthWrite:false})
  );
  ring.position.copy(pos);
  ring.rotation.x=Math.PI/2;
  scene.add(ring);
  addVfx({mesh:ring,life:.2+.05*scale,max:.2+.05*scale,type:'ring',grow:7.4*scale});
}
function enemyDeathPayoff(pos,kind='normal',explosive=false){
  if(!dopamineConfig.enableExplosionUpgrade){
    explosion(pos,kind!=='normal'||explosive);
    deathShockwave(pos);
    return;
  }
  const heavy=kind==='bomber'||kind==='ace'||kind==='miniBoss';
  explosion(pos,heavy||explosive);
  deathShockwave(pos,heavy?0xfff1a8:0xffd27a,heavy?1.65:1);
  if(kind==='ace')deathShockwave(pos,0x9ffcff,1.45);
  if(kind==='miniBoss')deathShockwave(pos,0xff6a2a,2.05);
  burstParticles(pos,{color:0xfff1a8,count:heavy?16:9,speed:heavy?24:18,size:[.035,.09],life:[.14,.36],gravity:2,drag:.9,additive:true});
  if(kind==='ace')burstParticles(pos,{color:0x9ffcff,count:24,speed:18,size:[.03,.09],life:[.16,.38],additive:true});
  if(kind==='bomber')burstParticles(pos,{color:0xff7a3d,count:22,speed:17,size:[.05,.14],life:[.2,.52],additive:true});
  burstParticles(pos,{color:0x3a3f46,count:heavy?8:4,speed:heavy?8:5,size:[.16,.34],life:[.38,.82],drag:.98,additive:false});
  if(heavy){
    const token=runToken;
    setTimeout(()=>{
      if(token!==runToken||(!player.alive&&kind!=='miniBoss'))return;
      explosion(pos.clone().add(new THREE.Vector3((Math.random()-.5)*1.4,(Math.random()-.5)*.8,(Math.random()-.5)*1.4)),true);
      deathShockwave(pos,kind==='ace'?0x9ffcff:0xffa24d,1.2);
    },90+Math.random()*50);
  }
  if(kind==='miniBoss'){
    eventCrest('HEAVY DOWN',{sub:'+200 TARGET DESTROYED',kind:'danger',duration:1120});
    freezeTimer=Math.max(freezeTimer,.085);
    slowmo(.24,.48);
  }else if(kind==='ace'){
    flashScreen(.16,'rgba(150,250,255,1)');
    slowmo(.14,.54);
  }else if(kind==='bomber'){
    flashScreen(.14,'rgba(255,164,72,1)');
  }
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
  addVfx({ mesh: center, life: 0.07, max: 0.07, type: 'flash', grow: 3.8 });
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialTexture('rgba(255,250,190,1)', 'rgba(255,90,20,0)', 96),
    color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  const dist = pos.distanceTo(camera.position);
  const scale = THREE.MathUtils.clamp(3 + dist * 0.035, 3, 5.8);
  flash.position.copy(pos); flash.scale.set(scale, scale, 1); scene.add(flash);
  addVfx({ mesh: flash, life: 0.13, max: 0.13, type: 'flash', grow: 4.6 });
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
  addVfx({ mesh: flash, life: 0.2, max: 0.2, type: 'flash', grow: 7 * scale });
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
  playSpatialCue(big?'explosion_big':'explosion_small',pos,big?.55:.42);
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
function nextTierForCombo(c){
  const ascending=[...weaponTiers].reverse();
  return ascending.find(t=>t.combo>c)||null;
}
function comboTierProgress(c){
  const current=tierForCombo(c);
  const next=nextTierForCombo(c);
  if(!next)return {next:null,progress:1};
  const base=current?.combo ?? 0;
  return {next,progress:THREE.MathUtils.clamp((c-base)/(next.combo-base || 1),0,1)};
}
const unlockedWeaponTiersThisRun=new Set();
let eventCrestEl=null,eventCrestTimer=null,eventCrestTextEl=null,eventCrestIconEl=null,eventCrestSubEl=null;
const eventCrestPriority={
  'FINAL STAND':10,
  'WEAPON UNLOCK':9,
  'HEAVY DOWN':8,'HEAVY FIGHTER INBOUND':8,
  'PERFECT REPAIR':7,'CLUTCH SAVE':7,
  'FLAK BARRAGE':6,
  'FRIENDLY ESCORT':5,'SUPPLY DROP':5,
  'ACE APPROACHING':4,'BOMBER INBOUND':4,'ACE DOWN':4,'BOMBER DOWN':4
};
const eventCrestState={priority:0,queue:null,queueTimer:null};
function priorityForEventCrest(text,unlock=false){
  if(unlock)return eventCrestPriority['WEAPON UNLOCK'];
  for(const [key,priority] of Object.entries(eventCrestPriority)){
    if(text.includes(key))return priority;
  }
  return 2;
}
function ensureEventCrestElement(){
  if(!eventCrestEl){
    eventCrestEl=document.createElement('div');
    eventCrestEl.id='eventCrest';
    eventCrestIconEl=document.createElement('img');
    eventCrestIconEl.className='event-crest-icon';
    eventCrestIconEl.alt='';
    eventCrestIconEl.decoding='async';
    eventCrestIconEl.onerror=()=>{eventCrestIconEl.hidden=true;eventCrestEl?.classList.add('fallback');};
    eventCrestTextEl=document.createElement('div');
    eventCrestTextEl.className='event-crest-text';
    eventCrestSubEl=document.createElement('div');
    eventCrestSubEl.className='event-crest-sub';
    eventCrestEl.append(eventCrestIconEl,eventCrestTextEl,eventCrestSubEl);
    document.body.appendChild(eventCrestEl);
  }
}
function showEventCrestNow(text,{sub='',kind='warm',duration=1050,unlock=false,priority=2}={}){
  ensureEventCrestElement();
  if(eventCrestTimer)clearTimeout(eventCrestTimer);
  if(eventCrestState.queueTimer){clearTimeout(eventCrestState.queueTimer);eventCrestState.queueTimer=null;}
  eventCrestState.priority=priority;
  eventCrestEl.className=`show ${kind}${unlock?' unlock':''}`;
  eventCrestTextEl.textContent=text;
  eventCrestSubEl.textContent=sub;
  eventCrestSubEl.hidden=!sub;
  eventCrestIconEl.hidden=false;
  eventCrestIconEl.src='/ui/rewards/unlock-crest.png';
  eventCrestTimer=setTimeout(()=>{
    eventCrestTimer=null;
    eventCrestState.priority=0;
    if(eventCrestEl)eventCrestEl.classList.remove('show','unlock','cyan','warm','danger','fallback');
    if(eventCrestState.queue){
      const queued=eventCrestState.queue;
      eventCrestState.queue=null;
      eventCrestState.queueTimer=setTimeout(()=>showEventCrestNow(queued.text,queued.options),140);
    }
  },duration);
}
function eventCrest(text,{sub='',kind='warm',duration=1050,unlock=false}={}){
  const priority=priorityForEventCrest(text,unlock);
  if(eventCrestState.priority>0&&priority<eventCrestState.priority){
    eventCrestState.queue={text,options:{sub,kind,duration,unlock,priority}};
    if(!eventCrestState.queueTimer){
      const token=runToken;
      eventCrestState.queueTimer=setTimeout(()=>{
        eventCrestState.queueTimer=null;
        if(token!==runToken||!eventCrestState.queue||eventCrestState.priority>0)return;
        const queued=eventCrestState.queue;
        eventCrestState.queue=null;
        showEventCrestNow(queued.text,queued.options);
      },760+Math.random()*220);
    }
    return;
  }
  showEventCrestNow(text,{sub,kind,duration,unlock,priority});
}
function clearEventCrest(){
  if(eventCrestTimer)clearTimeout(eventCrestTimer);
  eventCrestTimer=null;
  if(eventCrestState.queueTimer)clearTimeout(eventCrestState.queueTimer);
  eventCrestState.queueTimer=null;
  eventCrestState.queue=null;
  eventCrestState.priority=0;
  if(eventCrestEl)eventCrestEl.classList.remove('show','unlock','cyan','warm','danger','fallback');
}
let centerToastEl=null,centerToastTimer=null,centerToastTextEl=null,centerToastCrestEl=null,centerToastDividerEl=null;
function centerToast(text,color='#ffd27a',duration=760,kind='warm',options={}){
  if(!centerToastEl){
    centerToastEl=document.createElement('div');
    centerToastEl.id='centerToast';
    centerToastCrestEl=document.createElement('img');
    centerToastCrestEl.className='center-toast-crest';
    centerToastCrestEl.alt='';
    centerToastCrestEl.decoding='async';
    centerToastCrestEl.onerror=()=>{centerToastCrestEl.hidden=true;centerToastCrestEl.dataset.failed='true';};
    centerToastTextEl=document.createElement('span');
    centerToastTextEl.className='center-toast-text';
    centerToastDividerEl=document.createElement('img');
    centerToastDividerEl.className='center-toast-divider';
    centerToastDividerEl.alt='';
    centerToastDividerEl.decoding='async';
    centerToastDividerEl.onerror=()=>{centerToastDividerEl.hidden=true;centerToastDividerEl.dataset.failed='true';};
    centerToastEl.append(centerToastCrestEl,centerToastTextEl,centerToastDividerEl);
    document.body.appendChild(centerToastEl);
  }
  if(centerToastTimer)clearTimeout(centerToastTimer);
  const showUnlock=!!options.unlock;
  centerToastEl.className=`show ${kind}${showUnlock?' unlock':''}`;
  centerToastTextEl.textContent=text;
  centerToastEl.style.color=color;
  centerToastCrestEl.hidden=!showUnlock||centerToastCrestEl.dataset.failed==='true';
  centerToastDividerEl.hidden=!showUnlock||centerToastDividerEl.dataset.failed==='true';
  if(showUnlock){
    if(centerToastCrestEl.dataset.failed!=='true')centerToastCrestEl.src='/ui/rewards/unlock-crest.png';
    if(centerToastDividerEl.dataset.failed!=='true')centerToastDividerEl.src='/ui/rewards/unlock-divider.png';
  }
  centerToastTimer=setTimeout(()=>{
    if(centerToastEl){
      centerToastEl.classList.remove('show','unlock');
      if(centerToastCrestEl)centerToastCrestEl.hidden=true;
      if(centerToastDividerEl)centerToastDividerEl.hidden=true;
    }
    centerToastTimer=null;
  },duration);
}
function clearCenterToast(){
  if(centerToastTimer)clearTimeout(centerToastTimer);
  centerToastTimer=null;
  if(centerToastEl)centerToastEl.classList.remove('show','unlock');
  if(centerToastCrestEl)centerToastCrestEl.hidden=true;
  if(centerToastDividerEl)centerToastDividerEl.hidden=true;
}
function pulseWeaponPanel(tier){
  if(!ui.weapon)return;
  ui.weapon.classList.remove('weapon-pulse','cyan');
  void ui.weapon.offsetWidth;
  if(tier?.id==='overdrive'||tier?.color===0x66f7ff)ui.weapon.classList.add('cyan');
  ui.weapon.classList.add('weapon-pulse');
  setTimeout(()=>ui.weapon?.classList.remove('weapon-pulse','cyan'),420);
}
function setWeaponFromCombo(combo){
  const tier=tierForCombo(combo);
  const changed=tier.id!==player.weapon;
  if(changed){
    const special=tier.combo>=8||tier.id==='overdrive';
    const celebrate=tier.combo>0&&player.alive&&!unlockedWeaponTiersThisRun.has(tier.id);
    if(celebrate){
      unlockedWeaponTiersThisRun.add(tier.id);
      unlockProgressState.lastUnlockAt=performance.now()/1000;
      flashScreen(special?.2:.16,special?'rgba(130,245,255,1)':'rgba(255,224,130,1)');
      player.cameraKick=Math.max(player.cameraKick||0,special?.38:.3);
      freezeTimer=Math.max(freezeTimer,dopamineConfig.enableWeaponUnlockCrest?(special?.08:.065):(special?.065:.055));
      audio.play('ui_click',.12);
      pulseWeaponPanel(tier);
      playRewardCue('unlock',{force:true});
      pushRewardFeed('WEAPON UNLOCK',tier.name.toUpperCase(),{color:special?'#9ffcff':'#fff1b8',emphasis:true,life:1.18,forceCue:false});
      if(dopamineConfig.enableWeaponUnlockCrest){
        eventCrest(`${tier.name.toUpperCase()} UNLOCKED`,{sub:'WEAPON SYSTEM ONLINE',kind:special?'cyan':'warm',duration:1180,unlock:true});
        slowmo(.16,.62);
        flashScreen(.18,special?'rgba(130,245,255,1)':'rgba(255,224,130,1)');
      }else centerToast(`${tier.name.toUpperCase()} UNLOCKED`,special?'#9ffcff':'#ffd27a',780,special?'cyan':'warm',{unlock:true});
    }else if(tier.combo>0&&player.alive){
      pulseWeaponPanel(tier);
    }
  }
  player.weapon=tier.id;player.weaponTimer=tier.duration;
  if(ui.weaponName)ui.weaponName.textContent=tier.name;
  if(ui.weaponRule)ui.weaponRule.textContent=tier.rule;
}
function currentTier(){return weaponTiers.find(t=>t.id===player.weapon)||weaponTiers.at(-1);}
function maybePushUnlockProgress(){
  if(!player.alive||player.combo<=0)return;
  const now=performance.now()/1000;
  if(now-unlockProgressState.lastAt<1.35||now-unlockProgressState.lastUnlockAt<1.25)return;
  const progress=comboTierProgress(player.combo);
  if(!progress.next||progress.progress<.55)return;
  const needed=progress.next.combo-player.combo;
  let label=`${Math.round(progress.progress*100)}% TO ${progress.next.name.toUpperCase().split(' ')[0]}`;
  if(needed<=1)label=`ONE MORE FOR ${progress.next.name.toUpperCase().split(' ')[0]}`;
  if(progress.next.id==='overdrive'&&progress.progress>=.72)label='OVERDRIVE NEAR';
  unlockProgressState.lastAt=now;
  pushRewardFeed(label,'',{color:'#fff1b8',icon:'*',life:.78,priority:3,tier:'minor',cue:false,variant:false,streak:false});
}

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
  addVfx({ mesh: trail, life: 0.11, max: 0.11, type: 'beamTrail' });
}
function muzzleFlash(pos, color = 0xffd27a, size = 1.55) {
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialTexture('rgba(255,235,150,1)', 'rgba(255,120,30,0)', 64),
    color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  flash.position.copy(pos); flash.scale.set(size, size, 1); scene.add(flash);
  addVfx({ mesh: flash, life: 0.09, max: 0.09, type: 'flash', grow: 3.2 });
}
function shootOne(offX,angle=0,color=currentTier().color,explosive=false){
  const tracerColor = explosive ? 0xff8a35 : 0xffd36a;
  const overdrive = player.weapon === 'overdrive';
  const flowBoost=1+feedbackState.flow*.18;
  const m = createTracerMesh({
    color: tracerColor,
    radius: (overdrive ? 0.068 : 0.045)*flowBoost,
    glowMultiplier: 6.3,
    glowOpacity: (overdrive ? 0.4 : 0.34)+feedbackState.flow*.08
  });
  const start = player.group.position.clone().add(new THREE.Vector3(offX,.12,-2.75));
  const dir=aimedDirectionFrom(start,angle);
  const tracerLength = overdrive ? 10.5 : 7;
  alignTracerMesh(m, start.clone().addScaledVector(dir, -tracerLength), start, tracerLength);
  scene.add(m);
  addBullet({mesh:m,pos:start.clone(),vel:dir.multiplyScalar(overdrive ? 105 : 98),life:1,maxLife:1,hostile:false,explosive,color:tracerColor,prevPos:start.clone(),tracerLength,trailT:0});
  muzzleFlash(start, color, (explosive ? 1.15 : overdrive ? 1.1 : 0.92)*flowBoost);
  player.shake = Math.max(player.shake, 0.045);
  player.cameraKick = Math.max(player.cameraKick || 0, 0.13+feedbackState.flow*.035);
}
function fireWeapon(){
  hideStartHint();
  const tier=currentTier();
  if(player.weapon==='dual'){shootOne(-.28);shootOne(.28);}
  else if(player.weapon==='spread'){[-.18,-.09,0,.09,.18].forEach((a,i)=>shootOne(i%2?-0.28:0.28,a));}
  else if(player.weapon==='explosive'){shootOne(nextGunSide * .28,0,tier.color,true);nextGunSide*=-1;}
  else if(player.weapon==='overdrive'){[-.22,-.11,0,.11,.22].forEach((a,i)=>shootOne((i%2?-0.28:0.28)+(Math.random()-.5)*.08,a,tier.color,true));}
  else {shootOne(nextGunSide * .28,0,tier.color,false);nextGunSide*=-1;}
  pulseReticleFire();
  const now=performance.now()/1000;
  if(player.weapon!=='overdrive'&&now-audioTimers.shot>.095){
    audio.play('mg_burst_01',.22,true,1+(Math.random()-.5)*.08);
    audioTimers.shot=now;
  }
}

// UI refs
const ui={};
['hp','score','time','kills','nearCount','maxCombo','enemyCount','warn','nearMiss',
 'status','repairRing','repairIcon','flash','vignette','weaponName','weaponRule',
 'weapon','comboBadge','comboBadgeValue','comboBadgeLabel','comboCharge','rewardFeed',
 'hullBar','repairLabel','repairCompact','radarBlips','controls',
 'lastStand','resultsTitle','finalScore','finalTime','finalKills','finalCombo','finalNear',
 'resultLine','resultsBreakdown','resultsFooterHook','recordBadges','restart']
.forEach(id=>ui[id]=document.getElementById(id));
ui.box=document.getElementById('repairBox');
ui.reticle=document.getElementById('aimReticle');
ui.hitMarker=document.getElementById('hitMarker');
ui.overcharge=document.createElement('div');
ui.overcharge.id='overchargeIndicator';
ui.overcharge.textContent='OVERCHARGE';
document.getElementById('hud')?.appendChild(ui.overcharge);
ui.flow=document.createElement('div');
ui.flow.id='flowIndicator';
ui.flow.textContent='FLOW';
document.getElementById('hud')?.appendChild(ui.flow);
ui.finalStandCountdown=document.createElement('div');
ui.finalStandCountdown.id='finalStandCountdown';
ui.finalStandCountdown.textContent='FINAL STAND 3.0';
document.getElementById('hud')?.appendChild(ui.finalStandCountdown);

const rewardFeedItems=[];
const maxRewardFeedItems=3;
const radarState={accum:0,interval:.1,nodes:[]};
let startHintTimer=null;
function syncCombatCluster(){
  const hp=THREE.MathUtils.clamp(player.hp,0,100);
  if(ui.hullBar){
    ui.hullBar.style.width=hp+'%';
    if(hp<30){
      ui.hullBar.style.background='linear-gradient(90deg,rgba(255,75,47,.95),rgba(255,190,145,.86))';
      ui.hullBar.style.boxShadow='0 0 7px rgba(255,75,47,.5)';
    }else if(hp<55){
      ui.hullBar.style.background='linear-gradient(90deg,rgba(255,201,92,.96),rgba(255,238,176,.86))';
      ui.hullBar.style.boxShadow='0 0 6px rgba(255,201,92,.44)';
    }else{
      ui.hullBar.style.background='linear-gradient(90deg,rgba(73,229,242,.94),rgba(177,255,255,.86))';
      ui.hullBar.style.boxShadow='0 0 5px rgba(70,242,255,.38)';
    }
  }
  if(ui.repairLabel&&ui.repairCompact){
    if(repair.active){
      ui.repairLabel.textContent='REPAIRING';
      ui.repairCompact.textContent='';
      ui.repairCompact.style.display='none';
      ui.repairCompact.classList.add('text-state');
    }else if(repair.feedbackT>0&&repair.feedbackType==='interrupted'){
      ui.repairLabel.textContent='COOLDOWN';
      ui.repairCompact.textContent='';
      ui.repairCompact.style.display='none';
      ui.repairCompact.classList.add('text-state');
    }else{
      ui.repairLabel.textContent='REPAIR';
      ui.repairCompact.textContent='R';
      ui.repairCompact.style.display='';
      ui.repairCompact.classList.remove('text-state');
    }
  }
}
function updateThreatRadar(dt){
  if(!ui.radarBlips)return;
  radarState.accum+=dt;
  if(radarState.accum<radarState.interval)return;
  radarState.accum=0;
  const maxBlips=Math.min(enemies.length,8);
  while(radarState.nodes.length<maxBlips){
    const node=document.createElement('span');
    node.className='radar-blip';
    ui.radarBlips.appendChild(node);
    radarState.nodes.push(node);
  }
  for(let i=0;i<radarState.nodes.length;i++){
    const node=radarState.nodes[i];
    const e=enemies[i];
    if(i>=maxBlips||!e){
      node.style.display='none';
      continue;
    }
    const relX=e.group.position.x-player.group.position.x;
    const relZ=e.group.position.z-player.group.position.z;
    const range=82;
    const radius=40;
    let x=relX/range*radius;
    let y=relZ/range*radius;
    const mag=Math.hypot(x,y);
    if(mag>radius-5){
      const s=(radius-5)/mag;
      x*=s;y*=s;
    }
    const dist=e.group.position.distanceTo(player.group.position);
    node.style.display='block';
    node.style.left=`${46+x}px`;
    node.style.top=`${46+y}px`;
    node.style.opacity=String(THREE.MathUtils.clamp(1-dist/105,.62,1));
    node.classList.toggle('danger',dist<28);
    node.classList.toggle('warning',(e.warningTimer||0)>0);
    node.classList.toggle('ace',e.kind==='ace');
    node.classList.toggle('bomber',e.kind==='bomber');
    node.classList.toggle('heavy',e.kind==='miniBoss');
  }
}
function hideStartHint(){
  if(startHintTimer)clearTimeout(startHintTimer);
  startHintTimer=null;
  if(!ui.controls)return;
  ui.controls.classList.add('hidden');
  ui.controls.classList.add('gone');
}
function restartStartHint(){
  if(!ui.controls)return;
  if(startHintTimer)clearTimeout(startHintTimer);
  ui.controls.classList.remove('hidden','gone');
  ui.controls.style.animation='none';
  void ui.controls.offsetWidth;
  ui.controls.style.animation='';
  startHintTimer=setTimeout(hideStartHint,4000);
}
ui.controls?.addEventListener('animationend',e=>{
  if(e.animationName==='startHintFade')hideStartHint();
});
const highPriorityRewardLabels=new Set(['KILL','COMBO','HIT CHAIN','NEAR MISS','PERFECT REPAIR','CLUTCH SAVE','INTERCEPT','WEAPON UNLOCK','BOMBER DOWN','ACE DOWN','HEAVY DOWN','FINAL STAND','FINAL STAND KILL','OVERCHARGE','BARRAGE EVADED','SUPPLY CLAIMED','SUPPLY DROP','FRIENDLY ESCORT','FLAK BARRAGE','ESCORT ASSIST','NEW BEST COMBO','NEW KILL RECORD','FASTEST FIRST KILL','PERFECT DODGE','ACE REFLEX','CLUTCH THREAD','MIRACLE REPAIR','SKY ACE BONUS']);
const rewardPriorityTable={
  'FINAL STAND':10,'FINAL STAND KILL':10,
  'WEAPON UNLOCK':9,
  'HEAVY DOWN':8,'HEAVY FIGHTER INBOUND':8,
  'PERFECT REPAIR':7,'CLUTCH SAVE':7,'OVERCHARGE':7,
  'PERFECT DODGE':9,'ACE REFLEX':9,'CLUTCH THREAD':9,'MIRACLE REPAIR':9,'SKY ACE BONUS':9,
  'BARRAGE EVADED':6,'SUPPLY CLAIMED':6,'ACE DOWN':6,'BOMBER DOWN':6,'NEW BEST COMBO':6,'NEW KILL RECORD':6,'FASTEST FIRST KILL':6,
  'KILL':5,'NEAR MISS':5,'FLAK BARRAGE':5,'FRIENDLY ESCORT':5,'SUPPLY DROP':5,'ACE APPROACHING':5,'BOMBER INBOUND':5,
  'COMBO':4,'HIT CHAIN':4,
  'INTERCEPT':3,'LOW SKIM':3,'TERRAIN SKIM':3,'ESCORT ASSIST':3,
  'ENEMY HIT':1
};
const rewardCueByLabel={
  'ENEMY HIT':'hit',
  'HIT CHAIN':'chain',
  'KILL':'kill',
  'COMBO':'combo',
  'NEAR MISS':'nearMiss',
  'INTERCEPT':'intercept',
  'GOOD REPAIR':'repair',
  'PERFECT REPAIR':'perfectRepair',
  'REPAIR INTERRUPTED':'comboBroken',
  'WEAPON UNLOCK':'unlock',
  'CLUTCH SAVE':'perfectRepair',
  'BOMBER DOWN':'kill',
  'ACE DOWN':'kill',
  'HEAVY DOWN':'kill',
  'FINAL STAND':'unlock',
  'FINAL STAND KILL':'kill',
  'OVERCHARGE':'perfectRepair',
  'LOW SKIM':'nearMiss',
  'TERRAIN SKIM':'nearMiss',
  'BARRAGE EVADED':'nearMiss',
  'FLAK BARRAGE':'incomingFire',
  'FRIENDLY ESCORT':'incomingFire',
  'ESCORT ASSIST':'kill',
  'SUPPLY DROP':'incomingFire',
  'SUPPLY CLAIMED':'repair',
  'NEW BEST COMBO':'combo',
  'NEW KILL RECORD':'combo',
  'FASTEST FIRST KILL':'combo',
  'PERFECT DODGE':'unlock',
  'ACE REFLEX':'unlock',
  'CLUTCH THREAD':'unlock',
  'MIRACLE REPAIR':'perfectRepair',
  'SKY ACE BONUS':'unlock'
};
const rewardIconAssets={
  'ENEMY HIT':'/ui/rewards/enemy-hit.png',
  'HIT CHAIN':'/ui/rewards/combo.png',
  'COMBO':'/ui/rewards/combo.png',
  'KILL':'/ui/rewards/kill.png',
  'NEAR MISS':'/ui/rewards/near-miss.png',
  'INTERCEPT':'/ui/rewards/enemy-hit.png',
  'GOOD REPAIR':'/ui/rewards/repair.png',
  'PERFECT REPAIR':'/ui/rewards/repair.png',
  'REPAIR INTERRUPTED':'/ui/rewards/repair.png',
  'WEAPON UNLOCK':'/ui/rewards/unlock-crest.png',
  'BOMBER DOWN':'/ui/rewards/kill.png',
  'ACE DOWN':'/ui/rewards/kill.png',
  'HEAVY DOWN':'/ui/rewards/kill.png',
  'FINAL STAND':'/ui/rewards/unlock-crest.png',
  'FINAL STAND KILL':'/ui/rewards/kill.png',
  'OVERCHARGE':'/ui/rewards/repair.png',
  'LOW SKIM':'/ui/rewards/near-miss.png',
  'TERRAIN SKIM':'/ui/rewards/near-miss.png',
  'BARRAGE EVADED':'/ui/rewards/near-miss.png',
  'FLAK BARRAGE':'/ui/rewards/unlock-crest.png',
  'FRIENDLY ESCORT':'/ui/rewards/unlock-crest.png',
  'ESCORT ASSIST':'/ui/rewards/kill.png',
  'SUPPLY DROP':'/ui/rewards/repair.png',
  'SUPPLY CLAIMED':'/ui/rewards/repair.png',
  'NEW BEST COMBO':'/ui/rewards/unlock-crest.png',
  'NEW KILL RECORD':'/ui/rewards/unlock-crest.png',
  'FASTEST FIRST KILL':'/ui/rewards/unlock-crest.png',
  'PERFECT DODGE':'/ui/rewards/unlock-crest.png',
  'ACE REFLEX':'/ui/rewards/unlock-crest.png',
  'CLUTCH THREAD':'/ui/rewards/unlock-crest.png',
  'MIRACLE REPAIR':'/ui/rewards/repair.png',
  'SKY ACE BONUS':'/ui/rewards/unlock-crest.png'
};
const rewardIconFallbacks={
  'HIT CHAIN':'✦',
  'COMBO':'✦',
  'KILL':'✦',
  'NEAR MISS':'✦',
  'INTERCEPT':'✦',
  'PERFECT REPAIR':'✦',
  'REPAIR INTERRUPTED':'!',
  'LOW SKIM':'*',
  'TERRAIN SKIM':'*',
  'SUPPLY DROP':'!',
  'SUPPLY CLAIMED':'*'
};
const enemyHitFeedState={pending:0,timer:null,lastShown:0,windowMs:320};
const rewardFeedPacingState={lastHighAt:0,timers:[]};
const rewardVariantState={};
const rewardStreakState={};
const rewardCountUpTimers=new Set();
const jackpotState={cooldown:4,lastAt:-99};
const unlockProgressState={lastAt:0,lastUnlockAt:-99};
const rewardAudioState={lastAt:0,lastTier:0};
const rewardVariantGroups={
  nearMiss:{labels:['NEAR MISS','THREAD THE NEEDLE','ACE REFLEX','DEATH DODGER','GHOST DODGE'],window:3.6},
  kill:{labels:['KILL','CLEAN SHOT','TARGET DOWN','ACE HIT','SKY KILL'],window:3.4},
  intercept:{labels:['INTERCEPT','BULLET CUT','THREAT DENIED','CLEAN DEFLECT'],window:3.4},
  skim:{labels:['LOW SKIM','TERRAIN SKIM','GROUND RUSH','DANGER LOW'],window:3.5},
  perfectRepair:{labels:['PERFECT REPAIR','FIELD MIRACLE','CLUTCH FIX','ENGINE SAVED'],window:3.8}
};
const rewardLabelType={
  'NEAR MISS':'nearMiss',
  'KILL':'kill',
  'INTERCEPT':'intercept',
  'LOW SKIM':'skim',
  'TERRAIN SKIM':'skim',
  'PERFECT REPAIR':'perfectRepair'
};
const rewardTierTable={
  'ENEMY HIT':'minor','LOW SKIM':'minor','TERRAIN SKIM':'minor','INTERCEPT':'minor',
  'KILL':'medium','NEAR MISS':'medium','HIT CHAIN':'medium','COMBO':'medium','ESCORT ASSIST':'medium',
  'PERFECT REPAIR':'major','CLUTCH SAVE':'major','ACE DOWN':'major','BOMBER DOWN':'major','BARRAGE EVADED':'major','SUPPLY CLAIMED':'major','OVERCHARGE':'major',
  'WEAPON UNLOCK':'legendary','HEAVY DOWN':'legendary','FINAL STAND':'legendary','FINAL STAND KILL':'legendary',
  'NEW BEST COMBO':'legendary','NEW KILL RECORD':'legendary','FASTEST FIRST KILL':'legendary',
  'PERFECT DODGE':'legendary','ACE REFLEX':'legendary','CLUTCH THREAD':'legendary','MIRACLE REPAIR':'legendary','SKY ACE BONUS':'legendary'
};
const rewardTierRank={minor:1,medium:2,major:3,legendary:4};
function formatRewardValue(value){
  if(value===undefined||value===null||value==='')return '';
  if(typeof value==='number')return `${value>=0?'+':''}${value}`;
  return String(value);
}
function canonicalRewardLabel(label,options={}){
  return options.canonicalLabel||label;
}
function rewardTypeFor(label,options={}){
  return options.rewardType||rewardLabelType[canonicalRewardLabel(label,options)]||null;
}
function rewardTierFor(label,options={},priority=1){
  if(options.tier)return options.tier;
  const canonical=canonicalRewardLabel(label,options);
  if(rewardTierTable[canonical])return rewardTierTable[canonical];
  if(priority>=9)return 'legendary';
  if(priority>=6)return 'major';
  if(priority>=4)return 'medium';
  return 'minor';
}
function prepareRewardPresentation(label,value,options={}){
  const canonical=canonicalRewardLabel(label,options);
  const type=rewardTypeFor(label,options);
  let displayLabel=options.displayLabel||label;
  let displayValue=value;
  let streakCount=0;
  const now=performance.now()/1000;
  if(type&&rewardVariantGroups[type]&&options.variant!==false){
    const group=rewardVariantGroups[type];
    const state=rewardVariantState[type]||{lastAt:-99,count:0};
    state.count=now-state.lastAt<=group.window?state.count+1:1;
    state.lastAt=now;
    rewardVariantState[type]=state;
    if(state.count>1)displayLabel=group.labels[Math.min(group.labels.length-1,state.count-1)];
  }
  if(type&&type!=='enemyHit'&&options.streak!==false){
    const state=rewardStreakState[type]||{lastAt:-99,count:0};
    state.count=now-state.lastAt<=3.8?state.count+1:1;
    state.lastAt=now;
    rewardStreakState[type]=state;
    streakCount=state.count;
    if(streakCount>1&&displayValue!==undefined&&displayValue!==null&&displayValue!=='')displayValue=`${formatRewardValue(displayValue)} x${Math.min(9,streakCount)}`;
  }
  return {canonical,type,displayLabel,displayValue,streakCount};
}
function rewardPriorityFor(label,options={}){
  const canonical=canonicalRewardLabel(label,options);
  const base=Number.isFinite(rewardPriorityTable[canonical])?rewardPriorityTable[canonical]:(options.emphasis?2:1);
  return Number.isFinite(options.priority)?Math.max(base,options.priority):base;
}
function rewardLifeFor(label,options={},priority=1){
  const requested=options.life ?? options.duration;
  const tier=rewardTierFor(label,options,priority);
  const minLife=tier==='legendary'?1.45:tier==='major'?1.25:tier==='medium'?1.02:label==='ENEMY HIT'?.55:.72;
  const preferred=tier==='legendary'?1.72:tier==='major'?1.42:tier==='medium'?1.16:label==='ENEMY HIT'?.62:.82;
  return Math.max(requested ?? preferred,minLife);
}
function removeRewardFeedItem(item){
  if(item.timer)clearTimeout(item.timer);
  if(item.countCancel)item.countCancel();
  item.el?.remove();
  const idx=rewardFeedItems.indexOf(item);
  if(idx>=0)rewardFeedItems.splice(idx,1);
}
function makeRoomForReward(priority){
  if(rewardFeedItems.length<maxRewardFeedItems)return true;
  const now=performance.now();
  let lowestIdx=-1;
  let lowestPriority=Infinity;
  for(let i=0;i<rewardFeedItems.length;i++){
    const itemPriority=rewardFeedItems[i]?.priority ?? 1;
    const age=(now-(rewardFeedItems[i]?.createdAt ?? 0))/1000;
    if(itemPriority>=6&&age<.86&&priority<=itemPriority)continue;
    if(itemPriority<lowestPriority){
      lowestPriority=itemPriority;
      lowestIdx=i;
    }
  }
  if(lowestIdx<0)return false;
  if(priority<=lowestPriority&&lowestPriority>=5)return false;
  if(priority<lowestPriority)return false;
  removeRewardFeedItem(rewardFeedItems[lowestIdx]);
  return true;
}
function clearRewardFeedPacing(){
  rewardFeedPacingState.timers.splice(0).forEach(id=>clearTimeout(id));
  rewardFeedPacingState.lastHighAt=0;
  rewardCountUpTimers.forEach(id=>cancelAnimationFrame(id));
  rewardCountUpTimers.clear();
  rewardAudioState.lastAt=0;
  rewardAudioState.lastTier=0;
}
function resetRewardEmotionState(){
  for(const key of Object.keys(rewardVariantState))delete rewardVariantState[key];
  for(const key of Object.keys(rewardStreakState))delete rewardStreakState[key];
  jackpotState.cooldown=4;
  jackpotState.lastAt=-99;
  unlockProgressState.lastAt=0;
  unlockProgressState.lastUnlockAt=-99;
  clearRewardFeedPacing();
}
function shouldCountUpReward(label,value,tier){
  const canonical=canonicalRewardLabel(label,{});
  if(!['major','legendary'].includes(tier)&&!['KILL','ACE DOWN','BOMBER DOWN'].includes(canonical))return false;
  return typeof value==='string'&&/^\+\d+/.test(value);
}
function animateRewardValue(el,finalValue){
  const match=String(finalValue).match(/^([+-])(\d+)(.*)$/);
  if(!match){el.textContent=formatRewardValue(finalValue);return null;}
  const sign=match[1],target=Number(match[2]),suffix=match[3]||'';
  const start=performance.now();
  const duration=210+Math.random()*50;
  let frameId=null,stopped=false;
  function step(now){
    if(frameId!==null)rewardCountUpTimers.delete(frameId);
    if(stopped)return;
    const t=THREE.MathUtils.clamp((now-start)/duration,0,1);
    const eased=1-Math.pow(1-t,3);
    el.textContent=`${sign}${Math.round(target*eased)}${suffix}`;
    if(t<1){
      frameId=requestAnimationFrame(step);
      rewardCountUpTimers.add(frameId);
    }else{
      el.textContent=`${sign}${target}${suffix}`;
      frameId=null;
    }
  }
  frameId=requestAnimationFrame(step);
  rewardCountUpTimers.add(frameId);
  return ()=>{stopped=true;if(frameId!==null){cancelAnimationFrame(frameId);rewardCountUpTimers.delete(frameId);frameId=null;}};
}
function playTieredRewardCue(cueType,tier,options={}){
  const rank=rewardTierRank[tier]||1;
  const now=performance.now()/1000;
  if(now-rewardAudioState.lastAt<.2&&rank<=rewardAudioState.lastTier)return false;
  rewardAudioState.lastAt=now;
  rewardAudioState.lastTier=rank;
  const cueOptions={force:rank>=3||options.forceCue,volume:options.cueVolume};
  if(rank>=3){cueOptions.duck=true;cueOptions.duckAmount=rank>=4?.4:.28;cueOptions.duckTime=rank>=4?.42:.3;}
  return playRewardCue(cueType,cueOptions);
}
function pushRewardFeed(label,value,options={}){
  if(!ui.rewardFeed||!label)return;
  const prepared=prepareRewardPresentation(label,value,options);
  const canonical=prepared.canonical;
  const priority=rewardPriorityFor(label,options);
  const tier=rewardTierFor(canonical,options,priority);
  const now=performance.now();
  if(priority>=5&&!options._paced){
    const wait=Math.max(0,145-(now-rewardFeedPacingState.lastHighAt));
    rewardFeedPacingState.lastHighAt=now+wait;
    if(wait>0){
      const token=runToken;
      const timer=setTimeout(()=>{
        rewardFeedPacingState.timers=rewardFeedPacingState.timers.filter(id=>id!==timer);
        if(token===runToken)pushRewardFeed(label,value,{...options,_paced:true});
      },wait);
      rewardFeedPacingState.timers.push(timer);
      return;
    }
  }
  if(!makeRoomForReward(priority))return;
  directorState.lastRewardAt=performance.now()/1000;
  directorState.lullTimer=0;
  const life=rewardLifeFor(canonical,options,priority);
  const line=document.createElement('div');
  line.className=`reward-line tier-${tier}${options.emphasis||tier==='major'||tier==='legendary'?' emphasis':''}${prepared.streakCount>1?' streak':''}${options.colorClass?' '+options.colorClass:''}`;
  if(prepared.streakCount>1)line.style.setProperty('--streak-glow',String(Math.min(1,.25+prepared.streakCount*.14)));
  if(options.color)line.style.color=options.color;
  if(options.color==='#9ffcff'||options.color==='#6ef7ff')line.classList.add('cyan');
  line.style.setProperty('--reward-life',`${life}s`);

  const icon=document.createElement('span');
  icon.className='reward-icon';
  const iconSrc=options.iconSrc ?? rewardIconAssets[canonical];
  const fallbackIcon=options.icon ?? rewardIconFallbacks[canonical] ?? '';
  icon.textContent=fallbackIcon;
  if(iconSrc){
    const iconImg=document.createElement('img');
    iconImg.src=iconSrc;
    iconImg.alt='';
    iconImg.decoding='async';
    iconImg.onerror=()=>{iconImg.remove();icon.textContent=fallbackIcon;};
    icon.textContent='';
    icon.appendChild(iconImg);
  }
  const labelEl=document.createElement('span');
  labelEl.className='reward-label';
  labelEl.textContent=prepared.displayLabel;
  const valueEl=document.createElement('span');
  valueEl.className='reward-value';
  valueEl.textContent=shouldCountUpReward(canonical,prepared.displayValue,tier)?'+0':formatRewardValue(prepared.displayValue);

  line.append(icon,labelEl,valueEl);
  ui.rewardFeed.appendChild(line);
  const item={el:line,timer:null,countCancel:null,priority,label:canonical,createdAt:performance.now()};
  if(shouldCountUpReward(canonical,prepared.displayValue,tier))item.countCancel=animateRewardValue(valueEl,prepared.displayValue);
  item.timer=setTimeout(()=>removeRewardFeedItem(item),life*1000+80);
  rewardFeedItems.push(item);
  const cueType=options.cueType ?? rewardCueByLabel[canonical];
  if(options.cue!==false&&cueType){
    playTieredRewardCue(cueType,tier,options);
  }
}
function flushEnemyHitRewardFeed(){
  if(enemyHitFeedState.timer){
    clearTimeout(enemyHitFeedState.timer);
    enemyHitFeedState.timer=null;
  }
  const count=enemyHitFeedState.pending;
  enemyHitFeedState.pending=0;
  if(count<=0)return;
  enemyHitFeedState.lastShown=performance.now();
  pushRewardFeed('ENEMY HIT',count,{color:'#f8fbff',life:.58,priority:0});
}
function pushEnemyHitReward(amount=1){
  enemyHitFeedState.pending+=amount;
  const now=performance.now();
  const wait=Math.max(0,enemyHitFeedState.windowMs-(now-enemyHitFeedState.lastShown));
  if(wait<=0&&!enemyHitFeedState.timer){
    flushEnemyHitRewardFeed();
    return;
  }
  if(!enemyHitFeedState.timer){
    enemyHitFeedState.timer=setTimeout(flushEnemyHitRewardFeed,wait);
  }
}
function clearPendingEnemyHitReward(){
  if(enemyHitFeedState.timer)clearTimeout(enemyHitFeedState.timer);
  enemyHitFeedState.timer=null;
  enemyHitFeedState.pending=0;
  enemyHitFeedState.lastShown=0;
}
function clearRewardFeed(){
  clearPendingEnemyHitReward();
  clearRewardFeedPacing();
  rewardFeedItems.splice(0).forEach(item=>{
    if(item.timer)clearTimeout(item.timer);
    item.el?.remove();
  });
}

function pulseComboBadge(){
  feedbackState.comboPulse=.22;
  if(!ui.comboBadge)return;
  ui.comboBadge.classList.remove('pulse');
  void ui.comboBadge.offsetWidth;
  ui.comboBadge.classList.add('pulse');
}
function syncComboFeedback(){
  const combo=Math.max(0,player.combo|0);
  if(ui.comboBadgeValue)ui.comboBadgeValue.textContent='x'+combo;
  const progress=comboTierProgress(combo);
  if(ui.comboBadgeLabel)ui.comboBadgeLabel.textContent=combo>0?(progress.next?`NEXT: ${progress.next.name.toUpperCase().split(' ')[0]} x${progress.next.combo}`:'OVERDRIVE ACTIVE'):'COMBO';
  if(ui.comboBadge){
    ui.comboBadge.classList.toggle('active',combo>0);
    ui.comboBadge.classList.toggle('overdrive',combo>=5);
    ui.comboBadge.classList.toggle('flow',combo>=8);
    ui.comboBadge.classList.toggle('tier-ready',combo>0&&!progress.next);
  }
  if(ui.comboCharge)ui.comboCharge.style.width=progress.progress*100+'%';
}
function resetComboFeedback(){
  player.combo=0;
  syncComboFeedback();
  setWeaponFromCombo(0);
}
function resetCombatComboState(){
  combatComboState.hitCount=0;
  combatComboState.hitTimer=0;
}
function addCombo(amount=1,pos=player.group.position,label='COMBO',color='#ffd27a',opts={}){
  player.combo=Math.max(0,player.combo)+amount;
  player.maxCombo=Math.max(player.maxCombo,player.combo);
  syncComboFeedback();
  pulseComboBadge();
  checkLiveRecords('combo');
  if(opts.feed!==false&&label)pushRewardFeed(label,opts.feedValue ?? amount,{color,icon:opts.icon,emphasis:opts.emphasis,life:opts.life});
  if(opts.float&&pos)floatingText(opts.floatText || label,pos,color,{fontSize:opts.fontSize || 24,life:opts.floatLife || .9,rise:opts.rise || 48});
  setWeaponFromCombo(player.combo);
  maybePushUnlockProgress();
}
function registerEnemyHitCombo(pos){
  combatComboState.hitCount++;
  combatComboState.hitTimer=1.5;
  if(combatComboState.hitCount>=3){
    combatComboState.hitCount=0;
    addCombo(1,null,'HIT CHAIN','#9ffcff',{feedValue:'+1',icon:'✦',life:.82});
    pulseReticleChain();
    player.cameraKick=Math.max(player.cameraKick||0,.08);
    player.shake=Math.max(player.shake,.035);
    particle(pos,0x9ffcff,4);
    flashScreen(.06,'rgba(120,245,255,1)');
  }
}
function updateCombatComboState(dt){
  if(combatComboState.hitTimer<=0)return;
  combatComboState.hitTimer-=dt;
  if(combatComboState.hitTimer<=0)combatComboState.hitCount=0;
}

const hitMarkerTimers={hit:null,kill:null};
const reticleTimers={fire:null,hit:null,kill:null,chain:null};

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

function triggerHitMarker(isKill=false){
  if(!ui.hitMarker)return;
  if(hitMarkerTimers.hit)clearTimeout(hitMarkerTimers.hit);
  if(hitMarkerTimers.kill)clearTimeout(hitMarkerTimers.kill);
  ui.hitMarker.classList.remove('animate','kill');
  void ui.hitMarker.offsetWidth;
  if(isKill)ui.hitMarker.classList.add('kill');
  ui.hitMarker.classList.add('animate');
  audio.play('hit_marker', isKill ? 0.35 : 0.22, false, isKill ? 0.85 : 1.05);
  hitMarkerTimers.hit=setTimeout(()=>{
    if(ui.hitMarker)ui.hitMarker.classList.remove('animate','kill');
    hitMarkerTimers.hit=null;
  },isKill?280:180);
}

function pulseReticleFire(){
  restartReticlePulse('fire',80);
}
function pulseReticleHit(){
  if(ui.reticle)ui.reticle.classList.remove('fire');
  restartReticlePulse('hit',170);
  triggerHitMarker(false);
}
function pulseReticleChain(){
  if(ui.reticle)ui.reticle.classList.remove('fire','hit');
  restartReticlePulse('chain',210);
  triggerHitMarker(false);
}
function pulseReticleKill(){
  if(ui.reticle)ui.reticle.classList.remove('fire','hit','chain');
  restartReticlePulse('kill',270);
  triggerHitMarker(true);
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
  ui.reticle.classList.toggle('assist',dopamineConfig.enableAimAssistReticle&&!dim&&aimAssistState.active);
}

const repair={active:false,progress:0,duration:1.45,tookDamage:false,feedbackT:0,feedbackType:'idle',dangerRecent:0};
const repairScreenProbe=new THREE.Vector3();
const repairRingRadius=26;
const repairRingCircumference=Math.PI*2*repairRingRadius;
function repairAvailable(){return player.alive&&!player.lastStand&&player.hp<100;}
function startRepair(){
  if(repair.active||!repairAvailable())return;
  hideStartHint();
  repair.active=true;
  repair.progress=0;
  repair.tookDamage=false;
  repair.feedbackT=0;
  repair.feedbackType='active';
  repair.dangerRecent=0;
  audio.startLoop('repair_loop',.18);
  audioTimers.repairTick=0;
  if(ui.box)ui.box.classList.add('active');
  if(ui.status)ui.status.textContent='REPAIRING';
  syncComboFeedback();
}
function endRepair({hide=true}={}){
  repair.active=false;
  repair.progress=0;
  repair.tookDamage=false;
  audio.stopLoop('repair_loop');
  if(hide&&ui.box)ui.box.classList.remove('active','perfect','good','interrupted');
}
let timeScale=1,slowTimer=0;
function slowmo(dur=.25,sc=.34){timeScale=sc;slowTimer=dur;}
function grantRepairOvercharge(){
  if(!dopamineConfig.enablePerfectRepairBuff)return;
  repairOvercharge.timer=repairOvercharge.duration;
  pushRewardFeed('OVERCHARGE','+5s',{color:'#9ffcff',icon:'*',emphasis:true,life:1.05,cueType:'perfectRepair'});
}
function updateOvercharge(dt){
  repairOvercharge.timer=Math.max(0,repairOvercharge.timer-dt);
  if(ui.overcharge){
    const active=repairOvercharge.timer>0&&player.alive;
    ui.overcharge.classList.toggle('active',active);
    if(active)ui.overcharge.textContent=`OVERCHARGE ${repairOvercharge.timer.toFixed(1)}s`;
  }
}

function repairSuccess(perfect){
  const clutchPerfect=perfect&&(player.hp<30||repair.dangerRecent>0);
  endRepair({hide:false});
  repair.progress=1;
  repair.feedbackT=.85;
  repair.feedbackType=perfect?'perfect':'good';
  const heal=perfect?38+Math.min(18,player.combo*1.5):24+Math.min(12,player.combo*.8);
  player.hp=Math.min(100,player.hp+heal);
  if(perfect)addCombo(1,null,'COMBO','#9ffcff',{feedValue:'+1',icon:'✦',emphasis:true,life:.96});
  else syncComboFeedback();
  if(ui.status)ui.status.textContent=perfect?'PERFECT REPAIR':'GOOD REPAIR';
  particle(player.group.position.clone().add(new THREE.Vector3(0,0,.4)),perfect?0x66f7ff:0x6ef7ff,perfect?12:7);
  if(!perfect)spawnRepairSparks(false);
  if(perfect)spawnRepairSparks(true);
  calmPlayerDamageSmoke();
  playerDamageFx.smokeTimer=Math.max(playerDamageFx.smokeTimer,.35);
  audio.play(perfect?'repair_perfect':'repair_good',perfect?.28:.24);
  if(perfect){
    const jackpotDanger=repair.dangerRecent>0||clutchPerfect;
    directorState.recentPerfect=7;
    pushRewardFeed('PERFECT REPAIR',`+${Math.round(heal)}`,{color:'#9ffcff',icon:'✦',emphasis:true,life:1.1});
    grantRepairOvercharge();
    centerToast('PERFECT REPAIR', '#9ffcff', 760, 'cyan');
    eventCrest('PERFECT REPAIR',{sub:'OVERCHARGE READY',kind:'cyan',duration:920});
    freezeTimer=.045;
    slowmo(.42,.38);
    flashScreen(.62,'rgba(205,255,255,1)');
    perfectRepairBurst();
    floatingText('PERFECT REPAIR',player.group.position.clone().add(new THREE.Vector3(0,1.15,.25)),'#9ffcff');
    player.shake=Math.max(player.shake,.18);
    player.cameraKick=Math.max(player.cameraKick||0,.22);
    feedbackState.perfectGlow=1;
    feedbackState.perfectZoom=1;
    maybeJackpot('perfectRepair',player.group.position.clone(),{danger:jackpotDanger});
    if(clutchPerfect){
      player.shake=Math.max(player.shake,.25);
      flashScreen(.22,'rgba(255,245,180,1)');
      pushRewardFeed('CLUTCH SAVE','',{color:'#fff1b8',icon:'!',emphasis:true,life:1.05});
      centerToast('CLUTCH SAVE', '#fff1b8', 760, 'warm');
      freezeTimer=Math.max(freezeTimer,.065);
      slowmo(.32,.46);
      playRewardCue('perfectRepair',{force:true,duck:true,duckAmount:.38});
    }
  }else{
    pushRewardFeed('GOOD REPAIR',`+${Math.round(heal)}`,{color:'#9ffcff',life:.85});
  }
}
function cancelRepair(){
  if(!repair.active)return;
  endRepair();
  repair.feedbackT=0;
  repair.feedbackType='idle';
  if(ui.status)ui.status.textContent='HOLD R TO REPAIR';
}
function interruptRepair(){
  if(!repair.active)return;
  endRepair({hide:false});
  repair.feedbackT=.85;
  repair.feedbackType='interrupted';
  repair.progress=0;
  resetComboFeedback();
  resetCombatComboState();
  if(ui.status)ui.status.textContent='REPAIR INTERRUPTED';
  pushRewardFeed('REPAIR INTERRUPTED','',{color:'#ff7a3d',icon:'!',emphasis:true,life:.9});
  player.shake=.35;
  audio.play('repair_fail',.28);
  particle(player.group.position,0xff4b2f,10);
  setWeaponFromCombo(0);
}
function updateRepair(dt){
  if(!keys.has('KeyR')){cancelRepair();return;}
  repair.dangerRecent=Math.max(0,repair.dangerRecent-dt);
  repair.progress=THREE.MathUtils.clamp(repair.progress+dt/repair.duration,0,1);
  audioTimers.repairTick-=dt;
  if(audioTimers.repairTick<=0){audio.play('repair_tick',.045,false);audioTimers.repairTick=.24;}
  if(ui.status)ui.status.textContent=repair.progress<.08?'HOLD R TO REPAIR':'REPAIRING';
  if(repair.progress>=1)repairSuccess(!repair.tookDamage);
}
function updateRepairIndicator(){
  if(!ui.box)return;
  const clutchPrompt=player.alive&&!repair.active&&repair.feedbackT<=0&&player.hp<30&&repairAvailable();
  const visible=player.alive&&(repair.active||repair.feedbackT>0||clutchPrompt);
  ui.box.classList.toggle('active',visible);
  ui.box.classList.toggle('perfect',repair.feedbackType==='perfect');
  ui.box.classList.toggle('good',repair.feedbackType==='good');
  ui.box.classList.toggle('interrupted',repair.feedbackType==='interrupted');
  ui.box.classList.toggle('clutch',clutchPrompt||(repair.active&&player.hp<30));
  ui.box.classList.toggle('good-zone',repair.active&&repair.progress>.58);
  ui.box.classList.toggle('perfect-zone',repair.active&&!repair.tookDamage&&repair.progress>.84);
  let hostileNear=false;
  let closestThreat=null,closestThreatDist=Infinity;
  if(repair.active&&dopamineConfig.enableRepairWarningArcs){
    for(const b of bullets){
      if(!b.hostile||!b.pos)continue;
      const d=b.pos.distanceTo(player.group.position);
      if(d<5.15&&Math.abs(b.pos.z-player.group.position.z)<2.8&&d<closestThreatDist){
        closestThreat=b.pos;closestThreatDist=d;
      }
    }
    for(const m of mines){
      const d=m.pos.distanceTo(player.group.position);
      if(d<5.8&&Math.abs(m.pos.z-player.group.position.z)<3.4&&d<closestThreatDist){
        closestThreat=m.pos;closestThreatDist=d;
      }
    }
    hostileNear=!!closestThreat;
    if(hostileNear){
      const rel=closestThreat.clone().sub(player.group.position);
      const angle=Math.atan2(rel.x,-rel.z)*180/Math.PI;
      const intensity=THREE.MathUtils.clamp(1-closestThreatDist/5.8,.18,1);
      ui.box.style.setProperty('--danger-angle',`${210+angle}deg`);
      ui.box.style.setProperty('--danger-alpha',String(.28+intensity*.52));
      repair.dangerRecent=Math.max(repair.dangerRecent,.75);
      playRewardCue('incomingFire');
    }else{
      ui.box.style.setProperty('--danger-alpha','0');
    }
  }
  ui.box.classList.toggle('danger',hostileNear);
  if(clutchPrompt&&ui.status)ui.status.textContent='CLUTCH REPAIR AVAILABLE';
  if(!visible)return;
  repairScreenProbe.copy(player.group.position).project(camera);
  if(repairScreenProbe.z<-1||repairScreenProbe.z>1){
    ui.box.classList.remove('active');
    return;
  }
  const x=(repairScreenProbe.x*.5+.5)*innerWidth;
  const y=(-repairScreenProbe.y*.5+.5)*innerHeight-78;
  ui.box.style.left=`${x}px`;
  ui.box.style.top=`${y}px`;
  const progress=repair.active?repair.progress:(repair.feedbackType==='good'||repair.feedbackType==='perfect'?1:(clutchPrompt ? .08 : 0));
  if(ui.repairRing){
    ui.repairRing.style.strokeDasharray=repairRingCircumference;
    ui.repairRing.style.strokeDashoffset=repairRingCircumference*(1-THREE.MathUtils.clamp(progress,0,1));
  }
}
function nearMissStreak(pos) {
  const streak = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.12, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x9ffcff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  streak.rotation.x = Math.PI / 2;
  streak.position.copy(pos).add(new THREE.Vector3((Math.random() > 0.5 ? 1 : -1) * (1.2 + Math.random() * 1.4), (Math.random() - 0.5) * 1.2, 0.5));
  scene.add(streak);
  addVfx({ mesh: streak, vel: new THREE.Vector3((Math.random() - 0.5) * 6, 0, 25), life: 0.18, max: 0.18, type: 'streak' });
  player.shake = Math.max(player.shake, 0.2);
}
function showNearMiss(){
  player.nearMisses++;awardScore('nearMissScore',25);player.combo=Math.max(player.combo,0)+1;
  player.maxCombo=Math.max(player.maxCombo,player.combo);
  checkLiveRecords('nearMisses');
  pushRewardFeed('NEAR MISS','+25',{color:'#9ffcff',icon:'✦',emphasis:true,life:.84});
  if(ui.status)ui.status.textContent='NEAR MISS CHARGE!';
  syncComboFeedback();
  pulseComboBadge();
  particle(player.group.position.clone().add(new THREE.Vector3((Math.random()-.5)*1.6,.1,-.4)),0x9ffcff,8);
  nearMissStreak(player.group.position.clone());
  flashScreen(0.1, 'rgba(120,245,255,1)');
  if(dopamineConfig.enableStereoPanning)playSpatialCue(whizSounds[Math.floor(Math.random()*whizSounds.length)],player.group.position,.24);
  else audio.playRandom(whizSounds,.24);
  audio.play('slowmo_enter',.18);
  feedbackState.nearMissZoom=Math.max(feedbackState.nearMissZoom,1);
  if(slowTimer<=0.04)slowmo(.15,.58);
  player.shake=Math.max(player.shake,.16);
  setWeaponFromCombo(player.combo);
  maybePushUnlockProgress();
  maybeJackpot('nearMiss',player.group.position.clone());
}
function terrainSkimStreak(){
  const base=player.group.position.clone().add(new THREE.Vector3(0,-.45,.35));
  for(let i=0;i<3;i++){
    const streak=new THREE.Mesh(
      new THREE.CylinderGeometry(.035,.08,7+Math.random()*3,8),
      new THREE.MeshBasicMaterial({color:i%2?0xffffff:0x9ffcff,transparent:true,opacity:.46,blending:THREE.AdditiveBlending,depthWrite:false})
    );
    streak.rotation.x=Math.PI/2;
    streak.position.copy(base).add(new THREE.Vector3((Math.random()-.5)*2.6,-.15-Math.random()*.4,.6+Math.random()*.6));
    scene.add(streak);
    addVfx({mesh:streak,vel:new THREE.Vector3((Math.random()-.5)*3,-1.2-Math.random()*1.4,24+Math.random()*8),life:.16+Math.random()*.08,max:.24,type:'streak'});
  }
}
function triggerTerrainSkim(){
  const terrainLabel=Math.random()>.45?'LOW SKIM':'TERRAIN SKIM';
  const reward=terrainLabel==='LOW SKIM'?15:20;
  terrainSkimState.cooldown=2.35+Math.random()*.65;
  terrainSkimState.hold=0;
  terrainSkimState.successes++;
  awardScore('nearMissScore',reward);
  pushRewardFeed(terrainLabel,`+${reward}`,{color:'#9ffcff',icon:'*',life:.82,cueType:'nearMiss',priority:1});
  if(terrainSkimState.successes%2===0)addCombo(1,null,'COMBO','#9ffcff',{feedValue:'+1',life:.7,icon:'*'});
  terrainSkimStreak();
  feedbackState.skimZoom=Math.max(feedbackState.skimZoom,.55);
  player.cameraKick=Math.max(player.cameraKick||0,.08);
  player.shake=Math.max(player.shake,.07);
  if(dopamineConfig.enableStereoPanning)playSpatialCue(whizSounds[Math.floor(Math.random()*whizSounds.length)],player.group.position,.14);
  else audio.playRandom(whizSounds,.14);
}
function updateTerrainSkim(dt){
  if(!dopamineConfig.enableTerrainSkim||!player.alive||player.lastStand){
    terrainSkimState.hold=0;
    return;
  }
  terrainSkimState.cooldown=Math.max(0,terrainSkimState.cooldown-dt);
  const speed=Math.hypot(player.vel.x,player.vel.y);
  const low=player.group.position.y<-8.3;
  if(low&&speed>6.5)showTutorialHint('seenSkimTip','LOW FLYING BUILDS SKIM BONUS');
  if(low&&speed>8.2&&terrainSkimState.cooldown<=0){
    terrainSkimState.hold+=dt;
    if(terrainSkimState.hold>.34)triggerTerrainSkim();
  }else{
    terrainSkimState.hold=Math.max(0,terrainSkimState.hold-dt*1.6);
  }
}

function enemyBullet(pos,dir){
  const now=performance.now()/1000;
  if(now-audioTimers.enemyShot>.2){playSpatialCue('enemy_mg_burst_01',pos,.18,true,1+(Math.random()-.5)*.06);audioTimers.enemyShot=now;}
  if(repair.active)playRewardCue('incomingFire');
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
  addBullet({mesh:g,pos:pos.clone(),vel:dir.multiplyScalar(58),life:3,maxLife:3,hostile:true,explosive:false,nearChecked:false,color:0xff3b1f,prevPos:pos.clone(),tracerLength,trailT:0});
}
function triggerLastStand(){
  if(!dopamineConfig.enableLastStand||player.lastStandUsed)return false;
  endRepair();
  player.lastStand=true;
  player.lastStandUsed=true;
  player.lastStandTimer=3;
  player.hp=1;
  player.weapon='overdrive';
  player.weaponTimer=3.15;
  if(ui.weaponName)ui.weaponName.textContent='OVERDRIVE STORM';
  if(ui.weaponRule)ui.weaponRule.textContent='Final stand';
  repairOvercharge.timer=0;
  eventCrest('FINAL STAND',{sub:'OVERDRIVE UNTIL IMPACT',kind:'danger',duration:1220});
  centerToast('FINAL STAND','#ffcf8a',980,'warm');
  pushRewardFeed('FINAL STAND','3.0s',{color:'#ffcf8a',icon:'!',emphasis:true,life:1.15,cueType:'kill',forceCue:true});
  freezeTimer=Math.max(freezeTimer,.075);
  slowmo(.18,.48);
  player.shake=Math.max(player.shake,.42);
  player.cameraKick=Math.max(player.cameraKick||0,.5);
  flashScreen(.24,'rgba(255,85,32,1)');
  playRewardCue('unlock',{force:true,duck:true,duckAmount:.38});
  if(ui.finalStandCountdown){
    ui.finalStandCountdown.classList.add('active');
    ui.finalStandCountdown.textContent='FINAL STAND 3.0';
  }
  return true;
}
function damagePlayer(n){
  if(dopamineConfig.enablePerfectRepairBuff&&repairOvercharge.timer>0)n*=.78;
  const repairingAtHit=repair.active;
  if(repairingAtHit)repair.tookDamage=true;
  if(player.lastStand){
    player.hp=1;
    player.shake=Math.max(player.shake,.36);
    flashScreen(0.18,'rgba(255,75,47,1)');
    audio.play('player_hit_01',.18);
    return;
  }
  player.hp=Math.max(0,player.hp-n);
  player.shake=Math.max(player.shake, 0.5);
  flashScreen(0.32, 'rgba(255,30,20,1)');
  const pos = player.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2));
  burstParticles(pos, { color: 0xff5733, count: 12, speed: 12, size: [0.04, 0.11], life: [0.22, 0.55], additive: true });
  audio.play('player_hit_01',.24);
  if(n>=12){
    if(repairingAtHit){
      interruptRepair();
    }else{
      resetCombatComboState();
      if(player.combo>0){
        resetComboFeedback();
        floatingText('COMBO BROKEN',player.group.position.clone().add(new THREE.Vector3(0,1.25,.2)),'#ff7a3d');
        playRewardCue('comboBroken');
      }
    }
  }
  const now=performance.now()/1000;
  if(player.hp<30&&now-audioTimers.criticalBeep>1.15){audio.play('critical_beep',.22);audioTimers.criticalBeep=now;}
  if(player.hp<=0&&!triggerLastStand())endGame();
}
function resetRunTransientState(){
  waveDirector.opened=false;
  waveDirector.spawnTimer=0;
  waveDirector.burstTimer=0;
  waveDirector.lastPhase=-1;

  unlockedWeaponTiersThisRun.clear();
  specialEnemyState.bomberSpawned=false;
  specialEnemyState.aceSpawned=false;
  specialEnemyState.miniBossSpawned=false;
  repairOvercharge.timer=0;
  terrainSkimState.hold=0;
  terrainSkimState.cooldown=1.6;
  terrainSkimState.successes=0;
  clearMiniEvents();
  clearEventHazardBullets();
  resetDirectorState();
  resetRunStats();
  resetLiveRecordState();
  cacheRunRecords();
  resetRewardEmotionState();
  interceptComboState.count=0;
  player.lastStand=false;
  player.lastStandTimer=0;
  player.lastStandUsed=false;

  audioMix.duck=0;
  audioMix.duckTimer=0;
  audioMix.intensity=0;
  audioMix.musicRate=1;

  feedbackState.nearMissZoom=0;
  feedbackState.comboPulse=0;
  feedbackState.flow=0;
  feedbackState.perfectGlow=0;
  feedbackState.perfectZoom=0;
  feedbackState.skimZoom=0;
  ui.overcharge?.classList.remove('active');
  ui.flow?.classList.remove('active');
  ui.finalStandCountdown?.classList.remove('active');
  document.body.classList.remove('flow-state','final-stand-active');
  clearEventCrest();
}
function endGame(){
  if(!player.alive)return;player.alive=false;endRepair();
  repair.feedbackT=0;
  repair.feedbackType='idle';
  repair.dangerRecent=0;
  repairOvercharge.timer=0;
  ui.overcharge?.classList.remove('active');
  ui.flow?.classList.remove('active');
  ui.finalStandCountdown?.classList.remove('active');
  document.body.classList.remove('flow-state','final-stand-active');
  clearEventCrest();
  clearCenterToast();
  clearRewardFeed();
  resetRewardEmotionState();
  clearTutorialHint();
  clearMiniEvents();
  clearEventHazardBullets();
  clearSupplyDrop();
  resetRewardCueState();
  if(ui.nearMiss)ui.nearMiss.classList.remove('show');
  resetCombatComboState();
  interceptComboState.count=0;
  audio.stopLoop('mg_overdrive_loop');
  audio.fadeLoop('engine_loop',0,.75,true);
  audio.fadeLoop('engine_damaged_loop',0,.75,true);
  audio.fadeLoop('wind_loop',0,.75,true);
  audio.fadeLoop('distant_battle_loop',.02,.75);
  audio.stopLoop('music_base_loop');
  audio.setLoopPlaybackRate('engine_loop',1);
  audio.setLoopPlaybackRate('engine_damaged_loop',1);
  audio.setLoopPlaybackRate('music_elevenlabs_loop',1);
  audioMix.duck=0;
  audioMix.duckTimer=0;
  audio.setLoopVolume('music_elevenlabs_loop',musicVolumeConfig.gameOver);
  mines.splice(0).forEach(m=>scene.remove(m.mesh));
  releaseMouseCapture();
  if(ui.finalTime)ui.finalTime.textContent=player.survival.toFixed(1)+'s';
  if(ui.finalKills)ui.finalKills.textContent=player.kills;
  if(ui.finalCombo)ui.finalCombo.textContent='x'+player.maxCombo;
  if(ui.finalNear)ui.finalNear.textContent=player.nearMisses;
  const records=finalizeRunRecords();
  renderRecordBadges(records);
  if(records.length)showTutorialHint('seenRecordTip','RECORDS SAVE BETWEEN RUNS',{allowInactive:true});
  renderResultsScreen(records);
  if(records.length)playRewardCue('unlock',{force:true,duck:true,duckAmount:.28});
  player.combo=0;syncComboFeedback();
  if(ui.lastStand)ui.lastStand.classList.add('show');flash(.7);audio.play('explosion_big',.5);
}
function resetGame(){
  runToken++;
  audio.play('play_again', 0.8);
  releaseMouseCapture();
  endRepair();
  clearResultAnimations();
  repair.feedbackT=0;
  repair.feedbackType='idle';
  repair.progress=0;
  repair.dangerRecent=0;
  clearCenterToast();
  clearRewardFeed();
  clearTutorialHint();
  renderRecordBadges([]);
  resetRewardCueState();
  if(ui.nearMiss)ui.nearMiss.classList.remove('show');
  audio.stopLoop('repair_loop');
  audio.stopLoop('mg_overdrive_loop');
  audioTimers.criticalBeep=0;
  audioTimers.enemyShot=0;
  audioMix.damagedEngine=0;
  audioMix.music=musicVolumeConfig.gameplay;
  audio.setLoopPlaybackRate('engine_loop',1);
  audio.setLoopPlaybackRate('engine_damaged_loop',1);
  audio.setLoopPlaybackRate('music_elevenlabs_loop',1);
  if(audio.unlocked){
    audio.stopLoop('start_background');
    audio.startLoop('engine_loop',.25);
    audio.startLoop('wind_loop',.12);
    audio.startLoop('distant_battle_loop',.08);
    audio.stopLoop('music_base_loop');
    audio.startLoop('music_elevenlabs_loop',musicVolumeConfig.gameplay);
    audio.startLoop('engine_damaged_loop',0);
  }
  bullets.splice(0).forEach(b=>scene.remove(b.mesh));
  enemies.splice(0).forEach(e=>scene.remove(e.group));
  mines.splice(0).forEach(m=>scene.remove(m.mesh));
  particles.splice(0).forEach(p=>scene.remove(p.mesh));
  vfx.splice(0).forEach(fx=>scene.remove(fx.mesh));
  scorePopups.splice(0).forEach(p=>p.el.remove());
  ambientTracerTimer = 0;
  nextGunSide = -1;
  resetRunTransientState();
  Object.assign(aimAssistState,{target:null,timer:0,active:false,strength:0});
  Object.assign(playerDamageFx,{smokeTimer:0,sparkTimer:0,fireTimer:0});
  resetCombatComboState();
  Object.assign(player,{hp:100,score:0,combo:0,maxCombo:0,weapon:'single',weaponTimer:0,fireCd:0,shake:0,cameraKick:0,kills:0,nearMisses:0,alive:true,lastStand:false,lastStandTimer:0,lastStandUsed:false,startTime:performance.now(),survival:0});
  feedbackState.critical=0;
  feedbackState.pulse=0;
  feedbackState.skimZoom=0;
  freezeTimer=0;timeScale=1;slowTimer=0;
  updatePlayerDamageVisuals(0);
  resetAimToCenter();
  player.group.position.set(0,0,0);player.vel.set(0,0,0);setWeaponFromCombo(0);syncComboFeedback();
  restartStartHint();
  if(ui.lastStand)ui.lastStand.classList.remove('show','critical');
}
if(ui.restart)ui.restart.addEventListener('click',resetGame);
cacheRunRecords();
restartStartHint();

function updatePlayer(dt){
  if(!player.alive)return;
  if(player.lastStand){
    player.lastStandTimer=Math.max(0,player.lastStandTimer-dt);
    if(ui.finalStandCountdown){
      ui.finalStandCountdown.classList.add('active');
      ui.finalStandCountdown.textContent=`FINAL STAND ${player.lastStandTimer.toFixed(1)}`;
    }
    if(player.lastStandTimer<=0){endGame();return;}
  }else if(ui.finalStandCountdown){
    ui.finalStandCountdown.classList.remove('active');
  }
  updateOvercharge(dt);
  const ms=repair.active?7:15;const boost=keys.has('ShiftLeft')||keys.has('ShiftRight')?1.55:1;
  const tgt=new THREE.Vector3((keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),0).multiplyScalar(ms*boost);
  player.vel.lerp(tgt,dt*4.2);player.group.position.addScaledVector(player.vel,dt);
  player.group.position.x=THREE.MathUtils.clamp(player.group.position.x,-22,22);
  player.group.position.y=THREE.MathUtils.clamp(player.group.position.y,-12,15);
  player.group.rotation.z=THREE.MathUtils.lerp(player.group.rotation.z,-player.vel.x*.045,dt*7);
  player.group.rotation.x=THREE.MathUtils.lerp(player.group.rotation.x,player.vel.y*.03,dt*7);
  player.group.userData.prop.rotation.z+=(repair.active?18:42)*dt;
  updateTerrainSkim(dt);
  // Exhaust flicker
  const ex=player.group.userData.exhaust;
  if(ex){ex.scale.setScalar(.8+Math.random()*.5);ex.material.opacity=.5+Math.random()*.4;}
  if(keys.has('KeyR')&&!repair.active&&player.hp<100&&!player.lastStand)startRepair();if(repair.active)updateRepair(dt);
  if(!repair.active&&repair.feedbackT>0)repair.feedbackT=Math.max(0,repair.feedbackT-dt);
  player.fireCd-=dt;const tier=currentTier();
  const overchargeFireBoost=dopamineConfig.enablePerfectRepairBuff&&repairOvercharge.timer>0?.82:1;
  if((keys.has('Space')||mouse.down)&&!repair.active&&player.fireCd<=0){fireWeapon();player.fireCd=tier.cd*overchargeFireBoost;}
  if(player.weapon==='overdrive'&&(keys.has('Space')||mouse.down)&&!repair.active)audio.startLoop('mg_overdrive_loop',.18);
  else audio.stopLoop('mg_overdrive_loop');
  if(player.weaponTimer>0){player.weaponTimer-=dt;if(player.weaponTimer<=0){player.weapon='single';if(ui.weaponName)ui.weaponName.textContent='Single Shot';if(ui.weaponRule)ui.weaponRule.textContent='Combo expired';}}
  player.survival=(performance.now()-player.startTime)/1000;
}
function updateEnemies(dt){
  if(!player.alive)return;
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i];e.t+=dt;
    const aggression=e.aggression ?? 1;
    const kind=e.kind||'normal';
    e.dodgeTimer=Math.max(0,(e.dodgeTimer||0)-dt);
    e.warningTimer=Math.max(0,(e.warningTimer||0)-dt);
    const speedScale=kind==='bomber'?.68:kind==='ace'?1.28:kind==='miniBoss'?.62:1;
    const dx=e.type==='swoop'?Math.sin(e.t*(kind==='ace'?3.8:2.4))*dt*(8+aggression*1.8)*speedScale:0;
    const dy=e.type==='dive'?Math.sin(e.t*1.5)*dt*(5+aggression*1.6)*speedScale:0;
    const dodge=e.dodgeTimer>0?Math.sin(e.dodgeTimer*28)*(kind==='ace'?18:8)*dt:0;
    e.group.position.x+=dx+dodge+(player.group.position.x-e.group.position.x)*dt*(kind==='bomber'||kind==='miniBoss'?.08:.16+aggression*.035);
    e.group.position.y+=dy+(player.group.position.y-e.group.position.y)*dt*(kind==='bomber'||kind==='miniBoss'?.055:.1+aggression*.03);
    e.group.position.z+=dt*(10.5+aggression*1.8+Math.min(8,player.score/300))*speedScale;
    e.group.rotation.z=Math.sin(e.t*(kind==='ace'?4:2))*(kind==='ace'?.55:.28);e.group.userData.prop.rotation.z+=(kind==='bomber'?22:kind==='miniBoss'?18:42)*dt;
    const eEx=e.group.userData.exhaust;if(eEx){eEx.scale.setScalar(.6+Math.random()*.4);eEx.material.opacity=.4+Math.random()*.3;}
    if(e.specialGlow?.material)e.specialGlow.material.opacity=.35+.25*Math.sin(e.t*5);
    if(kind==='bomber'){
      e.mineTimer-=dt;
      if(e.mineTimer<=0&&e.group.position.z<-5){
        spawnMine(e);
        e.mineTimer=1.6+Math.random()*1.15;
      }
    }
    e.fire-=dt;if(e.fire<=0&&e.group.position.z<-6){
      e.warningTimer=.42;
      enemyBullet(e.group.position.clone().add(new THREE.Vector3(0,0,1.2)),player.group.position.clone().sub(e.group.position).normalize());
      if(kind==='miniBoss'&&e.burstShots<2){
        e.burstShots++;
        e.fire=.14;
      }else{
        e.burstShots=0;
        e.fire=((kind==='bomber'?1.25:kind==='ace'?.62:kind==='miniBoss'?.48:.88)+Math.random()*(kind==='miniBoss'?.62:1.25))/aggression;
      }
    }
    if(e.group.position.distanceTo(player.group.position)<1.5){damagePlayer(22);explosion(e.group.position);scene.remove(e.group);enemies.splice(i,1);continue;}
    if(e.group.position.z>12){damagePlayer(10);scene.remove(e.group);enemies.splice(i,1);}
  }
}
function floatingText(text, pos, color = '#ffd27a', opts = {}) {
  const div = document.createElement('div');
  div.textContent = text; div.style.position = 'fixed'; div.style.color = color;
  div.style.fontWeight = '900'; div.style.fontSize = (opts.fontSize || 22)+'px'; div.style.textShadow = '0 0 12px currentColor,0 0 28px currentColor';
  div.style.pointerEvents = 'none'; div.style.zIndex = '9';
  document.body.appendChild(div);
  const life=opts.life || 0.8;
  while(scorePopups.length>=perfCaps.scorePopups){
    const old=scorePopups.shift();
    old?.el?.remove();
  }
  scorePopups.push({ el: div, pos: pos.clone(), life, max: life, offsetY: 0, rise: opts.rise || 38 });
}
function updateScorePopups(dt) {
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    const p = scorePopups[i]; p.life -= dt; p.offsetY += dt * (p.rise || 38);
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
    } else if (fx.type === 'ring') {
      fx.mesh.material.opacity = 0.86 * k;
      fx.mesh.scale.multiplyScalar(1 + dt * (fx.grow || 4));
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
  addVfx({ mesh: tracer, vel: dir.multiplyScalar(16 + Math.random() * 10), life: 0.18 + Math.random() * 0.07, max: 0.25, type: 'beamTrail', ambient:true });
}
function updateAmbientCombat(dt) {
  if (!player.alive) return;
  ambientTracerTimer -= dt;
  if (ambientTracerTimer <= 0) {
    if(activeAmbientTracerCount()<perfCaps.ambientTracers)spawnAmbientTracer();
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
      pushRewardFeed('INTERCEPT',bulletInterceptConfig.score,{color:'#fff1b8',icon:'✦',emphasis:true,life:.88});
      awardScore('specialScore',bulletInterceptConfig.score);
      interceptComboState.count++;
      if(interceptComboState.count>=2){
        interceptComboState.count=0;
        addCombo(1,hit.midpoint,'COMBO','#fff1b8',{feedValue:'+1',life:.72,icon:'*'});
      }
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
      if(d<.9){
        if(b.flak)flakBarrageState.survived=false;
        damagePlayer(b.damage ?? 7);
        scene.remove(b.mesh);bullets.splice(i,1);if(!player.alive)break;continue;
      }
      if(!b.nearChecked&&!player.lastStand&&d>1.0&&d<2.55&&Math.abs(b.pos.z-player.group.position.z)<1.35){
        b.nearChecked=true;
        showNearMiss();
        if(repair.active)repair.dangerRecent=Math.max(repair.dangerRecent,.9);
      }
    }else{
      for(let mIdx=mines.length-1;mIdx>=0;mIdx--){
        const mine=mines[mIdx];
        const hit=distancePointToSegment(mine.pos,b.prevPos,b.pos);
        if(hit.distance<.75){
          b.consumed=true;
          removeMineAt(mIdx,true,true);
          break;
        }
      }
      if(b.consumed)continue;
      for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];
        const hit=distancePointToSegment(e.group.position,b.prevPos,b.pos);
        if(hit.distance<enemyHitRadius(e)){
          e.hp-=b.damage ?? (b.explosive?3:1);
          hitImpact(hit.closest, b.color || 0xffd27a);
          pulseReticleHit();
          if(b.source==='escort')pushEnemyHitReward(1);
          else{
            pushEnemyHitReward(b.explosive?3:1);
            registerEnemyHitCombo(hit.closest);
          }
          if(e.kind==='ace'){
            e.dodgeTimer=.34;
            burstParticles(e.group.position,{color:0x9ffcff,count:8,speed:12,size:[.03,.08],life:[.12,.28],additive:true});
          }
          if(b.explosive)explosion(e.group.position.clone(), true);
          b.consumed=true;
          if(e.hp<=0){
            const killPos=e.group.position.clone();
            pulseReticleKill();
            const kind=e.kind||'normal';
            enemyDeathPayoff(killPos,kind,b.explosive);
            scene.remove(e.group);enemies.splice(j,1);player.kills++;awardScore('killScore',50);
            noteRunKill(kind);
            maybeJackpot('kill',killPos,{enemyKind:kind});
            freezeTimer=Math.max(freezeTimer,.058);
            if(slowTimer<=0.04)slowmo(.14,.68);
            const reward=kind==='miniBoss'?200:kind==='ace'?125:kind==='bomber'?100:50;
            const label=kind==='miniBoss'?'HEAVY DOWN':kind==='ace'?'ACE DOWN':kind==='bomber'?'BOMBER DOWN':'KILL';
            awardScore('killScore',reward-50+(player.lastStand?100:0));
            pushRewardFeed(label,`+${reward}`,{color:kind==='ace'?'#9ffcff':'#fff1b8',icon:'*',emphasis:true,life:kind==='normal'?1.08:1.42,forceCue:true});
            if(b.source==='escort'){
              awardScore('specialScore',25);
              pushRewardFeed('ESCORT ASSIST','+25',{color:'#9ffcff',icon:'*',emphasis:true,life:.9,cueType:'kill',priority:3});
            }
            if(kind==='ace')centerToast('ACE DOWN','#9ffcff',680,'cyan');
            if(kind==='bomber')centerToast('BOMBER DOWN','#ffcf8a',720,'warm');
            if(player.lastStand)pushRewardFeed('FINAL STAND KILL','+100',{color:'#ffcf8a',icon:'!',emphasis:true,life:1.05,cueType:'kill'});
            const comboGain=kind==='miniBoss'?3:kind==='bomber'||kind==='ace'?2:1;
            addCombo(comboGain,null,'COMBO','#ffd27a',{feedValue:`+${comboGain}`,life:.98,emphasis:true});
            if(b.explosive&&dopamineConfig.enableExplosionUpgrade){
              let chainFx=0;
              const token=runToken;
              for(const other of enemies){
                if(chainFx>=2)break;
                if(other.group.position.distanceTo(killPos)<9){
                  chainFx++;
                  const chainPos=other.group.position.clone();
                  setTimeout(()=>{if(token===runToken)explosion(chainPos,false);},70+chainFx*55);
                }
              }
            }
            player.cameraKick=Math.max(player.cameraKick||0,kind==='normal'?.43:.62);
            player.shake=Math.max(player.shake,kind==='normal'?.24:.38);
            flashScreen(0.08, 'rgba(255,198,92,1)');
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
function updateFeedbackState(dt){
  const criticalTarget=player.alive?THREE.MathUtils.clamp((36-player.hp)/12,0,1):0;
  feedbackState.critical=THREE.MathUtils.lerp(feedbackState.critical,criticalTarget,1-Math.exp(-dt*5.4));
  feedbackState.pulse=(feedbackState.pulse+dt*(1.05+feedbackState.critical*.55))%1;
  feedbackState.perfectGlow=Math.max(0,feedbackState.perfectGlow-dt*2.9);
  feedbackState.perfectZoom=Math.max(0,feedbackState.perfectZoom-dt*2.4);
  feedbackState.comboPulse=Math.max(0,feedbackState.comboPulse-dt);
  feedbackState.nearMissZoom=Math.max(0,feedbackState.nearMissZoom-dt*4.2);
  feedbackState.skimZoom=Math.max(0,feedbackState.skimZoom-dt*3.4);
  const flowTarget=dopamineConfig.enableFlowState?THREE.MathUtils.clamp((player.combo-4)/8,0,1):0;
  feedbackState.flow=THREE.MathUtils.lerp(feedbackState.flow,flowTarget,1-Math.exp(-dt*3.2));
  if(ui.flow)ui.flow.classList.toggle('active',feedbackState.flow>.45);

  const heartbeat=.55+.45*Math.sin(feedbackState.pulse*Math.PI*2);
  const panic=feedbackState.critical*(.72+.28*heartbeat);
  if(ui.vignette){
    ui.vignette.style.opacity=panic*.96;
    ui.vignette.style.background=`radial-gradient(circle at 50% 48%,transparent ${45-panic*6}%,rgba(120,0,0,${.16+panic*.24}) 70%,rgba(0,0,0,${.4+panic*.22}) 100%)`;
  }
  const redTint=feedbackState.critical;
  const flowLift=feedbackState.flow*.08+feedbackState.perfectGlow*.1;
  renderer.domElement.style.filter=`saturate(${1-redTint*.3+flowLift}) sepia(${redTint*.12}) hue-rotate(${redTint*-6+feedbackState.flow*2}deg) brightness(${1-redTint*.07+flowLift})`;
  document.body.classList.toggle('flow-state',feedbackState.flow>.38);
  document.body.classList.toggle('final-stand-active',!!player.lastStand);
}
function updateCamera(dt){
  const base=player.group.position.clone().add(new THREE.Vector3(0,3.7,11));
  const panic=feedbackState.critical;
  const heartbeat=Math.sin(feedbackState.pulse*Math.PI*2);
  const criticalShake=panic>0?new THREE.Vector3(Math.sin(feedbackState.pulse*Math.PI*4.1)*.09*panic,heartbeat*.055*panic,0):new THREE.Vector3();
  const s=player.shake>0?new THREE.Vector3((Math.random()-.5)*player.shake,(Math.random()-.5)*player.shake,0):new THREE.Vector3();
  s.add(criticalShake);
  const kickOffset = new THREE.Vector3(0, 0, player.cameraKick || 0);
  camera.position.lerp(base.add(s).add(kickOffset), dt * 4.5);
  camera.lookAt(player.group.position.clone().add(new THREE.Vector3(0,.8,-15)));
  const targetFov=65+feedbackState.skimZoom*.75-feedbackState.nearMissZoom*1.4-feedbackState.perfectZoom*2.6+panic*.7+(dopamineConfig.enableFlowState?feedbackState.flow*.9:0)+(player.lastStand?2.2:0);
  if(Math.abs(camera.fov-targetFov)>.01){
    camera.fov=THREE.MathUtils.lerp(camera.fov,targetFov,1-Math.exp(-dt*5));
    camera.updateProjectionMatrix();
  }
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
  if(ui.warn){
    const critical=player.hp<30&&player.alive;
    ui.warn.style.opacity=critical?1:0;
    ui.warn.classList.toggle('active',critical);
  }
  syncCombatCluster();
  updateReticleState();
  updateRepairIndicator();
}
let last=performance.now();
let hasStarted=false;
let startOverlayDismissed=false;


const desktopGate = document.getElementById('desktopOnlyGate');
const copyGameLinkBtn = document.getElementById('copyGameLinkBtn');



function updateDesktopGate() {
  if (!desktopGate) return;

  const blocked = isUnsupportedDevice();
  desktopGate.hidden = !blocked;

  document.body.classList.toggle('desktop-gated', blocked);
}

copyGameLinkBtn?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    copyGameLinkBtn.textContent = 'LINK COPIED';
    setTimeout(() => {
      copyGameLinkBtn.textContent = 'COPY GAME LINK';
    }, 1400);
  } catch {
    copyGameLinkBtn.textContent = 'COPY FAILED';
  }
});

updateDesktopGate();
window.addEventListener('resize', updateDesktopGate);
window.addEventListener('orientationchange', updateDesktopGate);

function initStartScreen(){
  const startScreen=document.getElementById('startScreen');
  const startBtn=document.getElementById('startSortieBtn');
  const bestScoreEl=document.getElementById('startBestScore');
  const bestComboEl=document.getElementById('startBestCombo');
  
  if(!startScreen)return;
  
  let bestScore=0,bestCombo=0;
  try{
    bestScore=parseInt(localStorage.getItem('skyRepairAce.bestScore'))||0;
    bestCombo=parseInt(localStorage.getItem('skyRepairAce.bestCombo'))||0;
  }catch(e){}
  
  if(bestScoreEl)bestScoreEl.textContent=bestScore;
  if(bestComboEl)bestComboEl.textContent=bestCombo;

  function startGame(){
    if(hasStarted)return;
    hasStarted=true;
    startOverlayDismissed=true;
    startScreen.classList.add('hidden');
    ensureAudio();
    audio.unlock();
    audio.play('start_button', 0.8);
    if(audio.unlocked){
      audio.stopLoop('start_background');
      audio.startLoop('engine_loop',.25);
      audio.startLoop('wind_loop',.12);
      audio.startLoop('distant_battle_loop',.08);
      audio.stopLoop('music_base_loop');
      audio.startLoop('music_elevenlabs_loop',musicVolumeConfig.gameplay);
      audio.startLoop('engine_damaged_loop',0);
    }
    player.startTime=performance.now();
    player.survival=0;
  }
  
  startBtn.addEventListener('click',startGame);
  
  window.addEventListener('keydown',e=>{
    if((e.code==='Enter'||e.code==='Space')&&!hasStarted){
      startGame();
    }
  });

  const interactionUnlock=()=>{
    if(!audio.unlocked&&!hasStarted){
      ensureAudio();
      audio.unlock();
    }
    window.removeEventListener('mousedown',interactionUnlock);
    window.removeEventListener('keydown',interactionUnlock);
  };
  window.addEventListener('mousedown',interactionUnlock);
  window.addEventListener('keydown',interactionUnlock);
}
initStartScreen();

function animate(now=performance.now()){
  requestAnimationFrame(animate);let dt=Math.min((now-last)/1000,.033);last=now;
  if(freezeTimer>0){
    freezeTimer=Math.max(0,freezeTimer-dt);
    dt=0;
  }else{
    if(slowTimer>0){slowTimer-=dt;if(slowTimer<=0)timeScale=1;}
    dt*=timeScale;
  }
  
  updateAim(dt);
  updatePlayerDamageEffects(dt);
  updateAudioMix(dt);
  updateParticles(dt);
  updateVFX(dt);
  updateScorePopups(dt);
  updateFeedbackState(dt);
  updateCamera(dt);
  environment.update(dt,player.survival);
  updateThreatRadar(dt);
  updateUI();

  if(hasStarted){
    updatePlayer(dt);
    updateWaveDirector(dt);
    updateFlakBarrage(dt);
    updateFriendlyEscorts(dt);
    updateSupplyDrop(dt);
    updateEnemies(dt);
    updateMines(dt);
    updateBullets(dt);
    updateCombatComboState(dt);
    updateAmbientCombat(dt);
  }

  if(composer)composer.render();else renderer.render(scene,camera);
}
animate();
