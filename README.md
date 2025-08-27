# Webpage Summarizer Slack Bot

A Slack bot that automatically summarizes web pages shared in Slack channels into Japanese. Built with TypeScript and deployed on Cloudflare Workers using Google Gemini AI.

## Features

- 🔍 Automatically detects URLs in Slack messages
- 📝 Summarizes web page content in Japanese
- 💬 Posts summaries as thread replies with proper Slack formatting
- ⚡ Fast, serverless deployment on Cloudflare's edge network
- 🔒 Secure with Slack signature verification (HMAC-SHA256)
- 🎯 Smart markdown formatting for Japanese text
- 🔄 Event deduplication to prevent duplicate processing
- 🌐 Built-in web content extraction with Gemini URLContext

## Setup

### Prerequisites

- [Bun](https://bun.sh) installed
- Cloudflare account
- Google AI Studio API key (Gemini)
- Slack App with Events API enabled

### Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Create KV namespace for event deduplication:**
   ```bash
   bun run kv:create
   bun run kv:create:preview
   ```
   Update the IDs in `wrangler.toml` with the output values.

3. **Configure secrets:**
   ```bash
   # Copy the example file
   cp .env.example .dev.vars
   # Edit .dev.vars with your actual values
   
   # For production deployment:
   bun wrangler secret put SLACK_SIGNING_SECRET
   bun wrangler secret put SLACK_BOT_TOKEN
   bun wrangler secret put GEMINI_API_KEY
   ```

4. **Configure Slack App:**
   - Enable Event Subscriptions
   - Set Request URL: `https://your-worker.workers.dev/slack/events`
   - Subscribe to bot events: `message.channels` or `app_mention`
   - Install app to your workspace

### Development

```bash
# Local development with hot reload
bun run dev

# View logs
bun run tail

# Type checking
bun run typecheck
```

### Deployment

```bash
# Deploy to Cloudflare Workers
bun run deploy

# Deploy to specific environment
bun run deploy:staging
bun run deploy:production
```

### Architecture

- **Runtime:** Cloudflare Workers (Edge)
- **Language:** TypeScript
- **AI Model:** Google Gemini with URLContext tool
- **Package Manager:** Bun
- **Slack Integration:** Events API (Webhooks)

## Key Files

- `src/worker.ts` - Main worker entry point and event processing
- `src/gemini.ts` - Gemini API integration with URLContext and Slack formatting
- `src/slack.ts` - Slack signature verification and API client
- `src/extract.ts` - URL extraction from Slack messages and blocks
- `src/types.ts` - TypeScript type definitions
- `wrangler.toml` - Cloudflare Workers configuration

## Why TypeScript/Cloudflare Workers?

This project was rewritten from Python to TypeScript for several advantages:

| Aspect | Previous (Python) | Current (TypeScript) |
|---------|------------------|---------------------|
| **Hosting** | Self-hosted server required | Serverless (Cloudflare Workers) |
| **AI Model** | OpenAI GPT-4 | Google Gemini with URLContext |
| **Web Extraction** | ExtractContent3 library | Built-in Gemini URLContext |
| **Slack Connection** | Socket Mode (WebSocket) | Events API (Webhooks) |
| **Scaling** | Manual | Automatic edge scaling |
| **Cost** | OpenAI API + Server costs | Gemini API + Workers free tier |
| **Performance** | Server-dependent | Edge network (low latency) |
| **Maintenance** | Server management needed | Zero-ops deployment |

## Known Issues & Solutions

- **Unicode/Emoji issues:** Resolved by removing emojis from templates and fixing JSON stringification
- **Markdown spacing:** Automatically adds proper spacing between Japanese text and markdown blocks
- **Punctuation formatting:** Handles Japanese punctuation (、。！？) with proper spacing around markdown

## License

MIT
