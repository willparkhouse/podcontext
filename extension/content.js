// PodContext - Content Script

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

// Extract unique speakers from transcript data
function extractSpeakers(data) {
  const speakers = new Set();
  const sections = data.section || [];

  for (const section of sections) {
    if (section.title) {
      const title = section.title.title || '';
      if (title.startsWith('Speaker')) {
        speakers.add(title);
      }
    }
  }

  return Array.from(speakers).sort();
}

// Parse transcript JSON into readable text with custom speaker names
function parseTranscript(data, speakerMap = {}) {
  const sections = data.section || [];
  const result = [];
  let currentSpeaker = null;
  let currentSentences = [];

  for (const section of sections) {
    if (section.title) {
      const title = section.title.title || '';
      if (title.startsWith('Speaker') || title.match(/^[A-Z][a-z]+ [A-Z][a-z]+/)) {
        if (currentSpeaker && currentSentences.length > 0) {
          const displayName = speakerMap[currentSpeaker] || currentSpeaker;
          result.push(`${displayName}: ${currentSentences.join(' ')}`);
        }
        currentSpeaker = title;
        currentSentences = [];
      }
    }

    if (section.text && section.text.sentence) {
      const text = section.text.sentence.text;
      if (text && text.trim()) {
        currentSentences.push(text.trim());
      }
    }
  }

  if (currentSpeaker && currentSentences.length > 0) {
    const displayName = speakerMap[currentSpeaker] || currentSpeaker;
    result.push(`${displayName}: ${currentSentences.join(' ')}`);
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
  return title.replace(/\s*\|\s*Podcast on Spotify$/i, '').trim();
}

// Show speaker editor modal
function showSpeakerEditor(speakers, onConfirm, onCancel) {
  const overlay = document.createElement('div');
  overlay.id = 'podcontext-overlay';

  const modal = document.createElement('div');
  modal.id = 'podcontext-modal';

  modal.innerHTML = `
    <h2>Edit Speaker Names</h2>
    <p>Optionally rename the speakers, or skip to download with defaults:</p>
    <div id="podcontext-speakers"></div>
    <div id="podcontext-buttons">
      <button id="podcontext-cancel">Cancel</button>
      <button id="podcontext-skip">Skip</button>
      <button id="podcontext-download">Download</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const speakersDiv = modal.querySelector('#podcontext-speakers');
  speakers.forEach(speaker => {
    const row = document.createElement('div');
    row.className = 'podcontext-speaker-row';
    row.innerHTML = `
      <label>${speaker}:</label>
      <input type="text" data-speaker="${speaker}" value="${speaker}" placeholder="Enter name...">
    `;
    speakersDiv.appendChild(row);
  });

  const firstInput = speakersDiv.querySelector('input');
  if (firstInput) firstInput.focus();

  modal.querySelector('#podcontext-cancel').addEventListener('click', () => {
    overlay.remove();
    onCancel();
  });

  modal.querySelector('#podcontext-skip').addEventListener('click', () => {
    overlay.remove();
    onConfirm({});
  });

  modal.querySelector('#podcontext-download').addEventListener('click', () => {
    const speakerMap = {};
    modal.querySelectorAll('input[data-speaker]').forEach(input => {
      const original = input.dataset.speaker;
      const newName = input.value.trim() || original;
      speakerMap[original] = newName;
    });
    overlay.remove();
    onConfirm(speakerMap);
  });

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      modal.querySelector('#podcontext-download').click();
    } else if (e.key === 'Escape') {
      modal.querySelector('#podcontext-cancel').click();
    }
  });
}

// Create and inject the download button
function injectDownloadButton() {
  if (document.getElementById('podcontext-btn')) {
    return;
  }

  const episodeId = getEpisodeId();
  if (!episodeId) {
    return;
  }

  const button = document.createElement('button');
  button.id = 'podcontext-btn';
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
      const speakers = extractSpeakers(data);

      button.querySelector('span').textContent = originalText;
      button.disabled = false;

      if (speakers.length > 0) {
        showSpeakerEditor(speakers,
          (speakerMap) => {
            const text = parseTranscript(data, speakerMap);
            if (!text.trim()) {
              alert('Transcript is empty');
              return;
            }
            const title = getEpisodeTitle().replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            downloadText(text, `${title}_transcript.txt`);
          },
          () => {}
        );
      } else {
        const text = parseTranscript(data);
        if (!text.trim()) {
          throw new Error('Transcript is empty');
        }
        const title = getEpisodeTitle().replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        downloadText(text, `${title}_transcript.txt`);
      }
    } catch (error) {
      console.error('Transcript download error:', error);
      button.querySelector('span').textContent = 'Error!';
      alert(`Failed to download transcript: ${error.message}`);
      setTimeout(() => {
        button.querySelector('span').textContent = originalText;
      }, 2000);
      button.disabled = false;
    }
  });

  const insertButton = () => {
    const actionBar = document.querySelector('[data-testid="action-bar-row"]') ||
                      document.querySelector('[data-testid="episode-play-button"]')?.parentElement?.parentElement;

    if (actionBar && !document.getElementById('podcontext-btn')) {
      actionBar.appendChild(button);
      return true;
    }
    return false;
  };

  if (!insertButton()) {
    const observer = new MutationObserver((mutations, obs) => {
      if (insertButton()) {
        obs.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  }
}

// Initialize
function init() {
  injectTokenInterceptor();

  const checkAndInject = () => {
    if (getEpisodeId()) {
      injectDownloadButton();
    }
  };

  checkAndInject();

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      const oldBtn = document.getElementById('podcontext-btn');
      if (oldBtn) oldBtn.remove();
      checkAndInject();
    }
  }).observe(document.body, { subtree: true, childList: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
