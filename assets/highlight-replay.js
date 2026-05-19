(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const CHANNEL = 'peps-var-replay-studio-v1-1';
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
  const params = new URLSearchParams(location.search);
  const pageMode = params.get('mode') || 'control';
  const isHighlightScreen = pageMode === 'highlight-screen';
  const isVarScreen = pageMode === 'screen';
  const isScreen = isHighlightScreen;
  const isControl = !isHighlightScreen && !isVarScreen;

  if (isHighlightScreen) {
    document.body.classList.remove('is-control');
    document.body.classList.add('is-screen', 'is-highlight-screen');
    document.body.dataset.replayMode = 'highlight-source';
  }

  const els = {
    tabVar: $('#tabVarReplay'),
    tabHighlight: $('#tabHighlightReplay'),
    fileInput: $('#highlightFileInput'),
    dropZone: $('#highlightDropZone'),
    video: $('#highlightVideo'),
    screenVideo: $('#mainVideo'),
    videoWrapper: $('#videoWrapper'),
    screenStatus: $('#screenStatus'),
    play: $('#highlightPlay'),
    pause: $('#highlightPause'),
    restart: $('#highlightRestart'),
    prev: $('#highlightPrev'),
    next: $('#highlightNext'),
    clear: $('#highlightClear'),
    sequential: $('#highlightSequential'),
    random: $('#highlightRandom'),
    loop: $('#highlightLoop'),
    speedRange: $('#highlightSpeedRange'),
    speedLabel: $('#highlightSpeedLabel'),
    playlist: $('#highlightPlaylist'),
    now: $('#highlightNowPlaying'),
    count: $('#highlightClipCount'),
    nextName: $('#highlightNextClip')
  };

  const state = {
    mode: 'var',
    clips: [],
    currentIndex: -1,
    orderMode: 'sequential',
    loop: true,
    speed: 1,
    playing: false,
    shuffleBag: []
  };

  let objectUrl = null;
  let screenObjectUrl = null;
  let suppressAutoNext = false;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function fileMeta(file) {
    return {
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      name: file.name || 'highlight-video',
      size: file.size,
      type: file.type || 'video/mp4',
      file
    };
  }

  function niceRate(value) {
    const n = Number(value) || 1;
    if (n >= 1) return `${n.toFixed(1)}x`;
    return `${n.toFixed(2)}x`;
  }

  function post(type, payload = {}) {
    if (!bc) return;
    bc.postMessage({
      type,
      payload,
      source: isHighlightScreen ? 'highlight-screen' : 'highlight-control',
      at: Date.now()
    });
  }

  function highlightSourceUrl() {
    const url = new URL(location.href);
    url.pathname = url.pathname.replace(/VAR_Replay_V1\.0\.html$/i, 'index.html');
    url.searchParams.set('mode', 'highlight-screen');
    return url.toString();
  }

  function injectHighlightSourceLink() {
    if (!isControl || $('#linkInputHighlight')) return;
    const modal = $('#modalLinks .modal');
    if (!modal) return;

    const block = document.createElement('div');
    block.className = 'highlight-source-link-block';
    block.innerHTML = `
      <hr />
      <p>Highlight Source Link สำหรับ OBS Browser Source แยกจาก VAR</p>
      <div class="copy-group">
        <input id="linkInputHighlight" class="copy-input" type="text" readonly />
        <button id="btnCopyHighlight" type="button">Copy</button>
      </div>
      <div class="highlight-source-note">ใช้ลิงก์นี้สำหรับหมวด Highlight Replay เท่านั้น</div>
    `;
    modal.appendChild(block);

    const input = $('#linkInputHighlight');
    const button = $('#btnCopyHighlight');
    if (input) input.value = highlightSourceUrl();
    button?.addEventListener('click', async () => {
      const value = input?.value || highlightSourceUrl();
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        input?.focus();
        input?.select();
        document.execCommand('copy');
      }
      const msg = $('#copyMsg');
      if (msg) {
        msg.textContent = 'Copied Highlight Source!';
        msg.classList.add('show');
        setTimeout(() => msg.classList.remove('show'), 1500);
      }
    });
  }

  function setMode(mode) {
    if (!isControl) return;
    state.mode = mode === 'highlight' ? 'highlight' : 'var';
    document.body.dataset.replayMode = state.mode;
    els.tabVar?.classList.toggle('active', state.mode === 'var');
    els.tabHighlight?.classList.toggle('active', state.mode === 'highlight');
    post('highlight:mode', { mode: state.mode });
    render();
  }

  function clearObjectUrl() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

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
      playing: autoplay
    });
    render();
    if (autoplay) play();
  }

  function buildShuffleBag() {
    state.shuffleBag = state.clips.map((_, index) => index).filter((index) => index !== state.currentIndex);
    for (let i = state.shuffleBag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.shuffleBag[i], state.shuffleBag[j]] = [state.shuffleBag[j], state.shuffleBag[i]];
    }
  }

  function getNextIndex() {
    if (!state.clips.length) return -1;
    if (state.orderMode === 'random') {
      if (!state.shuffleBag.length) buildShuffleBag();
      if (!state.shuffleBag.length) return state.currentIndex;
      return state.shuffleBag.shift();
    }
    const next = state.currentIndex + 1;
    if (next < state.clips.length) return next;
    return state.loop ? 0 : -1;
  }

  function getPrevIndex() {
    if (!state.clips.length) return -1;
    if (state.orderMode === 'random') return Math.floor(Math.random() * state.clips.length);
    const prev = state.currentIndex - 1;
    if (prev >= 0) return prev;
    return state.loop ? state.clips.length - 1 : -1;
  }

  async function play() {
    if (!els.video || state.currentIndex < 0) return;
    state.playing = true;
    els.video.playbackRate = state.speed;
    try {
      await els.video.play();
      post('highlight:play', { speed: state.speed });
    } catch (err) {
      state.playing = false;
      console.warn(err);
    }
    render();
  }

  function pause() {
    if (!els.video) return;
    state.playing = false;
    els.video.pause();
    post('highlight:pause');
    render();
  }

  function restart() {
    if (!els.video || state.currentIndex < 0) return;
    els.video.currentTime = 0;
    post('highlight:restart', { speed: state.speed });
    if (state.playing) play();
  }

  function goToIndex(index, autoplay = state.playing) {
    if (index < 0 || index >= state.clips.length) {
      state.playing = false;
      render();
      post('highlight:pause');
      return;
    }
    state.currentIndex = index;
    loadCurrent({ autoplay });
  }

  function next() {
    goToIndex(getNextIndex(), state.playing);
  }

  function prev() {
    goToIndex(getPrevIndex(), state.playing);
  }

  function setSpeed(speed) {
    state.speed = clamp(Number(speed) || 1, 0.25, 2);
    if (els.video) els.video.playbackRate = state.speed;
    post('highlight:speed', { speed: state.speed });
    render();
  }

  function setOrder(mode) {
    state.orderMode = mode === 'random' ? 'random' : 'sequential';
    state.shuffleBag = [];
    render();
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith('video/'));
    if (!files.length) return;
    const wasEmpty = state.clips.length === 0;
    state.clips.push(...files.map(fileMeta));
    if (wasEmpty) state.currentIndex = 0;
    render();
    if (wasEmpty) loadCurrent({ autoplay: false });
  }

  function clearPlaylist() {
    pause();
    clearObjectUrl();
    state.clips = [];
    state.currentIndex = -1;
    state.shuffleBag = [];
    if (els.video) els.video.removeAttribute('src');
    post('highlight:clear');
    render();
  }

  function removeClip(index) {
    if (index < 0 || index >= state.clips.length) return;
    const wasCurrent = index === state.currentIndex;
    state.clips.splice(index, 1);
    if (!state.clips.length) {
      clearPlaylist();
      return;
    }
    if (index < state.currentIndex) state.currentIndex -= 1;
    if (state.currentIndex >= state.clips.length) state.currentIndex = 0;
    state.shuffleBag = state.shuffleBag.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i));
    render();
    if (wasCurrent) loadCurrent({ autoplay: state.playing });
  }

  function nextClipName() {
    if (!state.clips.length || state.currentIndex < 0) return '-';
    if (state.orderMode === 'random') return 'สุ่มคลิปถัดไป';
    const nextIndex = state.currentIndex + 1 < state.clips.length ? state.currentIndex + 1 : (state.loop ? 0 : -1);
    return nextIndex >= 0 ? state.clips[nextIndex].name : '-';
  }

  function renderPlaylist() {
    if (!els.playlist) return;
    if (!state.clips.length) {
      els.playlist.innerHTML = '<div class="highlight-empty">ยังไม่มี Playlist — ลากคลิปหลายไฟล์เข้ามาได้เลย</div>';
      return;
    }
    els.playlist.innerHTML = state.clips.map((clip, index) => `
      <div class="highlight-playlist-item ${index === state.currentIndex ? 'active' : ''}" data-index="${index}">
        <span class="index">${index + 1}</span>
        <button class="name" type="button" data-pick-index="${index}" title="${escapeHtml(clip.name)}">${escapeHtml(clip.name)}</button>
        <button class="remove" type="button" data-remove-index="${index}">×</button>
      </div>
    `).join('');
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>'"]/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[ch]));
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
    if (els.loop) els.loop.checked = state.loop;
    document.querySelectorAll('[data-highlight-speed]').forEach((button) => {
      button.classList.toggle('active', Math.abs(Number(button.dataset.highlightSpeed) - state.speed) < 0.001);
    });
    renderPlaylist();
    const linkInput = $('#linkInputHighlight');
    if (linkInput) linkInput.value = highlightSourceUrl();
  }

  function setupControlEvents() {
    if (!isControl) return;
    injectHighlightSourceLink();
    els.tabVar?.addEventListener('click', () => setMode('var'));
    els.tabHighlight?.addEventListener('click', () => setMode('highlight'));
    els.dropZone?.addEventListener('click', () => els.fileInput?.click());
    els.dropZone?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') els.fileInput?.click();
    });
    els.fileInput?.addEventListener('change', (event) => addFiles(event.target.files));
    ['dragenter', 'dragover'].forEach((name) => els.dropZone?.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropZone.classList.add('drag-over');
    }));
    ['dragleave', 'drop'].forEach((name) => els.dropZone?.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove('drag-over');
    }));
    els.dropZone?.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
    els.play?.addEventListener('click', play);
    els.pause?.addEventListener('click', pause);
    els.restart?.addEventListener('click', restart);
    els.next?.addEventListener('click', next);
    els.prev?.addEventListener('click', prev);
    els.clear?.addEventListener('click', clearPlaylist);
    els.sequential?.addEventListener('click', () => setOrder('sequential'));
    els.random?.addEventListener('click', () => setOrder('random'));
    els.loop?.addEventListener('change', () => { state.loop = els.loop.checked; render(); });
    els.speedRange?.addEventListener('input', () => setSpeed(els.speedRange.value));
    document.querySelectorAll('[data-highlight-speed]').forEach((button) => button.addEventListener('click', () => setSpeed(button.dataset.highlightSpeed)));
    els.playlist?.addEventListener('click', (event) => {
      const pick = event.target.closest('[data-pick-index]');
      const remove = event.target.closest('[data-remove-index]');
      if (pick) goToIndex(Number(pick.dataset.pickIndex), state.playing);
      if (remove) removeClip(Number(remove.dataset.removeIndex));
    });
    els.video?.addEventListener('ended', () => {
      if (suppressAutoNext) return;
      const nextIndex = getNextIndex();
      if (nextIndex >= 0) goToIndex(nextIndex, true);
      else pause();
    });
  }

  function setScreenStatus(text) {
    if (els.screenStatus) els.screenStatus.textContent = text;
  }

  function loadScreenClip(file, meta = {}, autoplay = false) {
    if (!isHighlightScreen || !els.screenVideo || !file) return;
    if (screenObjectUrl) URL.revokeObjectURL(screenObjectUrl);
    screenObjectUrl = URL.createObjectURL(file);
    els.screenVideo.pause();
    els.screenVideo.src = screenObjectUrl;
    els.screenVideo.load();
    els.screenVideo.playbackRate = state.speed;
    setScreenStatus(`Highlight: ${meta.name || file.name || 'clip'}`);
    if (els.videoWrapper) els.videoWrapper.classList.toggle('hide-status', false);
    if (autoplay) setTimeout(() => els.screenVideo.play().catch(() => setScreenStatus('Click Highlight Source once to allow playback')), 80);
  }

  function setupScreenEvents() {
    if (!isHighlightScreen || !bc) return;
    setScreenStatus('Highlight Source Ready');
    bc.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (!msg.type || msg.source === 'highlight-screen') return;
      const payload = msg.payload || {};
      if (msg.type === 'highlight:mode') {
        setScreenStatus(payload.mode === 'highlight' ? 'Highlight Replay Ready' : 'Highlight Source Standby');
      }
      if (msg.type === 'highlight:clip' && payload.clip?.file) {
        state.speed = Number(payload.speed) || state.speed;
        loadScreenClip(payload.clip.file, payload.clip, !!payload.playing);
      }
      if (msg.type === 'highlight:play') {
        state.speed = Number(payload.speed) || state.speed;
        if (els.screenVideo) {
          els.screenVideo.playbackRate = state.speed;
          els.screenVideo.play().catch(() => setScreenStatus('Click Highlight Source once to allow playback'));
        }
      }
      if (msg.type === 'highlight:pause') els.screenVideo?.pause();
      if (msg.type === 'highlight:restart' && els.screenVideo) {
        els.screenVideo.currentTime = 0;
        els.screenVideo.playbackRate = Number(payload.speed) || state.speed;
        els.screenVideo.play().catch(() => {});
      }
      if (msg.type === 'highlight:speed') {
        state.speed = Number(payload.speed) || 1;
        if (els.screenVideo) els.screenVideo.playbackRate = state.speed;
      }
      if (msg.type === 'highlight:clear') {
        els.screenVideo?.pause();
        if (els.screenVideo) els.screenVideo.removeAttribute('src');
        setScreenStatus('Highlight cleared');
      }
    });
  }

  setupControlEvents();
  setupScreenEvents();
  render();
})();
