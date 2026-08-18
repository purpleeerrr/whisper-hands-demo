(()=>{
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const app=$('#app'), world=$('#world'), ctx=world.getContext('2d',{alpha:false});
ctx.imageSmoothingEnabled=false;
const flash=$('#flash');
const scenes={intro:$('#introScene'),gate:$('#gateScene'),hardware:$('#hardwareScene'),clue:$('#clueScene'),followup:$('#followupScene'),stars:$('#starScene'),ways:$('#wayScene'),magic:$('#magicScene'),ships:$('#shipScene'),works:$('#workScene'),complete:$('#completeScene'),handoff:$('#handoffScene')};
let active='intro', trans=null;
const pointer={x:.5,y:.5,down:false,sx:0,sy:0,lx:0,ly:0};
let W=innerWidth,H=innerHeight;
const meaningStore=window.WhisperMeaningStore||null;
const aiAdapter=window.WhisperAI||null;
const creatorIdentityStore=window.WhisperCreatorIdentityStore||null;
const completionSummaryBuilder=window.WhisperCompletionSummary||null;
const PLANET_CONFIG=new Map([
  ['一件喜欢的作品',{dimension:'aesthetic',identity:false}],
  ['一个反复想到的人',{dimension:'meaning_association',identity:false}],
  ['一处忘不掉的场景',{dimension:'meaning_association',identity:false}],
  ['一种想尝试的材料',{dimension:'making_process',identity:false}],
  ['一个总会注意的细节',{dimension:'attention',identity:true}],
  ['一句现在想说的话',{dimension:'language_voice',identity:false}]
]);
const IDENTITY_PLANETS=new Set([...PLANET_CONFIG].filter(([,config])=>config.identity).map(([title])=>title));
const restoredMeaningState=meaningStore?meaningStore.getState():null;
const restoredUi=restoredMeaningState?.ui||{};
const state={clue:restoredUi.clue||'',clueText:restoredUi.clueText||'',clueImage:'',clueImageMeta:null,clueEntries:restoredUi.clueEntries||{},currentSourceId:'',attention:Array.isArray(restoredUi.attention)?restoredUi.attention:[],ways:Array.isArray(restoredUi.ways)?restoredUi.ways:[],followUpQuestion:restoredUi.followUpQuestion||'',followUpAnswer:restoredUi.followUpAnswer||'',followUpSourceId:restoredUi.followUpSourceId||'',mode:restoredUi.mode||'',works:Array.isArray(restoredUi.works)?restoredUi.works:[]};
function persistableClueEntries(){return Object.fromEntries(Object.entries(state.clueEntries).map(([key,value])=>[key,{text:value.text||'',image:'',imageMeta:value.imageMeta||null,dimension:value.dimension||PLANET_CONFIG.get(key)?.dimension||'meaning_association',sourceId:value.sourceId||'',followUpQuestion:value.followUpQuestion||'',followUpAnswer:value.followUpAnswer||'',followUpSourceId:value.followUpSourceId||''}]))}
let colorLevel=0, camera={x:0,y:0,s:1,tx:0,ty:0,ts:1};
const palette=['#7ea4bd','#b980a0','#7d9c7b','#c99561','#8d80b6','#b9d26f'];
function setOverlayOpen(v){document.body.classList.toggle('overlay-open',!!v)}

function ease(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function resize(){W=innerWidth;H=innerHeight;world.style.width=W+'px';world.style.height=H+'px'}addEventListener('resize',resize);resize();
addEventListener('pointermove',e=>{pointer.x=e.clientX/W;pointer.y=e.clientY/H;pointer.lx=e.clientX;pointer.ly=e.clientY});
const trailCanvas=$('#trailCanvas'), trailCtx=trailCanvas.getContext('2d'); let trailDots=[],cursorFlowers=[];let flowerLast={x:W/2,y:H/2},flowerStamp=0;
function resizeTrail(){trailCanvas.width=W;trailCanvas.height=H}resizeTrail();addEventListener('resize',resizeTrail);
let trailLast={x:W/2,y:H/2};addEventListener('pointermove',e=>{const dist=Math.hypot(e.clientX-trailLast.x,e.clientY-trailLast.y);if(dist>9){trailDots.push({x:e.clientX,y:e.clientY,life:1});trailLast={x:e.clientX,y:e.clientY}}const now=performance.now();if(active==='intro'&&Math.hypot(e.clientX-flowerLast.x,e.clientY-flowerLast.y)>42&&now-flowerStamp>110){cursorFlowers.push({x:e.clientX,y:e.clientY,life:1,grow:0,c:palette[cursorFlowers.length%palette.length]});flowerLast={x:e.clientX,y:e.clientY};flowerStamp=now}});
function drawTrail(){
  trailCtx.clearRect(0,0,W,H);
  for(let i=trailDots.length-1;i>=0;i--){const p=trailDots[i];p.life-=.075;if(p.life<=0){trailDots.splice(i,1);continue}trailCtx.globalAlpha=p.life*.58;trailCtx.fillStyle=i%4===0?'#fff':'#9fe7ff';trailCtx.fillRect(Math.round(p.x),Math.round(p.y),2,2)}
  for(let i=cursorFlowers.length-1;i>=0;i--){const f=cursorFlowers[i];f.grow=Math.min(1,f.grow+.075);f.life-=.008;if(f.life<=0){cursorFlowers.splice(i,1);continue}const a=Math.min(1,f.grow*2)*Math.min(1,f.life*2);trailCtx.globalAlpha=a*.9;const s=2+Math.round(f.grow*3),x=Math.round(f.x),y=Math.round(f.y);trailCtx.fillStyle=f.c;trailCtx.fillRect(x-s*2,y,s*4,2);trailCtx.fillRect(x,y-s*2,2,s*4);trailCtx.fillStyle='#fff4d8';trailCtx.fillRect(x,y,2,2);if(f.grow>.65){trailCtx.globalAlpha=a*.45;trailCtx.fillStyle=f.c;trailCtx.fillRect(x-7,y-7,2,2);trailCtx.fillRect(x+7,y+7,2,2)}}
  trailCtx.globalAlpha=1;
}
const buddyOcto=$('#buddyOcto'), buddyMsg=$('#buddyMsg'); const bctx=buddyOcto.getContext('2d'); bctx.imageSmoothingEnabled=false;
function drawBuddy(){bctx.clearRect(0,0,64,56);const px=(x,y,w=2,h=2,c='#7fe6f2',a=1)=>{bctx.globalAlpha=a;bctx.fillStyle=c;bctx.fillRect(x,y,w,h);bctx.globalAlpha=1};for(let y=-10;y<=8;y+=2){for(let x=-14;x<=14;x+=2){const dx=x/14,dy=(y+1)/11;if(dx*dx+dy*dy<1)px(30+x,22+y,2,2,dx*dx+dy*dy>.68?'#b5a8ff':'#7fe6f2')}}px(24,21,3,3,'#fff');px(34,21,3,3,'#fff');px(25,22,1,1,'#05060b');px(35,22,1,1,'#05060b');[[16,31,12,40],[22,31,20,43],[28,31,28,44],[34,31,36,43],[40,31,44,40]].forEach((a,i)=>{for(let s=0;s<=8;s++){const t=s/8;px(a[0]+(a[2]-a[0])*t,a[1]+(a[3]-a[1])*t,2,2,i%2?'#7fe6f2':'#b5a8ff')}});[[10,14],[49,13],[52,31]].forEach((q,i)=>{px(q[0],q[1],2,2,i===1?'#c9ef7a':'#ffd77a');px(q[0]-2,q[1],2,2,'#fff',.35);px(q[0]+2,q[1],2,2,'#fff',.35)})}drawBuddy();
let buddyTimer=0; function sayBuddy(text,dur=2500){buddyMsg.textContent=text; buddyMsg.classList.add('show'); clearTimeout(buddyTimer); buddyTimer=setTimeout(()=>buddyMsg.classList.remove('show'),dur)}


/* seeded noise */
let seed=38127;function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
const stars=Array.from({length:150},()=>({x:rnd()*480,y:rnd()*270,a:.18+rnd()*.65,s:rnd()<.82?1:2,p:rnd()*6.28}));
const dust=Array.from({length:520},()=>({x:rnd()*480,y:rnd()*270,n:rnd(),a:.08+rnd()*.25}));
function pxRect(x,y,w,h,c,a=1){ctx.globalAlpha=a;ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));ctx.globalAlpha=1}
function ditherRect(x,y,w,h,base='#666',density=.5,step=3,phase=0){for(let yy=y;yy<y+h;yy+=step){for(let xx=x;xx<x+w;xx+=step){const k=((xx/step*13+yy/step*7+phase*19)%17)/17;if(k<density)pxRect(xx,yy,step-1,step-1,base,.72)}}}
function ditherEllipse(cx,cy,rx,ry,c,density=.45,step=3,phase=0){for(let y=cy-ry;y<=cy+ry;y+=step){for(let x=cx-rx;x<=cx+rx;x+=step){const dx=(x-cx)/rx,dy=(y-cy)/ry;if(dx*dx+dy*dy<1){const k=((Math.floor(x/step)*11+Math.floor(y/step)*5+phase*7)%19)/19;if(k<density*(1-.22*(dx*dx+dy*dy)))pxRect(x,y,step-1,step-1,c,.68)}}}}
function circlePixel(cx,cy,r,phase=0,tint=null){ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();pxRect(cx-r,cy-r,r*2,r*2,'#111');for(let y=cy-r;y<=cy+r;y+=2){for(let x=cx-r;x<=cx+r;x+=2){const dx=(x-cx)/r,dy=(y-cy)/r;if(dx*dx+dy*dy<=1){const light=clamp(.78-(dx+.38)*(dx+.38)*.64-(dy+.35)*(dy+.35)*.5,0,1);const n=((x*7+y*13+phase*17)%23)/23;let g=Math.round(40+light*125+(n-.5)*35);let c=`rgb(${g},${g},${g})`;if(tint&&colorLevel>0){const mix=clamp(colorLevel*.16,0,.48);const tc=hexToRgb(tint);c=`rgb(${Math.round(g*(1-mix)+tc.r*mix)},${Math.round(g*(1-mix)+tc.g*mix)},${Math.round(g*(1-mix)+tc.b*mix)})`}pxRect(x,y,2,2,c,.95)}}}ctx.restore();ctx.strokeStyle='rgba(230,230,225,.28)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,r+.5,0,Math.PI*2);ctx.stroke()}
function hexToRgb(h){const n=parseInt(h.slice(1),16);return{r:(n>>16)&255,g:(n>>8)&255,b:n&255}}
function sceneKeyFromEl(el){if(!el)return active;const id=el.id||'';return id.replace('Scene','').replace('star','stars').replace('way','ways').replace('ship','ships').replace('work','works')}
function glowDisc(x,y,r,c,a=.3){ctx.save();const g=ctx.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,c);g.addColorStop(.2,c);g.addColorStop(1,'rgba(0,0,0,0)');ctx.globalAlpha=a;ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore()}
function backdropPlanet(x,y,r,c,phase=0,a=.18){ctx.save();ctx.globalAlpha=a;const rgb=hexToRgb(c);const g=ctx.createRadialGradient(x-r*.28,y-r*.25,r*.08,x,y,r*1.35);g.addColorStop(0,`rgba(${rgb.r},${rgb.g},${rgb.b},.75)`);g.addColorStop(.48,`rgba(${rgb.r},${rgb.g},${rgb.b},.28)`);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-r*1.4,y-r*1.4,r*2.8,r*2.8);ditherEllipse(x,y,r,r*.92,c,.16,4,phase);ctx.restore()}
function pixelNebula(cx,cy,rx,ry,color,density=.36,step=4,phase=0,alpha=.6){ctx.save();const rgb=hexToRgb(color);for(let y=cy-ry;y<=cy+ry;y+=step){for(let x=cx-rx;x<=cx+rx;x+=step){const dx=(x-cx)/rx,dy=(y-cy)/ry,q=dx*dx+dy*dy;if(q<1){const k=((Math.floor(x/step)*17+Math.floor(y/step)*9+phase*11)%29)/29;if(k<density*(1-q*.58)){const fall=(1-q)*alpha;pxRect(x,y,step-1,step-1,`rgb(${rgb.r},${rgb.g},${rgb.b})`,fall)}}}}ctx.restore()}
function bgStars(t,parX,parY,alpha=1,scale=1){ctx.save();ctx.globalAlpha=alpha;stars.forEach((s,i)=>{const tw=.56+.44*Math.sin(t*.0011+s.p);const x=240+(s.x-240)*scale+s.s*parX*.08,y=135+(s.y-135)*scale+s.s*parY*.08;const col=i%13===0?'#bdefff':i%17===0?'#d9c7ff':'#d8d9df';pxRect(x,y,s.s<2?1:2,s.s<2?1:2,col,s.a*tw)});ctx.restore()}

