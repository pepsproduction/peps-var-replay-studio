(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  if (params.get('mode') !== 'screen') return;

  const NativeBroadcastChannel = window.BroadcastChannel;
  if (!NativeBroadcastChannel || window.__pepsVarScreenStabilityFix) return;
  window.__pepsVarScreenStabilityFix = true;

  let lastDirectBlobVersion = 0;
  let lastDirectBlobAt = 0;

  window.BroadcastChannel = function PatchedBroadcastChannel(name) {
    const channel = new NativeBroadcastChannel(name);
    const nativeAdd = channel.addEventListener.bind(channel);

    channel.addEventListener = (type, listener, options) => {
      if (type !== 'message' || typeof listener !== 'function') {
        return nativeAdd(type, listener, options);
      }

      return nativeAdd('message', (event) => {
        const msg = event.data || {};
        const payload = msg.payload || {};

        if (msg.type === 'clip:blob' && payload.meta?.updatedAt) {
          lastDirectBlobVersion = payload.meta.updatedAt;
          lastDirectBlobAt = Date.now();
        }

        if (msg.type === 'clip:update') {
          const version = payload.version || 0;
          const isSameClip = version && version === lastDirectBlobVersion;
          const isImmediateDuplicate = Date.now() - lastDirectBlobAt < 2500;
          if (isSameClip && isImmediateDuplicate) return;
        }

        listener(event);
      }, options);
    };

    return channel;
  };

  window.BroadcastChannel.prototype = NativeBroadcastChannel.prototype;
})();
