# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Slack bot that automatically summarizes and translates web pages shared in Slack channels. Available in two implementations:

1. **TypeScript/Cloudflare Workers** (New) - Serverless edge deployment with Google Gemini
2. **Python** (Original) - Self-hosted with OpenAI GPT-4

## TypeScript Version (src/)

### Architecture
- **Runtime**: Cloudflare Workers (Edge serverless)
- **Entry Point**: `src/worker.ts`
- **AI Model**: Google Gemini with URLContext tool (no manual extraction needed)
- **Slack Integration**: Events API (Webhooks)
- **Event Deduplication**: Cloudflare KV storage

### Key Files
- `src/worker.ts` - Main request handler and event processing
- `src/gemini.ts` - Gemini API integration with URLContext for automatic web content extraction
- `src/slack.ts` - Signature verification (HMAC-SHA256) and Slack Web API
- `src/extract.ts` - URL extraction from Slack messages and blocks
- `src/types.ts` - TypeScript type definitions

### Development Commands
```bash
# Local development (requires .dev.vars with secrets)
bun run dev

# Create KV namespace for deduplication
bun run kv:create
bun run kv:create:preview

# Deploy to Cloudflare Workers
bun run deploy

# View live logs
bun run tail

# Type checking
bun run typecheck
```

### Local Testing Setup
1. Copy `.env.example` to `.dev.vars`
2. Add your Slack and Gemini credentials
3. Update KV namespace IDs in `wrangler.toml`
4. Run `bun run dev` for local testing

### Key Implementation Details
- Verifies Slack signatures using Web Crypto API (HMAC-SHA256)
- Responds to events within 3 seconds using `ctx.waitUntil()`
- Rate limits Slack API calls (1 message/second per channel)
- Handles URL verification challenges automatically
- Supports up to 20 URLs per message (Gemini URLContext limit)
- Event deduplication using KV storage with 1-hour TTL
- Smart Japanese text formatting for Slack markdown:
  - Automatically adds spaces between Japanese text and markdown
  - Handles punctuation (、。！？) with proper spacing
  - Removes spaces inside markdown markers (fixes `* text *` → `*text*`)
  - Converts double asterisks to single for Slack compatibility

## Python Version (app.py)

### Architecture
- **Runtime**: Local Python process
- **Entry Point**: `app.py`
- **AI Model**: OpenAI GPT-4 with ExtractContent3 for web scraping
- **Slack Integration**: Socket Mode (WebSocket)

### Development Commands
```bash
# Install dependencies
poetry install

# Run the application
poetry run python app.py

# Format code with Black (119 char line length configured)
poetry run black .
```

### Environment Variables
- `SLACK_BOT_TOKEN`: Slack bot user OAuth token
- `SLACK_APP_TOKEN`: Slack app-level token for Socket Mode
- `OPENAI_API_KEY`: OpenAI API key for GPT-4 access

### Key Implementation Details
- Uses GPT-4 Turbo (`gpt-4-1106-preview`) with function calling
- Handles Google redirect URLs automatically
- Implements retry logic with exponential backoff
- Filters out Slack's OG preview messages
- Sets custom user agent for web scraping

## Testing Locally

### TypeScript Version
1. Set up `.dev.vars` with test credentials
2. Run `bun run dev`
3. Use ngrok or cloudflared tunnel to expose local endpoint
4. Configure Slack app with tunnel URL

### Python Version
1. Export environment variables
2. Run `poetry run python app.py`
3. Socket Mode connects directly (no tunnel needed)

## Deployment Notes

- **TypeScript**: Deploy to Cloudflare Workers for serverless, global edge deployment
- **Python**: Requires always-on server or container deployment
- Both versions handle Japanese summarization automatically
- TypeScript version is recommended for production due to simpler infrastructure

## Common Issues & Solutions

### TypeScript Version
- **Unicode/Emoji corruption**: Fixed by removing emojis from templates and avoiding JSON.stringify on response text
- **Markdown spacing in Japanese**: Gemini is instructed to add proper spacing, and code automatically fixes common issues
- **Punctuation formatting**: Code ensures spaces are added between markdown and Japanese punctuation (、。！？)
- **Event duplication**: Handled with KV storage and event_id tracking

### Python Version
- **Google redirect URLs**: Automatically handled in the code
- **Slack OG previews**: Filtered out to avoid duplicate processing