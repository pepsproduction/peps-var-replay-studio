(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const params = new URLSearchParams(location.search);
  const pageMode = params.get('mode') || 'control';
  if (pageMode === 'highlight-screen') return; // Exit early for highlight screen to prevent conflicts
  const mode = pageMode === 'screen' ? 'screen' : 'control';

  const CHANNEL = 'peps-var-replay-studio-v1-1';
  const DB_NAME = 'peps-var-replay-studio-db';
  const DB_STORE = 'clips';
  const CLIP_ID = 'active-clip';
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;

  document.body.classList.toggle('is-screen', mode === 'screen');
  document.body.classList.toggle('is-control', mode !== 'screen');

  const els = {
    fileInput: $('#fileInput'),
    dropZone: $('#dropZone'),
    dropTitle: $('#dropTitle'),
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
    zoomPresetButtons: $$('[data-zoom-preset]'),
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
    controlVideo: $('#controlVideo'),
    screenVideo: $('#mainVideo'),
    screenVideoAlt: $('#mainVideoAlt'),
    screenStatus: $('#screenStatus'),
    modalLinks: $('#modalLinks'),
    btnOpenLinks: $('#btnOpenLinks'),
    btnCloseLinks: $('#btnCloseLinks'),
    linkInputScreen: $('#linkInputScreen'),
    linkInputControl: $('#linkInputControl'),
    sourceInputScreen: $('#sourceInputScreen'),
    sourceInputControl: $('#sourceInputControl'),
    btnCopyScreen: $('#btnCopyScreen'),
    btnCopyControl: $('#btnCopyControl'),
    btnCopyScreenSource: $('#btnCopyScreenSource'),
    btnCopyControlSource: $('#btnCopyControlSource'),
    copyMsg: $('#copyMsg')
  };

  let video = mode === 'screen' ? els.screenVideo : els.controlVideo;
  const screenBuffers = mode === 'screen' ? [els.screenVideo, els.screenVideoAlt].filter(Boolean) : [];
  let activeScreenBuffer = 0;

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
  let pendingSeek = null;
  let timelineWasPlaying = false;
  let pendingScrubTime = null;
  let scrubFrame = null;
  let loadingClip = null;
  let loadingClipVersion = 0;
  let loadedClipVersion = 0;
  let lastRemoteSeekAt = 0;
  let lastRemoteScrubSeekAt = 0;
  let lastScrubSeekAt = 0;
  let lastScrubBroadcastAt = 0;
  let controlLeaseTimer = null;
  let isControlLeader = false;
  let memoryControlLease = null;
  let playbackFrameId = null;
  let playbackFrameKind = '';
  let lastPlaybackUiPaint = 0;
  let lastScreenWakeAt = 0;
  let isFileLoading = false;
  let lastScreenProgressSentAt = 0;
  let lastScreenProgressAt = 0;
  let lastScreenRecoveryAt = 0;

  const CLIENT_ID = `${mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const ACTIVE_CONTROL_KEY = `${CHANNEL}:active-control`;
  const DIRECT_DUPLICATE_MS = 2500;
  const CONTROL_LEASE_MS = 3500;
  const CONTROL_LEASE_REFRESH_MS = 1000;
  const HEARTBEAT_INTERVAL_MS = 900;
  const HEARTBEAT_SEEK_MS = 1400;
  const HEARTBEAT_DRIFT = 0.9;
  const PLAY_DRIFT = 0.45;
  const SCRUB_SEEK_MS = 45;
  const SCRUB_BROADCAST_MS = 60;
  const REMOTE_SCRUB_SEEK_MS = 45;
  const PLAYBACK_UI_INTERVAL_MS = 40;
  const SCREEN_WAKE_COOLDOWN_MS = 2500;
  const SCREEN_PROGRESS_INTERVAL_MS = 700;
  const SCREEN_PROGRESS_STALE_MS = 2400;
  const SCREEN_RECOVERY_COOLDOWN_MS = 1400;
  const LIVE_SEEK_REASONS = new Set(['seek', 'scrub-preview', 'scrub-final', 'file', 'metadata', 'play', 'pause']);
  const CLAIM_BROADCAST_REASONS = new Set([
    'file', 'play', 'pause', 'seek', 'scrub-preview', 'scrub-final',
    'speed', 'zoom', 'pan', 'resetZoom', 'setA', 'setB', 'clearLoop',
    'navigator', 'navigatorReset', 'screenAudio', 'showStatus', 'autoSync'
  ]);
  const UNSUPPORTED_VIDEO_TITLE = 'Unsupported video codec';
  const UNSUPPORTED_VIDEO_HINT = 'ไฟล์นี้ browser decode ภาพไม่ได้ ให้แปลงเป็น H.264 MP4 ก่อนใช้ใน VAR Replay';



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
    if (!bc) return false;
    try {
      bc.postMessage({ type, payload, source: mode, at: Date.now() });
      return true;
    } catch (err) {
      console.warn('Broadcast failed', type, err);
      return false;
    }
  }

  function readControlLease() {
    try {
      const saved = localStorage.getItem(ACTIVE_CONTROL_KEY);
      if (!saved) return memoryControlLease;
      memoryControlLease = JSON.parse(saved);
      return memoryControlLease;
    } catch {
      return memoryControlLease;
    }
  }

  function writeControlLease() {
    if (mode !== 'control') return false;
    const lease = { id: CLIENT_ID, at: Date.now() };
    memoryControlLease = lease;
    try {
      localStorage.setItem(ACTIVE_CONTROL_KEY, JSON.stringify(lease));
      isControlLeader = true;
      return true;
    } catch {
      isControlLeader = true;
      return true;
    }
  }

  function leaseIsFresh(lease, now = Date.now()) {
    return Boolean(lease?.id && Number.isFinite(Number(lease.at)) && now - Number(lease.at) < CONTROL_LEASE_MS);
  }

  function hasControlLease() {
    if (mode !== 'control') return false;
    const lease = readControlLease();
    isControlLeader = Boolean(lease?.id === CLIENT_ID && leaseIsFresh(lease));
    return isControlLeader;
  }

  function claimControl() {
    if (mode !== 'control') return false;
    return writeControlLease();
  }

  function canBroadcast(reason = '') {
    if (mode !== 'control') return false;
    if (CLAIM_BROADCAST_REASONS.has(reason) && !hasControlLease()) claimControl();
    return hasControlLease();
  }

  function setupControlLeadership() {
    if (mode !== 'control') return;
    const lease = readControlLease();
    if (!leaseIsFresh(lease)) claimControl();

    window.addEventListener('storage', (event) => {
      if (event.key !== ACTIVE_CONTROL_KEY) return;
      const lease = readControlLease();
      isControlLeader = Boolean(lease?.id === CLIENT_ID && leaseIsFresh(lease));
    });

    document.addEventListener('pointerdown', () => claimControl(), { capture: true });
    document.addEventListener('keydown', () => claimControl(), { capture: true });

    clearInterval(controlLeaseTimer);
    controlLeaseTimer = setInterval(() => {
      if (hasControlLease()) writeControlLease();
    }, CONTROL_LEASE_REFRESH_MS);

    window.addEventListener('beforeunload', () => {
      const lease = readControlLease();
      if (lease?.id === CLIENT_ID) {
        try { localStorage.removeItem(ACTIVE_CONTROL_KEY); } catch {}
        memoryControlLease = null;
      }
    });
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

  function screenSourceText() {
    return [
      'Source Name: Peps VAR Screen',
      'Type: Browser Source',
      `URL: ${screenUrl()}`,
      'Width: 1920',
      'Height: 1080',
      'OBS: Keep source active when hidden = ON'
    ].join('\n');
  }

  function controlSourceText() {
    return [
      'Dock Name: Peps VAR Control',
      'Type: Custom Browser Dock',
      `URL: ${controlUrl()}`,
      'Recommended Width: 420-520',
      'Recommended Height: 900',
      'Use this dock to load clips and control replay'
    ].join('\n');
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

  async function saveClip(file, updatedAt = Date.now()) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put({
        id: CLIP_ID,
        blob: file,
        name: file.name || 'replay-video',
        type: file.type || 'video/mp4',
        updatedAt
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

  function setDropState(kind, title, subtitle) {
    if (!els.dropZone) return;
    els.dropZone.classList.toggle('loading', kind === 'loading');
    els.dropZone.classList.toggle('ready', kind === 'ready');
    if (els.dropTitle) els.dropTitle.textContent = title;
    if (els.dropText) els.dropText.textContent = subtitle;
  }

  function clipVersion(meta = {}) {
    return Number(meta.updatedAt) || Date.now();
  }

  function videoHasSource(target = video) {
    return Boolean(target && (target.currentSrc || target.src));
  }

  function wakeScreenVideo({ force = false, allowReload = false } = {}) {
    if (mode !== 'screen' || !video || !state.hasClip || !videoHasSource(video)) return;
    const now = Date.now();
    if (!force && now - lastScreenWakeAt < SCREEN_WAKE_COOLDOWN_MS) return;
    if (!force && document.hidden) return;
    lastScreenWakeAt = now;
    if (allowReload && (video.readyState || 0) < 1 && (video.networkState || 0) === 0) {
      try { video.load(); } catch {}
    }
    if (Number.isFinite(state.currentTime) && state.currentTime > 0) {
      seekVideoTo(video, state.currentTime, { minDelta: 0.08 });
    }
    video.playbackRate = state.speed;
    video.muted = !state.screenAudio;
    if (state.isPlaying) video.play().catch(() => setStatus('Click Screen once to allow playback'));
  }

  function hasLoadedClip(version) {
    return Boolean(version && loadedClipVersion === version && state.hasClip && videoHasSource(video) && (video?.readyState || 0) >= 1);
  }

  function isLoadingClip(version) {
    return Boolean(version && loadingClipVersion === version);
  }

  function shouldLoadClip(version) {
    return Boolean(version && !hasLoadedClip(version) && !isLoadingClip(version));
  }

  function unsupportedVideoError(meta = {}) {
    const err = new Error(`${UNSUPPORTED_VIDEO_TITLE}: ${meta.name || 'selected video'}`);
    err.code = 'UNSUPPORTED_VIDEO_CODEC';
    return err;
  }

  function isUnsupportedVideoError(err) {
    return err?.code === 'UNSUPPORTED_VIDEO_CODEC';
  }

  function showUnsupportedVideo(meta = {}) {
    const name = meta.name || state.clipName || 'video';
    setStatus(`${UNSUPPORTED_VIDEO_TITLE}: convert ${name} to H.264 MP4`);
    if (mode === 'control') {
      setDropState('ready', UNSUPPORTED_VIDEO_TITLE, UNSUPPORTED_VIDEO_HINT);
    }
  }

  function waitForVideoReady(target) {
    return new Promise((resolve, reject) => {
      if (!target) {
        reject(new Error('Video element missing'));
        return;
      }
      if (target.readyState >= 1 && Number.isFinite(target.duration)) {
        resolve();
        return;
      }
      const cleanup = () => {
        target.removeEventListener('loadedmetadata', onReady);
        target.removeEventListener('canplay', onReady);
        target.removeEventListener('error', onError);
        clearTimeout(timer);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(target.error || new Error('Video load failed'));
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, 5000);
      target.addEventListener('loadedmetadata', onReady, { once: true });
      target.addEventListener('canplay', onReady, { once: true });
      target.addEventListener('error', onError, { once: true });
    });
  }

  async function prepareVideoSource(target, url) {
    target.preload = 'auto';
    target.muted = mode === 'screen' ? !state.screenAudio : true;
    target.playbackRate = state.speed;
    target.src = url;
    target.load();
    await waitForVideoReady(target);
  }

  async function assertVideoFrameDecodable(target, meta = {}) {
    if (!target) throw unsupportedVideoError(meta);
    if (target.videoWidth > 0 && target.videoHeight > 0) return;
    await new Promise((resolve) => {
      const done = () => {
        target.removeEventListener('loadeddata', done);
        target.removeEventListener('canplay', done);
        target.removeEventListener('resize', done);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 2200);
      target.addEventListener('loadeddata', done, { once: true });
      target.addEventListener('canplay', done, { once: true });
      target.addEventListener('resize', done, { once: true });
    });
    if (target.videoWidth > 0 && target.videoHeight > 0) return;
    throw unsupportedVideoError(meta);
  }

  async function validateReplacementBlob(blob, meta = {}) {
    if (!blob || mode !== 'control' || !state.hasClip) return;
    const probe = document.createElement('video');
    const probeUrl = URL.createObjectURL(blob);
    probe.muted = true;
    probe.playsInline = true;
    probe.preload = 'auto';
    probe.className = 'validation-video-engine';
    document.body.appendChild(probe);
    try {
      await prepareVideoSource(probe, probeUrl);
      await assertVideoFrameDecodable(probe, meta);
    } catch (err) {
      if (isUnsupportedVideoError(err)) throw err;
      const codecError = unsupportedVideoError(meta);
      codecError.cause = err;
      throw codecError;
    } finally {
      probe.pause();
      probe.removeAttribute('src');
      try { probe.load(); } catch {}
      probe.remove();
      URL.revokeObjectURL(probeUrl);
    }
  }

  function resetInactiveScreenBuffer(target) {
    if (!target) return;
    target.pause();
    target.removeAttribute('src');
    target.load();
  }

  async function loadBlob(blob, meta = {}) {
    if (!blob || !video) return;
    const nextVersion = clipVersion(meta);
    if (hasLoadedClip(nextVersion)) {
      setStatus(mode === 'screen' ? 'Clip already loaded on Screen' : state.clipName || meta.name || 'READY');
      return;
    }
    const token = Symbol('clip-load');
    loadingClip = token;
    loadingClipVersion = nextVersion;
    const nextUrl = URL.createObjectURL(blob);
    const previousUrl = objectUrl;
    const nextTime = Number.isFinite(state.currentTime) ? state.currentTime : 0;
    const targetVideo = mode === 'screen' && screenBuffers.length > 1
      ? screenBuffers[activeScreenBuffer === 0 ? 1 : 0]
      : video;
    pendingSeek = nextTime;

    try {
      await prepareVideoSource(targetVideo, nextUrl);
      if (mode === 'control') await assertVideoFrameDecodable(targetVideo, meta);
    } catch (err) {
      if (loadingClip === token) loadingClip = null;
      if (loadingClipVersion === nextVersion) loadingClipVersion = 0;
      pendingSeek = null;
      if (targetVideo.src === nextUrl) resetInactiveScreenBuffer(targetVideo);
      URL.revokeObjectURL(nextUrl);
      if (isUnsupportedVideoError(err)) showUnsupportedVideo(meta);
      throw err;
    }

    if (loadingClip !== token) {
      if (loadingClipVersion === nextVersion) loadingClipVersion = 0;
      if (targetVideo.src === nextUrl) resetInactiveScreenBuffer(targetVideo);
      URL.revokeObjectURL(nextUrl);
      return;
    }

    objectUrl = nextUrl;
    state.hasClip = true;
    state.clipName = meta.name || 'replay-video';
    state.clipVersion = nextVersion;
    loadedClipVersion = nextVersion;
    state.duration = Number.isFinite(targetVideo.duration) ? targetVideo.duration : state.duration;
    state.currentTime = clamp(nextTime, 0, state.duration || nextTime);

    if (mode === 'screen' && screenBuffers.length > 1) {
      const previousVideo = video;
      video = targetVideo;
      activeScreenBuffer = screenBuffers.indexOf(targetVideo);
      video.currentTime = state.currentTime;
      video.playbackRate = state.speed;
      video.muted = !state.screenAudio;
      applyTransform();
      renderScreenOptions();
      targetVideo.classList.add('active');
      previousVideo?.classList.remove('active');
      if (state.isPlaying) {
        video.play().catch(() => setStatus('Click Screen once to allow playback'));
      } else {
        video.pause();
      }
      setTimeout(() => {
        if (previousVideo && previousVideo !== video && !previousVideo.classList.contains('active')) {
          resetInactiveScreenBuffer(previousVideo);
        }
        if (previousUrl && previousUrl !== objectUrl) URL.revokeObjectURL(previousUrl);
      }, 120);
    } else {
      video = targetVideo;
      video.currentTime = state.currentTime;
      video.playbackRate = state.speed;
      video.muted = mode === 'screen' ? !state.screenAudio : true;
      if (previousUrl && previousUrl !== objectUrl) URL.revokeObjectURL(previousUrl);
    }

    pendingSeek = null;
    setStatus(mode === 'screen' ? 'Clip loaded on Screen' : state.clipName);
    if (mode === 'control') setDropState('ready', state.clipName, 'คลิกหรือลากไฟล์ใหม่เพื่อเปลี่ยนคลิป');
    loadingClip = null;
    if (loadingClipVersion === nextVersion) loadingClipVersion = 0;
    wakeScreenVideo({ force: true });
    render();
  }

  async function loadSaved(expectedVersion = 0) {
    try {
      const row = await getSavedClip();
      const rowVersion = Number(row?.updatedAt) || 0;
      if (expectedVersion && rowVersion && rowVersion !== expectedVersion) {
        return;
      }
      if (row?.blob) {
        if (hasLoadedClip(rowVersion)) return;
        await loadBlob(row.blob, row);
      }
      else setStatus(mode === 'screen' ? 'Waiting for Control…' : 'READY');
    } catch (err) {
      console.warn(err);
      if (isUnsupportedVideoError(err)) showUnsupportedVideo();
      else setStatus('IndexedDB blocked');
    }
  }

  async function handleFile(file) {
    claimControl();
    if (!file || !file.type.startsWith('video/')) {
      alert('กรุณาเลือกไฟล์วิดีโอเท่านั้น');
      return;
    }
    const previousState = { ...state };
    const hadClip = state.hasClip && videoHasSource(video);
    isFileLoading = true;
    renderButtons();
    setDropState('loading', 'Loading...', 'กำลังเตรียมคลิปสำหรับ Replay');
    const updatedAt = Date.now();
    try {
      await validateReplacementBlob(file, { name: file.name, type: file.type, updatedAt });
      state.hasClip = false;
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
      await loadBlob(file, { name: file.name, type: file.type, updatedAt });
      await saveClip(file, updatedAt);
      post('clip:blob', { blob: file, meta: { name: file.name, type: file.type, updatedAt: state.clipVersion } });
      post('clip:update', { version: state.clipVersion, name: state.clipName });
      broadcast('file');
      render();
    } catch (err) {
      console.warn(err);
      if (hadClip && videoHasSource(video)) {
        Object.assign(state, previousState);
        setStatus(isUnsupportedVideoError(err) ? 'NEW CLIP UNSUPPORTED · CURRENT CLIP KEPT' : 'NEW CLIP FAILED · CURRENT CLIP KEPT');
        setDropState('ready', previousState.clipName, 'คลิปเดิมยังพร้อมใช้งาน');
      } else if (isUnsupportedVideoError(err)) {
        state.hasClip = false;
        state.isPlaying = false;
        state.duration = 0;
        state.currentTime = 0;
        showUnsupportedVideo({ name: file.name });
      } else {
        state.hasClip = false;
        state.isPlaying = false;
        state.duration = 0;
        state.currentTime = 0;
        setStatus('VIDEO LOAD FAILED');
        setDropState('ready', 'Video load failed', 'ลองเลือกไฟล์ใหม่อีกครั้ง');
      }
      render();
    } finally {
      isFileLoading = false;
      renderButtons();
    }
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
    return clamp(((time - start) / Math.max(0.001, width)) * 100, 0, 100);
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

  function seekVideoTo(target, time, options = {}) {
    if (!target || !Number.isFinite(time)) return false;
    const duration = state.duration || target.duration || time || 0;
    const next = clamp(Number(time) || 0, 0, duration || 0);
    const minDelta = Number.isFinite(options.minDelta) ? options.minDelta : 0.006;
    if (Math.abs((target.currentTime || 0) - next) < minDelta) return false;
    try {
      if (options.fast && typeof target.fastSeek === 'function') target.fastSeek(next);
      else target.currentTime = next;
      return true;
    } catch {
      pendingSeek = next;
      return false;
    }
  }

  function setCurrentTime(time, shouldBroadcast = true, reason = 'seek', options = {}) {
    if (!video || !state.hasClip) return;
    const duration = state.duration || video.duration || 0;
    const next = clamp(Number(time) || 0, 0, duration || 0);
    suppress = true;
    seekVideoTo(video, next, {
      fast: Boolean(options.fast),
      minDelta: Number.isFinite(options.minDelta) ? options.minDelta : 0.006
    });
    suppress = false;
    state.currentTime = next;
    renderTimeline();
    if (shouldBroadcast) broadcast(reason);
  }

  function flushScrubPreview(force = false) {
    scrubFrame = null;
    if (pendingScrubTime === null) return;
    const next = pendingScrubTime;
    pendingScrubTime = null;
    const now = performance.now();
    const shouldSeek = force || now - lastScrubSeekAt >= SCRUB_SEEK_MS;
    const shouldBroadcast = force || now - lastScrubBroadcastAt >= SCRUB_BROADCAST_MS;
    if (shouldSeek) {
      seekVideoTo(video, next, { minDelta: 0.004 });
      lastScrubSeekAt = now;
    }
    state.currentTime = next;
    renderTimeline();
    if (shouldBroadcast) {
      lastScrubBroadcastAt = now;
      broadcast('scrub-preview');
    }
  }

  function scheduleScrubTime(time) {
    pendingScrubTime = time;
    state.currentTime = time;
    renderTimeline();
    if (scrubFrame) return;
    scrubFrame = requestAnimationFrame(() => flushScrubPreview(false));
  }

  function beginScrubSession() {
    timelineWasPlaying = state.isPlaying;
    lastScrubSeekAt = 0;
    lastScrubBroadcastAt = 0;
    if (timelineWasPlaying) pause();
  }

  function finishScrubSession() {
    const finalTime = pendingScrubTime ?? state.currentTime;
    if (scrubFrame) {
      cancelAnimationFrame(scrubFrame);
      scrubFrame = null;
    }
    pendingScrubTime = null;
    setCurrentTime(finalTime, true, 'scrub-final', { minDelta: 0 });
    if (timelineWasPlaying) play();
    timelineWasPlaying = false;
  }

  function syncPlaybackPosition(target = video) {
    if (!target || target !== video || suppress) return;
    state.currentTime = target.currentTime || 0;
    if (loopActive() && state.currentTime >= state.loopB - 0.012) {
      seekVideoTo(target, state.loopA, { minDelta: 0 });
      state.currentTime = state.loopA;
      if (state.isPlaying) target.play().catch(() => {});
    }
    renderTimeline();
  }

  function publishScreenProgress(force = false) {
    if (mode !== 'screen' || !video || !state.hasClip) return;
    const now = Date.now();
    if (!force && now - lastScreenProgressSentAt < SCREEN_PROGRESS_INTERVAL_MS) return;
    lastScreenProgressSentAt = now;
    post('screen:progress', {
      clipVersion: state.clipVersion,
      currentTime: video.currentTime || state.currentTime || 0,
      duration: video.duration || state.duration || 0,
      isPlaying: !video.paused && !video.ended,
      playIntent: state.isPlaying,
      speed: video.playbackRate || state.speed
    });
  }

  function applyScreenProgress(payload = {}) {
    if (mode !== 'control' || !state.hasClip) return;
    if (payload.clipVersion && state.clipVersion && Number(payload.clipVersion) !== Number(state.clipVersion)) return;
    const now = Date.now();
    lastScreenProgressAt = now;
    if (isFileLoading || dragKind || pendingScrubTime !== null) return;
    state.currentTime = clamp(Number(payload.currentTime) || 0, 0, state.duration || Number(payload.duration) || 0);
    state.duration = Number(payload.duration) || state.duration;
    state.isPlaying = Boolean(payload.playIntent ?? payload.isPlaying);
    if (payload.playIntent && !payload.isPlaying && now - lastScreenRecoveryAt >= SCREEN_RECOVERY_COOLDOWN_MS) {
      lastScreenRecoveryAt = now;
      broadcast('screen-recover');
    }
    if (video && !document.hidden) {
      video.playbackRate = Number(payload.speed) || state.speed;
      if (Math.abs((video.currentTime || 0) - state.currentTime) > 0.22) {
        seekVideoTo(video, state.currentTime, { minDelta: 0 });
      }
      if (state.isPlaying && video.paused) {
        video.play().catch(() => {});
      } else if (!state.isPlaying && !video.paused) {
        video.pause();
      }
    }
    renderTimeline();
    renderButtons();
  }

  function stopPlaybackUiTicker() {
    if (playbackFrameId === null) return;
    if (playbackFrameKind === 'video' && typeof video?.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(playbackFrameId);
    } else {
      cancelAnimationFrame(playbackFrameId);
    }
    playbackFrameId = null;
    playbackFrameKind = '';
  }

  function schedulePlaybackUiTicker() {
    if (mode !== 'control' || playbackFrameId !== null || !video || video.paused || !state.hasClip) return;
    if (typeof video.requestVideoFrameCallback === 'function') {
      playbackFrameKind = 'video';
      playbackFrameId = video.requestVideoFrameCallback(playbackUiTick);
    } else {
      playbackFrameKind = 'animation';
      playbackFrameId = requestAnimationFrame(playbackUiTick);
    }
  }

  function playbackUiTick(now) {
    playbackFrameId = null;
    playbackFrameKind = '';
    if (mode !== 'control' || !video || video.paused || !state.hasClip) return;
    if (now - lastPlaybackUiPaint >= PLAYBACK_UI_INTERVAL_MS) {
      lastPlaybackUiPaint = now;
      syncPlaybackPosition(video);
    }
    schedulePlaybackUiTicker();
  }

  async function play() {
    if (!state.hasClip || !video) return;
    video.playbackRate = state.speed;
    video.muted = mode === 'screen' ? !state.screenAudio : true;
    try {
      await video.play();
      state.isPlaying = true;
      setStatus('PLAYING');
      broadcast('play');
    } catch (err) {
      console.warn(err);
      state.isPlaying = false;
      setStatus('PLAY BLOCKED: click video/control once');
    }
    renderButtons();
  }

  function pause() {
    if (!video) return;
    video.pause();
    state.isPlaying = false;
    setStatus('PAUSED');
    broadcast('pause');
    renderButtons();
  }

  function setSpeed(value) {
    state.speed = clamp(Number(value) || 1, 0.01, 2);
    if (video) video.playbackRate = state.speed;
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
    const targets = mode === 'screen' && screenBuffers.length ? screenBuffers : [video].filter(Boolean);
    const zoom = clamp(Number(state.zoom) || 1, 1, 10);
    const maxX = (zoom - 1) * 50;
    const maxY = (zoom - 1) * 50;
    const translateX = -(clamp(state.panXPct, -100, 100) / 100) * maxX;
    const translateY = -(clamp(state.panYPct, -100, 100) / 100) * maxY;
    targets.forEach((target) => {
      target.style.transformOrigin = 'center center';
      target.style.transform = `translate(${translateX}%, ${translateY}%) scale(${zoom})`;
    });
  }

  function setA(time = state.currentTime, shouldBroadcast = true) {
    const t = clamp(Number(time) || 0, 0, state.duration || 0);
    state.loopA = t;
    if (state.loopB !== null && state.loopB <= state.loopA) state.loopB = Math.min(state.duration || t, t + 0.1);
    if (shouldBroadcast) broadcast('setA');
    renderLoop();
  }

  function setB(time = state.currentTime, shouldBroadcast = true) {
    const t = clamp(Number(time) || 0, 0, state.duration || 0);
    state.loopB = t;
    if (state.loopA !== null && state.loopA >= state.loopB) state.loopA = Math.max(0, t - 0.1);
    if (shouldBroadcast) broadcast('setB');
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
    if (!canBroadcast(reason)) return;
    post('state', { ...state, reason });
  }

  async function applyIncoming(next = {}) {
    const prevVersion = state.clipVersion;
    Object.assign(state, next);
    state.speed = clamp(Number(state.speed) || 1, 0.01, 2);
    state.zoom = clamp(Number(state.zoom) || 1, 1, 10);
    state.viewStart = clamp(Number(state.viewStart) || 0, 0, 0.99);
    state.viewWidth = clamp(Number(state.viewWidth) || 1, 0.01, 1);

    if (mode === 'screen' && state.clipVersion && state.clipVersion !== prevVersion) {
      const isDirectDuplicate = state.clipVersion === lastDirectBlobVersion && Date.now() - lastDirectBlobAt < DIRECT_DUPLICATE_MS;
      if (!isDirectDuplicate && shouldLoadClip(state.clipVersion)) await loadSaved(state.clipVersion);
    }

    if (video) {
      video.playbackRate = state.speed;
      video.muted = !state.screenAudio;
      const drift = Math.abs((video.currentTime || 0) - state.currentTime);
      const now = Date.now();
      const reason = next.reason || '';
      if (reason === 'play' || reason === 'screen-ready' || reason === 'file') {
        wakeScreenVideo({ allowReload: true });
      }
      const isScrubPreview = reason === 'scrub-preview';
      const isLiveSeek = LIVE_SEEK_REASONS.has(reason);
      const driftLimit = reason === 'heartbeat' ? HEARTBEAT_DRIFT : PLAY_DRIFT;
      const heartbeatReady = reason !== 'heartbeat' || now - lastRemoteSeekAt > HEARTBEAT_SEEK_MS;
      const scrubReady = !isScrubPreview || now - lastRemoteScrubSeekAt > REMOTE_SCRUB_SEEK_MS;
      const shouldSeek = state.hasClip && Number.isFinite(state.currentTime) && (
        (isScrubPreview && scrubReady && drift > 0.012) ||
        (!isScrubPreview && isLiveSeek && drift > 0.006) ||
        (!isScrubPreview && !isLiveSeek && drift > driftLimit && heartbeatReady)
      );
      if (shouldSeek) {
        const ok = seekVideoTo(video, state.currentTime, {
          minDelta: isScrubPreview ? 0.012 : 0
        });
        if (ok) {
          lastRemoteSeekAt = now;
          if (isScrubPreview) lastRemoteScrubSeekAt = now;
        }
      }
      if (state.isPlaying && video.paused) {
        video.play().catch(() => setStatus('Click Screen once to allow playback'));
      }
      if (!state.isPlaying && !video.paused) video.pause();
    }
    if (next.reason === 'heartbeat' || next.reason === 'scrub-preview') return;
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
    els.zoomPresetButtons.forEach((button) => {
      const preset = Number(button.dataset.zoomPreset);
      button.classList.toggle('active', Math.abs(state.zoom - preset) < 0.05);
    });
  }

  function renderButtons() {
    if (els.btnPlay) els.btnPlay.disabled = isFileLoading || state.isPlaying || !state.hasClip;
    if (els.btnPause) els.btnPause.disabled = isFileLoading || !state.isPlaying || !state.hasClip;
    [
      els.btnSetA, els.btnSetB, els.btnClearLoop, els.btnJumpA, els.btnJumpB,
      els.btnBack1, els.btnForward1, els.btnResetZoom
    ].forEach((button) => {
      if (button) button.disabled = isFileLoading || !state.hasClip;
    });
  }

  function renderScreenOptions() {
    if (els.screenAudio) els.screenAudio.checked = state.screenAudio;
    if (els.showStatus) els.showStatus.checked = state.showStatus;
    if (els.autoSync) els.autoSync.checked = state.autoSync;
    const targets = mode === 'screen' && screenBuffers.length ? screenBuffers : [video].filter(Boolean);
    targets.forEach((target) => {
      target.muted = mode === 'screen' ? !state.screenAudio : true;
    });
    if (els.videoWrapper) {
      els.videoWrapper.classList.toggle('ready', state.hasClip && mode === 'screen' && !state.showStatus);
      els.videoWrapper.classList.toggle('hide-status', !state.showStatus);
    }
  }

  function renderLinks() {
    if (els.linkInputScreen) els.linkInputScreen.value = screenUrl();
    if (els.linkInputControl) els.linkInputControl.value = controlUrl();
    if (els.sourceInputScreen) els.sourceInputScreen.value = screenSourceText();
    if (els.sourceInputControl) els.sourceInputControl.value = controlSourceText();
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
    els.fileInput?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      handleFile(file);
    });
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
    els.btnSetA?.addEventListener('click', () => setA(video?.currentTime || state.currentTime));
    els.btnSetB?.addEventListener('click', () => setB(video?.currentTime || state.currentTime));
    els.btnClearLoop?.addEventListener('click', clearLoop);
    els.btnJumpA?.addEventListener('click', () => state.loopA !== null && setCurrentTime(state.loopA));
    els.btnJumpB?.addEventListener('click', () => state.loopB !== null && setCurrentTime(state.loopB));
    els.btnBack1?.addEventListener('click', () => setCurrentTime(state.currentTime - 1));
    els.btnForward1?.addEventListener('click', () => setCurrentTime(state.currentTime + 1));
    els.speedRange?.addEventListener('input', () => setSpeed(els.speedRange.value));
    els.zoomRange?.addEventListener('input', () => setZoom(els.zoomRange.value));
    els.zoomPresetButtons.forEach((button) => {
      button.addEventListener('click', () => setZoom(button.dataset.zoomPreset));
    });
    els.btnResetZoom?.addEventListener('click', resetZoom);
    document.addEventListener('peps:replay-mode-change', (event) => {
      if (event.detail?.mode === 'highlight' && state.isPlaying) pause();
    });

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
    els.modalLinks?.addEventListener('click', (event) => event.target === els.modalLinks && closeModal(els.modalLinks));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && els.modalLinks?.classList.contains('open')) closeModal(els.modalLinks);
    });
    els.btnCopyScreen?.addEventListener('click', () => copyValue(els.linkInputScreen));
    els.btnCopyControl?.addEventListener('click', () => copyValue(els.linkInputControl));
    els.btnCopyScreenSource?.addEventListener('click', () => copyValue(els.sourceInputScreen));
    els.btnCopyControlSource?.addEventListener('click', () => copyValue(els.sourceInputControl));

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
      if (kind === 'scrub') beginScrubSession();
      if (kind === 'A' || kind === 'B') {
        beginScrubSession();
        if (kind === 'A') els.markA?.classList.add('dragging');
        if (kind === 'B') els.markB?.classList.add('dragging');
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      move(event);
    }

    function move(event) {
      if (!dragKind || !els.timelineBox) return;
      const pct = pointerPct(event, els.timelineBox);
      const time = timeFromTimelinePct(pct);
      if (dragKind === 'scrub') scheduleScrubTime(time);
      if (dragKind === 'A') {
        setA(time, false);
        scheduleScrubTime(time);
      }
      if (dragKind === 'B') {
        setB(time, false);
        scheduleScrubTime(time);
      }
    }

    function end() {
      const finishedKind = dragKind;
      els.markA?.classList.remove('dragging');
      els.markB?.classList.remove('dragging');
      dragKind = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (finishedKind === 'scrub' || finishedKind === 'A' || finishedKind === 'B') finishScrubSession();
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
      window.addEventListener('pointercancel', end);
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
      window.removeEventListener('pointercancel', end);
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

  function setupZoomGestures() {
    if (!els.panFrame) return;
    els.panFrame.addEventListener('wheel', (event) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const step = event.shiftKey ? 0.5 : 0.25;
      setZoom(state.zoom + direction * step);
    }, { passive: false });
    els.panFrame.addEventListener('dblclick', (event) => {
      event.preventDefault();
      resetZoom();
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
      window.addEventListener('pointercancel', end);
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
      window.removeEventListener('pointercancel', end);
    }

    els.panFrame.addEventListener('pointerdown', begin);
    setupZoomGestures();
  }

  function setupKeyboard() {
    document.addEventListener('keydown', (event) => {
      if (mode !== 'control') return;
      if (document.body.dataset.replayMode !== 'var') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        state.isPlaying ? pause() : play();
      }
      if (event.key.toLowerCase() === 'a') setA(video?.currentTime || state.currentTime);
      if (event.key.toLowerCase() === 'b') setB(video?.currentTime || state.currentTime);
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

  function setupVideoEvents(target = video) {
    if (!target) return;
    target.addEventListener('loadedmetadata', () => {
      if (target !== video) return;
      state.duration = target.duration || 0;
      if (pendingSeek !== null) {
        try { target.currentTime = clamp(pendingSeek, 0, state.duration || pendingSeek); } catch {}
        pendingSeek = null;
      }
      state.currentTime = target.currentTime || 0;
      state.hasClip = true;
      target.playbackRate = state.speed;
      render();
      broadcast('metadata');
    });
    target.addEventListener('timeupdate', () => {
      if (target !== video) return;
      syncPlaybackPosition(target);
      publishScreenProgress();
    });
    target.addEventListener('play', () => {
      if (target !== video) return;
      state.isPlaying = true;
      renderButtons();
      schedulePlaybackUiTicker();
      publishScreenProgress(true);
    });
    target.addEventListener('pause', () => {
      if (target !== video) return;
      const preservePlayIntent = document.hidden && state.isPlaying && !target.ended;
      if (!preservePlayIntent) state.isPlaying = false;
      renderButtons();
      stopPlaybackUiTicker();
      publishScreenProgress(true);
    });
    target.addEventListener('error', () => {
      if (target !== video) return;
      const err = target.error;
      setStatus(err ? `VIDEO ERROR ${err.code}` : 'VIDEO ERROR');
      console.warn('Video error', err);
    });
  }

  let lastDirectBlobVersion = 0;
  let lastDirectBlobAt = 0;

  function setupBroadcast() {
    if (!bc) return;
    bc.addEventListener('message', async (event) => {
      const msg = event.data || {};
      if (!msg.type || msg.source === mode) return;
      if (mode === 'screen' && msg.type === 'clip:blob' && msg.payload?.blob) {
        lastDirectBlobVersion = msg.payload.meta?.updatedAt || 0;
        lastDirectBlobAt = Date.now();
        try {
          await loadBlob(msg.payload.blob, msg.payload.meta || {});
        } catch (err) {
          console.warn(err);
          lastDirectBlobVersion = 0;
          lastDirectBlobAt = 0;
          await loadSaved(msg.payload.meta?.updatedAt || 0);
        }
      }
      if (mode === 'screen' && msg.type === 'state') await applyIncoming(msg.payload);
      if (mode === 'screen' && msg.type === 'clip:update') {
        const version = msg.payload?.version || 0;
        const isSameClip = version && version === lastDirectBlobVersion;
        const isImmediateDuplicate = Date.now() - lastDirectBlobAt < DIRECT_DUPLICATE_MS;
        if (shouldLoadClip(version) && !(isSameClip && isImmediateDuplicate)) {
          await loadSaved(version);
        }
      }
      if (mode === 'control' && msg.type === 'screen:progress') applyScreenProgress(msg.payload || {});
      if (mode === 'control' && msg.type === 'screen:ready') broadcast('screen-ready');
    });
  }

  function setupSyncTimer() {
    if (mode !== 'control') return;
    clearInterval(syncTimer);
    syncTimer = setInterval(() => {
      if (!state.autoSync || !state.hasClip || !video || !hasControlLease()) return;
      if (Date.now() - lastScreenProgressAt < SCREEN_PROGRESS_STALE_MS) return;
      if (video.paused) {
        if (!state.isPlaying || document.hidden) return;
        video.play().catch(() => {});
        return;
      }
      state.currentTime = video.currentTime || 0;
      state.duration = video.duration || state.duration;
      state.isPlaying = !video.paused;
      broadcast('heartbeat');
    }, HEARTBEAT_INTERVAL_MS);
  }

  async function init() {
    const videoTargets = mode === 'screen' && screenBuffers.length ? screenBuffers : [video].filter(Boolean);
    videoTargets.forEach((target) => setupVideoEvents(target));
    setupControlLeadership();
    setupBroadcast();
    setupControl();
    render();
    await loadSaved();
    setupSyncTimer();
    if (mode === 'screen') {
      post('screen:ready', { ready: true });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) wakeScreenVideo({ force: true, allowReload: true });
      });
      window.addEventListener('pageshow', () => wakeScreenVideo({ force: true, allowReload: true }));
      window.addEventListener('focus', () => wakeScreenVideo({ force: true, allowReload: true }));
      document.addEventListener('click', () => {
        if (state.isPlaying && video?.paused) video.play().catch(() => {});
      }, { once: true });
    }
  }

  init();
})();