function drawIntroGarden(t,parX,parY,alpha=1){
  ctx.save();ctx.globalAlpha=alpha;
  pixelNebula(116,78,142,82,'#365e87',.22,4,2,.43);
  pixelNebula(365,182,154,86,'#70539a',.24,4,7,.48);
  pixelNebula(315,62,104,54,'#9c5f7d',.17,5,4,.32);
  // off-centre garden core: intentionally not the reference-style central portal
  const cx=304+parX*.06,cy=124+parY*.04;
  glowDisc(cx,cy,88,'#77ddec',.07);circlePixel(cx,cy,31,Math.floor(t/240),palette[0]);
  ctx.strokeStyle='rgba(165,216,224,.22)';ctx.lineWidth=1;
  [0,1,2].forEach(i=>{ctx.beginPath();ctx.ellipse(cx,cy,68+i*33,20+i*12,-.48+i*.37+t*.000018*(i%2?1:-1),0,Math.PI*2);ctx.stroke()});
  // flower constellation grows across the lower half
  for(let i=0;i<18;i++){const a=i*.71+t*.000012,r=60+(i%6)*31,x=cx+Math.cos(a)*r*1.45,y=cy+Math.sin(a)*r*.64;const c=palette[(i+2)%palette.length];if(i%3===0)glowDisc(x,y,16,c,.055);pxRect(x-3,y,7,2,c,.52);pxRect(x,y-3,2,7,c,.52);pxRect(x,y,2,2,'#fff',.72)}
  backdropPlanet(75+parX*.04,210+parY*.03,18,'#6d7c95',3,.08);
  ctx.restore();
}
function drawStation(t,parX,parY,alpha=1){ctx.save();ctx.globalAlpha=alpha;ditherEllipse(239+parX*.2,127+parY*.15,207,96,'#535767',.39,3,1);ditherEllipse(240,131,187,80,'#303442',.3,4,2);pixelNebula(240,112,190,72,'#445f77',.15,5,3,.26);ditherRect(26+parX*.35,75+parY*.2,77,68,'#5b6072',.42,4,2);ditherRect(377+parX*.3,72+parY*.2,72,71,'#4d5268',.42,4,5);ditherRect(26,177,105,20,'#555a68',.4,4,4);ditherRect(359,177,102,19,'#595d70',.4,4,7);const cx=240+parX*.13,cy=129+parY*.09,r=82;glowDisc(cx,cy,r+34,'#77ddec',.08);ctx.fillStyle='#010209';ctx.beginPath();ctx.arc(cx,cy,r-3,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(115,217,231,.2)';ctx.lineWidth=13;ctx.beginPath();ctx.arc(cx,cy,r+2,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='rgba(231,235,240,.78)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,r-5,.58,5.73);ctx.stroke();circlePixel(cx,cy,16,Math.floor(t/180),colorLevel>.4?palette[0]:null);ctx.restore()}
function drawHardwareSky(t,parX,parY,alpha=1){
  ctx.save();ctx.globalAlpha=alpha;
  pixelNebula(90,88,132,82,'#477f9e',.28,4,3,.48);
  pixelNebula(405,188,130,82,'#74559a',.25,4,7,.44);
  pixelNebula(384,42,86,42,'#b66f8c',.16,5,4,.28);
  // Far planets stay close to the frame edges, leaving the pairing planet a clean stage.
  backdropPlanet(43+parX*.03,225+parY*.02,18,'#55789c',2,.055);
  backdropPlanet(447+parX*.03,42+parY*.02,21,'#795f9f',5,.05);
  for(let i=0;i<12;i++){const a=i*.91+t*.000018,r=170+(i%3)*27,x=240+Math.cos(a)*r*1.32,y=135+Math.sin(a)*r*.64;pxRect(x,y,2,2,i%2?'#a4dded':'#cab9f2',.2)}
  ctx.restore();
}
function drawDeepGarden(t,parX,parY,alpha=1){ctx.save();ctx.globalAlpha=alpha;pixelNebula(112,83,150,94,'#4f95b6',.34,4,3,.62);pixelNebula(382,178,165,104,'#7656ae',.32,4,7,.6);pixelNebula(310,54,112,54,'#b66886',.24,4,5,.46);backdropPlanet(72+parX*.08,205+parY*.06,27,'#55789c',2,.11);backdropPlanet(417+parX*.06,67+parY*.05,36,'#795f9f',5,.09);for(let i=0;i<4;i++){const a=i*1.55+t*.00002*(i%2?1:-1),rr=72+i*34,x=240+Math.cos(a)*rr*1.65,y=136+Math.sin(a)*rr*.6;const c=palette[i%palette.length];backdropPlanet(x,y,8+(i%2)*4,c,i,.13)}ctx.restore()}
function drawOrbitSky(t,parX,parY,alpha=1,mode='stars'){ctx.save();ctx.globalAlpha=alpha;pixelNebula(mode==='ways'?125:370,mode==='ways'?185:80,155,88,mode==='ways'?'#547a67':'#536f9b',.25,4,4,.5);pixelNebula(mode==='ways'?382:116,mode==='ways'?76:190,120,74,mode==='ways'?'#9b744d':'#70518d',.22,4,7,.42);ctx.translate(240,135);ctx.strokeStyle='rgba(180,210,235,.18)';ctx.lineWidth=1;for(let i=0;i<5;i++){ctx.save();ctx.rotate(-.55+i*.28);ctx.scale(1,.28+i*.045);ctx.beginPath();ctx.arc(0,0,82+i*28,0,Math.PI*2);ctx.stroke();ctx.restore()}ctx.translate(-240,-135);for(let i=0;i<12;i++){const a=i*.73+t*.000055*(i%3?1:-1),r=62+(i%5)*32,x=240+Math.cos(a)*r*1.78,y=135+Math.sin(a)*r*.74;const c=palette[i%palette.length];glowDisc(x,y,13+(i%4)*4,c,.08);pxRect(x-2,y-2,4+(i%3),4+(i%3),'#fff',.65)}ctx.restore()}
function drawQuietNebula(t,parX,parY,alpha=1){ctx.save();ctx.globalAlpha=alpha;pixelNebula(120,145,180,105,'#465c84',.22,5,3,.36);pixelNebula(382,118,165,100,'#765780',.24,5,9,.38);glowDisc(240,125,130,'#a99cff',.05);for(let i=0;i<18;i++){const x=40+(i*83)%430,y=40+(i*47)%190;pxRect(x,y,2,2,i%3?'#b8cde3':'#e1c7db',.26+.2*Math.sin(t*.001+i))}ctx.restore()}
function drawMagicSky(t,parX,parY,alpha=1){ctx.save();ctx.globalAlpha=alpha;pixelNebula(240,190,175,130,'#4c6f82',.23,4,4,.4);pixelNebula(240,50,120,90,'#89648e',.22,4,8,.44);for(let i=0;i<10;i++){const x=170+i*17+Math.sin(t*.0004+i)*12;ctx.strokeStyle=i%2?'rgba(115,217,231,.16)':'rgba(255,143,174,.12)';ctx.beginPath();ctx.moveTo(x,270);ctx.quadraticCurveTo(x-28,160,x+Math.sin(i)*18,0);ctx.stroke()}ctx.restore()}
function drawDock(t,parX,parY,alpha=1){ctx.save();ctx.globalAlpha=alpha;pixelNebula(92,72,115,72,'#426e7f',.25,4,2,.42);pixelNebula(390,70,120,76,'#7a5d8e',.24,4,5,.45);ditherRect(0,208,480,62,'#202633',.33,4,4);ditherRect(30,183,120,30,'#3a4651',.32,4,7);ditherRect(330,181,120,32,'#493b4d',.32,4,9);ctx.strokeStyle='rgba(176,211,226,.24)';ctx.beginPath();ctx.moveTo(0,209);ctx.lineTo(170,205);ctx.lineTo(240,184);ctx.lineTo(310,205);ctx.lineTo(480,209);ctx.stroke();glowDisc(240,188,78,'#ffd166',.06);ctx.restore()}
function drawWorkGarden(t,parX,parY,alpha=1){ctx.save();ctx.globalAlpha=alpha;pixelNebula(110,90,160,95,'#477b91',.28,4,2,.5);pixelNebula(372,95,150,88,'#835f96',.27,4,6,.52);pixelNebula(250,218,190,58,'#587b67',.26,4,8,.38);for(let i=0;i<22;i++){const a=i*.79+t*.000018,r=58+(i%7)*27,x=240+Math.cos(a)*r*1.62,y=135+Math.sin(a)*r*.72;const c=palette[i%palette.length];if(i%3===0)glowDisc(x,y,20,c,.08);pxRect(x-2,y-2,4,4,c,.55)}// pixel flower clusters along horizon
for(let i=0;i<15;i++){const x=35+i*31,y=225+Math.sin(i*.9)*8,c=palette[i%palette.length];pxRect(x-3,y,7,2,c,.62);pxRect(x,y-3,2,7,c,.62);pxRect(x,y,2,2,'#fff',.7)}ctx.restore()}
function drawSceneWorld(key,t,alpha,parX,parY){bgStars(t,parX,parY,alpha,key==='intro'||key==='gate'?1:1.08);if(!app.classList.contains('world-visible'))return;if(key==='intro')drawIntroGarden(t,parX,parY,alpha);else if(key==='gate')drawStation(t,parX,parY,alpha);else if(key==='hardware')drawHardwareSky(t,parX,parY,alpha);else if(key==='clue')drawDeepGarden(t,parX,parY,alpha);else if(key==='stars'||key==='ways')drawOrbitSky(t,parX,parY,alpha,key);else if(key==='followup'||key==='handoff')drawQuietNebula(t,parX,parY,alpha);else if(key==='magic')drawMagicSky(t,parX,parY,alpha);else if(key==='ships')drawDock(t,parX,parY,alpha);else if(key==='works'||key==='complete')drawWorkGarden(t,parX,parY,alpha);}
function drawWorld(t){drawTrail();const cw=480,ch=270;ctx.setTransform(1,0,0,1,0,0);pxRect(0,0,cw,ch,'#02030a');const parX=(pointer.x-.5)*6,parY=(pointer.y-.5)*4;camera.x+=(camera.tx-camera.x)*.045;camera.y+=(camera.ty-camera.y)*.045;camera.s+=(camera.ts-camera.s)*.045;ctx.save();ctx.translate(240,135);ctx.scale(camera.s,camera.s);ctx.translate(-240+camera.x+parX*.12,-135+camera.y+parY*.12);if(trans){const p=clamp((performance.now()-trans.start)/trans.dur,0,1),e=ease(p),oldKey=sceneKeyFromEl(trans.from);drawSceneWorld(oldKey,t,1-e,parX,parY);drawSceneWorld(active,t,e,parX,parY)}else drawSceneWorld(active,t,1,parX,parY);ctx.restore();requestAnimationFrame(drawWorld)}requestAnimationFrame(drawWorld);

