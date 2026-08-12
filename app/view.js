function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function templateCard(template, activeTemplateId) {
  const isActive = template.id === activeTemplateId;
  return `
    <button class="template-card ${isActive ? 'active' : ''}" data-action="select-template" data-template-id="${template.id}">
      <span class="template-type">${template.subtitle}</span>
      <strong>${escapeHtml(template.name)}</strong>
      <span>${template.fields.slice(0, 3).join(' · ')}</span>
      ${template.editable ? '<em>已复制，可编辑</em>' : ''}
    </button>`;
}

function field(label, value, key, options = '') {
  return `<label class="field"><span>${label}</span>${options || `<input data-field="${key}" value="${escapeHtml(value)}" />`}</label>`;
}

function mediaTile(media) {
  if (media.type === 'audio') {
    return `<figure class="media-tile audio-tile"><audio src="${media.url}" controls></audio><figcaption>原始语音</figcaption></figure>`;
  }
  if (media.type === 'video') {
    return `<figure class="media-tile"><video src="${media.url}" controls muted playsinline></video><figcaption>视频片段</figcaption></figure>`;
  }
  return `<figure class="media-tile"><img src="${media.url}" alt="创作过程证据" /><figcaption>过程图片</figcaption></figure>`;
}

function mediaStrip(media = []) {
  if (!media.length) return '';
  return `<div class="media-strip">${media.map(mediaTile).join('')}</div>`;
}

function candidateEditor(item) {
  const candidate = item.candidate;
  if (!candidate) return '';
  const fields = candidate.fields;
  const candidateField = (label, key, value, multiline = false) => `<label class="candidate-field"><span>${label}</span>${multiline
    ? `<textarea data-candidate-field="${key}" data-inbox-id="${item.id}">${escapeHtml(value)}</textarea>`
    : `<input data-candidate-field="${key}" data-inbox-id="${item.id}" value="${escapeHtml(value)}" />`}</label>`;
  const templateFields = Object.entries(candidate.templateValues || {}).map(([label, value]) => `<label class="candidate-field"><span>${escapeHtml(label)}</span>${candidate.voiceOrganized
    ? `<textarea data-candidate-template-label="${escapeHtml(label)}" data-inbox-id="${item.id}">${escapeHtml(value)}</textarea>`
    : `<input data-candidate-template-label="${escapeHtml(label)}" data-inbox-id="${item.id}" value="${escapeHtml(value)}" />`}</label>`).join('');
  const ceramicFields = templateFields ? '' : `
      ${candidateField('泥料', 'clay', fields.clay)}
      ${candidateField('釉料', 'glaze', fields.glaze)}
      ${candidateField('层数', 'coats', fields.coats)}`;
  const reviewFields = candidate.voiceOrganized
    ? `${candidateField('结果状态', 'result', fields.result)}${candidateField('完整口述 / 可修改', 'observation', fields.observation, true)}`
    : `${candidateField('结果', 'result', fields.result)}${candidateField('观察', 'observation', fields.observation, true)}${candidateField('下次实验', 'nextExperiment', fields.nextExperiment, true)}`;
  return `<section class="candidate-editor" aria-label="事实候选">
    <div class="candidate-heading"><div><p class="eyebrow">事实候选记录 / 请确认</p><strong>${escapeHtml(candidate.projectName)}</strong></div><span>${candidate.voiceOrganized ? '口述已整理' : '规则已整理'}</span></div>
    <div class="candidate-grid">
      ${templateFields || ceramicFields}
      ${reviewFields}
    </div>
    <div class="candidate-actions"><button data-action="confirm" data-inbox-id="${item.id}">确认入库</button>${candidate.voiceOrganized ? (candidate.savedTemplateId ? '<span class="saved-template-status">结构已保存为模板</span>' : `<button class="ghost-button" data-action="save-candidate-template" data-inbox-id="${item.id}">把这套结构存成模板</button>`) : ''}<button class="ghost-button" data-action="defer-candidate" data-inbox-id="${item.id}">稍后处理</button><button class="danger-button" data-action="discard-inbox" data-inbox-id="${item.id}">删除记录</button></div>
  </section>`;
}

