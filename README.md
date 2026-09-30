# AI Chat Exporter for Google Docs

A Chrome extension for saving AI responses and conversations in the tools you already use. Export from ChatGPT, Gemini, Claude, DeepSeek, or Perplexity to Google Docs, Word (`.docx`), Markdown, Notion, or Obsidian.

## Supported Platforms

- ChatGPT (chatgpt.com)
- Google Gemini (gemini.google.com)
- Claude (claude.ai)
- DeepSeek (chat.deepseek.com)
- Perplexity (perplexity.ai)

## Export Destinations

- Google Docs in Google Drive
- Word documents (`.docx`) saved locally
- Markdown files (`.md`) saved locally
- Notion pages in a workspace you configure
- Obsidian notes in a vault on your device

## Features

- **One-click export** — button appears alongside responses on supported chat platforms
- **Selection panel** — choose individual responses or export the full conversation
- **Continue Google Docs exports** — add new content to a document associated with a previous export
- **Choose what to export** — export the latest response, the full conversation, or selected responses
- **Formatting support** — headings, bold/italic, code blocks, tables, math equations, and lists, depending on the destination
- **Source details** — Google Docs exports include platform and conversation citation metadata
- **CSV export** — download any table in a response as a `.csv` file
- **Keyboard shortcut** — `Cmd+Shift+E` / `Ctrl+Shift+E`
- **Dark mode** support

## Demo

<img width="1280" height="800" alt="Gemini_Generated_Image_142ny5142ny5142n (1)" src="https://github.com/user-attachments/assets/d02f1e12-d628-4e99-afb4-e8f60b66a007" />
<img width="1408" height="768" alt="Gemini_Generated_Image_7ohxy07ohxy07ohx" src="https://github.com/user-attachments/assets/89fb42aa-715e-4b8f-9d9f-177b65fe8234" />

## Installation (Development)

1. Clone this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer Mode**
4. Click **Load unpacked** and select this folder
5. Sign in with your Google account when prompted

## Tech Stack

- JavaScript (Manifest V3)
- Chrome Extension APIs: `identity`, `storage`, `commands`
- Google Drive API v3 / Google Docs API v1 / Notion API
- Obsidian URI integration
- Office Open XML (OOXML) for `.docx` generation

## Privacy

Conversation content is prepared in your browser and sent only to the export destination you choose. The extension has no developer-owned backend. See the [Privacy Policy](https://daniel-zeyuli.github.io/ai-to-google-docs-extension/privacy.html) for details, including Google Drive and Notion exports.

## Author

Daniel Li  
GitHub: https://github.com/daniel-zeyuli
