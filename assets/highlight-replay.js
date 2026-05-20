(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  const pageMode = params.get('mode') || 'control';
  const isHighlightScreen = pageMode === 'highlight-screen';
  const isVarScreen = pageMode === 'screen';
  const isControl = !isHighlightScreen && !isVarScreen;
  const CHANNEL = 'peps-var-replay-studio-v1-1';
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;

  const TRANSITIONS = [
    ['fade', 'Fade'],
    ['slide-left', 'Slide L'],
    ['slide-right', 'Slide R'],
    ['zoom-pop', 'Zoom Pop'],
    ['flash-cut', 'Flash'],
    ['blur-sweep', 'Blur']
  ];

  if (isHighlightScreen) {
    document.body.classList.remove('is-control');
    document.body.classList.add('is-screen', 'is-highlight-screen');
    document.body.dataset.replayMode = 'highlight-source';
  }

  const state = {
    mode: 'var',
    clips: [],
    currentIndex: -1,
    orderMode: 'sequential',
    loop: true,
    speed: 1,
    playing: false,
    shuffleBag: [],
    transition: 'fade',
    transitionDuration: 1
  };

  let objectUrl = null;
  let screenObjectUrl = null;
  let transitionTimer = null;

  const els = {
    tabVar: $('#tabVarReplay'),
    tabHighlight: $('#tabHighlightReplay'),
    fileInput: $('#highlightFileInput'),
    dropZone: $('#highlightDropZone'),
    video: $('#highlightVideo'),
    screenVideo: $('#mainVideo'),
    screenStatus: $('#screenStatus'),
    videoWrapper: $('#videoWrapper'),
    play: $('#highlightPlay'),
    pause: $('#highlightPause'),
    restart: $('#highlightRestart'),
    prev: $('#highlightPrev'),
    next: $('#highlightNext'),
    clear: $('#highlightClear'),
    sequential: $('#highlightSequential'),
    random: $('#highlightRandom'),
    loopInput: $('#highlightLoop'),
    speedRange: $('#highlightSpeedRange'),
    speedLabel: $('#highlightSpeedLabel'),
    playlist: $('#highlightPlaylist'),
    now: $('#highlightNowPlaying'),
    count: $('#highlightClipCount'),
    nextName: $('#highlightNextClip')
  };

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function niceRate(value) {
    const n = Number(value) || 1;
    return n >= 1 ? `${n.toFixed(1)}x` : `${n.toFixed(2)}x`;
  }
  function niceSeconds(value) {
    return `${(Number(value) || 1).toFixed(1)}s`;
  }
  function escapeHtml(text) {
    return String(text).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }
  function post(type, payload = {}) {
    if (!bc) return;
    bc.postMessage({ type, payload, source: isHighlightScreen ? 'highlight-screen' : 'highlight-control', at: Date.now() });
  }
  function highlightSourceUrl() {
    const url = new URL(location.href);
    url.pathname = url.pathname.replace(/VAR_Replay_V1\.0\.html$/i, 'index.html');
    url.searchParams.set('mode', 'highlight-screen');
    return url.toString();
  }

  function injectSourceLink() {
    if (!isControl || $('#linkInputHighlight')) return;
    const modal = $('#modalLinks .modal');
    if (!modal) return;
    const block = document.createElement('div');
    block.className = 'highlight-source-link-block';
    block.innerHTML = `
      <hr />
      <p>Highlight Source Link สำหรับ OBS Browser Source แยกจาก VAR</p>
      <div class="copy-group">
        <input id="linkInputHighlight" class="copy-input" type="text" readonly value="${highlightSourceUrl()}" />
        <button id="btnCopyHighlight" type="button">Copy</button>
      </div>
      <div class="highlight-source-note">ใช้ลิงก์นี้กับ Source ไฮไลท์เท่านั้น ไม่ชนกับ VAR Source</div>
    `;
    modal.appendChild(block);
    $('#btnCopyHighlight')?.addEventListener('click', async () => {
      const input = $('#linkInputHighlight');
      const value = input?.value || highlightSourceUrl();
      try { await navigator.clipboard.writeText(value); }
      catch { input?.focus(); input?.select(); document.execCommand('copy'); }
      const msg = $('#copyMsg');
      if (msg) { msg.textContent = 'Copied Highlight Source!'; msg.classList.add('show'); setTimeout(() => msg.classList.remove('show'), 1500); }
    });
  }

  function injectTransitionUI() {
    if (!isControl || $('#highlightTransitionGrid')) return;
    const speedCard = $('#highlightSpeedRange')?.closest('.highlight-card');
    if (!speedCard) return;
    const card = document.createElement('section');
    card.className = 'highlight-card';
    card.innerHTML = `
      <div class="highlight-transition-title">
        <span>TRANSITION</span>
        <strong id="highlightTransitionLabel">Fade</strong>
      </div>
      <div id="highlightTransitionGrid" class="highlight-transition-grid">
        ${TRANSITIONS.map(([id, label]) => `<button type="button" data-highlight-transition="${id}" class="${id === state.transition ? 'active' : ''}">${label}</button>`).join('')}
      </div>
      <div class="highlight-transition-duration-head" style="margin-top:10px">
        <span>DURATION</span>
        <strong id="highlightTransitionDurationLabel">1.0s</strong>
      </div>
      <input id="highlightTransitionDurationRange" type="range" min="0.5" max="5" step="0.1" value="1" />
    `;
    speedCard.insertAdjacentElement('afterend', card);
    card.addEventListener('click', (event) => {
      const button = event.target.closest('[data-highlight-transition]');
      if (!button) return;
      state.transition = button.dataset.highlightTransition || 'fade';
      post('highlight:transition', { transition: state.transition, transitionDuration: state.transitionDuration });
      render();
    });
    $('#highlightTransitionDurationRange')?.addEventListener('input', (event) => {
      state.transitionDuration = clamp(Number(event.target.value) || 1, 0.5, 5);
      post('highlight:transition', { transition: state.transition, transitionDuration: state.transitionDuration });
      render();
    });
  }

  function setMode(mode) {
    if (!isControl) return;
    state.mode = mode === 'highlight' ? 'highlight' : 'var';
    document.body.dataset.replayMode = state.mode;
    post('highlight:mode', { mode: state.mode });
    render();
  }

  function makeClip(file) {
    return { id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID?.() || Math.random()}`, name: file.name || 'highlight-video', type: file.type || 'video/mp4', file };
  }
  function clearObjectUrl() { if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null; }

  function loadCurrent({ autoplay = state.playing } = {}) {
    if (!els.video || state.currentIndex < 0 || !state.clips[state.currentIndex]) return;
    const clip = state.clips[state.currentIndex];
    clearObjectUrl();
    objectUrl = URL.createObjectURL(clip.file);
    els.video.pause();
    els.video.src = objectUrl;
    els.video.load();
    els.video.playbackRate = state.speed;
    post('highlight:clip', {
      clip: { name: clip.name, type: clip.type, file: clip.file },
      speed: state.speed,
      playing: autoplay,
      transition: state.transition,
      transitionDuration: state.transitionDuration
    });
    render();
    if (autoplay) play();
  }

  function buildShuffleBag() {
    state.shuffleBag = state.clips.map((_, i) => i).filter((i) => i !== state.currentIndex);
    for (let i = state.shuffleBag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.shuffleBag[i], state.shuffleBag[j]] = [state.shuffleBag[j], state.shuffleBag[i]];
    }
  }
  function getNextIndex() {
    if (!state.clips.length) return -1;
    if (state.orderMode === 'random') { if (!state.shuffleBag.length) buildShuffleBag(); return state.shuffleBag.shift() ?? state.currentIndex; }
    const next = state.currentIndex + 1;
    return next < state.clips.length ? next : (state.loop ? 0 : -1);
  }
  function getPrevIndex() {
    if (!state.clips.length) return -1;
    if (state.orderMode === 'random') return Math.floor(Math.random() * state.clips.length);
    const prev = state.currentIndex - 1;
    return prev >= 0 ? prev : (state.loop ? state.clips.length - 1 : -1);
  }

  async function play() {
    if (!els.video || state.currentIndex < 0) return;
    state.playing = true;
    els.video.playbackRate = state.speed;
    try { await els.video.play(); post('highlight:play', { speed: state.speed }); }
    catch (err) { state.playing = false; console.warn(err); }
    render();
  }
  function pause() { state.playing = false; els.video?.pause(); post('highlight:pause'); render(); }
  function restart() {
    if (!els.video || state.currentIndex < 0) return;
    els.video.currentTime = 0;
    post('highlight:restart', { speed: state.speed, transition: state.transition, transitionDuration: state.transitionDuration });
    if (state.playing) play();
  }
  function goToIndex(index, autoplay = state.playing) { if (index < 0 || index >= state.clips.length) { pause(); return; } state.currentIndex = index; loadCurrent({ autoplay }); }
  function next() { goToIndex(getNextIndex(), state.playing); }
  function prev() { goToIndex(getPrevIndex(), state.playing); }
  function setSpeed(speed) { state.speed = clamp(Number(speed) || 1, 0.25, 2); if (els.video) els.video.playbackRate = state.speed; post('highlight:speed', { speed: state.speed }); render(); }
  function setOrder(mode) { state.orderMode = mode === 'random' ? 'random' : 'sequential'; state.shuffleBag = []; render(); }
  function addFiles(fileList) { const files = Array.from(fileList || []).filter((f) => f.type.startsWith('video/')); if (!files.length) return; const empty = !state.clips.length; state.clips.push(...files.map(makeClip)); if (empty) { state.currentIndex = 0; loadCurrent({ autoplay: false }); } render(); }
  function clearPlaylist() { pause(); clearObjectUrl(); state.clips = []; state.currentIndex = -1; state.shuffleBag = []; if (els.video) els.video.removeAttribute('src'); post('highlight:clear'); render(); }
  function removeClip(index) { const wasCurrent = index === state.currentIndex; state.clips.splice(index, 1); if (!state.clips.length) return clearPlaylist(); if (state.currentIndex >= state.clips.length) state.currentIndex = 0; if (wasCurrent) loadCurrent({ autoplay: state.playing }); render(); }

  function nextClipName() {
    if (!state.clips.length || state.currentIndex < 0) return '-';
    if (state.orderMode === 'random') return 'สุ่มคลิปถัดไป';
    const nextIndex = state.currentIndex + 1 < state.clips.length ? state.currentIndex + 1 : (state.loop ? 0 : -1);
    return nextIndex >= 0 ? state.clips[nextIndex].name : '-';
  }
  function renderPlaylist() {
    if (!els.playlist) return;
    if (!state.clips.length) { els.playlist.innerHTML = '<div class="highlight-empty">ยังไม่มี Playlist — ลากคลิปหลายไฟล์เข้ามาได้เลย</div>'; return; }
    els.playlist.innerHTML = state.clips.map((clip, i) => `
      <div class="highlight-playlist-item ${i === state.currentIndex ? 'active' : ''}">
        <span class="index">${i + 1}</span>
        <button class="name" type="button" data-pick-index="${i}" title="${escapeHtml(clip.name)}">${escapeHtml(clip.name)}</button>
        <button class="remove" type="button" data-remove-index="${i}">×</button>
      </div>`).join('');
  }
  function render() {
    if (!isControl) return;
    els.tabVar?.classList.toggle('active', state.mode === 'var');
    els.tabHighlight?.classList.toggle('active', state.mode === 'highlight');
    if (els.now) els.now.textContent = state.currentIndex >= 0 && state.clips[state.currentIndex] ? state.clips[state.currentIndex].name : 'ยังไม่มีคลิป';
    if (els.count) els.count.textContent = String(state.clips.length);
    if (els.nextName) els.nextName.textContent = nextClipName();
    if (els.speedLabel) els.speedLabel.textContent = niceRate(state.speed);
    if (els.speedRange) els.speedRange.value = String(state.speed);
    els.sequential?.classList.toggle('active', state.orderMode === 'sequential');
    els.random?.classList.toggle('active', state.orderMode === 'random');
    if (els.loopInput) els.loopInput.checked = state.loop;
    document.querySelectorAll('[data-highlight-speed]').forEach((b) => b.classList.toggle('active', Math.abs(Number(b.dataset.highlightSpeed) - state.speed) < 0.001));
    document.querySelectorAll('[data-highlight-transition]').forEach((b) => b.classList.toggle('active', b.dataset.highlightTransition === state.transition));
    const label = $('#highlightTransitionLabel');
    if (label) label.textContent = TRANSITIONS.find(([id]) => id === state.transition)?.[1] || 'Fade';
    const durationRange = $('#highlightTransitionDurationRange');
    const durationLabel = $('#highlightTransitionDurationLabel');
    if (durationRange) durationRange.value = String(state.transitionDuration);
    if (durationLabel) durationLabel.textContent = niceSeconds(state.transitionDuration);
    const link = $('#linkInputHighlight');
    if (link) link.value = highlightSourceUrl();
    renderPlaylist();
  }

  function setupControl() {
    if (!isControl) return;
    injectSourceLink();
    injectTransitionUI();
    els.tabVar?.addEventListener('click', () => setMode('var'));
    els.tabHighlight?.addEventListener('click', () => setMode('highlight'));
    els.dropZone?.addEventListener('click', () => els.fileInput?.click());
    els.dropZone?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') els.fileInput?.click(); });
    els.fileInput?.addEventListener('change', (e) => addFiles(e.target.files));
    ['dragenter', 'dragover'].forEach((name) => els.dropZone?.addEventListener(name, (e) => { e.preventDefault(); els.dropZone.classList.add('drag-over'); }));
    ['dragleave', 'drop'].forEach((name) => els.dropZone?.addEventListener(name, (e) => { e.preventDefault(); els.dropZone.classList.remove('drag-over'); }));
    els.dropZone?.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
    els.play?.addEventListener('click', play); els.pause?.addEventListener('click', pause); els.restart?.addEventListener('click', restart); els.next?.addEventListener('click', next); els.prev?.addEventListener('click', prev); els.clear?.addEventListener('click', clearPlaylist);
    els.sequential?.addEventListener('click', () => setOrder('sequential')); els.random?.addEventListener('click', () => setOrder('random'));
    els.loopInput?.addEventListener('change', () => { state.loop = els.loopInput.checked; render(); });
    els.speedRange?.addEventListener('input', () => setSpeed(els.speedRange.value));
    document.querySelectorAll('[data-highlight-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(b.dataset.highlightSpeed)));
    els.playlist?.addEventListener('click', (e) => { const pick = e.target.closest('[data-pick-index]'); const remove = e.target.closest('[data-remove-index]'); if (pick) goToIndex(Number(pick.dataset.pickIndex), state.playing); if (remove) removeClip(Number(remove.dataset.removeIndex)); });
    els.video?.addEventListener('ended', () => { const i = getNextIndex(); if (i >= 0) goToIndex(i, true); else pause(); });
  }

  function setScreenStatus(text) { if (els.screenStatus) els.screenStatus.textContent = text; }
  function clearTransitionClasses(video) { video.classList.remove('highlight-transition', 'ht-fade-in', 'ht-fade-out', 'ht-slide-left-in', 'ht-slide-right-in', 'ht-zoom-pop-in', 'ht-flash-cut-in', 'ht-blur-sweep-in', 'ht-glitch-in'); }
  function transitionClass(type) {
    return ({ 'fade': 'ht-fade-in', 'slide-left': 'ht-slide-left-in', 'slide-right': 'ht-slide-right-in', 'zoom-pop': 'ht-zoom-pop-in', 'flash-cut': 'ht-flash-cut-in', 'blur-sweep': 'ht-blur-sweep-in', 'glitch': 'ht-glitch-in' })[type] || 'ht-fade-in';
  }
  function armTransition(type, duration) {
    const video = els.screenVideo;
    if (!video) return;
    if (transitionTimer) clearTimeout(transitionTimer);
    const safeDuration = clamp(Number(duration) || 1, 0.5, 5);
    clearTransitionClasses(video);
    video.style.setProperty('--highlight-transition-duration', `${safeDuration}s`);
    video.classList.add('highlight-transition', transitionClass(type));
    // force style flush so the starting state is applied before reveal
    void video.offsetWidth;
  }
  function revealTransition(type, duration) {
    const video = els.screenVideo;
    if (!video) return;
    const safeDuration = clamp(Number(duration) || 1, 0.5, 5);
    requestAnimationFrame(() => {
      video.classList.remove(transitionClass(type));
      transitionTimer = setTimeout(() => {
        video.classList.remove('highlight-transition');
      }, Math.ceil(safeDuration * 1000) + 120);
    });
  }
  function loadScreenClip(file, meta = {}, autoplay = false, transition = 'fade', transitionDuration = 1) {
    if (!isHighlightScreen || !els.screenVideo || !file) return;
    if (screenObjectUrl) URL.revokeObjectURL(screenObjectUrl);
    screenObjectUrl = URL.createObjectURL(file);
    state.transition = transition || state.transition;
    state.transitionDuration = clamp(Number(transitionDuration) || state.transitionDuration, 0.5, 5);
    armTransition(state.transition, state.transitionDuration);
    els.screenVideo.pause();
    els.screenVideo.src = screenObjectUrl;
    els.screenVideo.load();
    els.screenVideo.playbackRate = state.speed;
    setScreenStatus(`Highlight: ${meta.name || file.name || 'clip'}`);
    const reveal = () => {
      revealTransition(state.transition, state.transitionDuration);
      if (autoplay) els.screenVideo.play().catch(() => setScreenStatus('Click Highlight Source once to allow playback'));
    };
    els.screenVideo.addEventListener('loadeddata', reveal, { once: true });
    setTimeout(() => {
      if (els.screenVideo.readyState >= 2) revealTransition(state.transition, state.transitionDuration);
    }, 300);
  }
  function setupScreen() {
    if (!isHighlightScreen || !bc) return;
    setScreenStatus('Highlight Source Ready');
    bc.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (!msg.type || msg.source === 'highlight-screen') return;
      const payload = msg.payload || {};
      if (msg.type === 'highlight:transition') {
        state.transition = payload.transition || state.transition;
        state.transitionDuration = clamp(Number(payload.transitionDuration) || state.transitionDuration, 0.5, 5);
      }
      if (msg.type === 'highlight:clip' && payload.clip?.file) {
        state.speed = Number(payload.speed) || state.speed;
        loadScreenClip(payload.clip.file, payload.clip, !!payload.playing, payload.transition || state.transition, payload.transitionDuration || state.transitionDuration);
      }
      if (msg.type === 'highlight:play') {
        state.speed = Number(payload.speed) || state.speed;
        if (els.screenVideo) { els.screenVideo.playbackRate = state.speed; els.screenVideo.play().catch(() => setScreenStatus('Click Highlight Source once to allow playback')); }
      }
      if (msg.type === 'highlight:pause') els.screenVideo?.pause();
      if (msg.type === 'highlight:restart' && els.screenVideo) {
        state.transition = payload.transition || state.transition;
        state.transitionDuration = clamp(Number(payload.transitionDuration) || state.transitionDuration, 0.5, 5);
        armTransition(state.transition, state.transitionDuration);
        els.screenVideo.currentTime = 0;
        els.screenVideo.playbackRate = Number(payload.speed) || state.speed;
        revealTransition(state.transition, state.transitionDuration);
        els.screenVideo.play().catch(() => {});
      }
      if (msg.type === 'highlight:speed') { state.speed = Number(payload.speed) || 1; if (els.screenVideo) els.screenVideo.playbackRate = state.speed; }
      if (msg.type === 'highlight:clear') { els.screenVideo?.pause(); els.screenVideo?.removeAttribute('src'); setScreenStatus('Highlight cleared'); }
    });
  }

  setupControl();
  setupScreen();
  render();
})();