function inboxCard(item) {
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' })
    .format(new Date(item.capturedAt));
  let action = `<button class="text-button" data-action="shape-inbox" data-inbox-id="${item.id}">整理成候选记录</button>`;
  if (item.status === 'candidate_ready') action = candidateEditor(item);
  if (item.status === 'deferred') action = `<div class="deferred-row"><span class="quiet-status">已放回收件箱</span><button class="text-button" data-action="shape-inbox" data-inbox-id="${item.id}">继续整理</button></div>`;
  if (item.status === 'confirmed') action = '<span class="quiet-status">已确认入库</span>';
  const voice = item.audioEvidence ? `<div class="voice-evidence"><div><p class="eyebrow">原始语音 · ${escapeHtml(item.audioEvidence.source)}</p>${item.audioEvidence.audio ? mediaTile(item.audioEvidence.audio) : '<span class="quiet-status">录音文件未保存，可继续使用转写。</span>'}</div><label class="candidate-field"><span>语音转写 / 可修改</span><textarea data-transcript-field data-inbox-id="${item.id}">${escapeHtml(item.audioEvidence.transcript)}</textarea></label></div>` : '';
  return `<article id="inbox-${item.id}" class="inbox-card ${item.status === 'candidate_ready' ? 'candidate-open' : ''}"><div class="moment-dot"></div><div><p class="eyebrow">留一刻 · ${time}</p><p>${escapeHtml(item.note)}</p>${voice}${mediaStrip(item.media)}${action}</div></article>`;
}

function meaningReview(candidate) {
  if (!candidate || candidate.status === 'discarded') return '';
  if (candidate.status === 'confirmed') {
    return `<div class="meaning-confirmed"><p class="eyebrow">意义已确认</p><strong>已进入“创作原则”层</strong><p>原则与这条事实保持回链。</p></div>`;
  }
  if (candidate.status === 'deferred') {
    return `<div class="meaning-deferred"><span>已稍后处理</span><button class="text-button" data-action="request-meaning" data-record-id="${candidate.recordId}">继续复核</button></div>`;
  }
  return `<section class="meaning-review" aria-label="意义候选">
    <div class="meaning-kicker"><span>Meaning Layer</span><em>等待你确认</em></div>
    <label><span>给你的一道反思题</span><textarea data-meaning-field="reflectionQuestion" data-meaning-id="${candidate.id}">${escapeHtml(candidate.reflectionQuestion)}</textarea></label>
    <label><span>意义候选</span><textarea data-meaning-field="candidateMeaning" data-meaning-id="${candidate.id}">${escapeHtml(candidate.candidateMeaning)}</textarea></label>
    <p class="meaning-evidence">依据：只使用这条已确认事实 · ${candidate.evidenceRefs.map(escapeHtml).join('、')}</p>
    <div class="candidate-actions"><button data-action="confirm-meaning" data-meaning-id="${candidate.id}">保留这条原则</button><button class="ghost-button" data-action="defer-meaning" data-meaning-id="${candidate.id}">稍后处理</button><button class="danger-button" data-action="discard-meaning" data-meaning-id="${candidate.id}">放弃</button></div>
  </section>`;
}

function recordCard(record, state) {
  const candidate = (state.meaningCandidates || []).find((item) => item.recordId === record.id && item.status !== 'discarded');
  const materialLine = Object.keys(record.templateValues || {}).length
    ? Object.entries(record.templateValues).filter(([, value]) => value).slice(0, 2).map(([label, value]) => `${escapeHtml(label)}：${escapeHtml(value)}`).join(' · ')
    : `${escapeHtml(record.fields.glaze)} · ${escapeHtml(record.fields.clay)}`;
  const tags = record.fields.coats ? `<span>${record.fields.coats} 层</span>` : '';
  return `<article class="record-card"><div class="record-mark">事实已确认</div><h3>${escapeHtml(record.projectName)}</h3><p>${materialLine}</p><p>${escapeHtml(record.sourceNote)}</p>${mediaStrip(record.media)}<div class="record-tags">${tags}<span>${escapeHtml(record.fields.result)}</span></div><div class="record-actions"><button class="text-button reminder-button" data-action="schedule-reminder" data-record-id="${record.id}">5 秒后提醒我</button>${candidate ? '' : `<div class="meaning-entry"><button class="meaning-button" data-action="request-meaning" data-record-id="${record.id}">提炼这次意义</button><small>只使用这条已确认事实</small></div>`}</div>${meaningReview(candidate)}</article>`;
}

function templateNameForRecord(state, record) {
  return state.templates.find((template) => template.id === record.templateId)?.name || '自定义模板';
}