/* audio */
let ac=null,master=null,musicBus=null,fxBus=null,music=true,fx=true,drone=null,ambienceTimer=null,ambienceStep=0,delayNode=null,audioArmed=false;
function initAudio(){
  if(ac)return;
  ac=new (window.AudioContext||window.webkitAudioContext)();
  master=ac.createGain(); master.gain.value=.18; master.connect(ac.destination);
  musicBus=ac.createGain(); musicBus.gain.value=music?.78:0; musicBus.connect(master);
  fxBus=ac.createGain(); fxBus.gain.value=fx?1.75:0; fxBus.connect(master);
  delayNode=ac.createDelay(.9); delayNode.delayTime.value=.36;
  const feedback=ac.createGain(); feedback.gain.value=.24;
  const wet=ac.createGain(); wet.gain.value=.32;
  delayNode.connect(feedback); feedback.connect(delayNode); delayNode.connect(wet); wet.connect(musicBus);
  // soft nocturnal pad: open fifth + suspended color
  const freqs=[55,82.41,110,146.83];
  const oscs=[]; const padGain=ac.createGain(); padGain.gain.value=.10;
  const filt=ac.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=720; filt.Q.value=.35;
  freqs.forEach((f,i)=>{const o=ac.createOscillator(); o.type=i%2?'sine':'triangle'; o.frequency.value=f; const g=ac.createGain(); g.gain.value=[.34,.22,.15,.08][i]; o.connect(g); g.connect(padGain); o.start(); oscs.push(o)});
  padGain.connect(filt); filt.connect(musicBus);
  const lfo=ac.createOscillator(),lfoG=ac.createGain(); lfo.frequency.value=.055; lfoG.gain.value=120; lfo.connect(lfoG); lfoG.connect(filt.frequency); lfo.start();
  // very low filtered air/noise for depth
  const len=ac.sampleRate*2,buf=ac.createBuffer(1,len,ac.sampleRate),data=buf.getChannelData(0); for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*.22;
  const noise=ac.createBufferSource(),ng=ac.createGain(),nf=ac.createBiquadFilter(); noise.buffer=buf; noise.loop=true; ng.gain.value=.038; nf.type='lowpass'; nf.frequency.value=520; noise.connect(nf); nf.connect(ng); ng.connect(musicBus); noise.start();
  drone={oscs,padGain,filt,lfo,noise,ng};
  startAmbience();
}
function chime(freq,d=.72,vol=.045,when=0){
  if(!music)return; initAudio(); const t=ac.currentTime+when;
  const o=ac.createOscillator(),g=ac.createGain(),f=ac.createBiquadFilter(); o.type='sine'; o.frequency.setValueAtTime(freq,t); o.frequency.exponentialRampToValueAtTime(freq*.997,t+d); f.type='lowpass'; f.frequency.value=2400;
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+.035); g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(f); f.connect(g); g.connect(musicBus); g.connect(delayNode); o.start(t); o.stop(t+d+.08)
}
function startAmbience(){
  if(ambienceTimer)return;
  const scale=[220,246.94,293.66,329.63,369.99,440,493.88];
  ambienceTimer=setInterval(()=>{if(!music||!ac)return;const i=(ambienceStep*3+[0,2,5,1,4,6,3][ambienceStep%7])%scale.length;const base=scale[i];chime(base,1.45,.032);if(ambienceStep%4===2)chime(base*2,1.15,.018,.18);ambienceStep++;},2350)
}
function tone(freq=680,d=.1,vol=.028){
  if(!fx)return;initAudio();const o=ac.createOscillator(),g=ac.createGain(),f=ac.createBiquadFilter();o.type='sine';o.frequency.value=freq;f.type='lowpass';f.frequency.value=3200;g.gain.setValueAtTime(0,ac.currentTime);g.gain.linearRampToValueAtTime(Math.max(.035,vol*2.2),ac.currentTime+.012);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+Math.max(.12,d));o.connect(f);f.connect(g);g.connect(fxBus);o.start();o.stop(ac.currentTime+Math.max(.15,d)+.04)
}
function transitionWhoosh(){if(!fx)return;initAudio();const o=ac.createOscillator(),g=ac.createGain(),f=ac.createBiquadFilter();o.type='triangle';o.frequency.setValueAtTime(150,ac.currentTime);o.frequency.exponentialRampToValueAtTime(310,ac.currentTime+.42);f.type='lowpass';f.frequency.setValueAtTime(550,ac.currentTime);f.frequency.exponentialRampToValueAtTime(1500,ac.currentTime+.42);g.gain.setValueAtTime(.0001,ac.currentTime);g.gain.exponentialRampToValueAtTime(.05,ac.currentTime+.08);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.48);o.connect(f);f.connect(g);g.connect(fxBus);o.start();o.stop(ac.currentTime+.52)}
function armDefaultAudio(){
  if(audioArmed||(!music&&!fx))return; audioArmed=true; initAudio();
  if(ac.state==='suspended')ac.resume();
  master.gain.cancelScheduledValues(ac.currentTime); master.gain.setTargetAtTime(.18,ac.currentTime,.22);
  chime(220,1.6,.025); setTimeout(()=>chime(329.63,1.3,.022),240);
}
['pointerdown','touchstart','keydown'].forEach(type=>addEventListener(type,armDefaultAudio,{once:true,passive:true}));
addEventListener('wheel',armDefaultAudio,{once:true,passive:true});
$('#musicBtn').addEventListener('click',()=>{music=!music;$('#musicBtn').textContent=music?'MUSIC ON':'MUSIC OFF';$('#musicBtn').classList.toggle('on',music);if(!ac&&music){audioArmed=false;armDefaultAudio();return}if(musicBus){musicBus.gain.cancelScheduledValues(ac.currentTime);musicBus.gain.setTargetAtTime(music?.78:0,ac.currentTime,.14)}if(music)chime(293.66,1.2,.034)});
$('#fxBtn').addEventListener('click',()=>{fx=!fx;$('#fxBtn').textContent=fx?'FX ON':'FX OFF';$('#fxBtn').classList.toggle('on',fx);if(!ac&&fx){audioArmed=false;armDefaultAudio();return}if(fxBus){fxBus.gain.cancelScheduledValues(ac.currentTime);fxBus.gain.setTargetAtTime(fx?1.75:0,ac.currentTime,.08)}if(fx)tone(440,.3,.042)});

/* scene transition through one timeline */
function setVisible(scene,opacity,x=0,scale=1,blur=0,y=0){scene.style.visibility=opacity>.01?'visible':'hidden';scene.style.pointerEvents=opacity>.985?'auto':'none';scene.style.opacity=opacity;const layer=$('.scene-layer',scene);if(layer){layer.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;layer.style.filter=`blur(${blur}px)`}}
function go(name,mode='fade',after){if(name===active)return;transitionWhoosh();const from=scenes[active],to=scenes[name];const isLeft=mode==='left',isTunnel=mode==='tunnel',isZoom=mode==='zoom'||isTunnel;setVisible(to,0,isLeft?W*.16:0,isTunnel?.64:isZoom?.76:.96,isTunnel?18:isZoom?12:6,isLeft?10:0);to.classList.add('active');const start=performance.now(),dur=isTunnel?680:isZoom?1120:isLeft?820:720;trans={from,to,name,mode,start,dur,after};active=name;meaningStore?.setProgress(name)}
function tickTrans(now){if(!trans)return;const t=clamp((now-trans.start)/trans.dur,0,1),e=1-Math.pow(1-t,5);const{from,to,mode}=trans;if(mode==='left'){setVisible(from,1-e,-W*.30*e,1+e*.055,e*2,-6*e);setVisible(to,e,W*.16*(1-e),.95+.05*e,(1-e)*5,10*(1-e))}else if(mode==='zoom'||mode==='tunnel'){const fast=mode==='tunnel';setVisible(from,1-e,0,1+e*(fast?1.05:.72),e*(fast?24:18),0);setVisible(to,e,0,(fast?.62:.70)+(fast?.38:.30)*e,(1-e)*(fast?18:14),0)}else{setVisible(from,1-e,-20*e,1+e*.04,e*8,0);setVisible(to,e,20*(1-e),.95+.05*e,(1-e)*8,0)}if(t>=1){from.classList.remove('active');setVisible(from,0);setVisible(to,1);const a=trans.after;trans=null;if(a)a()}}
function anim(now){tickTrans(now);requestAnimationFrame(anim)}requestAnimationFrame(anim);

