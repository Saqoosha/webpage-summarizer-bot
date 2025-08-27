# Webpage Summarizer Slack Bot

A Slack bot that automatically summarizes and translates web pages shared in Slack channels. Now available in two implementations:

1. **Python Version** (Original) - Using OpenAI GPT-4 with Socket Mode
2. **TypeScript Version** (New) - Using Google Gemini with Cloudflare Workers

## Features

- 🔍 Automatically detects URLs in Slack messages
- 📝 Summarizes web page content in Japanese
- 💬 Posts summaries as thread replies with proper Slack formatting
- ⚡ Fast, serverless deployment (TypeScript version)
- 🔒 Secure with Slack signature verification
- 🎯 Smart markdown formatting for Japanese text
- 🔄 Event deduplication to prevent duplicate processing

## TypeScript Version (Cloudflare Workers + Gemini)

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

### Key Files

- `src/worker.ts` - Main worker entry point and event processing
- `src/gemini.ts` - Gemini API integration with URLContext and Slack formatting
- `src/slack.ts` - Slack signature verification and API client
- `src/extract.ts` - URL extraction from Slack messages and blocks
- `src/types.ts` - TypeScript type definitions
- `wrangler.toml` - Cloudflare Workers configuration

## Python Version (Original)

### Prerequisites

- Python 3.10+
- Poetry
- OpenAI API key
- Slack App with Socket Mode enabled

### Setup

1. **Install dependencies:**
   ```bash
   poetry install
   ```

2. **Set environment variables:**
   ```bash
   export SLACK_BOT_TOKEN="xoxb-..."
   export SLACK_APP_TOKEN="xapp-..."
   export OPENAI_API_KEY="sk-..."
   ```

3. **Run the bot:**
   ```bash
   poetry run python app.py
   ```

### Architecture

- **Runtime:** Local Python process
- **Language:** Python 3.10+
- **AI Model:** OpenAI GPT-4
- **Package Manager:** Poetry
- **Slack Integration:** Socket Mode (WebSocket)

## Comparison

| Feature | Python Version | TypeScript Version |
|---------|---------------|-------------------|
| **Hosting** | Self-hosted | Cloudflare Workers (Serverless) |
| **AI Model** | OpenAI GPT-4 | Google Gemini |
| **Web Extraction** | ExtractContent3 | Gemini URLContext (built-in) |
| **Slack Connection** | Socket Mode (WebSocket) | Events API (Webhooks) |
| **Scaling** | Manual | Automatic (Edge) |
| **Cost** | OpenAI API + Hosting | Gemini API + Workers (Free tier available) |

## Migration Notes

The TypeScript version offers several advantages:
- No need for manual web content extraction (Gemini URLContext handles it)
- Serverless deployment with automatic scaling on Cloudflare's edge network
- Lower latency with edge computing
- Simpler codebase without ExtractContent3 dependency
- Built-in URL fetching and grounding with Gemini
- Better handling of Japanese text with Slack markdown formatting
- Automatic event deduplication using Cloudflare KV storage
- Rate limiting to respect Slack API limits

### Known Issues & Solutions

- **Unicode/Emoji issues:** Resolved by removing emojis from templates and fixing JSON stringification
- **Markdown spacing:** Automatically adds proper spacing between Japanese text and markdown blocks
- **Punctuation formatting:** Handles Japanese punctuation (、。！？) with proper spacing around markdown

## License

MIT