function principleCard(principle, state) {
  const record = state.confirmedRecords.find((entry) => entry.id === principle.recordId);
  if (!record) return '';
  return `<article class="principle-card">
    <span class="layer-tag">原则</span>
    <strong>${escapeHtml(principle.text)}</strong>
    <p>依据回链</p>
    <a href="#record-${record.id}">${escapeHtml(templateNameForRecord(state, record))} → ${escapeHtml(record.projectName)}</a>
  </article>`;
}

function recallCueCards(state) {
  const records = state.confirmedRecords || [];
  const imageCount = records.filter((record) => (record.media || []).some((media) => media.type === 'image')).length;
  const reminderCount = (state.reminders || []).filter((reminder) => reminder.status === 'scheduled').length;
  const materialCount = records.filter((record) => record.fields?.glaze || Object.values(record.templateValues || {}).some(Boolean)).length;
  return `
    <article class="recall-cue"><span>材料</span><strong>${materialCount} 条材料线索</strong><p>选择相同釉料或材料时，主动找回相关事实。</p></article>
    <article class="recall-cue"><span>画面</span><strong>${imageCount} 条视觉线索</strong><p>上传相似画面，在本机匹配过程记录。</p></article>
    <article class="recall-cue"><span>时间</span><strong>${reminderCount} 条回看线索</strong><p>在出窑或复盘时间到来时提醒查看结果。</p></article>`;
}

function personalLibrary(state, isCeramic) {
  const facts = state.confirmedRecords || [];
  const principles = state.confirmedPrinciples || [];
  return `<section class="personal-library" aria-labelledby="library-title">
    <div class="section-heading library-heading"><div><p class="eyebrow">04 / 个人实验库 · ${facts.length}</p><h2 id="library-title">从事实，长成自己的经验</h2><p>每一层都有来源。你可以沿着原则回到当时的画面、语音和记录。</p></div>${facts.length && isCeramic ? '<button class="text-button" data-action="next-project">开始下一次试片</button>' : '<span class="count-badge">' + facts.length + '</span>'}</div>
    <div class="library-map">
      <section class="library-layer facts-layer" data-library-layer="facts">
        <div class="layer-heading"><div><span class="layer-number">01</span><p class="eyebrow">事实记录</p><h3>发生过什么</h3></div><span class="layer-count">${facts.length}</span></div>
        <p class="layer-copy">由你确认后入库，保存模板字段、原始观察和媒体证据。</p>
        <div class="layer-content">${facts.length ? facts.map((record) => `<div id="record-${record.id}" class="fact-record"><p class="record-path">${escapeHtml(templateNameForRecord(state, record))} → ${escapeHtml(record.projectName)}</p>${recordCard(record, state)}</div>`).join('') : '<p class="empty-copy">确认后的事实会先进入这一层。它们仍保留原始语音、画面和模板字段。</p>'}</div>
      </section>
      <section class="library-layer principles-layer" data-library-layer="principles">
        <div class="layer-heading"><div><span class="layer-number">02</span><p class="eyebrow">创作原则</p><h3>我学到了什么</h3></div><span class="layer-count">${principles.length}</span></div>
        <p class="layer-copy">只收录你主动提炼并确认的原则，每条都能回到依据事实。</p>
        <div class="layer-content">${principles.length ? principles.map((principle) => principleCard(principle, state)).join('') : '<p class="empty-copy">确认事实后，可以生成一条意义候选。经过你的复核，原则才会进入这里。</p>'}</div>
      </section>
      <section class="library-layer recall-layer" data-library-layer="recall">
        <div class="layer-heading"><div><span class="layer-number">03</span><p class="eyebrow">找回线索</p><h3>什么时候需要它</h3></div></div>
        <p class="layer-copy">材料、画面和时间会成为入口，让旧经验在合适的时刻回来。</p>
        <div class="recall-cue-grid">${recallCueCards(state)}</div>
      </section>
    </div>
  </section>`;
}

function recallCard(recall) {
  if (!recall) return '';
  return `<aside class="recall-card" aria-live="polite"><div class="recall-icon">↗</div><div><p class="eyebrow">此刻找回</p><strong>${escapeHtml(recall.reason)}</strong><p>来自「${escapeHtml(recall.record.projectName)}」：${escapeHtml(recall.record.sourceNote)}</p><div class="recall-actions"><button data-action="open-recall">查看记录</button><button class="ghost-button" data-action="dismiss-recall">这次忽略</button></div></div></aside>`;
}