/* Intro timeline */
setTimeout(()=>{$('#introQuote').animate([{opacity:0,transform:'translate(-50%,-48%)'},{opacity:1,transform:'translate(-50%,-50%)'}],{duration:1300,fill:'forwards',easing:'ease-out'})},450);
setTimeout(()=>{app.classList.add('world-visible');$('#introQuote').animate([{opacity:1},{opacity:0}],{duration:1200,fill:'forwards'});$('#introSide').animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:1200,fill:'forwards'})},2600);
setTimeout(()=>{$('#introSide').animate([{opacity:1},{opacity:0}],{duration:700,fill:'forwards'});$('#heroLeft').animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:1050,fill:'forwards'});$('#heroRight').animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:1050,fill:'forwards'});$('#introSwipe').animate([{opacity:0},{opacity:1}],{duration:900,fill:'forwards'})},4300);
let introReady=false;setTimeout(()=>{introReady=true;sayBuddy('先慢一点看，等一句话和你对上眼。',2600)},5400);
function introAdvance(){if(!introReady||active!=='intro')return;camera.ts=1.23;camera.tx=0;camera.ty=2;sayBuddy('准备进入宇宙。',1800);go('gate','zoom')}
addEventListener('wheel',e=>{if(active==='intro'&&Math.abs(e.deltaY)>20)introAdvance();else if(active==='clue'&&e.deltaX>28)goStars();else if(active==='complete'&&e.deltaY>28)startHandoff()},{passive:false});
let globalSwipe=null;
addEventListener('pointerdown',e=>{if(e.target.closest('.orbit-field,.editor,.cargo,.work-detail'))return;globalSwipe={x:e.clientX,y:e.clientY,dx:0,dy:0};});
addEventListener('pointermove',e=>{if(!globalSwipe||trans)return;globalSwipe.dx=e.clientX-globalSwipe.x;globalSwipe.dy=e.clientY-globalSwipe.y;const scene=scenes[active],layer=$('.scene-layer',scene);if(!layer||!['intro','clue','complete'].includes(active))return;const isLeft=active==='clue',offset=isLeft?Math.min(0,globalSwipe.dx*.34):Math.min(0,globalSwipe.dy*.34),s=1+Math.min(0.015,Math.abs(offset)/900);if(offset){scene.classList.add('swipe-preview');layer.style.transform=isLeft?`translate3d(${offset}px,0,0) scale(${s})`:`translate3d(0,${offset}px,0) scale(${s})`}});
addEventListener('pointerup',e=>{if(!globalSwipe)return;const dx=e.clientX-globalSwipe.x,dy=e.clientY-globalSwipe.y,scene=scenes[active];scene&&scene.classList.remove('swipe-preview');const layer=scene&&$('.scene-layer',scene);if(layer)layer.style.transform='';if(active==='intro'&&dy<-24)introAdvance();else if(active==='clue'&&dx<-24)goStars();else if(active==='complete'&&dy<-24)startHandoff();globalSwipe=null;});

/* Gate -> tunnel -> hardware */
let gateEntering=false;$('#lightGate').addEventListener('click',()=>{if(gateEntering)return;gateEntering=true;if(music||fx){initAudio();ac.resume()}tone(220,.22,.05);$('#lightGate').classList.add('entering');camera.ts=2.75;camera.tx=0;camera.ty=0;const flood=flash.animate([{opacity:0,offset:0},{opacity:.08,offset:.18},{opacity:.28,offset:.45},{opacity:.72,offset:.74},{opacity:1,offset:1}],{duration:1350,easing:'cubic-bezier(.12,.75,.18,1)',fill:'forwards'});setTimeout(()=>{go('hardware','fade',()=>{camera.ts=1.62;startHardware();flash.animate([{opacity:1,offset:0},{opacity:1,offset:.22},{opacity:0,offset:1}],{duration:900,easing:'ease-out',fill:'forwards'});gateEntering=false})},1260)});

/* hardware pixel planet with flowers */
const hp=$('#hardwarePlanet'),hctx=hp.getContext('2d');hctx.imageSmoothingEnabled=false;let blooms=0,hardwareRunning=false,spin=0;function drawHardware(){const w=180,h=180;hctx.clearRect(0,0,w,h);const cx=90,cy=90,r=64;const halo=hctx.createRadialGradient(cx,cy,28,cx,cy,88);halo.addColorStop(0,'rgba(115,217,231,.18)');halo.addColorStop(.55,'rgba(169,156,255,.10)');halo.addColorStop(1,'rgba(0,0,0,0)');hctx.fillStyle=halo;hctx.fillRect(0,0,w,h);hctx.strokeStyle='rgba(126,164,189,.55)';hctx.lineWidth=1;hctx.beginPath();hctx.ellipse(cx,cy,82,29,-.22,0,Math.PI*2);hctx.stroke();for(let y=-r;y<=r;y+=3){for(let x=-r;x<=r;x+=3){if(x*x+y*y<=r*r){const xr=Math.cos(spin)*x-Math.sin(spin)*4,yr=y;const light=clamp(.92-((xr+18)/r)**2*.46-((yr+15)/r)**2*.54,0,1);const n=((x*9+y*5+Math.floor(spin*70))%19)/19;let g=Math.round(48+light*142+(n-.5)*36);const edge=1-Math.sqrt((x*x+y*y)/(r*r));const br=Math.min(255,g+edge*10),bb=Math.min(255,g+edge*24);hctx.fillStyle=`rgb(${Math.round(br*.92)},${Math.round(g*.98)},${Math.round(bb)})`;hctx.fillRect(cx+x,cy+y,3,3)}}}for(let i=0;i<blooms;i++){const a=(i/24)*Math.PI*2+spin*.38,rr=72;const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr*.83;const c=palette[i%palette.length];hctx.shadowColor=c;hctx.shadowBlur=6;hctx.fillStyle=c;hctx.fillRect(Math.round(x)-3,Math.round(y),7,2);hctx.fillRect(Math.round(x),Math.round(y)-3,2,7);hctx.fillStyle='#fff';hctx.fillRect(Math.round(x),Math.round(y),2,2);hctx.shadowBlur=0}spin+=.006;requestAnimationFrame(drawHardware)}requestAnimationFrame(drawHardware);
function startHardware(){camera.ts=1.65;hardwareRunning=true;blooms=0;let i=0;const timer=setInterval(()=>{blooms++;i++;$('#hardwareStatus').innerHTML=`PAIRING WITH WHISPER HANDS<small>${String(i).padStart(2,'0')} / 24 BLOOMS</small>`;if(i%4===0)tone(520+i*9,.08,.012);if(i>=24){clearInterval(timer);$('#hardwareStatus').innerHTML=`<span class="done">CONNECTED · 花园已经听见你</span><small>24 / 24 BLOOMS</small>`;colorLevel=.55;tone(660,.42,.025);setTimeout(()=>{camera.ts=1.18;go('clue','fade',()=>sayBuddy('鼠标放在星球上寻找答案吧～',3600))},850)}},145)}

