(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  if (params.get('mode') !== 'highlight-screen') return;

  const CHANNEL = 'peps-var-replay-studio-v1-1';
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
  const video = document.querySelector('#mainVideo');
  const wrapper = document.querySelector('#videoWrapper') || document.body;
  if (!bc || !video) return;

  const style = document.createElement('style');
  style.textContent = `
    body.is-highlight-screen #videoWrapper,
    body.is-highlight-screen .video-wrapper {
      position: fixed !important;
      inset: 0 !important;
      overflow: hidden !important;
      background: transparent !important;
    }

    body.is-highlight-screen #mainVideo {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      object-fit: contain !important;
      opacity: 1;
      transform: translate3d(0,0,0) scale(1);
      filter: none;
      will-change: opacity, transform, filter;
      z-index: 1;
    }

    .highlight-transition-overlay {
      position: absolute;
      inset: 0;
      z-index: 20;
      pointer-events: none;
      opacity: 0;
      background: #000;
      will-change: opacity, transform, filter;
    }

    .highlight-transition-overlay.flash {
      background: radial-gradient(circle at center, rgba(255,255,255,.98), rgba(255,120,0,.62) 42%, rgba(0,0,0,0) 72%);
      mix-blend-mode: screen;
    }

    .highlight-transition-overlay.blur {
      background: linear-gradient(110deg, transparent 0 30%, rgba(255,90,0,.55) 45%, rgba(255,255,255,.85) 50%, rgba(255,90,0,.45) 55%, transparent 70% 100%);
      mix-blend-mode: screen;
      filter: blur(10px);
    }

    .highlight-transition-overlay.wipe {
      background: linear-gradient(90deg, rgba(0,0,0,1), rgba(255,90,0,.82), rgba(0,0,0,1));
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'highlight-transition-overlay';
  wrapper.appendChild(overlay);

  let currentAnimations = [];
  let pending = null;
  let pendingTimer = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function stopAnimations() {
    currentAnimations.forEach((animation) => {
      try { animation.cancel(); } catch {}
    });
    currentAnimations = [];
    overlay.className = 'highlight-transition-overlay';
    overlay.style.opacity = '0';
    overlay.style.transform = 'none';
    video.style.opacity = '1';
    video.style.transform = 'translate3d(0,0,0) scale(1)';
    video.style.filter = 'none';
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
    pending = {
      type: payload.transition || 'fade',
      duration: clamp(Number(payload.transitionDuration) || 1, 0.5, 5),
      started: false
    };

    stopAnimations();
    video.style.opacity = '0';
    video.style.filter = 'brightness(.55)';
    overlay.style.opacity = '.88';
    overlay.style.background = '#000';

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

  bc.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (!msg.type || msg.source === 'highlight-screen') return;
    if (msg.type === 'highlight:clip' || msg.type === 'highlight:restart') {
      prepareTransition(msg.payload || {});
    }
  });

  video.addEventListener('loadstart', () => {
    if (pending) {
      video.style.opacity = '0';
      overlay.style.opacity = '.88';
    }
  });

  video.addEventListener('loadeddata', () => {
    startPendingTransition();
  });
})();
