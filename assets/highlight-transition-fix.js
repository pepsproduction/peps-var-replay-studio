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
      background: radial-gradient(circle at center, rgba(255,255,255,.98), rgba(255,120,0,.55) 42%, rgba(0,0,0,0) 72%);
      mix-blend-mode: screen;
    }

    .highlight-transition-overlay.blur {
      background: linear-gradient(110deg, transparent 0 30%, rgba(255,90,0,.55) 45%, rgba(255,255,255,.75) 50%, rgba(255,90,0,.45) 55%, transparent 70% 100%);
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
        { opacity: .72, offset: .42, transform: 'translateX(0%)' },
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
        { opacity: .72, offset: .42, transform: 'translateX(0%)' },
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
      ], { duration: Math.min(duration, 900), easing: 'ease-out', fill: 'both' });
      animate(video, [
        { opacity: 0, transform: 'scale(.78)', filter: 'contrast(1.25) saturate(1.25)' },
        { opacity: 1, transform: 'scale(1.035)', offset: .72, filter: 'contrast(1.08) saturate(1.08)' },
        { opacity: 1, transform: 'scale(1)', filter: 'none' }
      ], common);
      return;
    }

    if (type === 'flash-cut') {
      overlay.classList.add('flash');
      animate(overlay, [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: .55, offset: .18, transform: 'scale(1.05)' },
        { opacity: 0, transform: 'scale(1.24)' }
      ], { duration: Math.min(duration, 1200), easing: 'ease-out', fill: 'both' });
      animate(video, [
        { opacity: .25, filter: 'brightness(2.25) contrast(1.25)', transform: 'scale(1.025)' },
        { opacity: 1, filter: 'brightness(1) contrast(1)', transform: 'scale(1)' }
      ], common);
      return;
    }

    if (type === 'blur-sweep') {
      overlay.classList.add('blur');
      animate(overlay, [
        { opacity: 0, transform: 'translateX(-120%) skewX(-12deg)' },
        { opacity: .9, offset: .45, transform: 'translateX(0%) skewX(-12deg)' },
        { opacity: 0, transform: 'translateX(120%) skewX(-12deg)' }
      ], common);
      animate(video, [
        { opacity: 0, filter: 'blur(24px) brightness(1.35)', transform: 'scale(1.08)' },
        { opacity: 1, filter: 'blur(0px) brightness(1)', transform: 'scale(1)' }
      ], common);
      return;
    }

    // Fade default.
    animate(overlay, [
      { opacity: .9, background: '#000' },
      { opacity: 0, background: '#000' }
    ], common);
    animate(video, [
      { opacity: 0, transform: 'scale(1.01)', filter: 'brightness(.72)' },
      { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' }
    ], common);
  }

  function scheduleTransition(payload = {}) {
    pending = {
      type: payload.transition || pending?.type || 'fade',
      duration: payload.transitionDuration || pending?.duration || 1,
      stamp: Date.now()
    };

    const start = () => {
      if (!pending) return;
      const data = pending;
      pending = null;
      runTransition(data.type, data.duration);
    };

    if (video.readyState >= 2) {
      requestAnimationFrame(start);
      return;
    }

    video.addEventListener('loadeddata', start, { once: true });
    setTimeout(() => {
      if (pending && Date.now() - pending.stamp > 250) start();
    }, 320);
  }

  bc.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (!msg.type || msg.source === 'highlight-screen') return;
    if (msg.type === 'highlight:clip' || msg.type === 'highlight:restart') {
      scheduleTransition(msg.payload || {});
    }
  });
})();