/* clue planets */
const clueData=[
  {title:'一件喜欢的作品',x:13,y:50,size:164,color:palette[0]},
  {title:'一个反复想到的人',x:29,y:72,size:142,color:palette[2]},
  {title:'一处忘不掉的场景',x:45,y:43,size:172,color:palette[4]},
  {title:'一种想尝试的材料',x:63,y:67,size:150,color:palette[3]},
  {title:'一个总会注意的细节',x:79,y:43,size:158,color:palette[1]},
  {title:'一句现在想说的话',x:90,y:72,size:136,color:palette[5]}
].map(item=>({...item,...PLANET_CONFIG.get(item.title)}));
const followUpQuestions={
  '一件喜欢的作品':'你想靠近的，是它的形式，还是它允许你进入的一种状态？',
  '一个反复想到的人':'反复出现的是这个人本身，还是你们之间尚未说完的某种关系？',
  '一处忘不掉的场景':'你最想留下的是发生过的事，还是那个时刻让时间停住的感觉？',
  '一种想尝试的材料':'吸引你的是它的顺从、抵抗、变化，还是它留下痕迹的方式？',
  '一个总会注意的细节':'这个细节让世界更有秩序、更有生命，还是更陌生？',
  '一句现在想说的话':'这句话现在更像事实、愿望、拒绝，还是一个还没有答案的问题？'
};
function questionForClue(title,text){
  if(/颜色|光线|明亮|暗处|红色|蓝色|黑色|白色/.test(text))return '吸引你的是这个颜色或光线本身，还是它改变整个空间的方式？';
  if(/材料|布|木|金属|玻璃|纸|陶|纤维/.test(text))return '如果用手触碰它，你最想保留的是质地、阻力，还是它变化时留下的痕迹？';
  return followUpQuestions[title]||'这块线索里，你最希望絮手暂时理解到什么？';
}
function drawMiniPlanet(canvas,color,phase){
  const c=canvas.getContext('2d');canvas.width=128;canvas.height=128;c.imageSmoothingEnabled=false;c.clearRect(0,0,128,128);
  const tc=hexToRgb(color),cx=64,cy=64,r=46;
  const halo=c.createRadialGradient(cx,cy,18,cx,cy,62);halo.addColorStop(0,`rgba(${tc.r},${tc.g},${tc.b},.24)`);halo.addColorStop(.62,`rgba(${tc.r},${tc.g},${tc.b},.08)`);halo.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=halo;c.fillRect(0,0,128,128);
  for(let y=16;y<112;y+=2){for(let x=16;x<112;x+=2){const dx=(x-cx)/r,dy=(y-cy)/r;if(dx*dx+dy*dy<1){const light=clamp(.8-(dx+.3)**2*.48-(dy+.34)**2*.44,0,1);const n=((x*7+y*13+phase*17)%23)/23;let g=38+light*118+(n-.5)*25;const m=.28+colorLevel*.065;c.fillStyle=`rgb(${Math.round(g*(1-m)+tc.r*m)},${Math.round(g*(1-m)+tc.g*m)},${Math.round(g*(1-m)+tc.b*m)})`;c.fillRect(x,y,2,2)}}}
  c.strokeStyle=`rgba(${tc.r},${tc.g},${tc.b},.55)`;c.lineWidth=1;c.beginPath();c.ellipse(cx,cy,56,15,-.25+phase*.09,0,Math.PI*2);c.stroke();
}
function selectedClueEntries(){return clueData.map(config=>state.clueEntries[config.title]?{...state.clueEntries[config.title],title:config.title,dimension:config.dimension}:null).filter(Boolean)}
function updateClueProgress(){clueData.forEach(config=>{const node=$(`.clue[data-label="${config.title}"]`);node?.classList.toggle('completed',Boolean(state.clueEntries[config.title]))})}
clueData.forEach((d,i)=>{const b=document.createElement('button');b.className='clue';b.type='button';b.style.setProperty('--x',d.x+'%');b.style.setProperty('--y',d.y+'%');b.style.setProperty('--s',d.size+'px');b.style.setProperty('--c',d.color);b.dataset.label=d.title;b.dataset.dimension=d.dimension;const cv=document.createElement('canvas');drawMiniPlanet(cv,d.color,i);const lab=document.createElement('span');lab.className='label';lab.textContent=d.title;b.append(cv,lab);b.addEventListener('mouseenter',()=>tone(390+i*55,.06,.008));b.addEventListener('click',()=>{state.clue=d.title;$$('.clue').forEach(x=>x.classList.toggle('selected',x===b));$('#clueEditorTitle').textContent=d.title;const saved=state.clueEntries[d.title]||{};$('#clueText').value=saved.text||'';state.clueText=saved.text||'';state.clueImage=saved.image||'';state.clueImageMeta=saved.imageMeta||null;state.currentSourceId=saved.sourceId||'';state.followUpQuestion=saved.followUpQuestion||'';state.followUpAnswer=saved.followUpAnswer||'';state.followUpSourceId=saved.followUpSourceId||'';const prev=$('#cluePreview'),tip=$('#uploadTip');if(saved.image){prev.src=saved.image;prev.style.display='block';tip.style.display='none'}else{prev.removeAttribute('src');prev.style.display='none';tip.style.display='block'}$('#clueEditor').classList.add('open');setOverlayOpen(true);sayBuddy('把这颗星球装得更像你一点。',2200);colorLevel=Math.max(colorLevel,.85+i*.08);tone(650+i*45,.12,.014)});$('#clueSpace').appendChild(b)});
$('#clueImage').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(!f)return;const url=URL.createObjectURL(f);state.clueImage=url;state.clueImageMeta={fileName:f.name,contentType:f.type,byteSize:f.size};$('#cluePreview').src=url;$('#cluePreview').style.display='block';$('#uploadTip').style.display='none'});
$('#clueCancel').addEventListener('click',()=>{$('#clueEditor').classList.remove('open');setOverlayOpen(false)});$('#clueSave').addEventListener('click',()=>{state.clueText=$('#clueText').value.trim();if(!state.clueText&&!state.clueImageMeta){sayBuddy('可以写几个字、放一张图片，或者暂时不填写。',2400);return}const config=PLANET_CONFIG.get(state.clue),previous=state.clueEntries[state.clue]||{};const source=meaningStore?.saveClue({title:state.clue,text:state.clueText,imageMetadata:state.clueImageMeta});state.currentSourceId=source?.id||previous.sourceId||'';state.followUpQuestion='';state.followUpAnswer='';state.followUpSourceId='';state.clueEntries[state.clue]={text:state.clueText,image:state.clueImage||'',imageMeta:state.clueImageMeta,dimension:config?.dimension||'meaning_association',sourceId:state.currentSourceId,followUpQuestion:'',followUpAnswer:'',followUpSourceId:''};meaningStore?.saveUiState({clue:state.clue,clueText:state.clueText,clueEntries:persistableClueEntries()});$('#clueEditor').classList.remove('open');setOverlayOpen(false);updateClueProgress();sayBuddy('已经保存。我会先问一个很小的问题。',2600);colorLevel=Math.max(colorLevel,1.1);tone(780,.16,.015);setTimeout(beginFollowUp,260)});
function aiAnalysisPayload(){
  const confirmed=meaningStore?.getConfirmedMeaningLayer()?.confirmedSlices||[];
  const current=state.clueEntries[state.clue]||{};
  return{
    source:{type:'clue',title:state.clue,text:current.text||'',hasImage:Boolean(current.imageMeta),dimension:current.dimension||PLANET_CONFIG.get(state.clue)?.dimension||'meaning_association'},
    followUp:{question:state.followUpQuestion,answer:state.followUpAnswer},
    selections:{attention:[...state.attention],ways:[...state.ways]},
    confirmedSlices:confirmed.map(slice=>({dimension:slice.dimension,statement:slice.statement}))
  }
}
function isIdentityPlanet(){return IDENTITY_PLANETS.has(state.clue)}
function creatorKernelPayload(){return (creatorIdentityStore?.getKernel()?.items||[]).map(item=>({id:item.id,statement:item.statement,scope:item.scope}))}
function stableHash(value){let hash=2166136261;for(const char of String(value||'')){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}return(hash>>>0).toString(36)}
let followUpRequest=0;
async function beginFollowUp(){
  const requestId=++followUpRequest;
  const current=state.clueEntries[state.clue];
  if(!current){sayBuddy('先选择一颗星球留下一点线索，或者点“先不说”。',2600);return}
  state.clueText=current.text||'';state.clueImageMeta=current.imageMeta||null;state.currentSourceId=current.sourceId||'';state.followUpAnswer=current.followUpAnswer||'';state.followUpSourceId=current.followUpSourceId||'';
  const fallback=questionForClue(state.clue,state.clueText);
  state.followUpQuestion=fallback;
  $('#followupClueTitle').textContent=state.clue||'一小块关于你的线索';
  $('#followupClueText').textContent=state.clueText||'已加入图片线索';
  $('#followupModeLabel').textContent='AI 正在寻找一个贴近这条线索的问题…';
  $('#followupQuestion').textContent=fallback;
  $('#followupAnswer').value=state.followUpAnswer||'';
  go('followup','left');
  try{
    if(!aiAdapter)throw new Error('AI adapter unavailable');
    if(isIdentityPlanet()){
      const result=await aiAdapter.extractIdentity({caseId:`onboarding-${stableHash(state.clue)}-followup`,planet:state.clue,userInput:state.clueText,existingKernel:creatorKernelPayload()});
      if(requestId!==followUpRequest)return;
      state.followUpQuestion=result.extraction.followUp?.question||fallback;
      $('#followupModeLabel').textContent='A GENTLE QUESTION · CREATOR IDENTITY';
    }else{
      const result=await aiAdapter.analyze('followup',aiAnalysisPayload());
      if(requestId!==followUpRequest)return;
      state.followUpQuestion=result.followUpQuestion;
      $('#followupModeLabel').textContent='A GENTLE QUESTION · AI';
    }
  }catch(error){
    if(requestId!==followUpRequest)return;
    state.followUpQuestion=fallback;
    $('#followupModeLabel').textContent='A GENTLE QUESTION · LOCAL FALLBACK';
  }
  $('#followupQuestion').textContent=state.followUpQuestion;
  state.clueEntries[state.clue]={...current,followUpQuestion:state.followUpQuestion};
  meaningStore?.saveUiState({followUpQuestion:state.followUpQuestion,clueEntries:persistableClueEntries()});
}
function finishFollowUp(skip=false){state.followUpAnswer=skip?'':$('#followupAnswer').value.trim();if(!skip&&!state.followUpAnswer){sayBuddy('只写几个字也可以，或者选择暂时不回答。',2400);return}followUpRequest+=1;if(state.followUpAnswer){const followUpSource=meaningStore?.saveFollowUp({clueSourceId:state.currentSourceId,question:state.followUpQuestion,answer:state.followUpAnswer});state.followUpSourceId=followUpSource?.id||''}else state.followUpSourceId='';state.clueEntries[state.clue]={...(state.clueEntries[state.clue]||{}),followUpQuestion:state.followUpQuestion,followUpAnswer:state.followUpAnswer,followUpSourceId:state.followUpSourceId};meaningStore?.saveUiState({followUpQuestion:state.followUpQuestion,followUpAnswer:state.followUpAnswer,followUpSourceId:state.followUpSourceId,clueEntries:persistableClueEntries()});go('clue','fade',()=>sayBuddy('还可以继续填写其他星球；准备好后向左滑动。',2800))}
$('#followupSkip').addEventListener('click',()=>finishFollowUp(true));
$('#followupNext').addEventListener('click',()=>finishFollowUp(false));
function goStars(){camera.ts=1.08;sayBuddy('下一页会继续接住你的选择。',1800);go('stars','left')}$('#clueSkip').addEventListener('click',goStars);updateClueProgress();

/* 360 star fields */
const starLabels=['颜色或光线','材料或触感','形状或结构','痕迹或不完整','空间关系','变化发生的瞬间'];
const selectPalette=['#ffd166','#ff9fbd','#98efb4','#d8ff7d','#ffb36b','#c9a7ff'];
const wayLabels=['我想先弄明白它为什么这样','我喜欢边做边改变','我会反复比较很小的区别','我很在意材料本身发生什么','失败的部分有时更有意思','我希望最后的东西足够完整'];
function makeField(el,labels,key){labels.forEach((lab,i)=>{const b=document.createElement('button');b.className='star';b.type='button';b.dataset.label=lab;b.dataset.i=i;b.style.setProperty('--s',(i%3===0?96:i%2===0?78:66)+'px');b.style.setProperty('--c',selectPalette[i%selectPalette.length]);const sp=document.createElement('span');sp.className='spark';const tx=document.createElement('span');tx.className='label';tx.textContent=lab;b.append(sp,tx);if(state[key].includes(lab))b.classList.add('selected');b.addEventListener('mouseenter',()=>tone(460+i*43,.055,.007));b.addEventListener('click',()=>{b.classList.toggle('selected');const arr=state[key],j=arr.indexOf(lab);if(b.classList.contains('selected')){if(j<0)arr.push(lab)}else if(j>=0)arr.splice(j,1);meaningStore?.saveSelections(key,arr);colorLevel=Math.max(colorLevel,1.25+arr.length*.16);tone(670+i*38,.1,.012)});el.appendChild(b)})}
makeField($('#starField'),starLabels,'attention');makeField($('#wayField'),wayLabels,'ways');
function orbitController(el){
  let rx=-8,ry=0,trx=-8,tryy=0,vx=0,vy=0,drag=false,last=null;
  const nodes=$$('.star',el);
  function layout(){nodes.forEach((n,i)=>{const ring=i%3,a=(i/nodes.length)*Math.PI*2+ring*.9;let x,y,z;if(ring===0){x=Math.cos(a)*285;y=Math.sin(a)*96;z=Math.sin(a)*145}else if(ring===1){x=Math.cos(a)*214;z=Math.sin(a)*232;y=Math.sin(a*.7)*136}else{x=Math.cos(a)*198;y=Math.sin(a)*194;z=Math.sin(a+1.2)*126}n.dataset.base=`${x},${y},${z}`})}
  layout();
  el.addEventListener('pointerdown',e=>{if(e.target.closest('.star'))return;drag=true;last={x:e.clientX,y:e.clientY};el.classList.add('dragging');el.setPointerCapture(e.pointerId)});
  el.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-last.x,dy=e.clientY-last.y;tryy+=dx*.58;trx-=dy*.48;vx=dx*.39;vy=-dy*.32;last={x:e.clientX,y:e.clientY}});
  function stop(){drag=false;el.classList.remove('dragging')}
  el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);
  function loop(){if(!drag){tryy+=vx;trx+=vy;vx*=.955;vy*=.95}rx+=(trx-rx)*.145;ry+=(tryy-ry)*.145;el.style.transform=`translate(-50%,-50%) rotateX(${rx}deg) rotateY(${ry}deg)`;nodes.forEach(n=>{const [x,y,z]=n.dataset.base.split(',').map(Number);n.style.transform=`translate3d(${x}px,${y}px,${z}px) rotateY(${-ry}deg) rotateX(${-rx}deg)`});requestAnimationFrame(loop)}
  loop()
}
orbitController($('#starField'));orbitController($('#wayField'));


