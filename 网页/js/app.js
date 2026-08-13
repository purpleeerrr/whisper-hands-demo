(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const intro=$('#intro'),loader=$('#loader'),app=$('#app'),enterButton=$('#enterButton'),notes=$$('.desk-note');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const octoSVG=`<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M18 31c0-12 6-20 14-20s14 8 14 20c0 5-2 9-5 12-2 2-6 4-9 4s-7-2-9-4c-3-3-5-7-5-12Z" fill="rgba(216,92,65,.13)" stroke="#2c302e" stroke-width="2" stroke-linecap="round"/><path d="M22 43c-1 8-8 7-7 2M27 48c-2 9-8 10-10 5M32 50c0 9-4 12-6 8M37 48c2 9 8 10 10 5M42 43c1 8 8 7 7 2" stroke="#2c302e" stroke-width="2" stroke-linecap="round"/><circle cx="27" cy="28" r="1.7" fill="#2c302e"/><circle cx="37" cy="28" r="1.7" fill="#2c302e"/></svg>`;
$$('.octo-mini').forEach(n=>n.innerHTML=octoSVG);

/* quiet octopus companion */
let octoCompanionTimer=null,octoCompanionHide=null;
const companionMessages={now:['不急着整理，先做你手上的事。','刚才那个停顿也算创作的一部分。','如果有一刻你想记住，按一下“留一刻”就好。'],memory:['有些半成品不是失败，只是还没到继续的时候。','过去的尝试还在这里，想用的时候再翻出来。','资料夹只是整理方式，任何一张纸都能重新拿回桌面。'],review:['你不用把每一步都做对，回头能看见为什么改变就够了。','这里记录的是过程，不是给你的作品打分。'],setting:['我只在你允许的时候听，也只在录制时记录。','整理好以后，关掉也没关系。']} ;
function companionSay(text,duration=4700){const box=$('#octoCompanion'),label=$('#octoCompanionText');if(!box||!label||!app.classList.contains('active'))return;label.textContent=text;box.classList.add('show');clearTimeout(octoCompanionHide);octoCompanionHide=setTimeout(()=>box.classList.remove('show'),duration)}
function scheduleCompanion(){clearTimeout(octoCompanionTimer);octoCompanionTimer=setTimeout(()=>{if(app.classList.contains('active')&&!folderView?.classList.contains('open')&&!finish?.classList.contains('open')){const page=$('.index-tab.active')?.dataset.page||'now',pool=companionMessages[page]||companionMessages.now;companionSay(pool[Math.floor(Math.random()*pool.length)])}scheduleCompanion()},26000+Math.random()*26000)}
setTimeout(scheduleCompanion,8000);

/* sound and haptic */
let audioCtx=null,soundOn=true;
function tone(freq=440,duration=.055,gain=.015){if(!soundOn)return;try{audioCtx||=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const now=audioCtx.currentTime,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='triangle';o.frequency.value=freq;g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(gain,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+duration);o.connect(g).connect(audioCtx.destination);o.start(now);o.stop(now+duration+.02)}catch(_){}}
function buzz(p){try{navigator.vibrate&&navigator.vibrate(p)}catch(_){}}
let toastTimer;function toast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1500)}

/* intro drag + click shortcut */
let noteZ=50;
notes.forEach((note,i)=>note.style.setProperty('--breath-delay',`${-i*.62}s`));
notes.forEach(note=>{let s=null,moved=false;note.addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=note.getBoundingClientRect();s={x:e.clientX,y:e.clientY,left:r.left,top:r.top,lastX:e.clientX};moved=false;note.setPointerCapture(e.pointerId);note.classList.add('dragging');note.style.left=r.left+'px';note.style.top=r.top+'px';note.style.zIndex=++noteZ;tone(350)});note.addEventListener('pointermove',e=>{if(!s)return;const dx=e.clientX-s.x,dy=e.clientY-s.y;if(Math.hypot(dx,dy)>7)moved=true;note.style.left=Math.max(-35,Math.min(innerWidth-note.offsetWidth+35,s.left+dx))+'px';note.style.top=Math.max(-25,Math.min(innerHeight-note.offsetHeight+25,s.top+dy))+'px';const tilt=Math.max(-5,Math.min(5,(e.clientX-s.lastX)*.65));s.lastX=e.clientX;note.style.transform=`rotate(${tilt}deg) scale(1.02)`});note.addEventListener('pointerup',e=>{if(!s)return;try{note.releasePointerCapture(e.pointerId)}catch(_){}note.classList.remove('dragging');note.style.transform='rotate(var(--r,0deg))';const click=!moved;s=null;if(click)enterApp(note.dataset.page,note.dataset.focus);else tone(250)});note.addEventListener('pointercancel',()=>{s=null;note.classList.remove('dragging')})});