function activeReminderCard(state) {
  if (!state.activeReminder) return '';
  const record = state.confirmedRecords.find((item) => item.id === state.activeReminder.recordId);
  return `<aside class="reminder-card" aria-live="assertive"><p class="eyebrow">主动提醒 / 到时间了</p><strong>回来记录「${escapeHtml(record?.projectName || '这次实验')}」的结果</strong><p>这条提醒来自你刚刚设置的出窑回看时间。</p><button data-action="complete-reminder">知道了</button></aside>`;
}

function deviceCard(state) {
  const connected = state.device?.status === 'connected';
  const voiceAction = state.project?.captureMode === 'voice_first' ? '说完整记录' : '说观察';
  return `<article class="device-card"><div><p class="eyebrow">硬件入口</p><h3>${connected ? 'AI Keyboard 已连接' : '连接 AI Keyboard'}</h3><p>${connected ? escapeHtml(state.device.label) : `F8 短按留画面；按住 F9 ${voiceAction}，松开结束。串口可发送 MARK、VOICE_START、VOICE_STOP。`}</p></div><button data-action="connect-device">${connected ? '重新连接' : '连接设备'}</button></article>`;
}

function mediaStudio(state) {
  const media = state.currentMedia || [];
  return `<section class="media-studio"><div class="camera-stage"><video id="camera-preview" autoplay muted playsinline></video><div class="camera-placeholder"><span>◉</span><p>开启镜头后，这里显示桌面画面</p></div></div><div class="media-controls"><p class="eyebrow">过程证据 / 图片与视频</p><strong>让“这一刻”有画面可找回</strong><div class="media-actions"><button data-action="start-camera">开启镜头</button><button data-action="take-photo">拍一张</button><button data-action="record-video">录 3 秒视频</button><label class="upload-button">上传图片或视频<input id="media-upload" type="file" accept="image/*,video/*" multiple /></label></div>${media.length ? `<div class="pending-media"><span>待随“留一刻”保存 · ${media.length}</span>${mediaStrip(media)}</div>` : '<p class="media-empty">可以先上传素材；按“留一刻”时，它们会和文字一起进入过程收件箱。</p>'}</div></section>`;
}

function captureControls(state, { voiceFirst = false } = {}) {
  const voiceStatus = state.voiceCapture?.status || 'idle';
  const statusCopy = {
    idle: '按住开始录音',
    recording: '正在听你说…松开结束',
    review_ready: '语音已保存，可在收件箱复核',
    failed: '录音未完成，可手动输入',
  };
  return `<div class="moment-area ${voiceStatus === 'recording' ? 'is-recording' : ''}">
    <div><p class="eyebrow">硬件与网页共用同一组动作</p><strong>${voiceFirst ? '直接说完整记录，画面随时可补' : '短按留画面，长按说观察'}</strong><p>${voiceFirst ? '材料、动作、判断和含糊感受都可以一起说。系统随后整理候选结构，你再决定如何保存。' : '板载麦克风验证前，硬件负责触发，电脑／USB 麦克风采集声音。'}</p></div>
    <div class="moment-actions">
      <button class="moment-button" data-action="leave-moment"><span>◉</span><b>${voiceFirst ? '留一张画面' : '短按留画面'}</b><small>${voiceFirst ? '可选 · F8' : 'F8'}</small></button>
      <button class="voice-button" data-action="hold-to-talk" aria-pressed="${voiceStatus === 'recording'}"><span class="voice-wave">ııı</span><b>${voiceFirst ? '长按说完整记录' : '长按说观察'}</b><small>${statusCopy[voiceStatus] || statusCopy.idle} · F9</small></button>
    </div>
  </div>`;
}

function visualSearchPanel(state) {
  const matches = state.visualMatches || [];
  const results = matches.length
    ? matches.slice(0, 3).map((match) => `<article class="visual-result"><span>${Math.max(0, 100 - Math.round((match.distance / 64) * 100))}% 相似</span><strong>${escapeHtml(match.record.projectName)}</strong><p>${escapeHtml(match.record.sourceNote)}</p>${mediaTile(match.media)}</article>`).join('')
    : '<p class="empty-copy">确认一条带图片的记录，再上传相似图片。系统会在本机计算图像特征并排序，不上传云端。</p>';
  return `<article class="visual-panel"><div class="section-heading"><div><p class="eyebrow">05 / 视觉找回</p><h2>用一张图，找回相似过程</h2></div><label class="visual-upload">选择查询图片<input id="visual-query" type="file" accept="image/*" /></label></div><div class="visual-results">${results}</div></article>`;
}