function goWays(){go('ways','left');colorLevel=Math.max(colorLevel,1.8)}$('#starSkip').addEventListener('click',goWays);$('#starNext').addEventListener('click',goWays);
$('#waySkip').addEventListener('click',goMagic);$('#wayNext').addEventListener('click',goMagic);

/* magic line */
const mc=$('#magicCanvas'),mctx=mc.getContext('2d');mctx.imageSmoothingEnabled=false;const path=[];for(let i=0;i<42;i++){const y=286-i*6.55,x=80+Math.sin(i*.75)*10+Math.sin(i*.21)*6;path.push([x,y])}let magicP=0,magicRun=false;function drawMagic(){mctx.clearRect(0,0,160,300);mctx.strokeStyle='rgba(215,221,238,.34)';mctx.lineWidth=1;mctx.beginPath();path.forEach((p,i)=>i?mctx.lineTo(...p):mctx.moveTo(...p));mctx.stroke();if(magicP>0){mctx.strokeStyle='#deded7';mctx.lineWidth=2;mctx.beginPath();const count=Math.floor(path.length*magicP);for(let i=0;i<count;i++){i?mctx.lineTo(...path[i]):mctx.moveTo(...path[i])}mctx.stroke();if(count>0){const [x,y]=path[Math.min(count,path.length-1)];for(let j=0;j<18;j++){const a=j*.9+performance.now()*.002,r=4+(j%4)*3;mctx.fillStyle=j%3===0?palette[j%palette.length]:'#eee';mctx.fillRect(Math.round(x+Math.cos(a)*r),Math.round(y+Math.sin(a)*r),2,2)}}}requestAnimationFrame(drawMagic)}requestAnimationFrame(drawMagic);
function goMagic(){go('magic','fade',()=>setTimeout(startMagic,450))}
function startMagic(){if(magicRun)return;magicRun=true;const s=performance.now(),dur=3700;function f(now){magicP=clamp((now-s)/dur,0,1);if(Math.floor(magicP*20)%3===0)tone(500+magicP*260,.08,.016);if(magicP<1)requestAnimationFrame(f);else{tone(920,.42,.042);setTimeout(()=>go('ships','fade'),500)}}requestAnimationFrame(f)}

/* ships */
const shipDefs=[['single','带入一件作品','从一件仍想保留的东西开始'],['multiple','一次带入几件','先让作品宇宙出现几个坐标'],['skip','暂时没有','保留跳过，之后再慢慢带进来']];
function drawOctopus(cv,i){
  cv.width=120;cv.height=92;const c=cv.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,120,92);
  const cols=[['#83e5f2','#b9a9ff'],['#ffd77a','#ff9fbd'],['#98efb4','#83e5f2']][i%3];
  const body=cols[0], accent=cols[1];
  const px=(x,y,w=2,h=2,col=body,a=1)=>{c.globalAlpha=a;c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),w,h);c.globalAlpha=1};
  // halo bubbles
  for(let b=0;b<9;b++){const bx=16+b*10+((b*13)%7), by=18+(b%3)*6; px(bx,by,2,2,b%2?accent:'#fff',0.18)}
  // head
  for(let y=-14;y<=10;y+=2){for(let x=-18;x<=18;x+=2){const dx=x/18,dy=(y+2)/18;if(dx*dx+dy*dy<1){const edge=dx*dx+dy*dy;const col=edge>.72?accent:body;px(60+x,42+y,2,2,col, edge>.78?0.9:1)}}}
  // skirt
  for(let x=-18;x<=18;x+=4){px(60+x,54+(Math.abs(x)%8===0?0:2),4,2,body)}
  // eyes
  px(52,38,4,4,'#fff'); px(64,38,4,4,'#fff'); px(54,40,2,2,'#03050b'); px(66,40,2,2,'#03050b');
  // blush / glow spots
  px(46,46,4,2,accent,0.7); px(72,46,4,2,accent,0.7);
  // tentacles
  const tent=[[38,58,30,68,24,74],[48,58,42,70,40,80],[58,58,56,72,58,82],[66,58,68,72,72,80],[76,58,82,68,90,74],[84,56,92,64,98,70]];
  tent.forEach((t,j)=>{for(let k=0;k<t.length-2;k+=2){const x1=t[k],y1=t[k+1],x2=t[k+2],y2=t[k+3]; const steps=Math.max(Math.abs(x2-x1),Math.abs(y2-y1))/2; for(let s=0;s<=steps;s++){const tt=s/steps; const x=x1+(x2-x1)*tt, y=y1+(y2-y1)*tt; px(x,y,2,2,j%2?body:accent,0.95)}}});
  // tiny stars around
  [[22,58],[98,24],[104,54],[18,34]].forEach(([x,y],n)=>{px(x,y,2,2,n%2?'#fff':accent,0.8);px(x-2,y,2,2,accent,0.5);px(x+2,y,2,2,accent,0.5);px(x,y-2,2,2,accent,0.5);px(x,y+2,2,2,accent,0.5)});
}
shipDefs.forEach((d,i)=>{const b=document.createElement('button');b.type='button';b.className='ship';b.dataset.mode=d[0];const cv=document.createElement('canvas');drawOctopus(cv,i);const st=document.createElement('strong');st.textContent=d[1];const sm=document.createElement('small');sm.textContent=d[2];b.append(cv,st,sm);b.addEventListener('mouseenter',()=>tone(390+i*70,.06,.007));b.addEventListener('click',()=>selectShip(d[0]));$('#ships').appendChild(b)});
function selectShip(mode){state.mode=mode;meaningStore?.saveUiState({mode});if(mode==='skip'){state.works=[];meaningStore?.saveWorks([]);sayBuddy('没关系，先空着也可以。',2200);go('works','zoom',startWorks);return}$('#cargoTitle').textContent=mode==='single'?'带一件作品进来。':'让几件作品一起出现。';$('#workFiles').multiple=mode==='multiple';$('#cargo').classList.add('open');setOverlayOpen(true);tone(520,.14,.011)}
$('#cargoBack').addEventListener('click',()=>{$('#cargo').classList.remove('open');setOverlayOpen(false)});
$('#workFiles').addEventListener('change',e=>{const fs=[...e.target.files].slice(0,state.mode==='single'?1:8);state.works=fs.map((f,i)=>({id:`work-${Date.now()}-${i+1}`,title:f.name.replace(/\.[^.]+$/,''),url:URL.createObjectURL(f),file:f,fileName:f.name,contentType:f.type,byteSize:f.size,time:$('#projectTime').value,reason:'',analysis:null,color:palette[i%palette.length]}));$('#previews').innerHTML='';state.works.forEach(w=>{const im=new Image();im.src=w.url;$('#previews').appendChild(im)});$('#workAiStatus').className='work-ai-status';$('#workAiStatus').textContent=fs.length>1?`已准备 ${fs.length} 张图片；进入花园前会逐张分析。`:'图片已准备好；进入花园前会生成一份 AI 解读初稿。';tone(730,.15,.012)});
function localVisualSignals(context,canvas){const {width,height}=canvas,step=Math.max(1,Math.floor(Math.max(width,height)/72)),pixels=context.getImageData(0,0,width,height).data,bins=new Map();let count=0,sum=0,sumSq=0,satSum=0,edges=0,edgeTests=0,left=0,right=0,leftN=0,rightN=0,top=0,bottom=0,topN=0,bottomN=0;const brightnessAt=(x,y)=>{const index=(y*width+x)*4;return(pixels[index]*.299+pixels[index+1]*.587+pixels[index+2]*.114)};for(let y=0;y<height;y+=step){for(let x=0;x<width;x+=step){const index=(y*width+x)*4,r=pixels[index],g=pixels[index+1],b=pixels[index+2],bright=r*.299+g*.587+b*.114,max=Math.max(r,g,b),min=Math.min(r,g,b),sat=max?((max-min)/max):0,key=[r,g,b].map(value=>Math.min(255,Math.round(value/51)*51));bins.set(key.join(','),(bins.get(key.join(','))||0)+1);count++;sum+=bright;sumSq+=bright*bright;satSum+=sat;if(x<width/2){left+=bright;leftN++}else{right+=bright;rightN++}if(y<height/2){top+=bright;topN++}else{bottom+=bright;bottomN++}if(x+step<width){edges+=Math.abs(bright-brightnessAt(x+step,y));edgeTests++}if(y+step<height){edges+=Math.abs(bright-brightnessAt(x,y+step));edgeTests++}}}const mean=sum/Math.max(1,count),deviation=Math.sqrt(Math.max(0,sumSq/Math.max(1,count)-mean*mean)),edgeMean=edges/Math.max(1,edgeTests),dominantColors=[...bins.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([key])=>`#${key.split(',').map(value=>Number(value).toString(16).padStart(2,'0')).join('')}`),horizontal=(right/Math.max(1,rightN))-(left/Math.max(1,leftN)),vertical=(bottom/Math.max(1,bottomN))-(top/Math.max(1,topN));let lightDistribution='明暗分布较均衡';if(Math.abs(horizontal)>14)lightDistribution=horizontal>0?'右侧整体更亮':'左侧整体更亮';else if(Math.abs(vertical)>14)lightDistribution=vertical>0?'下部整体更亮':'上部整体更亮';return{width,height,orientation:width>height*1.15?'横向':height>width*1.15?'纵向':'接近方形',dominantColors,brightness:mean<85?'偏暗':mean>180?'偏亮':'中等',contrast:deviation<35?'较低':deviation>70?'较高':'中等',saturation:(satSum/Math.max(1,count))<.18?'较低':(satSum/count)>.48?'较高':'中等',visualDensity:edgeMean<12?'较疏':edgeMean>34?'较密':'中等',lightDistribution}}
function compressedWorkImage(file){return new Promise((resolve,reject)=>{if(!file||!/^image\/(jpeg|png|webp)$/i.test(file.type)){reject(new Error('请上传 JPG、PNG 或 WEBP 图片。'));return}const url=URL.createObjectURL(file),image=new Image();image.onload=()=>{try{const maxSide=960,scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=canvas.getContext('2d');context.fillStyle='#f5f3ef';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);const visualSignals=localVisualSignals(context,canvas),imageDataUrl=canvas.toDataURL('image/jpeg',.74);URL.revokeObjectURL(url);if(imageDataUrl.length>1600000)throw new Error('压缩后的图片仍然过大，请换一张较小的图。');resolve({imageDataUrl,visualSignals})}catch(error){URL.revokeObjectURL(url);reject(error)}};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('这张图片暂时无法读取。'))};image.src=url})}
async function submitWorks(){
  const button=$('#cargoGo'),status=$('#workAiStatus'),title=$('#projectTitle').value.trim(),time=$('#projectTime').value,reason=$('#projectReason').value.trim();
  if(!state.works.length){if(!title&&!reason){status.className='work-ai-status error';status.textContent='请先上传作品图片，或至少填写一条真实的作品信息。';sayBuddy('花园只会接住你真正带进来的作品。',2600);return}state.works=[{id:`work-${Date.now()}-1`,title:title||'未命名作品',time,reason,analysis:null,color:palette[0]}]}
  state.works.forEach((w,i)=>{if(title&&state.works.length===1)w.title=title;w.time=time;w.reason=reason;w.color=palette[i%palette.length]});
  button.disabled=true;let analyzed=0,failed=0,totalTokens=0;
  for(let i=0;i<state.works.length;i+=1){const work=state.works[i];if(!work.file)continue;if(!aiAdapter?.analyzeWork){work.analysis=null;work.analysisReview=null;failed+=1;continue}status.className='work-ai-status loading';status.textContent=`正在分析第 ${i+1} / ${state.works.length} 件作品：${work.title}`;try{const {imageDataUrl,visualSignals}=await compressedWorkImage(work.file);const result=await aiAdapter.analyzeWork({title:work.title,time:work.time,reason:work.reason,imageDataUrl,visualSignals,creatorKernel:creatorKernelPayload()});work.analysis=result.analysis;work.analysisReview=null;analyzed+=1;totalTokens+=Number(result.usage?.totalTokens)||0}catch(error){work.analysis=null;work.analysisReview=null;work.analysisError=error.message||'作品 AI 暂时不可用';failed+=1}}
  if(analyzed){status.className='work-ai-status success';status.textContent=`已完成 ${analyzed} / ${state.works.length} 件作品的解读初稿${failed?`，${failed} 件保留原始介绍`:''}${totalTokens?` · ${totalTokens} tokens`:''}`;sayBuddy('每件作品都有自己的解读初稿；仍然需要你逐件确认。',3200)}else if(state.works.some(work=>work.file)){status.className='work-ai-status error';status.textContent='作品 AI 暂时不可用；所有原始介绍都已保留。';sayBuddy('这次我没有假装看懂。你的原始介绍仍然完整保留。',3000)}
  meaningStore?.saveWorks(state.works);button.disabled=false;$('#cargo').classList.remove('open');setOverlayOpen(false);go('works','zoom',startWorks)
}
$('#cargoGo').addEventListener('click',submitWorks);