/* intro title interaction removed: no hover attraction */

/* pencil trail */
const canvas=$('#trailCanvas'),ctx=canvas.getContext('2d');let pts=[],last=null;function resize(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=innerWidth*dpr;canvas.height=innerHeight*dpr;canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}resize();addEventListener('resize',resize);addEventListener('pointermove',e=>{if(reduced||intro.style.display==='none')return;if(last){const dx=e.clientX-last.x,dy=e.clientY-last.y,speed=Math.hypot(dx,dy);pts.push({x1:last.x,y1:last.y,x2:e.clientX,y2:e.clientY,life:1,w:Math.max(.6,1.9-speed*.02)});if(pts.length>140)pts.shift()}last={x:e.clientX,y:e.clientY}});function draw(){ctx.clearRect(0,0,innerWidth,innerHeight);ctx.lineCap='round';pts.forEach(p=>{p.life-=.027;ctx.globalAlpha=Math.max(0,p.life)*.16;ctx.strokeStyle='#2c302e';ctx.lineWidth=p.w;ctx.beginPath();ctx.moveTo(p.x1,p.y1);ctx.lineTo(p.x2,p.y2);ctx.stroke()});ctx.globalAlpha=1;pts=pts.filter(p=>p.life>0);requestAnimationFrame(draw)}draw();

let entering=false;
function finishIntroEntry(page,focus,delay=0){setTimeout(()=>{intro.classList.add('exiting')},delay);setTimeout(()=>{intro.style.display='none';loader.classList.add('active')},delay+360);setTimeout(()=>{loader.classList.remove('active');app.classList.add('active');app.setAttribute('aria-hidden','false');document.body.style.overflowY='auto';entering=false;showPage(page,focus)},delay+2120)}
function enterApp(page='now',focus=null,fromTitle=false){
  if(app.classList.contains('active')){showPage(page,focus);return}
  if(entering)return;
  entering=true;tone(620,.07,.02);buzz(8);
  if(fromTitle){
    enterButton.classList.remove('click-pop');
    void enterButton.offsetWidth;
    enterButton.classList.add('click-pop');
    notes.forEach((n,i)=>{
      n.style.pointerEvents='none';
      n.style.transition=`opacity .28s ease ${i*12}ms, filter .28s ease ${i*12}ms`;
      n.style.opacity='0';n.style.filter='blur(.35px)';
    });
    finishIntroEntry(page,focus,180);
  }else{
    notes.forEach((n,i)=>{n.style.transitionDelay=(i*18)+'ms';n.style.opacity='0';n.style.transform=`translate(${Math.random()*55-27}px,${Math.random()*45-22}px) scale(.9) rotate(${Math.random()*8-4}deg)`});
    finishIntroEntry(page,focus,0)
  }
}
enterButton.addEventListener('click',()=>enterApp('now',null,true));

/* four primary pages */
function showPage(page,focus=null){if(typeof closeQuickRecordDetail==='function'&&quickRecordDetail?.classList.contains('open'))closeQuickRecordDetail();$$('.pc-page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));$$('.index-tab').forEach(t=>t.classList.toggle('active',t.dataset.page===page));scrollTo({top:0,behavior:reduced?'auto':'smooth'});tone(500,.04,.01);if(focus)setTimeout(()=>focusBlock(focus),140)}
function focusBlock(id){const el=document.getElementById(id);if(!el)return;el.classList.remove('shortcut-focus');void el.offsetWidth;el.classList.add('shortcut-focus');el.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});setTimeout(()=>el.classList.remove('shortcut-focus'),2400)}
$$('.index-tab').forEach(t=>t.addEventListener('click',()=>showPage(t.dataset.page)));
$('#backMemory').addEventListener('click',()=>showPage('memory'));$('#homeBtn').addEventListener('click',()=>location.reload());

