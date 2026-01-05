// Injected into page context to intercept fetch requests
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const [url, options] = args;
    if (options && options.headers) {
      const headers = options.headers;
      let auth = null;
      let clientToken = null;

      if (headers instanceof Headers) {
        auth = headers.get('authorization');
        clientToken = headers.get('client-token');
      } else if (typeof headers === 'object') {
        auth = headers['authorization'] || headers['Authorization'];
        clientToken = headers['client-token'] || headers['Client-Token'];
      }

      if (auth && clientToken) {
        window.postMessage({
          type: 'SPOTIFY_TOKENS',
          authorization: auth,
          clientToken: clientToken
        }, '*');
      }
    }
    return originalFetch.apply(this, args);
  };
})();