/* work orbit -> ring, one continuous transform */
let workNodes=[],workMorph=0,workTarget=0,workAngle=0,workHover=-1,workRun=false,workYaw=0,workPitch=-12,workTYaw=0,workTPitch=-12,workVYaw=0,workVPitch=0,workDrag=false,workLast=null;
const presetWorks=[
  {title:'蓝釉流动测试',time:'交互示例',reason:'观察蓝色釉面在光线中形成的流动层次。',color:'#6aaed6',pattern:0,isPreset:true},
  {title:'纤维呼吸结构',time:'交互示例',reason:'一组关于柔软材料与空间张力的练习。',color:'#9ac88f',pattern:1,isPreset:true},
  {title:'夜航光点记录',time:'交互示例',reason:'让微小光点沿着不稳定的轨迹聚集。',color:'#a995d6',pattern:2,isPreset:true},
  {title:'纸面折叠实验',time:'交互示例',reason:'用折痕保留手的犹豫与方向改变。',color:'#d5a46c',pattern:3,isPreset:true},
  {title:'回声容器',time:'交互示例',reason:'一个围绕声音残留和空白展开的容器。',color:'#c58baa',pattern:4,isPreset:true},
  {title:'植物影子采样',time:'交互示例',reason:'收集叶片影子随时间发生的轻微偏移。',color:'#b8d568',pattern:5,isPreset:true},
  {title:'潮汐刻度',time:'交互示例',reason:'把重复靠近又退开的运动变成一组刻度。',color:'#6fc7bd',pattern:6,isPreset:true},
  {title:'透明层叠练习',time:'交互示例',reason:'让几层半透明颜色在边缘处产生新的空间。',color:'#8aa7d9',pattern:7,isPreset:true},
  {title:'未完成的网格',time:'交互示例',reason:'保留网格中断的位置，让缺口成为观看线索。',color:'#d09a85',pattern:8,isPreset:true},
  {title:'低频形状',time:'交互示例',reason:'把缓慢的声音想象成可以触摸的轮廓。',color:'#8f86c9',pattern:9,isPreset:true},
  {title:'漂浮字句',time:'交互示例',reason:'一些没有固定顺序的句子在空间里暂时相遇。',color:'#d4bd72',pattern:10,isPreset:true},
  {title:'柔软边界',time:'交互示例',reason:'测试边界在被触碰时是否可以轻微改变。',color:'#a5ce9a',pattern:11,isPreset:true}
];
function displayWorks(){return[...(state.works||[]),...presetWorks]}
function buildWorks(){
  workNodes.forEach(n=>n.remove());workNodes=[];
  const data=displayWorks();
  data.forEach((w,i)=>{
    const b=document.createElement('button');b.className=`work-node${w.isPreset?' preset':''}`;b.type='button';
    const baseSize=data.length>10?76+(i%4)*8:92+(i%3)*12;
    b.style.setProperty('--s',baseSize+'px');b.style.setProperty('--colorize',.26);b.style.setProperty('--work-c',w.color||palette[i%palette.length]);
    const thumb=document.createElement('span');thumb.className='work-thumb';
    if(w.url){const im=new Image();im.src=w.url;thumb.appendChild(im)}else{
      const c=w.color||palette[i%palette.length],p=w.pattern??i;
      const angles=[35,125,70,155,20,105][p%6];
      thumb.style.background=`radial-gradient(circle at ${28+(p*11)%55}% ${25+(p*17)%58}%,rgba(255,255,255,.72) 0 3%,transparent 4%),linear-gradient(${angles}deg,color-mix(in srgb,${c},#ffffff 18%) 0 18%,transparent 18% 26%,color-mix(in srgb,${c},#18203d 38%) 26% 48%,transparent 48% 61%,color-mix(in srgb,${c},#ffffff 5%) 61% 100%),repeating-linear-gradient(90deg,rgba(255,255,255,.06) 0 2px,transparent 2px 7px),#131a35`;
    }
    const lab=document.createElement('span');lab.className='work-label';lab.textContent=w.isPreset?`示例 · ${w.title}`:w.title;b.append(thumb,lab);
    b.addEventListener('mouseenter',()=>workHover=i);b.addEventListener('mouseleave',()=>workHover=-1);b.addEventListener('click',()=>openDetail(i));
    $('#workField').appendChild(b);workNodes.push(b)
  });
  $('#ringHint').dataset.displayCount=data.length;
}
const workFieldEl=$('#workField');
function rotatePoint(x,y,z,pitchDeg,yawDeg){
  const px=pitchDeg*Math.PI/180, py=yawDeg*Math.PI/180;
  const cp=Math.cos(px), sp=Math.sin(px), cy=Math.cos(py), sy=Math.sin(py);
  let x1=x*cy+z*sy, z1=-x*sy+z*cy;
  let y2=y*cp-z1*sp, z2=y*sp+z1*cp;
  return {x:x1,y:y2,z:z2};
}
workFieldEl.addEventListener('pointerdown',e=>{if(e.target.closest('.work-node,.start-create'))return;workDrag=true;workLast={x:e.clientX,y:e.clientY};workFieldEl.classList.add('dragging');workFieldEl.setPointerCapture(e.pointerId)});
workFieldEl.addEventListener('pointermove',e=>{if(!workDrag)return;const dx=e.clientX-workLast.x,dy=e.clientY-workLast.y;workTYaw+=dx*.22;workTPitch=clamp(workTPitch-dy*.16,-54,54);workVYaw=dx*.09;workVPitch=-dy*.06;workLast={x:e.clientX,y:e.clientY}});
function endWorkDrag(){workDrag=false;workFieldEl.classList.remove('dragging')}
workFieldEl.addEventListener('pointerup',endWorkDrag);workFieldEl.addEventListener('pointercancel',endWorkDrag);
workFieldEl.addEventListener('wheel',e=>{e.preventDefault();workTPitch=clamp(workTPitch+(e.deltaY>0?6:-6),-58,58);},{passive:false});