/* fixed drag implementation: wrapper uses left/top, card uses transform */
let blockZ=10;
$$('.drag-block').forEach(block=>{let s=null,moved=false;block.addEventListener('pointerdown',e=>{if(innerWidth<=980||e.button!==0||e.target.closest('button,input,textarea,select,a,label,.record-card,.folder'))return;const canvas=block.parentElement,br=block.getBoundingClientRect(),cr=canvas.getBoundingClientRect();s={x:e.clientX,y:e.clientY,left:br.left-cr.left,top:br.top-cr.top,canvas};moved=false;block.setPointerCapture(e.pointerId);block.classList.add('dragging');block.style.zIndex=++blockZ;tone(340,.045,.012)});block.addEventListener('pointermove',e=>{if(!s)return;const dx=e.clientX-s.x,dy=e.clientY-s.y;if(Math.hypot(dx,dy)>6)moved=true;let minL=0,minT=0,maxL=Math.max(0,s.canvas.clientWidth-block.offsetWidth),maxT=Math.max(0,s.canvas.clientHeight-block.offsetHeight);if(block.id==='recordsBlock'){const sideFreedom=Math.min(300,block.offsetWidth*.22);minL=-sideFreedom;maxL=Math.max(0,s.canvas.clientWidth-block.offsetWidth)+sideFreedom;minT=150;maxT=Math.max(minT,s.canvas.clientHeight-block.offsetHeight+220)}block.style.left=Math.max(minL,Math.min(maxL,s.left+dx))+'px';block.style.top=Math.max(minT,Math.min(maxT,s.top+dy))+'px'});const stop=e=>{if(!s)return;try{block.releasePointerCapture(e.pointerId)}catch(_){}block.classList.remove('dragging');s=null;if(moved){tone(250,.04,.01);buzz(4)}};block.addEventListener('pointerup',stop);block.addEventListener('pointercancel',stop)});

/* NOW session state */
const recDot=$('#recDot'),recState=$('#recState'),micState=$('#micState'),liveStatus=$('#liveStatus'),modeHint=$('#modeHint'),durationStat=$('#durationStat'),nodeStat=$('#nodeStat');
let sessionActive=false,paused=false,currentMode=null,nodeCount=3,startedAt=null,timer=null,elapsed=0;
const modeNames={explore:'探索模式',create:'创作模式',execute:'执行模式',recover:'恢复模式'};
function updateTimer(){if(!sessionActive||paused)return;elapsed=Math.floor((Date.now()-startedAt)/1000);durationStat.textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0')}
function startSession(mode){currentMode=mode;sessionActive=true;paused=false;startedAt=Date.now()-elapsed*1000;clearInterval(timer);timer=setInterval(updateTimer,1000);$$('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));recDot.className='rec-dot on';recState.textContent='REC · '+modeNames[mode];liveStatus.textContent=modeNames[mode].toUpperCase()+' · RECORDING';modeHint.textContent=`已进入${modeNames[mode]}。你可以不再管网页，继续做手上的事。`;$('#pauseBtn').textContent='Ⅱ 暂停';tone(470,.06,.02);toast(`${modeNames[mode]} · 开始记录`)}
$$('.mode-btn').forEach(b=>b.addEventListener('click',()=>startSession(b.dataset.mode)));
$('#pauseBtn').addEventListener('click',()=>{if(!sessionActive){toast('先选择一个创作模式');return}paused=!paused;if(paused){recDot.className='rec-dot pause';recState.textContent='PAUSED';liveStatus.textContent='PAUSED';$('#pauseBtn').textContent='▶ 继续';clearInterval(timer);tone(300)}else{startedAt=Date.now()-elapsed*1000;timer=setInterval(updateTimer,1000);recDot.className='rec-dot on';recState.textContent='REC · '+modeNames[currentMode];liveStatus.textContent=modeNames[currentMode].toUpperCase()+' · RECORDING';$('#pauseBtn').textContent='Ⅱ 暂停';tone(440)} });
function addTimeline(kind,text){nodeCount++;nodeStat.textContent=nodeCount;const tm=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});const ev=document.createElement('div');ev.className='event';ev.innerHTML=`<div class="event-thumb" data-kind="${kind}" style="--r:${Math.random()*6-3}deg"></div><div class="event-text"><b>${tm} · <span class="${kind==='F8'?'manual-tag':'auto-tag'}">${kind==='F8'?'留一刻':kind}</span></b><p>${text}</p></div>`;$('#timeline').prepend(ev)}
$('#markBtn').addEventListener('click',()=>{if(!sessionActive){toast('先选择一个创作模式');return}addTimeline('F8','这一刻被你手动标记为重要节点。');tone(800,.1,.025);buzz([8,25,8]);toast('留一刻 · 已记住')});
const voiceBtn=$('#voiceBtn');let listening=false;
function stopListening(){if(!listening)return;listening=false;voiceBtn.classList.remove('listening');voiceBtn.textContent='〰 按住说话';micState.textContent='MIC OFF';micState.classList.remove('listening');const tm=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}),note=document.createElement('div');note.className='voice-note';note.style.setProperty('--r',(Math.random()*3-1.5)+'deg');note.innerHTML=`<b>${tm} · VOICE</b><p>“我觉得这里先别急着改，下一轮只试一个变量。”</p>`;$('#voiceNotes').prepend(note);addTimeline('VOICE','口述已自动转成文字，不需要重新听一遍录音。');tone(610,.055,.018);toast('已经写下来啦')}
voiceBtn.addEventListener('pointerdown',e=>{if(!sessionActive){toast('先选择一个创作模式');return}e.preventDefault();listening=true;voiceBtn.classList.add('listening');voiceBtn.textContent='● 正在听… 松开结束';micState.textContent='MIC LISTENING';micState.classList.add('listening');tone(520,.05,.015)});voiceBtn.addEventListener('pointerup',stopListening);voiceBtn.addEventListener('pointercancel',stopListening);voiceBtn.addEventListener('pointerleave',e=>{if(listening&&e.buttons===0)stopListening()});

