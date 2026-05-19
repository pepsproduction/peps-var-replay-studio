(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') === 'screen' ? 'screen' : 'control';
  const CHANNEL = 'peps-var-replay-studio-v1-1';
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;

  const state = {
    zoom: 1,
    panXPct: 0,
    panYPct: 0
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function readPercent(value, fallback = 0) {
    const n = Number.parseFloat(String(value || '').replace('%', ''));
    return Number.isFinite(n) ? n : fallback;
  }

  function readControlState() {
    const zoomRange = document.querySelector('#zoomRange');
    const panViewport = document.querySelector('#panViewport');

    const zoom = clamp(Number(zoomRange?.value) || state.zoom || 1, 1, 10);
    state.zoom = zoom;

    if (!panViewport || zoom <= 1) {
      state.panXPct = 0;
      state.panYPct = 0;
      return;
    }

    const viewportWidth = 100 / zoom;
    const viewportHeight = 100 / zoom;
    const maxLeft = Math.max(0, 100 - viewportWidth);
    const maxTop = Math.max(0, 100 - viewportHeight);
    const left = readPercent(panViewport.style.left, 0);
    const top = readPercent(panViewport.style.top, 0);

    state.panXPct = maxLeft > 0 ? clamp((left / maxLeft) * 200 - 100, -100, 100) : 0;
    state.panYPct = maxTop > 0 ? clamp((top / maxTop) * 200 - 100, -100, 100) : 0;
  }

  function applyCorrectTransform() {
    if (mode === 'control') readControlState();

    const video = mode === 'screen'
      ? (document.querySelector('#screenVideo') || document.querySelector('#mainVideo'))
      : document.querySelector('#controlVideo');

    if (!video) return;

    const zoom = clamp(Number(state.zoom) || 1, 1, 10);

    // Correct pan math:
    // At zoom 10x, the image must be able to travel 450% from center to edge.
    // The previous formula divided by zoom and only allowed 45%, so it never reached the real edge.
    const maxX = (zoom - 1) * 50;
    const maxY = (zoom - 1) * 50;

    // Viewport moved right means the visible crop should move right,
    // so the video itself must translate left. Same idea for Y axis.
    const translateX = -(clamp(state.panXPct, -100, 100) / 100) * maxX;
    const translateY = -(clamp(state.panYPct, -100, 100) / 100) * maxY;

    const next = `translate(${translateX}%, ${translateY}%) scale(${zoom})`;
    if (video.style.transform !== next) {
      video.style.transformOrigin = 'center center';
      video.style.transform = next;
    }
  }

  if (bc) {
    bc.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (mode !== 'screen' || msg.source === mode || msg.type !== 'state') return;
      const payload = msg.payload || {};
      if (Number.isFinite(Number(payload.zoom))) state.zoom = clamp(Number(payload.zoom), 1, 10);
      if (Number.isFinite(Number(payload.panXPct))) state.panXPct = clamp(Number(payload.panXPct), -100, 100);
      if (Number.isFinite(Number(payload.panYPct))) state.panYPct = clamp(Number(payload.panYPct), -100, 100);
      applyCorrectTransform();
    });
  }

  function loop() {
    applyCorrectTransform();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
