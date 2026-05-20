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

  const DB_NAME = 'peps-var-replay-studio-db';
  const DB_STORE = 'clips';
  const DB_KEY = 'highlight-active-clip';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function putClip(file, meta = {}) {
    if (!file) return null;
    const row = {
      id: DB_KEY,
      blob: file,
      name: meta.name || file.name || 'highlight-video',
      type: meta.type || file.type || 'video/mp4',
      updatedAt: Date.now(),
      transition: meta.transition || 'fade',
      transitionDuration: Number(meta.transitionDuration) || 1,
      playing: !!meta.playing,
      speed: Number(meta.speed) || 1
    };
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(row);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return row;
  }

  async function getClip() {
    const db = await openDB();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(DB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return row;
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

  async function loadCurrent({ autoplay = state.playing } = {}) {
    if (!els.video || state.currentIndex < 0 || !state.clips[state.currentIndex]) return;
    const clip = state.clips[state.currentIndex];
    clearObjectUrl();
    objectUrl = URL.createObjectURL(clip.file);
    els.video.pause();
    els.video.src = objectUrl;
    els.video.load();
    els.video.playbackRate = state.speed;
    try {
      await putClip(clip.file, {
        name: clip.name,
        type: clip.type,
        transition: state.transition,
        transitionDuration: state.transitionDuration,
        playing: autoplay,
        speed: state.speed
      });
    } catch (err) {
      console.warn('putClip failed', err);
    }
    post('highlight:clip', {
      clip: { name: clip.name, type: clip.type },
      speed: state.speed,
      playing: autoplay,
      transition: state.transition,
      transitionDuration: state.transitionDuration,
      version: Date.now()
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
    setupKeyboard();
  }

  function setupKeyboard() {
    document.addEventListener('keydown', (event) => {
      if (!isControl) return;
      if (document.body.dataset.replayMode !== 'highlight') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        state.playing ? pause() : play();
      }
      if (event.key.toLowerCase() === 'r') restart();
      if (event.key === 'ArrowLeft') prev();
      if (event.key === 'ArrowRight') next();
      if (event.key === '[') setSpeed(state.speed - 0.05);
      if (event.key === ']') setSpeed(state.speed + 0.05);
    });
  }

  function setScreenStatus(text) { if (els.screenStatus) els.screenStatus.textContent = text; }

  let overlay = null;
  let currentAnimations = [];
  let pending = null;
  let pendingTimer = null;

  function initScreenTransitionOverlay() {
    if (!isHighlightScreen || !els.videoWrapper) return;
    if ($('.highlight-transition-overlay')) {
      overlay = $('.highlight-transition-overlay');
      return;
    }
    overlay = document.createElement('div');
    overlay.className = 'highlight-transition-overlay';
    els.videoWrapper.appendChild(overlay);
  }

  function stopAnimations() {
    currentAnimations.forEach((animation) => {
      try { animation.cancel(); } catch {}
    });
    currentAnimations = [];
    if (overlay) {
      overlay.className = 'highlight-transition-overlay';
      overlay.style.opacity = '0';
      overlay.style.transform = 'none';
    }
    const video = els.screenVideo;
    if (video) {
      video.style.opacity = '1';
      video.style.transform = 'translate3d(0,0,0) scale(1)';
      video.style.filter = 'none';
    }
  }

  function animate(target, frames, options) {
    const animation = target.animate(frames, options);
    currentAnimations.push(animation);
    animation.addEventListener('finish', () => {
      currentAnimations = currentAnimations.filter((item) => item !== animation);
      target.style.opacity = '';
      target.style.transform = '';
      target.style.filter = '';
    });
    return animation;
  }

  function runTransition(type = 'fade', seconds = 1) {
    const duration = Math.round(clamp(Number(seconds) || 1, 0.5, 5) * 1000);
    stopAnimations();

    const common = { duration, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' };
    const video = els.screenVideo;
    if (!overlay || !video) return;

    if (type === 'slide-left') {
      overlay.classList.add('wipe');
      animate(overlay, [
        { opacity: .95, transform: 'translateX(-110%)' },
        { opacity: .78, offset: .46, transform: 'translateX(0%)' },
        { opacity: 0, transform: 'translateX(110%)' }
      ], common);
      animate(video, [
        { opacity: 0, transform: 'translateX(12%) scale(1.02)' },
        { opacity: 1, transform: 'translateX(0%) scale(1)' }
      ], common);
      return;
    }

    if (type === 'slide-right') {
      overlay.classList.add('wipe');
      animate(overlay, [
        { opacity: .95, transform: 'translateX(110%)' },
        { opacity: .78, offset: .46, transform: 'translateX(0%)' },
        { opacity: 0, transform: 'translateX(-110%)' }
      ], common);
      animate(video, [
        { opacity: 0, transform: 'translateX(-12%) scale(1.02)' },
        { opacity: 1, transform: 'translateX(0%) scale(1)' }
      ], common);
      return;
    }

    if (type === 'zoom-pop') {
      animate(overlay, [
        { opacity: .82, background: '#000' },
        { opacity: 0, background: '#000' }
      ], { duration: Math.min(duration, 1000), easing: 'ease-out', fill: 'both' });
      animate(video, [
        { opacity: 0, transform: 'scale(.76)', filter: 'contrast(1.28) saturate(1.25)' },
        { opacity: 1, transform: 'scale(1.04)', offset: .72, filter: 'contrast(1.08) saturate(1.08)' },
        { opacity: 1, transform: 'scale(1)', filter: 'none' }
      ], common);
      return;
    }

    if (type === 'flash-cut') {
      overlay.classList.add('flash');
      animate(overlay, [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: .6, offset: .20, transform: 'scale(1.05)' },
        { opacity: 0, transform: 'scale(1.24)' }
      ], { duration: Math.min(duration, 1300), easing: 'ease-out', fill: 'both' });
      animate(video, [
        { opacity: .18, filter: 'brightness(2.35) contrast(1.25)', transform: 'scale(1.026)' },
        { opacity: 1, filter: 'brightness(1) contrast(1)', transform: 'scale(1)' }
      ], common);
      return;
    }

    if (type === 'blur-sweep') {
      overlay.classList.add('blur');
      animate(overlay, [
        { opacity: 0, transform: 'translateX(-120%) skewX(-12deg)' },
        { opacity: .94, offset: .45, transform: 'translateX(0%) skewX(-12deg)' },
        { opacity: 0, transform: 'translateX(120%) skewX(-12deg)' }
      ], common);
      animate(video, [
        { opacity: 0, filter: 'blur(26px) brightness(1.35)', transform: 'scale(1.08)' },
        { opacity: 1, filter: 'blur(0px) brightness(1)', transform: 'scale(1)' }
      ], common);
      return;
    }

    animate(overlay, [
      { opacity: .9, background: '#000' },
      { opacity: 0, background: '#000' }
    ], common);
    animate(video, [
      { opacity: 0, transform: 'scale(1.01)', filter: 'brightness(.68)' },
      { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' }
    ], common);
  }

  function prepareTransition(payload = {}) {
    const video = els.screenVideo;
    if (!video) return;
    pending = {
      type: payload.transition || 'fade',
      duration: clamp(Number(payload.transitionDuration) || 1, 0.5, 5),
      started: false
    };

    stopAnimations();
    video.style.opacity = '0';
    video.style.filter = 'brightness(.55)';
    if (overlay) {
      overlay.style.opacity = '.88';
      overlay.style.background = '#000';
    }

    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => startPendingTransition(), 900);
  }

  function startPendingTransition() {
    if (!pending || pending.started) return;
    pending.started = true;
    const data = pending;
    pending = null;
    if (pendingTimer) clearTimeout(pendingTimer);
    requestAnimationFrame(() => runTransition(data.type, data.duration));
  }

  async function loadScreenClipFromDB(payload = {}) {
    if (!isHighlightScreen || !els.screenVideo) return;
    try {
      const row = await getClip();
      if (!row?.blob) return;

      if (screenObjectUrl) URL.revokeObjectURL(screenObjectUrl);
      screenObjectUrl = URL.createObjectURL(row.blob);

      state.transition = payload.transition || row.transition || state.transition;
      state.transitionDuration = clamp(Number(payload.transitionDuration || row.transitionDuration) || state.transitionDuration, 0.5, 5);

      prepareTransition(payload);

      els.screenVideo.pause();
      els.screenVideo.src = screenObjectUrl;
      els.screenVideo.load();
      els.screenVideo.playbackRate = Number(payload.speed || row.speed) || 1;
      setScreenStatus(`Highlight: ${row.name || 'clip'}`);

      const reveal = () => {
        startPendingTransition();
        const shouldPlay = payload.playing ?? row.playing;
        if (shouldPlay) {
          els.screenVideo.play().catch(() => setScreenStatus('Click Highlight Source once to allow playback'));
        }
      };

      els.screenVideo.addEventListener('loadeddata', reveal, { once: true });
      setTimeout(() => {
        if (els.screenVideo.readyState >= 2) {
          startPendingTransition();
        }
      }, 300);
    } catch (err) {
      console.warn('loadScreenClipFromDB failed', err);
      setScreenStatus('Failed to load clip from database');
    }
  }

  function setupScreen() {
    if (!isHighlightScreen || !bc) return;
    initScreenTransitionOverlay();
    setScreenStatus('Highlight Source Ready');

    if (els.screenVideo) {
      els.screenVideo.addEventListener('loadstart', () => {
        if (pending && els.screenVideo) {
          els.screenVideo.style.opacity = '0';
          if (overlay) {
            overlay.style.opacity = '.88';
            overlay.style.background = '#000';
          }
        }
      });
      els.screenVideo.addEventListener('loadeddata', () => {
        startPendingTransition();
      });
    }

    bc.addEventListener('message', async (event) => {
      const msg = event.data || {};
      if (!msg.type || msg.source === 'highlight-screen') return;
      const payload = msg.payload || {};
      if (msg.type === 'highlight:transition') {
        state.transition = payload.transition || state.transition;
        state.transitionDuration = clamp(Number(payload.transitionDuration) || state.transitionDuration, 0.5, 5);
      }
      if (msg.type === 'highlight:clip') {
        state.speed = Number(payload.speed) || state.speed;
        await loadScreenClipFromDB(payload);
      }
      if (msg.type === 'highlight:play') {
        state.speed = Number(payload.speed) || state.speed;
        if (els.screenVideo) {
          els.screenVideo.playbackRate = state.speed;
          els.screenVideo.play().catch(() => setScreenStatus('Click Highlight Source once to allow playback'));
        }
      }
      if (msg.type === 'highlight:pause') {
        els.screenVideo?.pause();
      }
      if (msg.type === 'highlight:restart' && els.screenVideo) {
        state.transition = payload.transition || state.transition;
        state.transitionDuration = clamp(Number(payload.transitionDuration) || state.transitionDuration, 0.5, 5);
        prepareTransition(payload);
        els.screenVideo.currentTime = 0;
        els.screenVideo.playbackRate = Number(payload.speed) || state.speed;
        startPendingTransition();
        els.screenVideo.play().catch(() => {});
      }
      if (msg.type === 'highlight:speed') {
        state.speed = Number(payload.speed) || 1;
        if (els.screenVideo) els.screenVideo.playbackRate = state.speed;
      }
      if (msg.type === 'highlight:clear') {
        els.screenVideo?.pause();
        els.screenVideo?.removeAttribute('src');
        setScreenStatus('Highlight cleared');
      }
    });
  }

  setupControl();
  setupScreen();
  render();
})();