/* finish modal */
const finish=$('#finishModal');$('#endBtn').addEventListener('click',()=>{if(!sessionActive){toast('当前还没有正在进行的创作');return}clearInterval(timer);sessionActive=false;recDot.className='rec-dot';recState.textContent='IDLE';liveStatus.textContent='SESSION COMPLETE';$('#finishDuration').textContent=durationStat.textContent+' · SESSION';$('#finishNodes').textContent=nodeCount+' NODES';finish.classList.add('open');finish.setAttribute('aria-hidden','false');tone(560,.07,.02)});function closeFinish(){finish.classList.remove('open');finish.setAttribute('aria-hidden','true')}$('#closeFinishBtn').addEventListener('click',closeFinish);$('#goReviewBtn').addEventListener('click',()=>{closeFinish();showPage('review','reviewTimeline')});$('#deleteSessionBtn').addEventListener('click',()=>{closeFinish();elapsed=0;durationStat.textContent='00:00';toast('本次演示记录已删除')});

/* MEMORY records drag + merge + reversible folders */
const board=$('#recordBoard'),folderStore=new Map();let recordZ=20,folderIndex=1,activeFolder=null;
const folderView=$('#folderView'),folderGrid=$('#folderGrid'),folderViewBody=$('#folderViewBody'),folderDropZone=$('#folderDropZone');
function overlap(a,b){const r1=a.getBoundingClientRect(),r2=b.getBoundingClientRect(),w=Math.max(0,Math.min(r1.right,r2.right)-Math.max(r1.left,r2.left)),h=Math.max(0,Math.min(r1.bottom,r2.bottom)-Math.max(r1.top,r2.top));return w*h/Math.min(r1.width*r1.height,r2.width*r2.height)}
function recordData(card){const meta=card.querySelector('.record-meta span')?.textContent?.trim()||'';const [date='',duration='']=meta.split('·').map(s=>s.trim());return{id:card.dataset.id,title:card.dataset.title,mode:card.dataset.mode||'create',date,duration,summary:card.querySelector('p')?.textContent?.trim()||'',bg:card.style.background||'',voice:`“${card.querySelector('p')?.textContent?.trim()||'这个想法先留着，下一次继续看。'}”`,reflect:'下一次继续时，先保持其他变量不变，只验证这一条线索。'}}
function sortRecords(rs){return [...rs].sort((a,b)=>(parseInt((a.id||'R0').replace(/\D/g,''))||0)-(parseInt((b.id||'R0').replace(/\D/g,''))||0))}
function createRecordCard(r,left,top){const c=document.createElement('article');c.className='record-card';c.dataset.id=r.id;c.dataset.title=r.title;c.dataset.mode=r.mode||'create';c.style.left=Math.max(0,Math.min(board.clientWidth-230,left))+'px';c.style.top=Math.max(0,Math.min(board.clientHeight-155,top))+'px';c.style.setProperty('--r',(Math.random()*4-2).toFixed(1)+'deg');if(r.bg)c.style.background=r.bg;c.innerHTML=`<div class="record-meta"><span>${r.date||'2026.08.12'} · ${r.duration||'--'}</span><span class="star">☆</span></div><div class="cover"></div><h4>${r.title}</h4><p>${r.summary||'一次被保存下来的创作尝试。'}</p>`;board.appendChild(c);makeRecordDraggable(c);return c}
function fanPositions(count){const presets={2:[[-42,6,-7],[68,0,6]],3:[[-62,12,-8],[50,-2,0],[162,10,8]],4:[[-58,18,-9],[36,-4,-3],[130,-3,3],[224,18,9]],5:[[-54,24,-10],[22,2,-5],[98,-10,0],[174,2,5],[250,24,10]]};return presets[count]||presets[5]}
function updateFolder(folder){const rs=sortRecords(folderStore.get(folder.dataset.key)||[]);folderStore.set(folder.dataset.key,rs);folder.querySelector('.folder-title').textContent=`创作资料夹 · ${rs.length}`;folder.querySelector('.folder-count').textContent=`HANDMADE FOLDER / ${rs.length} RECORDS`;folder.querySelector('.folder-hint').textContent=rs.length>5?'OPEN FOLDER →':(folder.classList.contains('open')?'CLICK A SHEET TO READ · DRAG OUT':'CLICK TO FAN OUT');const pv=folder.querySelector('.folder-previews');pv.innerHTML='';if(rs.length<=5){const pos=fanPositions(rs.length);rs.forEach((r,i)=>{const n=document.createElement('div');n.className='folder-record-mini';n.dataset.id=r.id;const [x,y,rot]=pos[i]||[i*72,0,0];n.style.setProperty('--fx',x+'px');n.style.setProperty('--fy',y+'px');n.style.setProperty('--fr',rot+'deg');n.innerHTML=`<b>${r.id}</b><span>${r.title}</span>`;pv.appendChild(n);makeFolderMiniDraggable(n,folder)})}}
function mergeCards(a,b){const br=b.getBoundingClientRect(),ar=board.getBoundingClientRect(),key='F'+Date.now()+folderIndex++;const folder=document.createElement('div');folder.className='folder';folder.dataset.key=key;folder.style.left=Math.max(10,br.left-ar.left)+'px';folder.style.top=Math.max(18,br.top-ar.top)+'px';folder.innerHTML='<div class="folder-title">创作资料夹 · 2</div><div class="folder-count">HANDMADE FOLDER / 2 RECORDS</div><div class="folder-previews"></div><div class="folder-hint">CLICK TO FAN OUT · DRAG A SHEET OUT</div>';folderStore.set(key,[recordData(b),recordData(a)]);a.remove();b.remove();board.appendChild(folder);updateFolder(folder);makeRecordDraggable(folder);tone(430,.06,.022);setTimeout(()=>tone(560,.06,.018),55);buzz([8,25,8]);toast('已整理成资料夹');companionSay('收好啦。想拿出来的时候，也可以直接把纸拖回桌面。')}
function addToFolder(folder,card){const rs=folderStore.get(folder.dataset.key)||[];rs.push(recordData(card));folderStore.set(folder.dataset.key,rs);card.remove();folder.classList.remove('open');updateFolder(folder);tone(500,.05,.018);toast(`已加入资料夹 · ${rs.length} 条记录`);if(rs.length===6)companionSay('这里已经有 6 张记录了。下次点开，我会带你进入完整的资料夹页。')}
function pointOutsideRect(x,y,r,pad=0){return x<r.left-pad||x>r.right+pad||y<r.top-pad||y>r.bottom+pad}
const quickRecordDetail=$('#quickRecordDetail');
let quickActiveFolder=null,quickActiveId=null,quickActiveCard=null;
function quickRecordById(folder,id){return (folderStore.get(folder.dataset.key)||[]).find(r=>r.id===id)||null}
function closeQuickRecordDetail(){
  quickRecordDetail.classList.remove('open');quickRecordDetail.setAttribute('aria-hidden','true');
  if(quickActiveFolder){quickActiveFolder.classList.remove('has-quick-detail');quickActiveFolder.querySelectorAll('.folder-record-mini').forEach(n=>n.classList.remove('detail-selected'))}
  if(quickActiveCard)quickActiveCard.classList.remove('detail-selected');
  quickActiveFolder=null;quickActiveId=null;quickActiveCard=null;
}
function openQuickRecordDetail(folder,r,sourceCard=null){
  if(!r)return;
  if(quickActiveFolder&&quickActiveFolder!==folder){quickActiveFolder.classList.remove('has-quick-detail');quickActiveFolder.querySelectorAll('.folder-record-mini').forEach(n=>n.classList.remove('detail-selected'))}
  if(quickActiveCard&&quickActiveCard!==sourceCard)quickActiveCard.classList.remove('detail-selected');
  quickActiveFolder=folder||null;quickActiveId=r.id;quickActiveCard=folder?null:sourceCard;
  if(folder){folder.classList.add('has-quick-detail');folder.querySelectorAll('.folder-record-mini').forEach(n=>n.classList.toggle('detail-selected',n.dataset.id===r.id))}
  if(quickActiveCard)quickActiveCard.classList.add('detail-selected');
  $('#quickDetailId').textContent=r.id;$('#quickDetailTitle').textContent=r.title;
  $('#quickDetailMeta').textContent=`${r.date||'DATE'} · ${r.duration||'--'} · ${(r.mode||'create').toUpperCase()}`;
  $('#quickDetailSummary').textContent=r.summary||'一次被保存下来的创作尝试。';
  $('#quickDetailMoments').innerHTML=`<div class="quick-detail-moment"><b>14:02 · AUTO</b><br>系统自动保留了桌面变化。</div><div class="quick-detail-moment"><b>14:18 · 留一刻</b><br>${r.summary||'这个时刻被单独标记。'}</div><div class="quick-detail-moment"><b>14:31 · VOICE</b><br>当时的口述想法已经转成文字。</div>`;
  $('#quickDetailVoice').textContent=r.voice||'“这个想法先留着，下一次继续看。”';
  $('#quickDetailReflect').textContent=r.reflect||'下一次从最小变量开始继续验证。';
  quickRecordDetail.classList.add('open');quickRecordDetail.setAttribute('aria-hidden','false');tone(610,.045,.012);
}
$('#quickRecordDetailClose').addEventListener('click',closeQuickRecordDetail);

