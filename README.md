# PodContext

Download Spotify podcast transcripts for LLM context.

A Chrome extension that adds a one-click download button to Spotify podcast episodes, saving transcripts as plain text files perfect for use with ChatGPT, Claude, and other LLMs.

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `extension` folder

## Usage

1. Go to [Spotify Web Player](https://open.spotify.com/)
2. Navigate to any podcast episode with a transcript
3. Interact with the page first (e.g., click play/pause) to allow the extension to capture auth tokens
4. Click the green **Download Transcript** button
5. A dialog appears letting you rename the speakers (e.g., "Speaker 1" → "Rory Stewart")
6. Click **Download** and the transcript saves as a `.txt` file

## Output Format

```
Rory Stewart: Welcome to the show. Today we're discussing...

Matt Clifford: Thanks for having me. I think the key point is...
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Auth tokens not captured" | Interact with the Spotify page (play/pause, click around) then try again |
| "No transcript available" | Not all episodes have transcripts - check if Spotify shows a "Transcript" button |
| Button not appearing | Make sure you're on an episode page (URL contains `/episode/`) |

## How It Works

The extension intercepts Spotify's authentication tokens from network requests, then uses them to fetch transcripts from Spotify's internal API. Before downloading, you can rename the generic speaker labels to actual names.

## License

MIT