function startWorks(){camera.ts=1.02;colorLevel=Math.max(colorLevel,2.8);buildWorks();workRun=true;workMorph=0;workTarget=0;workAngle=0;workYaw=0;workPitch=-12;workTYaw=0;workTPitch=-12;workVYaw=0;workVPitch=0;$('#workCore').style.opacity='1';$('#ringHint').textContent=state.works.length?'你的作品和交互示例正在进入宇宙…':'先用示例作品感受这个宇宙的互动方式。';setTimeout(()=>{workTarget=1;$('#ringHint').textContent=`DRAG TO TILT · WHEEL TO SHIFT ANGLE · ${$('#ringHint').dataset.displayCount||workNodes.length} WORKS`;tone(392,.3,.015)},1650)}
function workLoop(){
  if(workRun&&active==='works'){
    workMorph+=(workTarget-workMorph)*.055; workAngle+=.0024;
    if(!workDrag){workTYaw+=workVYaw; workTPitch=clamp(workTPitch+workVPitch,-58,58); workVYaw*=.94; workVPitch*=.92}
    workYaw+=(workTYaw-workYaw)*.08; workPitch+=(workTPitch-workPitch)*.08;
    const n=Math.max(1,workNodes.length), rx0=Math.min(W*.19,230), ry0=Math.min(H*.11,90), R=Math.min(W*.35,H*.38), lift=Math.min(H*.16,120);
    workNodes.forEach((node,i)=>{
      const a=workAngle+i*Math.PI*2/n;
      const pband=Math.sin(a*2.1+i*.35)*34;
      const x0=Math.cos(a)*rx0, y0=Math.sin(a)*ry0, z0=Math.sin(a)*130;
      const x1=Math.cos(a)*R, y1=Math.sin(a)*R*.74 + pband*(.18+.08*Math.sin(workAngle+i)), z1=Math.sin(a*1.05)*88;
      let x=x0+(x1-x0)*workMorph, y=y0+(y1-y0)*workMorph, z=z0+(z1-z0)*workMorph;
      const rot=rotatePoint(x,y,z,workPitch,workYaw); x=rot.x; y=rot.y; z=rot.z;
      const px=(pointer.x-.5)*(16+24*workMorph), py=(pointer.y-.5)*(9+15*workMorph); x+=px; y+=py*.9;
      const h=workHover===i?1:0; if(h){x+=(pointer.x-.5)*15; y+=(pointer.y-.5)*10; z+=44}
      const perspective=620; const zz=perspective/(perspective-z); const sc=(.72+.18*zz)*(1+h*.14);
      node.style.opacity=clamp(.4+(z+240)/480*.75,.38,1);
      node.style.zIndex=30+Math.round(z+240);
      node.style.transform=`translate3d(calc(-50% + ${x}px),calc(-50% + ${y}px),${z}px) scale(${sc}) rotateZ(${Math.sin(a+workAngle)*3.5}deg)`
    });
    const coreRot=rotatePoint(0,-lift*.08,0,workPitch*.65,workYaw*.65);
    $('#workCore').style.opacity=String(1-workMorph*.95);
    $('#workCore').style.transform=`translate(calc(-50% + ${coreRot.x}px),calc(-50% + ${coreRot.y}px)) scale(${1-workMorph*.25}) rotate(${workYaw*.05}deg)`;
  }
  requestAnimationFrame(workLoop)
}
requestAnimationFrame(workLoop);
let openWorkIndex=-1;
function setWorkReviewUi(review){const actions=$('#workReviewActions');actions.dataset.status=review?.status||'pending';$('#workReviewStatus').textContent=review?.status==='confirmed'?(review.userEdited?'已按你的改写确认；后续只使用这个版本。':'这份解读已由你确认。'):review?.status==='rejected'?'你已经拒绝这份解读；后续不会使用它。':'尚未确认；AI 初稿不会进入后续知识库。'}
function openDetail(i){const data=displayWorks(),w=data[i];if(!w)return;const analysis=w.analysis||null,review=w.analysisReview||null;openWorkIndex=w.isPreset?-1:i;$('#detailK').textContent=w.isPreset?`EXAMPLE · ${String(i+1).padStart(3,'0')}`:`WORK · ${String(i+1).padStart(3,'0')}`;$('#detailTitle').textContent=w.title;$('#detailTime').textContent=w.time||'最近';$('#detailOriginal').textContent=w.isPreset?'这是交互展示作品，不会写入你的数据。':analysis&&w.reason?`你原本写道：${w.reason}`:'';$('#detailDesc').value=w.isPreset?`${w.reason} 这件作品只用于展示作品宇宙的旋转、悬停与查看效果。`:review?.status==='confirmed'&&review.confirmedIntroduction?review.confirmedIntroduction:analysis?.polishedIntroduction||w.reason||'这件作品已经被带进花园。以后这里会继续接住它的变化、停顿和重新开始。';$('#detailDesc').disabled=w.isPreset||!analysis;$('#workIntroReview').classList.add('show');$('#workIntroReview span').textContent=w.isPreset?'预设作品 · 仅供交互展示':analysis?'作品介绍 · 可以改成你的话':'作品介绍';$('#detailVisual').textContent=analysis?[...(analysis.visualObservations||[]),...(analysis.formalLanguage||[])].join(' · '):'';$('#detailInspiration').textContent=analysis?.inspirationHypotheses?.join(' · ')||'';$('#detailAnalysis').classList.toggle('show',Boolean(analysis));$('#workReviewActions').classList.toggle('show',Boolean(analysis&&openWorkIndex>=0));setWorkReviewUi(review);$('#detailAnalysisBoundary').textContent=analysis?.analysisBasis==='local_visual_signals'?'颜色、明暗与密度来自浏览器本地计算；GLM 没有看见具体物体。确认后也不会自动更新 Kernel。':'这是等待你确认的视觉模型初稿，不会自动改变 Creator Identity Kernel。';$('#detailAnalysisState').textContent=w.isPreset?'PRESET EXAMPLE · NEVER SAVED':review?.status==='confirmed'?'WORK READING · USER CONFIRMED':review?.status==='rejected'?'WORK READING · USER REJECTED':analysis?.analysisBasis==='local_visual_signals'?'LOCAL VISUAL SIGNALS + GLM · DRAFT':analysis?'VISION MODEL · DRAFT':'PROCESS MEMORY · READY';$('#detailMedia').innerHTML='';if(w.url){const im=new Image();im.src=w.url;$('#detailMedia').appendChild(im)}else $('#detailMedia').textContent=w.isPreset?'PRESET INTERACTION EXAMPLE':'NO IMAGE · MEMORY SEED';$('#workDetail').classList.add('open');setOverlayOpen(true);tone(760,.14,.012)}
$('#detailDesc').addEventListener('input',()=>{if(openWorkIndex<0)return;const work=state.works[openWorkIndex];if(work?.analysisReview?.status==='confirmed'){$('#workReviewActions').dataset.status='pending';$('#workReviewStatus').textContent='文字已改变；请重新确认这个版本。'}});
$('#workReadingConfirm').addEventListener('click',()=>{const work=state.works[openWorkIndex],introduction=$('#detailDesc').value.trim();if(!work?.analysis||!introduction){sayBuddy('先留下一句你愿意确认的作品介绍。',2400);return}work.analysisReview={status:'confirmed',confirmedIntroduction:introduction,userEdited:introduction!==work.analysis.polishedIntroduction,confirmedFormalLanguage:[...(work.analysis.formalLanguage||[])],confirmedInspirationHypotheses:[...(work.analysis.inspirationHypotheses||[])],reviewedAt:new Date().toISOString()};meaningStore?.saveWorks(state.works);setWorkReviewUi(work.analysisReview);$('#detailAnalysisState').textContent='WORK READING · USER CONFIRMED';sayBuddy('这次只保存你确认过的作品解读。',2600);tone(820,.18,.016)});
$('#workReadingReject').addEventListener('click',()=>{const work=state.works[openWorkIndex];if(!work?.analysis)return;work.analysisReview={status:'rejected',confirmedIntroduction:'',userEdited:false,confirmedFormalLanguage:[],confirmedInspirationHypotheses:[],reviewedAt:new Date().toISOString()};meaningStore?.saveWorks(state.works);setWorkReviewUi(work.analysisReview);$('#detailAnalysisState').textContent='WORK READING · USER REJECTED';sayBuddy('收到。这份 AI 初稿不会进入后续理解。',2600);tone(330,.16,.012)});
$('#detailClose').addEventListener('click',()=>{$('#workDetail').classList.remove('open');setOverlayOpen(false);openWorkIndex=-1});

function renderCompletion(){
  const summary=completionSummaryBuilder?.buildCompletionSummary({creatorState:creatorIdentityStore?.getState(),creatorKernel:creatorIdentityStore?.getKernel(),confirmedWorks:meaningStore?.getConfirmedWorkInterpretations()})||{message:'我们已经留下一些起点；更多理解会从之后的创作里慢慢长出来。',items:[],counts:{stableKernelItems:0,growingThreads:0,confirmedWorks:0}};
  $('#completionMessage').textContent=summary.message;
}
$('#startCreate').addEventListener('click',()=>{renderCompletion();workRun=false;camera.ts=1.04;sayBuddy('来看一眼，我们目前一起确认了什么。',2600);tone(720,.18,.018);go('complete','fade')});

const handoffCanvas=$('#handoffOctopus'),handoffCtx=handoffCanvas.getContext('2d');handoffCtx.imageSmoothingEnabled=false;
function paintHandoffOctopus(context,body,accent,eye){
  const px=(x,y,w=4,h=4,c=body,a=1)=>{context.globalAlpha=a;context.fillStyle=c;context.fillRect(x,y,w,h);context.globalAlpha=1};
  for(let y=30;y<=112;y+=4){for(let x=50;x<=190;x+=4){const dx=(x-120)/70,dy=(y-76)/48;if(dx*dx+dy*dy<1)px(x,y,4,4,dx*dx+dy*dy>.72?accent:body,.96)}}
  px(88,66,12,12,eye);px(140,66,12,12,eye);px(92,70,4,4,'#080a14');px(144,70,4,4,'#080a14');
  const tentacles=[[[62,106],[48,130],[32,154],[20,180]],[[82,110],[72,138],[66,166],[52,188]],[[104,112],[98,144],[102,174],[92,194]],[[124,112],[124,146],[118,176],[126,196]],[[144,112],[150,142],[146,170],[158,192]],[[164,108],[178,134],[184,162],[202,184]]];
  tentacles.forEach((points,index)=>{points.slice(0,-1).forEach((point,i)=>{const next=points[i+1],steps=Math.max(Math.abs(next[0]-point[0]),Math.abs(next[1]-point[1]))/4;for(let step=0;step<=steps;step+=1){const t=step/steps;px(Math.round((point[0]+(next[0]-point[0])*t)/4)*4,Math.round((point[1]+(next[1]-point[1])*t)/4)*4,4,4,index%2?body:accent,.94)}})});
  [[36,48],[202,62],[32,118],[208,126],[58,24],[186,28]].forEach(([x,y],i)=>{px(x,y,4,4,i%2?accent:eye,.8);px(x-4,y,4,4,accent,.35);px(x+4,y,4,4,accent,.35);px(x,y-4,4,4,accent,.35);px(x,y+4,4,4,accent,.35)});
}
function drawHandoffOctopus(progress){handoffCtx.clearRect(0,0,handoffCanvas.width,handoffCanvas.height);paintHandoffOctopus(handoffCtx,'#777b86','#4d5260','#d8d9dc');handoffCtx.save();const top=handoffCanvas.height*(1-clamp(progress,0,1));handoffCtx.beginPath();handoffCtx.rect(0,top,handoffCanvas.width,handoffCanvas.height-top);handoffCtx.clip();paintHandoffOctopus(handoffCtx,'#78e4ef','#b8a7ff','#fff6d6');handoffCtx.restore()}
drawHandoffOctopus(0);
let handoffRun=false,handoffReady=false;
function startHandoff(){if(active!=='complete'||handoffRun)return;handoffRun=true;meaningStore?.setProgress('complete',true);drawHandoffOctopus(0);tone(260,.24,.026);go('handoff','fade',()=>{const started=performance.now(),duration=3200;let soundStep=-1;function fill(now){const progress=clamp((now-started)/duration,0,1),eased=1-Math.pow(1-progress,2.4),nextStep=Math.min(7,Math.floor(eased*8));drawHandoffOctopus(1-Math.pow(1-progress,2.4));if(nextStep>soundStep){soundStep=nextStep;tone(300+soundStep*66,.16,.018+soundStep*.0015)}if(progress<1){requestAnimationFrame(fill);return}tone(880,.36,.032);setTimeout(()=>tone(1174.66,.42,.022),110);handoffRun=false;if(handoffReady)return;handoffReady=true;window.dispatchEvent(new CustomEvent('whisper:handoff-ready',{detail:{source:'onboarding',status:'ready'}}));try{if(typeof window.startWhisperSecondHalf==='function')window.startWhisperSecondHalf()}catch(error){console.warn('Second-half handoff callback failed',error)}}requestAnimationFrame(fill)})}

})();