function previewWorkbench(template) {
  const fields = template.editable
    ? template.fields.map((label, index) => `<label><span>字段 ${index + 1}</span><input data-template-field-index="${index}" value="${escapeHtml(label)}" /></label>`).join('')
    : template.fields.map((label) => `<span>${escapeHtml(label)}</span>`).join('');
  return `<div class="workbench"><div class="section-heading"><div><p class="eyebrow">02 / 模板预览</p><h2 id="workspace-title">${escapeHtml(template.name)}</h2><p>复制后可以修改字段，并用它建立自己的过程记录。</p></div><span class="project-chip">${template.editable ? '可编辑' : '模板'}</span></div><div class="preview-fields ${template.editable ? 'editable-fields' : ''}">${fields}</div><div class="template-note"><strong>${template.editable ? '字段会成为真正的工作台输入项。' : '下一步：复制后调整字段。'}</strong><p>${template.editable ? '保存字段名后，用这个模板开始记录。' : '陶艺模板承担完整主演示，其他模板可复制并投入使用。'}</p>${template.editable ? `<button data-action="start-template-project" data-template-id="${template.id}">用这个模板开始记录</button>` : ''}</div></div>`;
}

function genericWorkbench(state, template) {
  if (template.voiceFirst) {
    return `<div class="workbench voice-first-workbench">
      <div class="section-heading"><div><p class="eyebrow">02 / 自由记录</p><h2 id="workspace-title">先把想到的全部说出来</h2><p>此刻无需创建字段。口述完成后，系统会整理出可编辑的事实候选。</p></div><span class="project-chip">先说再整理</span></div>
      <div class="voice-first-prompt"><span>可以这样说</span><p>“我用了什么，刚才做了什么，看起来有什么变化，我有哪里说不清楚，下次想怎么试……”</p><button data-action="use-voice-demo">用演示口述体验</button><small>演示数据，不会请求麦克风权限</small></div>
      ${mediaStudio(state)}
      ${captureControls(state, { voiceFirst: true })}
    </div>`;
  }
  const values = state.project.templateValues || {};
  const fields = Object.entries(values).filter(([label]) => label !== '观察').map(([label, value]) => `<label class="field"><span>${escapeHtml(label)}</span><input data-template-value="${escapeHtml(label)}" value="${escapeHtml(value)}" /></label>`).join('');
  return `<div class="workbench">
    <div class="section-heading"><div><p class="eyebrow">02 / 当前工作台</p><h2 id="workspace-title">${escapeHtml(state.project.name)}</h2><p>${escapeHtml(template.name)} · ${escapeHtml(state.project.stage)}</p></div><span class="project-chip">进行中</span></div>
    <div class="field-grid">${fields}</div>
    <label class="field note-field"><span>这一刻的观察</span><textarea data-field="observation" placeholder="长按硬件说出观察，也可以在这里修改转写。">${escapeHtml(state.project.fields.observation)}</textarea></label>
    ${mediaStudio(state)}
    ${captureControls(state)}
  </div>`;
}

