(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const pageMode = params.get('mode') || 'control';
  const isHighlightScreen = pageMode === 'highlight-screen';
  const isControl = !isHighlightScreen && pageMode !== 'screen';
  const CHANNEL = 'peps-var-replay-studio-v1-1';
  const DB_NAME = 'peps-var-replay-studio-db';
  const STORE = 'clips';
  const KEY = 'highlight-active-clip';
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
  if (!bc) return;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function putClip(file, meta = {}) {
    if (!file) return null;
    const row = {
      id: KEY,
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
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(row);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return row;
  }

  async function getClip() {
    const db = await openDB();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return row;
  }

  let objectUrl = null;
  async function loadClipFromDB(payload = {}) {
    const video = document.querySelector('#mainVideo');
    const status = document.querySelector('#screenStatus');
    if (!video) return;

    const row = await getClip();
    if (!row?.blob) return;

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(row.blob);
    video.pause();
    video.src = objectUrl;
    video.load();
    video.playbackRate = Number(payload.speed || row.speed) || 1;
    if (status) status.textContent = `Highlight: ${row.name || 'clip'}`;

    const shouldPlay = !!(payload.playing ?? row.playing);
    if (shouldPlay) {
      const playWhenReady = () => video.play().catch(() => {
        if (status) status.textContent = 'Click Highlight Source once to allow playback';
      });
      if (video.readyState >= 2) playWhenReady();
      else video.addEventListener('loadeddata', playWhenReady, { once: true });
    }
  }

  bc.addEventListener('message', async (event) => {
    const msg = event.data || {};
    const payload = msg.payload || {};
    if (!msg.type || msg.source === 'highlight-persist-fix') return;

    if (isControl && msg.type === 'highlight:clip' && payload.clip?.file) {
      try {
        const row = await putClip(payload.clip.file, {
          name: payload.clip.name,
          type: payload.clip.type,
          transition: payload.transition,
          transitionDuration: payload.transitionDuration,
          playing: payload.playing,
          speed: payload.speed
        });
        if (row) {
          bc.postMessage({
            type: 'highlight:clip-db',
            source: 'highlight-persist-fix',
            at: Date.now(),
            payload: {
              version: row.updatedAt,
              name: row.name,
              playing: row.playing,
              speed: row.speed,
              transition: row.transition,
              transitionDuration: row.transitionDuration
            }
          });
        }
      } catch (err) {
        console.warn('Highlight persist failed', err);
      }
    }

    if (isHighlightScreen && msg.type === 'highlight:clip-db') {
      try { await loadClipFromDB(payload); }
      catch (err) { console.warn('Highlight DB load failed', err); }
    }
  });

  if (isHighlightScreen) {
    bc.postMessage({ type: 'highlight-source-ready', source: 'highlight-persist-fix', at: Date.now(), payload: {} });
  }
})();
