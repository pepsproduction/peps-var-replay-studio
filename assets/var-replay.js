(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') === 'screen' ? 'screen' : 'control';

  const CHANNEL = 'peps-var-replay-studio-v1-1';
  const DB_NAME = 'peps-var-replay-studio-db';
  const DB_STORE = 'clips';
  const CLIP_ID = 'active-clip';
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;

  const els = {
    fileInput: $('#fileInput'),
    dropZone: $('#dropZone'),
    dropText: $('#dropText'),
    loopStatus: $('#loopStatus'),
    timelineBox: $('#timelineBox'),
    clickLayer: $('#clickLayer'),
    trackFill: $('#trackFill'),
    trackWindow: $('#trackWindow'),
    trackLoop: $('#trackLoop'),
    markA: $('#markA'),
    markB: $('#markB'),
    currTime: $('#currTime'),
    totalTime: $('#totalTime'),
    navBox: $('#navBox'),
    navPlayhead: $('#navPlayhead'),
    navWindow: $('#navWindow'),
    navHandleLeft: $('#navHandleLeft'),
    navHandleRight: $('#navHandleRight'),
    btnPlay: $('#btnPlay'),
    btnPause: $('#btnPause'),
    btnSetA: $('#btnSetA'),
    btnSetB: $('#btnSetB'),
    btnClearLoop: $('#btnClearLoop'),
    speedRange: $('#speedRange'),
    speedVal: $('#speedVal'),
    statusText: $('#statusText'),
    zoomRange: $('#zoomRange'),
    zoomVal: $('#zoomVal'),
    panFrame: $('#panFrame'),
    panViewport: $('#panViewport'),
    btnResetZoom: $('#btnResetZoom'),
    btnJumpA: $('#btnJumpA'),
    btnJumpB: $('#btnJumpB'),
    btnBack1: $('#btnBack1'),
    btnForward1: $('#btnForward1'),
    screenAudio: $('#screenAudio'),
    showStatus: $('#showStatus'),
    autoSync: $('#autoSync'),
    videoWrapper: $('#videoWrapper'),
    video: $('#mainVideo'),
    screenStatus: $('#screenStatus'),
    modalLinks: $('#modalLinks'),
    modalSponsor: $('#modalSponsor'),
    btnOpenLinks: $('#btnOpenLinks'),
    btnCloseLinks: $('#btnCloseLinks'),
    btnOpenSponsor: $('#btnOpenSponsor'),
    btnCloseSponsor: $('#btnCloseSponsor'),
    linkInputScreen: $('#linkInputScreen'),
    linkInputControl: $('#linkInputControl'),
    btnCopyScreen: $('#btnCopyScreen'),
    btnCopyControl: $('#btnCopyControl'),
    copyMsg: $('#copyMsg')
  };

  const state = {
    hasClip: false,
    clipVersion: 0,
    clipName: '',
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    speed: 1,
    loopA: null,
    loopB: null,
    viewStart: 0,
    viewWidth: 1,
    zoom: 1,
    panXPct: 0,
    panYPct: 0,
    screenAudio: false,
    showStatus: true,
    autoSync: true
  };

  let objectUrl = null;
  let suppress = false;
  let dragKind = null;
  let dragData = null;
  let syncTimer = null;

  document.body.classList.toggle('is-screen', mode === 'screen');
  document.body.classList.toggle('is-control', mode !== 'screen');

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function fmt(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function niceRate(value) {
    const n = Number(value) || 1;
    if (n >= 1) return `${n.toFixed(1)}x`;
    return `${n.toFixed(2)}x`;
  }

  function post(type, payload = {}) {
    if (!bc) return;
    bc.postMessage({ type, payload, source: mode, at: Date.now() });
  }

  function screenUrl() {
    const url = new URL(location.href);
    url.pathname = url.pathname.replace(/VAR_Replay_V1\.0\.html$/i, 'index.html');
    url.searchParams.set('mode', 'screen');
    return url.toString();
  }

  function controlUrl() {
    const url = new URL(location.href);
    url.pathname = url.pathname.replace(/VAR_Replay_V1\.0\.html$/i, 'index.html');
    url.searchParams.set('mode', 'control');
    return url.toString();
  }

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

  async function saveClip(file) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put({
        id: CLIP_ID,
        blob: file,
        name: file.name || 'replay-video',
        type: file.type || 'video/mp4',
        updatedAt: Date.now()
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function getSavedClip() {
    const db = await openDB();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(CLIP_ID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return row;
  }

  async function loadBlob(blob, meta = {}) {
    if (!blob || !els.video) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    els.video.src = objectUrl;
    els.video.load();
    state.hasClip = true;
    state.clipName = meta.name || 'replay-video';
    state.clipVersion = meta.updatedAt || Date.now();
    setStatus(mode === 'screen' ? 'Clip received' : `Ready: ${state.clipName}`);
    if (els.dropZone) {
      els.dropZone.classList.remove('loading');
      els.dropZone.classList.add('ready');
      els.dropZone.innerHTML = `<div class="drop-icon" aria-hidden="true">▣</div><b>Ready:</b> ${escapeHTML(state.clipName)}<br><span id="dropText">คลิกหรือลากไฟล์ใหม่เพื่อเปลี่ยนคลิป</span>`;
    }
    render();
  }

  function escapeHTML(text) {
    return String(text).replace(/[&<>'"]/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[ch]));
  }

  async function loadSaved() {
    try {
      const row = await getSavedClip();
      if (row?.blob) await loadBlob(row.blob, row);
      else setStatus(mode === 'screen' ? 'Waiting for Control…' : 'READY');
    } catch (err) {
      console.warn(err);
      setStatus('IndexedDB blocked');
    }
  }

  async function handleFile(file) {
    if (!file || !file.type.startsWith('video/')) {
      alert('กรุณาเลือกไฟล์วิดีโอเท่านั้น');
      return;
    }
    els.dropZone?.classList.add('loading');
    if (els.dropZone) els.dropZone.innerHTML = '<div class="drop-icon">⌛</div><b>Loading...</b><br><span id="dropText">กำลังเตรียมคลิปสำหรับ Replay</span>';
    await saveClip(file);
    await loadBlob(file, { name: file.name, type: file.type, updatedAt: Date.now() });
    state.currentTime = 0;
    state.duration = 0;
    state.isPlaying = false;
    state.loopA = null;
    state.loopB = null;
    state.viewStart = 0;
    state.viewWidth = 1;
    state.speed = 1;
    state.zoom = 1;
    state.panXPct = 0;
    state.panYPct = 0;
    post('clip:update', { version: state.clipVersion, name: state.clipName });
    broadcast('file');
    render();
  }

  function setStatus(text) {
    if (els.statusText) els.statusText.textContent = text;
    if (els.screenStatus) els.screenStatus.textContent = text;
  }

  function timelinePctFromTime(time) {
    const duration = state.duration || 0;
    if (!duration) return 0;
    const start = state.viewStart * duration;
    const width = state.viewWidth * duration;
    return clamp(((time - start) / width) * 100, 0, 100);
  }

  function navPctFromTime(time) {
    const duration = state.duration || 0;
    if (!duration) return 0;
    return clamp((time / duration) * 100, 0, 100);
  }

  function timeFromTimelinePct(pct) {
    const duration = state.duration || 0;
    const start = state.viewStart * duration;
    const width = state.viewWidth * duration;
    return clamp(start + (pct / 100) * width, 0, duration);
  }

  function pointerPct(event, element) {
    const rect = element.getBoundingClientRect();
    if (!rect.width) return 0;
    return clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
  }

  function setCurrentTime(time, shouldBroadcast = true) {
    if (!els.video) return;
    const duration = state.duration || els.video.duration || 0;
    const next = clamp(Number(time) || 0, 0, duration || 0);
    suppress = true;
    els.video.currentTime = next;
    suppress = false;
    state.currentTime = next;
    renderTimeline();
    if (shouldBroadcast) broadcast('seek');
  }

  function play() {
    if (!state.hasClip || !els.video) return;
    els.video.playbackRate = state.speed;
    const p = els.video.play();
    if (p?.catch) p.catch(() => setStatus('Click once to allow playback'));
    state.isPlaying = true;
    broadcast('play');
    renderButtons();
  }

  function pause() {
    if (!els.video) return;
    els.video.pause();
    state.isPlaying = false;
    broadcast('pause');
    renderButtons();
  }

  function setSpeed(value) {
    state.speed = clamp(Number(value) || 1, 0.01, 2);
    if (els.video) els.video.playbackRate = state.speed;
    renderSpeed();
    broadcast('speed');
  }

  function setZoom(value) {
    state.zoom = clamp(Number(value) || 1, 1, 10);
    updateViewportFromState();
    applyTransform();
    renderZoom();
    broadcast('zoom');
  }

  function setPan(xPct, yPct) {
    state.panXPct = clamp(Number(xPct) || 0, -100, 100);
    state.panYPct = clamp(Number(yPct) || 0, -100, 100);
    updateViewportFromState();
    applyTransform();
    broadcast('pan');
  }

  function resetZoom() {
    state.zoom = 1;
    state.panXPct = 0;
    state.panYPct = 0;
    updateViewportFromState();
    applyTransform();
    renderZoom();
    broadcast('resetZoom');
  }

  function applyTransform() {
    if (!els.video) return;
    const maxX = ((state.zoom - 1) / Math.max(state.zoom, 1)) * 50;
    const maxY = ((state.zoom - 1) / Math.max(state.zoom, 1)) * 50;
    const translateX = (state.panXPct / 100) * maxX;
    const translateY = (state.panYPct / 100) * maxY;
    els.video.style.transform = `translate(${translateX}%, ${translateY}%) scale(${state.zoom})`;
  }

  function setA(time = state.currentTime) {
    const t = clamp(Number(time) || 0, 0, state.duration || 0);
    state.loopA = t;
    if (state.loopB !== null && state.loopB <= state.loopA) state.loopB = Math.min(state.duration || t, t + 0.1);
    broadcast('setA');
    renderLoop();
  }

  function setB(time = state.currentTime) {
    const t = clamp(Number(time) || 0, 0, state.duration || 0);
    state.loopB = t;
    if (state.loopA !== null && state.loopA >= state.loopB) state.loopA = Math.max(0, t - 0.1);
    broadcast('setB');
    renderLoop();
  }

  function clearLoop() {
    state.loopA = null;
    state.loopB = null;
    broadcast('clearLoop');
    renderLoop();
  }

  function loopActive() {
    return state.loopA !== null && state.loopB !== null && state.loopB > state.loopA;
  }

  function broadcast(reason) {
    if (mode !== 'control') return;
    post('state', { ...state, reason });
  }

  function applyIncoming(next) {
    const prevVersion = state.clipVersion;
    Object.assign(state, next || {});
    state.speed = clamp(Number(state.speed) || 1, 0.01, 2);
    state.zoom = clamp(Number(state.zoom) || 1, 1, 10);
    state.viewStart = clamp(Number(state.viewStart) || 0, 0, 0.99);
    state.viewWidth = clamp(Number(state.viewWidth) || 1, 0.01, 1);

    if (mode === 'screen' && state.clipVersion && state.clipVersion !== prevVersion) loadSaved();

    if (els.video) {
      els.video.playbackRate = state.speed;
      els.video.muted = !state.screenAudio;
      const drift = Math.abs((els.video.currentTime || 0) - state.currentTime);
      if (state.hasClip && Number.isFinite(state.currentTime) && (drift > 0.25 || next.reason === 'seek')) {
        els.video.currentTime = state.currentTime;
      }
      if (state.isPlaying && els.video.paused) {
        const p = els.video.play();
        if (p?.catch) p.catch(() => setStatus('Click Screen once to allow playback'));
      }
      if (!state.isPlaying && !els.video.paused) els.video.pause();
    }
    render();
  }

  function render() {
    renderTimeline();
    renderLoop();
    renderNav();
    renderSpeed();
    renderZoom();
    renderButtons();
    renderLinks();
    updateViewportFromState();
    applyTransform();
    renderScreenOptions();
  }

  function renderTimeline() {
    const duration = state.duration || 0;
    const currentPct = timelinePctFromTime(state.currentTime);
    if (els.trackFill) els.trackFill.style.width = `${currentPct}%`;
    if (els.currTime) els.currTime.textContent = fmt(state.currentTime);
    if (els.totalTime) els.totalTime.textContent = fmt(duration);
    if (els.navPlayhead) {
      els.navPlayhead.style.display = duration ? 'block' : 'none';
      els.navPlayhead.style.left = `${navPctFromTime(state.currentTime)}%`;
    }
    if (els.trackWindow) {
      els.trackWindow.style.left = '0%';
      els.trackWindow.style.width = '100%';
    }
  }

  function renderLoop() {
    const active = loopActive();
    if (els.loopStatus) {
      els.loopStatus.textContent = active ? 'LOOP A-B ACTIVE' : 'LOOP A-B OFF';
      els.loopStatus.classList.toggle('active', active);
    }
    if (els.btnSetA) els.btnSetA.classList.toggle('active-btn', state.loopA !== null);
    if (els.btnSetB) els.btnSetB.classList.toggle('active-btn', state.loopB !== null);

    if (els.markA) {
      els.markA.style.display = state.loopA !== null ? 'block' : 'none';
      els.markA.style.left = `${timelinePctFromTime(state.loopA || 0)}%`;
    }
    if (els.markB) {
      els.markB.style.display = state.loopB !== null ? 'block' : 'none';
      els.markB.style.left = `${timelinePctFromTime(state.loopB || 0)}%`;
    }
    if (els.trackLoop) {
      if (active) {
        const left = timelinePctFromTime(state.loopA);
        const right = timelinePctFromTime(state.loopB);
        els.trackLoop.style.display = 'block';
        els.trackLoop.style.left = `${left}%`;
        els.trackLoop.style.width = `${Math.max(0, right - left)}%`;
      } else {
        els.trackLoop.style.display = 'none';
      }
    }
  }

  function renderNav() {
    if (!els.navWindow) return;
    const left = state.viewStart * 100;
    const width = state.viewWidth * 100;
    els.navWindow.style.left = `${left}%`;
    els.navWindow.style.width = `${width}%`;
  }

  function renderSpeed() {
    if (els.speedRange) els.speedRange.value = String(state.speed);
    if (els.speedVal) els.speedVal.textContent = niceRate(state.speed);
  }

  function renderZoom() {
    if (els.zoomRange) els.zoomRange.value = String(state.zoom);
    if (els.zoomVal) els.zoomVal.textContent = niceRate(state.zoom);
  }

  function renderButtons() {
    if (els.btnPlay) els.btnPlay.disabled = state.isPlaying || !state.hasClip;
    if (els.btnPause) els.btnPause.disabled = !state.isPlaying || !state.hasClip;
  }

  function renderScreenOptions() {
    if (els.screenAudio) els.screenAudio.checked = state.screenAudio;
    if (els.showStatus) els.showStatus.checked = state.showStatus;
    if (els.autoSync) els.autoSync.checked = state.autoSync;
    if (els.video) els.video.muted = !state.screenAudio;
    if (els.videoWrapper) {
      els.videoWrapper.classList.toggle('ready', state.hasClip && mode === 'screen' && !state.showStatus);
      els.videoWrapper.classList.toggle('hide-status', !state.showStatus);
    }
  }

  function renderLinks() {
    if (els.linkInputScreen) els.linkInputScreen.value = screenUrl();
    if (els.linkInputControl) els.linkInputControl.value = controlUrl();
  }

  function updateViewportFromState() {
    if (!els.panViewport) return;
    const zoom = Math.max(1, state.zoom);
    const width = 100 / zoom;
    const height = 100 / zoom;
    const maxLeft = 100 - width;
    const maxTop = 100 - height;
    const left = ((state.panXPct + 100) / 200) * maxLeft;
    const top = ((state.panYPct + 100) / 200) * maxTop;
    els.panViewport.style.width = `${width}%`;
    els.panViewport.style.height = `${height}%`;
    els.panViewport.style.left = `${left}%`;
    els.panViewport.style.top = `${top}%`;
  }

  function setupControl() {
    if (mode !== 'control') return;

    els.dropZone?.addEventListener('click', () => els.fileInput?.click());
    els.dropZone?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        els.fileInput?.click();
      }
    });
    els.fileInput?.addEventListener('change', (event) => handleFile(event.target.files?.[0]));
    ['dragenter', 'dragover'].forEach((name) => els.dropZone?.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropZone.classList.add('drag-over');
    }));
    ['dragleave', 'drop'].forEach((name) => els.dropZone?.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove('drag-over');
    }));
    els.dropZone?.addEventListener('drop', (event) => handleFile(event.dataTransfer.files?.[0]));

    els.btnPlay?.addEventListener('click', play);
    els.btnPause?.addEventListener('click', pause);
    els.btnSetA?.addEventListener('click', () => setA(els.video?.currentTime || state.currentTime));
    els.btnSetB?.addEventListener('click', () => setB(els.video?.currentTime || state.currentTime));
    els.btnClearLoop?.addEventListener('click', clearLoop);
    els.btnJumpA?.addEventListener('click', () => state.loopA !== null && setCurrentTime(state.loopA));
    els.btnJumpB?.addEventListener('click', () => state.loopB !== null && setCurrentTime(state.loopB));
    els.btnBack1?.addEventListener('click', () => setCurrentTime(state.currentTime - 1));
    els.btnForward1?.addEventListener('click', () => setCurrentTime(state.currentTime + 1));
    els.speedRange?.addEventListener('input', () => setSpeed(els.speedRange.value));
    els.zoomRange?.addEventListener('input', () => setZoom(els.zoomRange.value));
    els.btnResetZoom?.addEventListener('click', resetZoom);

    els.screenAudio?.addEventListener('change', () => {
      state.screenAudio = els.screenAudio.checked;
      renderScreenOptions();
      broadcast('screenAudio');
    });
    els.showStatus?.addEventListener('change', () => {
      state.showStatus = els.showStatus.checked;
      renderScreenOptions();
      broadcast('showStatus');
    });
    els.autoSync?.addEventListener('change', () => {
      state.autoSync = els.autoSync.checked;
      broadcast('autoSync');
    });

    els.btnOpenLinks?.addEventListener('click', () => openModal(els.modalLinks));
    els.btnCloseLinks?.addEventListener('click', () => closeModal(els.modalLinks));
    els.btnOpenSponsor?.addEventListener('click', () => openModal(els.modalSponsor));
    els.btnCloseSponsor?.addEventListener('click', () => closeModal(els.modalSponsor));
    els.modalLinks?.addEventListener('click', (event) => event.target === els.modalLinks && closeModal(els.modalLinks));
    els.modalSponsor?.addEventListener('click', (event) => event.target === els.modalSponsor && closeModal(els.modalSponsor));
    els.btnCopyScreen?.addEventListener('click', () => copyValue(els.linkInputScreen));
    els.btnCopyControl?.addEventListener('click', () => copyValue(els.linkInputControl));

    setupTimelineDrag();
    setupNavigatorDrag();
    setupPanDrag();
    setupKeyboard();
  }

  function openModal(el) {
    if (!el) return;
    renderLinks();
    el.classList.add('open');
  }

  function closeModal(el) {
    el?.classList.remove('open');
  }

  async function copyValue(input) {
    if (!input) return;
    try {
      await navigator.clipboard.writeText(input.value);
      showCopy('Copied!');
    } catch {
      input.focus();
      input.select();
      document.execCommand('copy');
      showCopy('Copied!');
    }
  }

  function showCopy(text) {
    if (!els.copyMsg) return;
    els.copyMsg.textContent = text;
    els.copyMsg.classList.add('show');
    setTimeout(() => els.copyMsg.classList.remove('show'), 1600);
  }

  function setupTimelineDrag() {
    function begin(kind, event) {
      event.preventDefault();
      event.stopPropagation();
      dragKind = kind;
      dragData = {};
      if (kind === 'A') els.markA?.classList.add('dragging');
      if (kind === 'B') els.markB?.classList.add('dragging');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      move(event);
    }

    function move(event) {
      if (!dragKind || !els.timelineBox) return;
      const pct = pointerPct(event, els.timelineBox);
      const time = timeFromTimelinePct(pct);
      if (dragKind === 'scrub') setCurrentTime(time, true);
      if (dragKind === 'A') setA(time);
      if (dragKind === 'B') setB(time);
    }

    function end() {
      els.markA?.classList.remove('dragging');
      els.markB?.classList.remove('dragging');
      dragKind = null;
      dragData = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    }

    els.clickLayer?.addEventListener('pointerdown', (event) => begin('scrub', event));
    els.markA?.addEventListener('pointerdown', (event) => begin('A', event));
    els.markB?.addEventListener('pointerdown', (event) => begin('B', event));
  }

  function setupNavigatorDrag() {
    if (!els.navBox || !els.navWindow) return;
    const minWidth = 0.03;

    function begin(kind, event) {
      event.preventDefault();
      event.stopPropagation();
      const rect = els.navBox.getBoundingClientRect();
      dragKind = kind;
      dragData = {
        startX: event.clientX,
        boxWidth: rect.width,
        viewStart: state.viewStart,
        viewWidth: state.viewWidth
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
    }

    function move(event) {
      if (!dragKind || !dragData || !dragKind.startsWith('nav')) return;
      const dx = (event.clientX - dragData.startX) / dragData.boxWidth;
      if (dragKind === 'nav-left') {
        const right = dragData.viewStart + dragData.viewWidth;
        state.viewStart = clamp(dragData.viewStart + dx, 0, right - minWidth);
        state.viewWidth = clamp(right - state.viewStart, minWidth, 1);
      }
      if (dragKind === 'nav-right') {
        state.viewWidth = clamp(dragData.viewWidth + dx, minWidth, 1 - dragData.viewStart);
      }
      if (dragKind === 'nav-move') {
        state.viewStart = clamp(dragData.viewStart + dx, 0, 1 - dragData.viewWidth);
      }
      renderNav();
      renderTimeline();
      renderLoop();
      broadcast('navigator');
    }

    function end() {
      dragKind = null;
      dragData = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    }

    els.navHandleLeft?.addEventListener('pointerdown', (event) => begin('nav-left', event));
    els.navHandleRight?.addEventListener('pointerdown', (event) => begin('nav-right', event));
    els.navWindow?.addEventListener('pointerdown', (event) => begin('nav-move', event));
    els.navBox.addEventListener('dblclick', () => {
      state.viewStart = 0;
      state.viewWidth = 1;
      render();
      broadcast('navigatorReset');
    });
  }

  function setupPanDrag() {
    if (!els.panFrame || !els.panViewport) return;

    function begin(event) {
      event.preventDefault();
      const rect = els.panFrame.getBoundingClientRect();
      dragKind = 'pan';
      dragData = { rect };
      els.panViewport.classList.add('dragging');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      move(event);
    }

    function move(event) {
      if (dragKind !== 'pan' || !dragData) return;
      const rect = dragData.rect;
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      setPan((x * 200) - 100, (y * 200) - 100);
    }

    function end() {
      dragKind = null;
      dragData = null;
      els.panViewport.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    }

    els.panFrame.addEventListener('pointerdown', begin);
  }

  function setupKeyboard() {
    document.addEventListener('keydown', (event) => {
      if (mode !== 'control') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        state.isPlaying ? pause() : play();
      }
      if (event.key.toLowerCase() === 'a') setA(els.video?.currentTime || state.currentTime);
      if (event.key.toLowerCase() === 'b') setB(els.video?.currentTime || state.currentTime);
      if (event.key.toLowerCase() === 'c') clearLoop();
      if (event.key.toLowerCase() === 'r') resetZoom();
      if (event.key === 'ArrowLeft') setCurrentTime(state.currentTime - 1);
      if (event.key === 'ArrowRight') setCurrentTime(state.currentTime + 1);
      if (event.key === '[') setSpeed(state.speed - 0.05);
      if (event.key === ']') setSpeed(state.speed + 0.05);
      if (event.key === '+' || event.key === '=') setZoom(state.zoom + 0.1);
      if (event.key === '-' || event.key === '_') setZoom(state.zoom - 0.1);
    });
  }

  function setupVideoEvents() {
    if (!els.video) return;
    els.video.addEventListener('loadedmetadata', () => {
      state.duration = els.video.duration || 0;
      state.currentTime = els.video.currentTime || 0;
      els.video.playbackRate = state.speed;
      render();
      broadcast('metadata');
    });
    els.video.addEventListener('timeupdate', () => {
      if (!suppress) state.currentTime = els.video.currentTime || 0;
      if (loopActive() && state.currentTime >= state.loopB - 0.025) {
        els.video.currentTime = state.loopA;
        state.currentTime = state.loopA;
        if (state.isPlaying) els.video.play().catch(() => {});
      }
      renderTimeline();
      if (mode === 'control' && state.autoSync) broadcast('timeupdate');
    });
    els.video.addEventListener('play', () => {
      state.isPlaying = true;
      renderButtons();
      broadcast('video-play');
    });
    els.video.addEventListener('pause', () => {
      state.isPlaying = false;
      renderButtons();
      broadcast('video-pause');
    });
  }

  function setupBroadcast() {
    if (!bc) return;
    bc.addEventListener('message', async (event) => {
      const msg = event.data || {};
      if (!msg.type || msg.source === mode) return;
      if (mode === 'screen' && msg.type === 'state') applyIncoming(msg.payload);
      if (mode === 'screen' && msg.type === 'clip:update') await loadSaved();
      if (mode === 'control' && msg.type === 'screen:ready') broadcast('screen-ready');
    });
  }

  function setupSyncTimer() {
    if (mode !== 'control') return;
    clearInterval(syncTimer);
    syncTimer = setInterval(() => {
      if (!state.autoSync || !state.hasClip || !els.video) return;
      state.currentTime = els.video.currentTime || 0;
      state.duration = els.video.duration || state.duration;
      state.isPlaying = !els.video.paused;
      broadcast('heartbeat');
    }, 260);
  }

  async function init() {
    setupVideoEvents();
    setupBroadcast();
    setupControl();
    render();
    await loadSaved();
    setupSyncTimer();
    if (mode === 'screen') {
      post('screen:ready', { ready: true });
      document.addEventListener('click', () => {
        if (state.isPlaying && els.video?.paused) els.video.play().catch(() => {});
      }, { once: true });
    }
  }

  init();
})();