export function renderApp(state) {
  const activeTemplate = state.templates.find((template) => template.id === state.activeTemplateId);
  const currentTemplateName = activeTemplate?.name || '创作模板';
  const confirmedCount = state.confirmedRecords.length;
  const isCeramic = activeTemplate?.id === 'tpl_ceramic_glaze_v1';
  const isVoiceFirst = Boolean(activeTemplate?.voiceFirst);
  const hasActiveProject = state.project?.templateId === activeTemplate?.id;

  return `
    <main class="app-shell">
      <header class="topbar">
        <a class="wordmark" href="#top" aria-label="絮手首页"><span>絮</span>手 <i>Whisper Hands</i></a>
        <div class="topbar-actions"><div class="session-note"><span class="status-dot"></span> 已在本机保存</div><button class="export-button" data-action="export-records">导出确认记录</button></div>
      </header>

      <section class="intro" id="top">
        <div><p class="eyebrow">创作过程知识库 / 本地 Demo</p><h1>把手边发生的，<br /><em>留成下一次的经验。</em></h1><p class="intro-copy">在变化发生时按一下。先留下证据，再决定它是否成为你的实践。</p></div>
        <div class="signal-object" aria-hidden="true"><span class="signal-ring ring-one"></span><span class="signal-ring ring-two"></span><span class="signal-ring ring-three"></span><span class="signal-core">留<br />一刻</span></div>
      </section>

      <section class="template-section" aria-labelledby="template-title">
        <div class="section-heading"><div><p class="eyebrow">01 / 选择路径</p><h2 id="template-title">今天怎么开始？</h2><p>可以借用专业结构，也可以先说再整理。</p></div><button class="text-button" data-action="fork-template">复制当前模板并配置字段</button></div>
        <div class="template-grid"><button class="template-card voice-first-card" data-action="start-voice-first"><span class="template-type">自由入口</span><strong>直接开始说</strong><span>无需先填字段 · 口述后自动整理候选结构</span><em>材料、动作、感受都可以混在一起</em></button>${state.templates.filter((template) => !template.voiceFirst).map((template) => templateCard(template, state.activeTemplateId)).join('')}</div>
      </section>

      <section class="workspace" aria-labelledby="workspace-title">
        ${isCeramic ? `<div class="workbench">
          <div class="section-heading"><div><p class="eyebrow">02 / 当前工作台</p><h2 id="workspace-title">${escapeHtml(state.project.name)}</h2><p>${escapeHtml(currentTemplateName)} · ${escapeHtml(state.project.stage)}</p></div><span class="project-chip">进行中</span></div>
          <div class="field-grid">
            ${field('泥料', state.project.fields.clay, 'clay')}
      ${field('釉料', state.project.fields.glaze, 'glaze', `<select data-field="glaze"><option value="" ${state.project.fields.glaze === '' ? 'selected' : ''}>请选择釉料</option><option ${state.project.fields.glaze === '深海蓝透明釉' ? 'selected' : ''}>深海蓝透明釉</option><option ${state.project.fields.glaze === '海军蓝亮釉' ? 'selected' : ''}>海军蓝亮釉</option><option>月白透明釉</option></select>`)}
            ${field('施釉方式', state.project.fields.method, 'method')}
            ${field('层数', state.project.fields.coats, 'coats')}
          </div>
          <label class="field note-field transcript-review"><span>这一刻的观察 / 语音转写</span><textarea data-field="observation" placeholder="长按硬件说：第三层釉料在杯沿堆积，下次先试两层。">${escapeHtml(state.project.fields.observation)}</textarea><small>语音完成后自动填入；这里用于复核和修改。</small></label>
          ${mediaStudio(state)}
          ${captureControls(state)}
        </div>` : (hasActiveProject ? genericWorkbench(state, activeTemplate) : previewWorkbench(activeTemplate))}
        <aside class="side-stack">
          ${activeReminderCard(state)}
          ${recallCard(state.recall)}
          ${deviceCard(state)}
          ${isCeramic ? '<article class="reference-card"><p class="eyebrow">参考架 / 陶艺</p><h3>记录釉料开发</h3><p>试片编号、变量对照与结果能帮助你比较下一次实验。</p><a href="https://ceramicartsnetwork.org/pottery-making-illustrated/pottery-making-illustrated-article/Recording-Glaze-Development" target="_blank" rel="noreferrer">查看来源 ↗</a></article>' : (isVoiceFirst ? '<article class="reference-card"><p class="eyebrow">自由记录提示</p><h3>字段可以稍后决定</h3><p>先把现场语言完整留下。系统整理出的字段只是候选，你可以修改、放弃或保存为模板。</p></article>' : '<article class="reference-card"><p class="eyebrow">模板提示</p><h3>从官方模板开始</h3><p>复制模板后，可以按自己的材料和流程调整字段、阶段与回顾条件。</p></article>')}
        </aside>
      </section>

      <section class="archive-grid">
        <article class="archive-panel inbox-panel"><div class="section-heading"><div><p class="eyebrow">03 / 过程收件箱</p><h2>先留下，稍后整理</h2></div><span class="count-badge">${state.inbox.length}</span></div><div class="panel-list">${state.inbox.length ? state.inbox.map(inboxCard).join('') : '<p class="empty-copy">还没有过程记录。按一次“留一刻”，把此刻放进收件箱。</p>'}</div></article>
        ${personalLibrary(state, isCeramic)}
        ${visualSearchPanel(state)}
      </section>

      <footer>絮手 Demo · 事实由你确认后入库，意义由你主动提炼并确认。</footer>
    </main>`;
}
