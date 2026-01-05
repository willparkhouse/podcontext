// Spotify Podcast Transcript Downloader - Content Script

let capturedTokens = {
  authorization: null,
  clientToken: null
};

// Inject script to intercept fetch requests and capture tokens
function injectTokenInterceptor() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

// Listen for tokens from injected script
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SPOTIFY_TOKENS') {
    capturedTokens.authorization = event.data.authorization;
    capturedTokens.clientToken = event.data.clientToken;
  }
});

// Extract episode ID from URL
function getEpisodeId() {
  const match = window.location.pathname.match(/\/episode\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// Parse transcript JSON into readable text
function parseTranscript(data) {
  const sections = data.section || [];
  const result = [];
  let currentSpeaker = null;
  let currentSentences = [];

  for (const section of sections) {
    // Check if this is a speaker title
    if (section.title) {
      const title = section.title.title || '';
      if (title.startsWith('Speaker') || title.match(/^[A-Z][a-z]+ [A-Z][a-z]+/)) {
        // Save previous speaker's text
        if (currentSpeaker && currentSentences.length > 0) {
          result.push(`${currentSpeaker}: ${currentSentences.join(' ')}`);
        }
        currentSpeaker = title;
        currentSentences = [];
      }
    }

    // Check if this is a text section
    if (section.text && section.text.sentence) {
      const text = section.text.sentence.text;
      if (text && text.trim()) {
        currentSentences.push(text.trim());
      }
    }
  }

  // Don't forget the last speaker
  if (currentSpeaker && currentSentences.length > 0) {
    result.push(`${currentSpeaker}: ${currentSentences.join(' ')}`);
  }

  return result.join('\n\n');
}

// Fetch transcript via background worker
async function fetchTranscript(episodeId) {
  if (!capturedTokens.authorization || !capturedTokens.clientToken) {
    throw new Error('Auth tokens not captured yet. Please interact with the page (play/pause, click around) and try again.');
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: 'fetchTranscript',
        episodeId: episodeId,
        tokens: capturedTokens
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error));
        }
      }
    );
  });
}

// Download text as file
function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Get episode title from page
function getEpisodeTitle() {
  const title = document.title || 'transcript';
  // Remove " | Podcast on Spotify" suffix
  return title.replace(/\s*\|\s*Podcast on Spotify$/i, '').trim();
}

// Create and inject the download button
function injectDownloadButton() {
  // Don't inject if already present
  if (document.getElementById('spotify-transcript-dl-btn')) {
    return;
  }

  const episodeId = getEpisodeId();
  if (!episodeId) {
    return; // Not on an episode page
  }

  const button = document.createElement('button');
  button.id = 'spotify-transcript-dl-btn';
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3v10.586l3.293-3.293 1.414 1.414L12 16.414l-4.707-4.707 1.414-1.414L12 13.586V3z"/>
      <path d="M3 17v4h18v-4h-2v2H5v-2H3z"/>
    </svg>
    <span>Download Transcript</span>
  `;
  button.title = 'Download podcast transcript as text file';

  button.addEventListener('click', async () => {
    const originalText = button.querySelector('span').textContent;

    try {
      button.disabled = true;
      button.querySelector('span').textContent = 'Fetching...';

      const episodeId = getEpisodeId();
      if (!episodeId) {
        throw new Error('Could not find episode ID');
      }

      const data = await fetchTranscript(episodeId);
      const text = parseTranscript(data);

      if (!text.trim()) {
        throw new Error('Transcript is empty');
      }

      const title = getEpisodeTitle().replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      downloadText(text, `${title}_transcript.txt`);

      button.querySelector('span').textContent = 'Downloaded!';
      setTimeout(() => {
        button.querySelector('span').textContent = originalText;
      }, 2000);
    } catch (error) {
      console.error('Transcript download error:', error);
      button.querySelector('span').textContent = 'Error!';
      alert(`Failed to download transcript: ${error.message}`);
      setTimeout(() => {
        button.querySelector('span').textContent = originalText;
      }, 2000);
    } finally {
      button.disabled = false;
    }
  });

  // Find a good place to inject the button
  // Look for the action bar near the play button on episode pages
  const insertButton = () => {
    const actionBar = document.querySelector('[data-testid="action-bar-row"]') ||
                      document.querySelector('[data-testid="episode-play-button"]')?.parentElement?.parentElement;

    if (actionBar && !document.getElementById('spotify-transcript-dl-btn')) {
      actionBar.appendChild(button);
      return true;
    }
    return false;
  };

  // Try immediately, then with observer for dynamic content
  if (!insertButton()) {
    const observer = new MutationObserver((mutations, obs) => {
      if (insertButton()) {
        obs.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Stop observing after 10 seconds
    setTimeout(() => observer.disconnect(), 10000);
  }
}

// Initialize
function init() {
  injectTokenInterceptor();

  // Check for episode page and inject button
  const checkAndInject = () => {
    if (getEpisodeId()) {
      injectDownloadButton();
    }
  };

  // Run on page load
  checkAndInject();

  // Watch for URL changes (Spotify is a SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Remove old button if exists
      const oldBtn = document.getElementById('spotify-transcript-dl-btn');
      if (oldBtn) oldBtn.remove();
      checkAndInject();
    }
  }).observe(document.body, { subtree: true, childList: true });
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
