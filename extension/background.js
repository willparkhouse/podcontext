// Spotify Podcast Transcript Downloader - Background Service Worker

// Handle transcript fetch requests from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchTranscript') {
    fetchTranscript(request.episodeId, request.tokens)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
});

async function fetchTranscript(episodeId, tokens) {
  const url = `https://spclient.wg.spotify.com/transcript-read-along/v2/episode/${episodeId}?format=json&maxSentenceLength=500&excludeCC=true`;

  const response = await fetch(url, {
    headers: {
      'authorization': tokens.authorization,
      'client-token': tokens.clientToken,
      'accept': 'application/json',
      'accept-language': 'en-GB'
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('No transcript available for this episode');
    }
    if (response.status === 401) {
      throw new Error('Authentication failed. Please refresh the page and try again.');
    }
    throw new Error(`Failed to fetch transcript: ${response.status}`);
  }

  return response.json();
}
