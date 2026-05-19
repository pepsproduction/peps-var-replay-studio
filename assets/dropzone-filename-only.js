(() => {
  'use strict';

  const style = document.createElement('style');
  style.id = 'peps-dropzone-filename-only-css';
  style.textContent = `
    body.is-control #dropZone.drop-zone {
      min-height: 58px !important;
      height: auto !important;
      padding: 0 !important;
      overflow: hidden !important;
    }

    body.is-control #dropZone.drop-zone.ready {
      min-height: 58px !important;
      height: auto !important;
    }

    body.is-control #dropZone .control-video,
    body.is-control #dropZone.ready .control-video {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    body.is-control #dropZone .drop-overlay,
    body.is-control #dropZone.ready .drop-overlay {
      position: relative !important;
      inset: auto !important;
      min-height: 58px !important;
      width: 100% !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      justify-content: center !important;
      gap: 2px !important;
      padding: 10px 14px !important;
      text-align: left !important;
      border-radius: 0 !important;
      background: rgba(9, 9, 9, 0.72) !important;
      color: #ffe4d4 !important;
      backdrop-filter: blur(10px) !important;
    }

    body.is-control #dropZone.ready .drop-overlay {
      color: #ffffff !important;
    }

    body.is-control #dropZone.ready .drop-icon {
      display: none !important;
    }

    body.is-control #dropZone.ready #dropTitle {
      display: block !important;
      width: 100% !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      font-family: "Chakra Petch", "IBM Plex Sans Thai", system-ui, sans-serif !important;
      font-size: 12px !important;
      font-weight: 800 !important;
      letter-spacing: 0.1px !important;
      color: #ffffff !important;
    }

    body.is-control #dropZone.ready #dropText {
      display: none !important;
    }

    body.is-control #dropZone:not(.ready) .drop-overlay {
      align-items: center !important;
      text-align: center !important;
    }
  `;
  document.head.appendChild(style);

  function cleanFilenameText() {
    const title = document.querySelector('#dropTitle');
    if (!title) return;
    const cleaned = title.textContent.replace(/^Ready:\s*/i, '').trim();
    if (cleaned && cleaned !== title.textContent) title.textContent = cleaned;
  }

  const observer = new MutationObserver(cleanFilenameText);

  function init() {
    const title = document.querySelector('#dropTitle');
    if (title) observer.observe(title, { childList: true, characterData: true, subtree: true });
    cleanFilenameText();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.addEventListener('load', cleanFilenameText);
})();
