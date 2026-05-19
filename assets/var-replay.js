(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') === 'screen' ? 'screen' : 'control';
  const app = $('#app');
  app.dataset.mode = mode;

  const CHANNEL = 'peps-var-replay-studio-v1';
  const DB_NAME = 'peps-var-replay-db';
  const DB_STORE = 'clips';
  const CLIP_ID = 'active';
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;

  const state = {
    currentTime: 0,
    duration: 0,
    pointA: 0,
    pointB: 0,
    loopActive: false,
    playing: false,
    speed: 1,
    zoom: 1,
    panX: 0,
    panY: 0,
    screenAudio: false,
    autoSync: true,
    showSafeFrame: true,
    navStartPct: 0,
    navEndPct: 100,
    clipVersion: 0,
    hasClip: false
  };

  const els = {
    dropZone: $('#dropZone'),
    fileInput: $('#fileInput'),
    controlVideo: $('#controlVideo'),
    screenVideo: $('#screenVideo'),
    timeline: $('#timeline'),
    currentTimeLabel: $('#currentTimeLabel'),
    durationLabel: $('#durationLabel'),
    pointALabel: $('#pointALabel'),
    pointBLabel: $('#pointBLabel'),
    loopStatus: $('#loopStatus'),
    navigator: $('#navigator'),
    navSelection: $('#navSelection'),
    navStart: $('#navStart'),
    navEnd: $('#navEnd'),
    btnPlay: $('#btnPlay'),
    btnPause: $('#btnPause'),
    btnSetA: $('#btnSetA'),
    btnSetB: $('#btnSetB'),
    btnClearLoop: $('#btnClearLoop'),
    speedRange: $('#speedRange'),
    speedLabel: $('#speedLabel'),
    speedDown: $('#speedDown'),
    speedUp: $('#speedUp'),
    zoomRange: $('#zoomRange'),
    zoomLabel: $('#zoomLabel'),
    zoomDown: $('#zoomDown'),
    zoomUp: $('#zoomUp'),
    panXRange: $('#panXRange'),
    panYRange: $('#panYRange'),
    panXLabel: $('#panXLabel'),
    panYLabel: $('#panYLabel'),
    btnResetView: $('#btnResetView'),
    btnJumpA: $('#btnJumpA'),
    btnJumpB: $('#btnJumpB'),
    btnBack1: $('#btnBack1'),
    btnForward1: $('#btnForward1'),
    screenAudio: $('#screenAudio'),
    autoSync: $('#autoSync'),
    showSafeFrame: $('#showSafeFrame'),
    screenFrame: $('#screenFrame'),
    screenSafeFrame: $('#screenSafeFrame'),
    screenStatus: $('#screenStatus'),
    btnOpenLinks: $('#btnOpenLinks'),
    btnOpenScreen: $('#btnOpenScreen'),
    linkDialog: $('#linkDialog'),
    btnCloseDialog: $('#btnCloseDialog'),
    screenLink: $('#screenLink'),
    controlLink: $('#controlLink'),
    btnCopyScreen: $('#btnCopyScreen'),
    btnCopyControl: $('#btnCopyControl'),
    copyStatus: $('#copyStatus')
  };

  const video = mode === 'screen' ? els.screenVideo : els.controlVideo;
  let currentObjectUrl = null;
  let suppressSeekEvent = false;
  let syncTimer = null;
  let dragPan = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function post(type, payload = {}) {
    if (!bc) return;
    bc.postMessage({ type, payload, sentAt: Date.now(), source: mode });
  }

  function getControlUrl() {
    const url = new URL(location.href);
    url.pathname = url.pathname.replace(/VAR_Replay_V1\.0\.html$/i, 'index.html');
    url.searchParams.set('mode', 'control');
    return url.toString();
  }

  function getScreenUrl() {
    const url = new URL(location.href);
    url.pathname = url.pathname.replace(/VAR_Replay_V1\.0\.html$/i, 'index.html');
    url.searchParams.set('mode', 'screen');
    return url.toString();
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' });
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
        name: file.name,
        type: file.type,
        size: file.size,
        updatedAt: Date.now()
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function loadSavedClip() {
    const db = await openDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(CLIP_ID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  }

  async function loadClipBlob(blob, version = Date.now()) {
    if (!blob || !video) return;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(blob);
    state.clipVersion = version;
    state.hasClip = true;
    video.src = currentObjectUrl;
    video.load();
    if (els.dropZone) els.dropZone.classList.add('has-video');
    updateStatus('Loaded clip');
  }

  async function pickClip(file) {
    if (!file || !file.type.startsWith('video/')) {
      alert('กรุณาเลือกไฟล์วิดีโอเท่านั้น');
      return;
    }
    await saveClip(file);
    await loadClipBlob(file, Date.now());
    state.pointA = 0;
    state.pointB = 0;
    state.loopActive = false;
    state.currentTime = 0;
    state.duration = 0;
    state.navStartPct = 0;
    state.navEndPct = 100;
    post('clip:update', { version: state.clipVersion, name: file.name, size: file.size, type: file.type });
    broadcastState('clip-picked');
    render();
  }

  async function tryLoadSavedClip() {
    try {
      const record = await loadSavedClip();
      if (record?.blob) {
        await loadClipBlob(record.blob, record.updatedAt);
        updateStatus(`Loaded: ${record.name || 'saved clip'}`);
      } else {
        updateStatus(mode === 'screen' ? 'Waiting for clip from Control…' : 'ยังไม่มีคลิปที่บันทึกไว้');
      }
    } catch (error) {
      console.warn(error);
      updateStatus('Cannot load saved clip. IndexedDB may be blocked.');
    }
  }

  function getVisibleWindow() {
    const duration = state.duration || video?.duration || 0;
    const start = (state.navStartPct / 100) * duration;
    const end = (state.navEndPct / 100) * duration;
    return { start, end: Math.max(start + 0.1, end), duration };
  }

  function setTime(time, shouldBroadcast = true) {
    if (!video || !Number.isFinite(time)) return;
    const duration = video.duration || state.duration || 0;
    const next = clamp(time, 0, duration || time);
    suppressSeekEvent = true;
    video.currentTime = next;
    state.currentTime = next;
    suppressSeekEvent = false;
    renderTime();
    if (shouldBroadcast) broadcastState('seek');
  }

  function setPlaying(playing) {
    if (!video || !state.hasClip) return;
    state.playing = playing;
    video.playbackRate = state.speed;
    if (playing) {
      const p = video.play();
      if (p?.catch) p.catch(() => updateStatus('Browser blocked autoplay. Click Play once on this page.'));
    } else {
      video.pause();
    }
    broadcastState(playing ? 'play' : 'pause');
    renderButtons();
  }

  function setLoopPoints(a, b, active = true) {
    const duration = state.duration || video?.duration || 0;
    const aa = clamp(a, 0, duration || a);
    const bb = clamp(b, 0, duration || b);
    state.pointA = Math.min(aa, bb);
    state.pointB = Math.max(aa, bb);
    state.loopActive = active && state.pointB > state.pointA + 0.05;
    renderLoop();
    broadcastState('loop');
  }

  function clearLoop() {
    state.loopActive = false;
    state.pointA = 0;
    state.pointB = 0;
    renderLoop();
    broadcastState('clear-loop');
  }

  function setSpeed(speed) {
    state.speed = clamp(Number(speed) || 1, 0.25, 2);
    if (video) video.playbackRate = state.speed;
    renderSpeed();
    broadcastState('speed');
  }

  function setZoom(zoom) {
    state.zoom = clamp(Number(zoom) || 1, 1, 3);
    applyTransform();
    renderZoom();
    broadcastState('zoom');
  }

  function setPan(x, y) {
    state.panX = clamp(Number(x) || 0, -500, 500);
    state.panY = clamp(Number(y) || 0, -300, 300);
    applyTransform();
    renderPan();
    broadcastState('pan');
  }

  function resetView() {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    applyTransform();
    renderZoom();
    renderPan();
    broadcastState('reset-view');
  }

  function applyTransform() {
    const transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    if (els.controlVideo) els.controlVideo.style.transform = transform;
    if (els.screenVideo) els.screenVideo.style.transform = transform;
  }

  function broadcastState(reason = 'state') {
    if (mode !== 'control') return;
    post('state', { ...state, reason });
  }

  function updateStatus(text) {
    if (els.screenStatus) els.screenStatus.textContent = text;
  }

  function renderTime() {
    const duration = state.duration || video?.duration || 0;
    if (els.currentTimeLabel) els.currentTimeLabel.textContent = formatTime(state.currentTime);
    if (els.durationLabel) els.durationLabel.textContent = formatTime(duration);
    if (els.timeline) {
      const { start, end } = getVisibleWindow();
      const pct = duration ? ((state.currentTime - start) / Math.max(0.1, end - start)) * 1000 : 0;
      els.timeline.value = String(clamp(pct, 0, 1000));
    }
  }

  function renderLoop() {
    if (els.pointALabel) els.pointALabel.textContent = formatTime(state.pointA);
    if (els.pointBLabel) els.pointBLabel.textContent = formatTime(state.pointB);
    if (els.loopStatus) {
      els.loopStatus.textContent = state.loopActive ? '⚡ LOOP A-B ACTIVE ⚡' : 'LOOP A-B OFF';
      els.loopStatus.classList.toggle('active', state.loopActive);
    }
  }

  function renderSpeed() {
    if (els.speedRange) els.speedRange.value = String(state.speed);
    if (els.speedLabel) els.speedLabel.textContent = `${state.speed.toFixed(2).replace(/\.00$/, '.0')}x`;
  }

  function renderZoom() {
    if (els.zoomRange) els.zoomRange.value = String(state.zoom);
    if (els.zoomLabel) els.zoomLabel.textContent = `${state.zoom.toFixed(2).replace(/\.00$/, '.0')}x`;
  }

  function renderPan() {
    if (els.panXRange) els.panXRange.value = String(state.panX);
    if (els.panYRange) els.panYRange.value = String(state.panY);
    if (els.panXLabel) els.panXLabel.textContent = String(Math.round(state.panX));
    if (els.panYLabel) els.panYLabel.textContent = String(Math.round(state.panY));
  }

  function renderNavigator() {
    if (!els.navSelection || !els.navStart || !els.navEnd) return;
    const start = clamp(state.navStartPct, 0, 99);
    const end = clamp(state.navEndPct, start + 1, 100);
    state.navStartPct = start;
    state.navEndPct = end;
    els.navSelection.style.left = `${start}%`;
    els.navSelection.style.right = `${100 - end}%`;
    els.navStart.style.left = `${start}%`;
    els.navEnd.style.left = `${end}%`;
  }

  function renderButtons() {
    if (els.btnPlay) els.btnPlay.disabled = state.playing;
    if (els.btnPause) els.btnPause.disabled = !state.playing;
  }

  function renderOptions() {
    if (els.screenAudio) els.screenAudio.checked = state.screenAudio;
    if (els.autoSync) els.autoSync.checked = state.autoSync;
    if (els.showSafeFrame) els.showSafeFrame.checked = state.showSafeFrame;
    if (els.screenVideo) els.screenVideo.muted = !state.screenAudio;
    if (els.screenFrame) {
      els.screenFrame.classList.toggle('hide-safe', !state.showSafeFrame);
      els.screenFrame.classList.toggle('ready', state.hasClip);
    }
  }

  function renderLinks() {
    if (els.screenLink) els.screenLink.value = getScreenUrl();
    if (els.controlLink) els.controlLink.value = getControlUrl();
  }

  function render() {
    renderTime();
    renderLoop();
    renderSpeed();
    renderZoom();
    renderPan();
    renderNavigator();
    renderButtons();
    renderOptions();
    renderLinks();
    applyTransform();
  }

  function applyIncomingState(next) {
    const oldClipVersion = state.clipVersion;
    Object.assign(state, next);
    state.speed = clamp(Number(state.speed) || 1, 0.25, 2);
    state.zoom = clamp(Number(state.zoom) || 1, 1, 3);
    state.navStartPct = clamp(Number(state.navStartPct) || 0, 0, 99);
    state.navEndPct = clamp(Number(state.navEndPct) || 100, state.navStartPct + 1, 100);
    if (video) {
      video.playbackRate = state.speed;
      video.muted = !state.screenAudio;
      const drift = Math.abs((video.currentTime || 0) - state.currentTime);
      if (state.hasClip && Number.isFinite(state.currentTime) && (drift > 0.28 || next.reason === 'seek')) {
        video.currentTime = state.currentTime;
      }
      if (state.playing && video.paused) {
        const p = video.play();
        if (p?.catch) p.catch(() => updateStatus('Click once on Screen to allow playback.'));
      }
      if (!state.playing && !video.paused) video.pause();
    }
    if (mode === 'screen' && next.clipVersion && next.clipVersion !== oldClipVersion) {
      tryLoadSavedClip();
    }
    render();
  }

  function handleLoop() {
    if (!video || !state.loopActive) return;
    if (state.pointB <= state.pointA) return;
    if (video.currentTime >= state.pointB - 0.025) {
      video.currentTime = state.pointA;
      state.currentTime = state.pointA;
      if (state.playing) {
        const p = video.play();
        if (p?.catch) p.catch(() => {});
      }
    }
  }

  function handleTimelineInput() {
    if (!els.timeline) return;
    const { start, end } = getVisibleWindow();
    const pct = (Number(els.timeline.value) || 0) / 1000;
    const nextTime = start + pct * (end - start);
    setTime(nextTime, true);
  }

  function setupNavigatorDrag() {
    if (!els.navigator) return;
    const minGap = 4;
    let active = null;

    function pointerToPct(event) {
      const rect = els.navigator.getBoundingClientRect();
      return clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    }

    function onMove(event) {
      if (!active) return;
      const pct = pointerToPct(event);
      if (active === 'start') state.navStartPct = clamp(pct, 0, state.navEndPct - minGap);
      if (active === 'end') state.navEndPct = clamp(pct, state.navStartPct + minGap, 100);
      renderNavigator();
      renderTime();
      broadcastState('navigator');
    }

    function stop() {
      active = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
    }

    els.navStart.addEventListener('pointerdown', (event) => {
      active = 'start';
      event.preventDefault();
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', stop);
    });
    els.navEnd.addEventListener('pointerdown', (event) => {
      active = 'end';
      event.preventDefault();
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', stop);
    });
    els.navigator.addEventListener('dblclick', () => {
      state.navStartPct = 0;
      state.navEndPct = 100;
      renderNavigator();
      renderTime();
      broadcastState('navigator-reset');
    });
  }

  function setupPanDrag(target) {
    if (!target) return;
    target.addEventListener('pointerdown', (event) => {
      if (!state.hasClip || state.zoom <= 1) return;
      dragPan = { x: event.clientX, y: event.clientY, startX: state.panX, startY: state.panY };
      target.setPointerCapture?.(event.pointerId);
    });
    target.addEventListener('pointermove', (event) => {
      if (!dragPan) return;
      const dx = event.clientX - dragPan.x;
      const dy = event.clientY - dragPan.y;
      setPan(dragPan.startX + dx, dragPan.startY + dy);
    });
    target.addEventListener('pointerup', () => { dragPan = null; });
    target.addEventListener('pointercancel', () => { dragPan = null; });
  }

  async function copyToClipboard(text, label = 'Copied!') {
    try {
      await navigator.clipboard.writeText(text);
      if (els.copyStatus) els.copyStatus.textContent = label;
    } catch {
      if (els.copyStatus) els.copyStatus.textContent = 'Copy ไม่สำเร็จ ให้กด Ctrl+C จากช่องลิงก์แทน';
    }
  }

  function setupControlEvents() {
    if (mode !== 'control') return;

    els.dropZone?.addEventListener('click', () => els.fileInput.click());
    els.dropZone?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') els.fileInput.click();
    });
    els.fileInput?.addEventListener('change', (event) => pickClip(event.target.files?.[0]));

    ['dragenter', 'dragover'].forEach((type) => {
      els.dropZone?.addEventListener(type, (event) => {
        event.preventDefault();
        els.dropZone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach((type) => {
      els.dropZone?.addEventListener(type, (event) => {
        event.preventDefault();
        els.dropZone.classList.remove('drag-over');
      });
    });
    els.dropZone?.addEventListener('drop', (event) => pickClip(event.dataTransfer.files?.[0]));

    els.btnPlay?.addEventListener('click', () => setPlaying(true));
    els.btnPause?.addEventListener('click', () => setPlaying(false));
    els.btnSetA?.addEventListener('click', () => setLoopPoints(video.currentTime, state.pointB || video.duration || video.currentTime, true));
    els.btnSetB?.addEventListener('click', () => setLoopPoints(state.pointA || 0, video.currentTime, true));
    els.btnClearLoop?.addEventListener('click', clearLoop);
    els.btnJumpA?.addEventListener('click', () => setTime(state.pointA));
    els.btnJumpB?.addEventListener('click', () => setTime(state.pointB));
    els.btnBack1?.addEventListener('click', () => setTime((video.currentTime || 0) - 1));
    els.btnForward1?.addEventListener('click', () => setTime((video.currentTime || 0) + 1));
    els.timeline?.addEventListener('input', handleTimelineInput);

    els.speedRange?.addEventListener('input', () => setSpeed(els.speedRange.value));
    els.speedDown?.addEventListener('click', () => setSpeed(round(state.speed - 0.05, 2)));
    els.speedUp?.addEventListener('click', () => setSpeed(round(state.speed + 0.05, 2)));
    els.zoomRange?.addEventListener('input', () => setZoom(els.zoomRange.value));
    els.zoomDown?.addEventListener('click', () => setZoom(round(state.zoom - 0.05, 2)));
    els.zoomUp?.addEventListener('click', () => setZoom(round(state.zoom + 0.05, 2)));
    els.panXRange?.addEventListener('input', () => setPan(els.panXRange.value, state.panY));
    els.panYRange?.addEventListener('input', () => setPan(state.panX, els.panYRange.value));
    els.btnResetView?.addEventListener('click', resetView);

    els.screenAudio?.addEventListener('change', () => {
      state.screenAudio = els.screenAudio.checked;
      renderOptions();
      broadcastState('screen-audio');
    });
    els.autoSync?.addEventListener('change', () => {
      state.autoSync = els.autoSync.checked;
      renderOptions();
      broadcastState('auto-sync');
    });
    els.showSafeFrame?.addEventListener('change', () => {
      state.showSafeFrame = els.showSafeFrame.checked;
      renderOptions();
      broadcastState('safe-frame');
    });

    els.btnOpenLinks?.addEventListener('click', () => els.linkDialog.showModal());
    els.btnOpenScreen?.addEventListener('click', () => window.open(getScreenUrl(), '_blank', 'noopener,noreferrer'));
    els.btnCloseDialog?.addEventListener('click', () => els.linkDialog.close());
    els.btnCopyScreen?.addEventListener('click', () => copyToClipboard(getScreenUrl(), 'Copied Screen Link!'));
    els.btnCopyControl?.addEventListener('click', () => copyToClipboard(getControlUrl(), 'Copied Control Link!'));

    document.addEventListener('keydown', (event) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (event.code === 'Space') { event.preventDefault(); setPlaying(!state.playing); }
      if (event.key.toLowerCase() === 'a') setLoopPoints(video.currentTime, state.pointB || video.duration || video.currentTime, true);
      if (event.key.toLowerCase() === 'b') setLoopPoints(state.pointA || 0, video.currentTime, true);
      if (event.key.toLowerCase() === 'c') clearLoop();
      if (event.key.toLowerCase() === 'r') resetView();
      if (event.key === 'ArrowLeft') setTime((video.currentTime || 0) - 1);
      if (event.key === 'ArrowRight') setTime((video.currentTime || 0) + 1);
      if (event.key === '[') setSpeed(round(state.speed - 0.05, 2));
      if (event.key === ']') setSpeed(round(state.speed + 0.05, 2));
      if (event.key === '+' || event.key === '=') setZoom(round(state.zoom + 0.05, 2));
      if (event.key === '-' || event.key === '_') setZoom(round(state.zoom - 0.05, 2));
    });
  }

  function setupVideoEvents() {
    if (!video) return;
    video.addEventListener('loadedmetadata', () => {
      state.duration = video.duration || 0;
      if (!state.pointB && state.duration) state.pointB = state.duration;
      video.playbackRate = state.speed;
      render();
      if (mode === 'control') broadcastState('metadata');
    });
    video.addEventListener('timeupdate', () => {
      handleLoop();
      if (!suppressSeekEvent) state.currentTime = video.currentTime || 0;
      renderTime();
    });
    video.addEventListener('play', () => {
      state.playing = true;
      if (mode === 'control') broadcastState('play-event');
      renderButtons();
    });
    video.addEventListener('pause', () => {
      state.playing = false;
      if (mode === 'control') broadcastState('pause-event');
      renderButtons();
    });
  }

  function setupBroadcast() {
    if (!bc) return;
    bc.addEventListener('message', async (event) => {
      const { type, payload, source } = event.data || {};
      if (!type || source === mode) return;
      if (mode === 'screen' && type === 'state') applyIncomingState(payload || {});
      if (mode === 'screen' && type === 'clip:update') {
        await tryLoadSavedClip();
        updateStatus('Clip received from Control');
      }
      if (mode === 'control' && type === 'screen:ready') broadcastState('screen-ready-sync');
    });
  }

  function setupSyncTimer() {
    if (mode !== 'control') return;
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => {
      if (!state.autoSync || !state.hasClip) return;
      state.currentTime = video?.currentTime || state.currentTime;
      state.duration = video?.duration || state.duration;
      state.playing = video ? !video.paused : state.playing;
      broadcastState('heartbeat');
    }, 260);
  }

  async function init() {
    setupVideoEvents();
    setupBroadcast();
    setupControlEvents();
    setupNavigatorDrag();
    setupPanDrag(els.dropZone);
    setupPanDrag(els.screenFrame);
    await tryLoadSavedClip();
    render();
    setupSyncTimer();
    if (mode === 'screen') {
      post('screen:ready', { ready: true });
      document.body.addEventListener('click', () => {
        if (state.playing && video?.paused) video.play().catch(() => {});
      }, { once: true });
    }
  }

  init();
})();