function removeRecordFromFolder(folder,id,clientX=null,clientY=null){let rs=folderStore.get(folder.dataset.key)||[];const idx=rs.findIndex(r=>r.id===id);if(idx<0)return null;if(quickActiveFolder===folder)closeQuickRecordDetail();const [r]=rs.splice(idx,1);folderStore.set(folder.dataset.key,rs);const br=board.getBoundingClientRect(),fr=folder.getBoundingClientRect();let left=clientX==null?fr.left-br.left+folder.offsetWidth+18:clientX-br.left-115,top=clientY==null?fr.top-br.top+20:clientY-br.top-75;createRecordCard(r,left,top);if(rs.length<=1){const last=rs[0];if(last){const fLeft=parseFloat(folder.style.left)||20,fTop=parseFloat(folder.style.top)||20;createRecordCard(last,fLeft+25,fTop+22)}folderStore.delete(folder.dataset.key);folder.remove();toast('资料夹已解散');companionSay('只剩一张纸了，就不用把它关在资料夹里啦。')}else{folder.classList.remove('open');updateFolder(folder);toast(`${id} 已恢复为独立记录`)}tone(280,.055,.014);buzz(6);return r}
function makeFolderMiniDraggable(mini,folder){
  let s=null,ghost=null,moved=false;
  const move=e=>{
    if(!s||e.pointerId!==s.pointerId)return;
    const dist=Math.hypot(e.clientX-s.x,e.clientY-s.y);
    if(dist>8&&!moved){
      moved=true;mini.classList.add('drag-source');
      ghost=document.createElement('div');ghost.className='folder-mini-ghost';ghost.innerHTML=mini.innerHTML;ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';document.body.appendChild(ghost);tone(340,.04,.01)
    }
    if(!moved)return;
    ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';
    const outside=pointOutsideRect(e.clientX,e.clientY,folder.getBoundingClientRect(),40);ghost.classList.toggle('ready-out',outside)
  };
  const end=e=>{
    if(!s||e.pointerId!==s.pointerId)return;
    window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',end,true);window.removeEventListener('pointercancel',end,true);
    if(moved){
      const outside=pointOutsideRect(e.clientX,e.clientY,folder.getBoundingClientRect(),40);mini.classList.remove('drag-source');ghost?.remove();
      if(outside){removeRecordFromFolder(folder,mini.dataset.id,e.clientX,e.clientY);companionSay('拿出来也没关系，资料夹只是整理方式，不是固定规则。')}else updateFolder(folder)
    }else{
      const r=quickRecordById(folder,mini.dataset.id);
      if(quickActiveFolder===folder&&quickActiveId===mini.dataset.id)closeQuickRecordDetail();
      else openQuickRecordDetail(folder,r,mini)
    }
    s=null;ghost=null;moved=false
  };
  mini.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();
    s={x:e.clientX,y:e.clientY,pointerId:e.pointerId};moved=false;
    window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',end,true);window.addEventListener('pointercancel',end,true)
  })
}
function openFolderAction(folder){const rs=folderStore.get(folder.dataset.key)||[];if(rs.length>5){closeQuickRecordDetail();enterFolderView(folder)}else{const willClose=folder.classList.contains('open');if(willClose&&quickActiveFolder===folder)closeQuickRecordDetail();folder.classList.toggle('open');updateFolder(folder);tone(590,.045,.015);if(folder.classList.contains('open'))companionSay('这些纸可以点开细看，也可以直接拖出来放回桌面。')}}
function makeRecordDraggable(el){let s=null,target=null,moved=false;el.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('.folder-record-mini'))return;const er=el.getBoundingClientRect(),br=board.getBoundingClientRect();s={x:e.clientX,y:e.clientY,left:er.left-br.left,top:er.top-br.top};moved=false;el.setPointerCapture(e.pointerId);el.classList.add('dragging');el.style.zIndex=++recordZ;tone(340,.04,.01)});el.addEventListener('pointermove',e=>{if(!s)return;const dx=e.clientX-s.x,dy=e.clientY-s.y;if(Math.hypot(dx,dy)>8)moved=true;if(!moved)return;if(quickActiveCard===el)closeQuickRecordDetail();const edge=12;el.style.left=Math.max(-edge,Math.min(board.clientWidth-el.offsetWidth+edge,s.left+dx))+'px';el.style.top=Math.max(-edge,Math.min(board.clientHeight-el.offsetHeight+edge,s.top+dy))+'px';$$('.merge-target').forEach(n=>n.classList.remove('merge-target'));target=null;if(el.classList.contains('record-card')){[...board.querySelectorAll('.folder,.record-card')].filter(n=>n!==el).some(n=>{const th=n.classList.contains('folder')?.34:.5;if(overlap(el,n)>th){target=n;n.classList.add('merge-target');return true}return false})}});const stop=e=>{if(!s)return;try{el.releasePointerCapture(e.pointerId)}catch(_){}el.classList.remove('dragging');$$('.merge-target').forEach(n=>n.classList.remove('merge-target'));if(target){if(target.classList.contains('folder'))addToFolder(target,el);else mergeCards(el,target)}else if(!moved&&el.classList.contains('folder'))openFolderAction(el);else if(!moved&&el.classList.contains('record-card')){const r=recordData(el);if(quickActiveCard===el&&quickRecordDetail.classList.contains('open'))closeQuickRecordDetail();else openQuickRecordDetail(null,r,el)}else tone(250,.04,.01);s=null;target=null};el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop)}
function renderFolderGrid(){if(!activeFolder)return;const rs=sortRecords(folderStore.get(activeFolder.dataset.key)||[]);folderGrid.innerHTML='';rs.forEach((r,i)=>{const c=document.createElement('article');c.className='folder-view-card';c.dataset.id=r.id;c.style.setProperty('--vr',((i%5)-2)*.45+'deg');c.innerHTML=`<div class="fv-id">${r.id}</div><div class="fv-meta">${r.date||'DATE'} · ${r.duration||'--'}</div><div class="fv-cover"></div><h4>${r.title}</h4><p>${r.summary||''}</p><span class="fv-tag">${(r.mode||'create').toUpperCase()}</span>`;folderGrid.appendChild(c);makeFolderViewCard(c,r)})}
function enterFolderView(folder){activeFolder=folder;const rs=sortRecords(folderStore.get(folder.dataset.key)||[]);$('#folderViewTitle').textContent=folder.querySelector('.folder-title').textContent.replace(/ · \d+$/,'');$('#folderViewSub').textContent=`${rs[0]?.id||''} — ${rs.at(-1)?.id||''} · ${rs.length} RECORDS`;folderViewBody.classList.remove('detail-open');folderView.classList.add('open');folderView.setAttribute('aria-hidden','false');renderFolderGrid();tone(520,.06,.018);companionSay('都在这里。按编号排好了，移过卡片会像抽出一张纸一样弹起来。')}
function closeFolderView(){folderView.classList.remove('open');folderView.setAttribute('aria-hidden','true');folderViewBody.classList.remove('detail-open');folderDropZone.classList.remove('show','hot');activeFolder=null;$('#folderDetail').scrollTop=0}
function openRecordDetail(r){$('#detailId').textContent=r.id;$('#detailTitle').textContent=r.title;$('#detailMeta').textContent=`${r.date||'DATE'} · ${r.duration||'--'} · ${(r.mode||'create').toUpperCase()}`;$('#detailSummary').textContent=r.summary||'一次被保存下来的创作尝试。';$('#detailMoments').innerHTML=`<div class="detail-moment"><b>14:02 · AUTO</b><br>系统自动保留了桌面变化。</div><div class="detail-moment"><b>14:18 · 留一刻</b><br>${r.summary||'这个时刻被单独标记。'}</div><div class="detail-moment"><b>14:31 · VOICE</b><br>当时的口述想法已经转成文字。</div>`;$('#detailVoice').textContent=r.voice||'“这个想法先留着，下一次继续看。”';$('#detailReflect').textContent=r.reflect||'下一次从最小变量开始继续验证。';folderViewBody.classList.add('detail-open');tone(610,.045,.012)}
function makeFolderViewCard(card,r){let s=null,ghost=null,moved=false;const move=e=>{if(!s||e.pointerId!==s.pointerId)return;if(Math.hypot(e.clientX-s.x,e.clientY-s.y)>8&&!moved){moved=true;card.classList.add('drag-source');ghost=card.cloneNode(true);ghost.className='folder-mini-ghost';ghost.style.width='230px';document.body.appendChild(ghost);folderDropZone.classList.add('show');tone(340,.04,.01)}if(!moved)return;ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';const zr=folderDropZone.getBoundingClientRect(),hot=e.clientX>=zr.left&&e.clientX<=zr.right&&e.clientY>=zr.top&&e.clientY<=zr.bottom;folderDropZone.classList.toggle('hot',hot)};const end=e=>{if(!s||e.pointerId!==s.pointerId)return;window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',end,true);window.removeEventListener('pointercancel',end,true);if(moved){const zr=folderDropZone.getBoundingClientRect(),hot=e.clientX>=zr.left&&e.clientX<=zr.right&&e.clientY>=zr.top&&e.clientY<=zr.bottom;card.classList.remove('drag-source');ghost?.remove();folderDropZone.classList.remove('show','hot');if(hot&&activeFolder){const folder=activeFolder,id=r.id;closeFolderView();removeRecordFromFolder(folder,id);companionSay(`${id} 已经放回桌面了。以后想再收进去，也可以重新拖回资料夹。`)}else renderFolderGrid()}else openRecordDetail(r);s=null;ghost=null;moved=false};card.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();s={x:e.clientX,y:e.clientY,pointerId:e.pointerId};moved=false;window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',end,true);window.addEventListener('pointercancel',end,true)})}
$('#folderViewBack').addEventListener('click',closeFolderView);$('#folderDetailClose').addEventListener('click',()=>folderViewBody.classList.remove('detail-open'));
$$('.record-card').forEach(makeRecordDraggable);
board.addEventListener('pointerdown',e=>{if(e.target===board&&quickRecordDetail.classList.contains('open'))closeQuickRecordDetail()});
function seedDemoFolder(){if(board.querySelector('[data-key="FDEMO6"]'))return;const folder=document.createElement('div');folder.className='folder';folder.dataset.key='FDEMO6';folder.style.left='76%';folder.style.top='520px';folder.innerHTML='<div class="folder-title">测试资料夹 · 6</div><div class="folder-count">HANDMADE FOLDER / 6 RECORDS</div><div class="folder-previews"></div><div class="folder-hint">OPEN FOLDER →</div>';folderStore.set('FDEMO6',[
{id:'R101',title:'釉色方向 A',mode:'create',date:'2026.08.01',duration:'28m',summary:'第一轮保留的釉色方向。'},
{id:'R102',title:'釉色方向 B',mode:'explore',date:'2026.08.02',duration:'34m',summary:'改变烧成条件后的第二组尝试。'},
{id:'R103',title:'杯沿厚度记录',mode:'create',date:'2026.08.03',duration:'41m',summary:'集中比较三种杯沿厚度。'},
{id:'R104',title:'泥料发色对照',mode:'execute',date:'2026.08.04',duration:'33m',summary:'同一釉料在两种泥料上的对照。'},
{id:'R105',title:'失败边缘样本',mode:'recover',date:'2026.08.05',duration:'22m',summary:'把失败边缘留下，作为下一轮形式线索。'},
{id:'R106',title:'最终小变量验证',mode:'create',date:'2026.08.06',duration:'37m',summary:'只改变施釉层数，验证最后一个变量。'}]);board.appendChild(folder);updateFolder(folder);makeRecordDraggable(folder)}
seedDemoFolder();
$$('.filter').forEach(f=>f.addEventListener('click',()=>{$$('.filter').forEach(x=>x.classList.remove('active'));f.classList.add('active');const mode=f.dataset.filter;$$('#recordBoard .record-card').forEach(c=>c.style.opacity=(mode==='all'||c.dataset.mode===mode)?'1':'.24');tone(420,.04,.01)}));
$('#memorySearch').addEventListener('input',e=>{const q=e.target.value.trim();$('#searchHint').textContent=q?`正在找“${q}”相关的历史记录和当时的语音备注。`:'搜“蓝釉”，我会把过去相关的尝试一起找出来。'});$('#resumeBtn').addEventListener('click',()=>{showPage('now','liveBlock');toast('已把搁置项目带回当前工作台');companionSay('欢迎回来。上次停下来的地方还在，不用重新想一遍。')});

/* setting interactions */
$$('.switch').forEach(sw=>sw.addEventListener('click',()=>sw.classList.toggle('on')));$('#soundSwitch').addEventListener('click',()=>{soundOn=!soundOn});$('#clearBtn').addEventListener('click',()=>{toast('演示：本地记录已清空');tone(260,.06,.018)});

/* export mock */
$('#exportReview').addEventListener('click',()=>{const payload={project:'Whisper Hands',session:'蓝色杯子实验',duration:durationStat.textContent,nodes:nodeCount,summary:'先用更小的变量变化验证材料边界。'};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='whisper-hands-review-demo.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),300);toast('复盘演示文件已导出')});
})();
