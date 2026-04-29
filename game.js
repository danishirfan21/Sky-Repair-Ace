import * as THREE from 'https://esm.sh/three@0.160.0';

const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x4a2010,.012);
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
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.85,.5,.72));
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
function ensureAudio(){if(!ctx)ctx=new AudioCtx();ctx.resume?.();}
function beep(freq=440,dur=.08,g=.045,type='sine'){
  if(!ctx)return;const o=ctx.createOscillator(),gn=ctx.createGain();o.type=type;o.frequency.value=freq;
  gn.gain.setValueAtTime(g,ctx.currentTime);gn.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+dur);
  o.connect(gn);gn.connect(ctx.destination);o.start();o.stop(ctx.currentTime+dur);
}
function boom(){beep(80,.22,.08,'sawtooth');setTimeout(()=>beep(45,.18,.06,'square'),20);}
function whoosh(){beep(180,.05,.045,'triangle');setTimeout(()=>beep(520,.08,.035,'sine'),35);}

// Lighting
scene.add(new THREE.HemisphereLight(0xffc080,0x1a0808,.8));
const sun=new THREE.DirectionalLight(0xffa050,3);sun.position.set(-30,15,-40);scene.add(sun);
const rim=new THREE.DirectionalLight(0xff7030,1.5);rim.position.set(10,20,30);scene.add(rim);

// Sky shader with fbm clouds
const skyVert=`varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const skyFrag=`
varying vec3 vP;uniform float shift;uniform float uTime;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.+.1;a*=.5;}return v;}
void main(){
  vec3 d=normalize(vP);float h=d.y*.5+.5;
  vec3 hz=vec3(1.,.43,.17),mid=vec3(1.,.69,.25),up=vec3(.23,.16,.28),top=vec3(.04,.02,.06);
  hz=mix(hz,vec3(.3,.08,.02),shift*.6);mid=mix(mid,vec3(.15,.04,.02),shift*.5);
  vec3 sky=h<.3?mix(hz,mid,smoothstep(0.,.3,h)):h<.6?mix(mid,up,smoothstep(.3,.6,h)):mix(up,top,smoothstep(.6,1.,h));
  vec2 uv=d.xz/(d.y+.15)*2.;
  float cl=fbm(uv*1.5+uTime*.02);cl=smoothstep(.35,.7,cl);
  vec3 cL=vec3(1.,.6,.3),cD=vec3(.1,.04,.02);
  float cM=smoothstep(.05,.4,h)*(1.-smoothstep(.6,.9,h));
  sky=mix(sky,mix(cD,cL,pow(cl,.5)),cl*cM*.8);
  vec3 sDir=normalize(vec3(-.6,.15,-.8));float sD=max(0.,dot(d,sDir));
  sky+=vec3(1.,.7,.3)*pow(sD,64.)*2.+vec3(1.,.5,.2)*pow(sD,8.)*.4;
  gl_FragColor=vec4(sky,1.);}`;
const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,
  uniforms:{shift:{value:0},uTime:{value:0}},vertexShader:skyVert,fragmentShader:skyFrag});
const sky=new THREE.Mesh(new THREE.SphereGeometry(500,32,16),skyMat);scene.add(sky);

// Input
const gameKeys=new Set(['Space','KeyW','KeyA','KeyS','KeyD','KeyR','ShiftLeft','ShiftRight']);
const keys=new Set();
window.addEventListener('keydown',e=>{if(gameKeys.has(e.code))e.preventDefault();keys.add(e.code);ensureAudio();});
window.addEventListener('keyup',e=>{if(gameKeys.has(e.code))e.preventDefault();keys.delete(e.code);});

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

const player={group:makePlane(),vel:new THREE.Vector3(),hp:100,score:0,combo:0,maxCombo:0,
  weapon:'single',weaponTimer:0,fireCd:0,shake:0,kills:0,nearMisses:0,alive:true,
  startTime:performance.now(),survival:0};
scene.add(player.group);player.group.rotation.y=Math.PI;

const bullets=[],enemies=[],particles=[];
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

function particle(pos,color=0xffb15f,count=8){
  for(let i=0;i<count;i++){
    const m=new THREE.Mesh(new THREE.SphereGeometry(.05+Math.random()*.08,8,6),
      new THREE.MeshBasicMaterial({color,transparent:true,opacity:1}));
    m.position.copy(pos);scene.add(m);
    particles.push({mesh:m,vel:new THREE.Vector3((Math.random()-.5)*12,(Math.random()-.5)*12,(Math.random()-.5)*12),life:.55+Math.random()*.3,max:.85});
  }
}
function explosion(pos){
  particle(pos,0xffcf6e,24);particle(pos,0xff4b2f,14);
  const l=new THREE.PointLight(0xff7c35,7,18);l.position.copy(pos);scene.add(l);
  particles.push({mesh:l,vel:new THREE.Vector3(),life:.25,max:.25,light:true});
  player.shake=.45;boom();
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
  const tier=tierForCombo(combo);if(tier.id!==player.weapon){flash(.35);beep(900+combo*25,.13,.06,'triangle');}
  player.weapon=tier.id;player.weaponTimer=tier.duration;
  if(ui.weaponName)ui.weaponName.textContent=tier.name;
  if(ui.weaponRule)ui.weaponRule.textContent=tier.rule;
}
function currentTier(){return weaponTiers.find(t=>t.id===player.weapon)||weaponTiers.at(-1);}

function shootOne(offX,angle=0,color=currentTier().color,explosive=false){
  const g=new THREE.Group();
  const mat=new THREE.MeshBasicMaterial({color,fog:false});
  const core=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,1.6,7),mat);
  core.rotation.x=Math.PI/2;g.add(core);
  const glowMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.4,fog:false});
  const glow=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,2.0,7),glowMat);
  glow.rotation.x=Math.PI/2;g.add(glow);
  g.position.copy(player.group.position).add(new THREE.Vector3(offX,.08,-1.7));
  scene.add(g);
  const dir=new THREE.Vector3(Math.sin(angle),0,-Math.cos(angle));
  bullets.push({mesh:g,vel:dir.multiplyScalar(92),life:1.8,hostile:false,explosive});
}
function fireWeapon(){
  const tier=currentTier();
  if(player.weapon==='dual'){shootOne(-.34);shootOne(.34);}
  else if(player.weapon==='spread'){[-.18,-.09,0,.09,.18].forEach(a=>shootOne(0,a));}
  else if(player.weapon==='explosive'){shootOne(0,0,tier.color,true);}
  else if(player.weapon==='overdrive'){[-.22,-.11,0,.11,.22].forEach(a=>shootOne((Math.random()-.5)*.55,a,tier.color,true));}
  else shootOne(0,0,tier.color,false);
  beep(player.weapon==='single'?520:player.weapon==='rapid'?650:760,.035,.025,'square');
}

// UI refs
const ui={};
['hp','score','time','kills','nearCount','maxCombo','enemyCount','warn','nearMiss',
 'key','combo','status','fill','marker','flash','vignette','weaponName','weaponRule',
 'lastStand','finalTime','finalKills','finalCombo','finalNear','resultLine','restart']
.forEach(id=>ui[id]=document.getElementById(id));
ui.box=document.getElementById('repairBox');

const repair={active:false,target:'KeyA',phaseT:0,speed:.8};
const repairKeys=['KeyA','KeyS','KeyD','KeyW'];
function nextRepairPrompt(){
  repair.target=repairKeys[Math.floor(Math.random()*repairKeys.length)];
  if(ui.key)ui.key.textContent=repair.target.replace('Key','');
  repair.phaseT=0;repair.speed=.75+Math.min(1.65,player.combo*.08);
}
function startRepair(){
  repair.active=true;player.combo=0;
  if(ui.box)ui.box.classList.add('active');
  if(ui.status)ui.status.textContent='';
  if(ui.combo)ui.combo.textContent='COMBO x0';
  if(ui.fill)ui.fill.style.width='0%';
  nextRepairPrompt();
}
function endRepair(){repair.active=false;if(ui.box)ui.box.classList.remove('active');}
let timeScale=1,slowTimer=0;
function flash(amt=.55){if(ui.flash)ui.flash.style.opacity=amt;setTimeout(()=>{if(ui.flash)ui.flash.style.opacity=0},90);}
function slowmo(dur=.25,sc=.34){timeScale=sc;slowTimer=dur;}

function repairSuccess(perfect){
  player.combo++;player.maxCombo=Math.max(player.maxCombo,player.combo);
  const heal=perfect?10+player.combo*2.5:5+player.combo*1.6;player.hp=Math.min(100,player.hp+heal);
  if(ui.combo)ui.combo.textContent='COMBO x'+player.combo;
  if(ui.fill)ui.fill.style.width=Math.min(100,player.combo*7)+'%';
  if(ui.status)ui.status.textContent=perfect?'PERFECT WEAPON CHARGE!':'GOOD';
  particle(player.group.position.clone().add(new THREE.Vector3(0,0,.4)),perfect?0x66f7ff:0xffd27a,perfect?12:6);
  beep(perfect?920:520,.09,.045,perfect?'triangle':'sine');
  if(perfect){slowmo(.25,.34);flash(.55);}
  setWeaponFromCombo(player.combo);nextRepairPrompt();
}
function repairFail(){
  player.combo=0;player.hp-=12;
  if(ui.combo)ui.combo.textContent='COMBO x0';if(ui.fill)ui.fill.style.width='0%';
  if(ui.status)ui.status.textContent='MISS - SYSTEM SPARK';
  player.shake=.35;beep(115,.16,.06,'sawtooth');particle(player.group.position,0xff4b2f,10);
  setWeaponFromCombo(0);nextRepairPrompt();
}
function updateRepair(dt){
  repair.phaseT+=dt*repair.speed;const phase=Math.sin(repair.phaseT*Math.PI*2)*.5+.5;
  if(ui.marker)ui.marker.style.left=(phase*300)+'px';
  const perfect=phase>.46&&phase<.54,good=phase>.31&&phase<.69;
  if(keys.has(repair.target)){if(perfect)repairSuccess(true);else if(good)repairSuccess(false);else repairFail();}
  if(player.hp>=100&&player.combo>=3){if(ui.status)ui.status.textContent='SYSTEM RESTORED';endRepair();}
}
function showNearMiss(){
  player.nearMisses++;player.score+=25;player.combo=Math.max(player.combo,0)+1;
  player.maxCombo=Math.max(player.maxCombo,player.combo);
  if(ui.nearMiss){ui.nearMiss.classList.add('show');ui.nearMiss.textContent='NEAR MISS +25';setTimeout(()=>ui.nearMiss.classList.remove('show'),260);}
  if(ui.status)ui.status.textContent='NEAR MISS CHARGE!';
  if(ui.combo)ui.combo.textContent='COMBO x'+player.combo;
  if(ui.fill)ui.fill.style.width=Math.min(100,player.combo*7)+'%';
  particle(player.group.position.clone().add(new THREE.Vector3((Math.random()-.5)*1.6,.1,-.4)),0x9ffcff,8);
  whoosh();slowmo(.14,.55);player.shake=.12;setWeaponFromCombo(player.combo);
}

function enemyBullet(pos,dir){
  const g=new THREE.Group();
  const m=new THREE.Mesh(new THREE.SphereGeometry(.14,8,6),new THREE.MeshBasicMaterial({color:0xff4b2f,fog:false}));
  g.add(m);
  const glow=new THREE.Mesh(new THREE.SphereGeometry(.28,8,6),new THREE.MeshBasicMaterial({color:0xff2200,transparent:true,opacity:.35,fog:false}));
  g.add(glow);
  g.position.copy(pos);scene.add(g);
  bullets.push({mesh:g,vel:dir.multiplyScalar(56),life:3,hostile:true,explosive:false,nearChecked:false});
}
function damagePlayer(n){
  player.hp=Math.max(0,player.hp-n);player.shake=.35;particle(player.group.position,0xff5733,9);
  beep(95,.11,.06,'sawtooth');if(player.hp<=0)endGame();
}
function endGame(){
  if(!player.alive)return;player.alive=false;endRepair();
  if(ui.finalTime)ui.finalTime.textContent=player.survival.toFixed(1)+'s';
  if(ui.finalKills)ui.finalKills.textContent=player.kills;
  if(ui.finalCombo)ui.finalCombo.textContent='x'+player.maxCombo;
  if(ui.finalNear)ui.finalNear.textContent=player.nearMisses;
  const rank=player.survival>70||player.maxCombo>=15?'Legendary clutch pilot':player.survival>40||player.maxCombo>=8?'Elite panic mechanic':'Rookie ace under fire';
  if(ui.resultLine)ui.resultLine.textContent=`${rank} · Score ${player.score}`;
  if(ui.lastStand)ui.lastStand.classList.add('show');flash(.7);boom();
}
function resetGame(){
  bullets.splice(0).forEach(b=>scene.remove(b.mesh));
  enemies.splice(0).forEach(e=>scene.remove(e.group));
  particles.splice(0).forEach(p=>scene.remove(p.mesh));
  Object.assign(player,{hp:100,score:0,combo:0,maxCombo:0,weapon:'single',weaponTimer:0,fireCd:0,shake:0,kills:0,nearMisses:0,alive:true,startTime:performance.now(),survival:0});
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
  if(keys.has('Space')&&!repair.active&&player.fireCd<=0){fireWeapon();player.fireCd=tier.cd;}
  if(player.weaponTimer>0){player.weaponTimer-=dt;if(player.weaponTimer<=0){player.weapon='single';if(ui.weaponName)ui.weaponName.textContent='Single Shot';if(ui.weaponRule)ui.weaponRule.textContent='Combo expired';}}
  player.survival=(performance.now()-player.startTime)/1000;
  skyMat.uniforms.shift.value=Math.min(.9,player.survival/90);
  skyMat.uniforms.uTime.value=player.survival;
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
function updateBullets(dt){
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];b.mesh.position.addScaledVector(b.vel,dt);b.life-=dt;
    if(b.life<=0){scene.remove(b.mesh);bullets.splice(i,1);continue;}
    if(b.hostile){
      const d=b.mesh.position.distanceTo(player.group.position);
      if(d<.9){damagePlayer(7);scene.remove(b.mesh);bullets.splice(i,1);continue;}
      if(repair.active&&!b.nearChecked&&d>1.0&&d<2.15&&Math.abs(b.mesh.position.z-player.group.position.z)<1.2){b.nearChecked=true;showNearMiss();}
    }else{
      for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];
        if(b.mesh.position.distanceTo(e.group.position)<1.35){
          e.hp-=b.explosive?3:1;particle(b.mesh.position,0xffd27a,5);
          if(b.explosive)explosion(e.group.position.clone());
          scene.remove(b.mesh);bullets.splice(i,1);
          if(e.hp<=0){explosion(e.group.position);scene.remove(e.group);enemies.splice(j,1);player.kills++;player.score+=50;}break;
        }
      }
    }
  }
}
function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];p.life-=dt;if(p.life<=0){scene.remove(p.mesh);particles.splice(i,1);continue;}
    if(p.light){p.mesh.intensity=7*(p.life/p.max);}
    else{p.mesh.position.addScaledVector(p.vel,dt);p.mesh.material.opacity=Math.max(0,p.life/p.max);}
  }
}
function updateCamera(dt){
  const base=player.group.position.clone().add(new THREE.Vector3(0,3.7,11));
  const s=player.shake>0?new THREE.Vector3((Math.random()-.5)*player.shake,(Math.random()-.5)*player.shake,0):new THREE.Vector3();
  camera.position.lerp(base.add(s),dt*4.5);
  camera.lookAt(player.group.position.clone().add(new THREE.Vector3(0,.8,-15)));
  player.shake=Math.max(0,player.shake-dt*1.8);
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
}
let last=performance.now();
function animate(now=performance.now()){
  requestAnimationFrame(animate);let dt=Math.min((now-last)/1000,.033);last=now;
  if(slowTimer>0){slowTimer-=dt;if(slowTimer<=0)timeScale=1;}dt*=timeScale;
  updatePlayer(dt);updateEnemies(dt);updateBullets(dt);updateParticles(dt);updateCamera(dt);updateUI();
  if(composer)composer.render();else renderer.render(scene,camera);
}
animate();
