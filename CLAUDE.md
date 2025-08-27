# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Slack bot that automatically summarizes web pages shared in Slack channels into Japanese. Built with TypeScript and deployed on Cloudflare Workers using Google Gemini AI.

## Architecture
- **Runtime**: Cloudflare Workers (Edge serverless)
- **Entry Point**: `src/worker.ts`
- **AI Model**: Google Gemini with URLContext tool (no manual extraction needed)
- **Slack Integration**: Events API (Webhooks)
- **Event Deduplication**: Cloudflare KV storage

## Key Files
- `src/worker.ts` - Main request handler and event processing
- `src/gemini.ts` - Gemini API integration with URLContext for automatic web content extraction
- `src/slack.ts` - Signature verification (HMAC-SHA256) and Slack Web API
- `src/extract.ts` - URL extraction from Slack messages and blocks
- `src/types.ts` - TypeScript type definitions

## Development Commands
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

## Local Testing Setup
1. Copy `.env.example` to `.dev.vars`
2. Add your Slack and Gemini credentials
3. Update KV namespace IDs in `wrangler.toml`
4. Run `bun run dev` for local testing
5. Use ngrok or cloudflared tunnel to expose local endpoint for Slack events

## Key Implementation Details
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

## Deployment

Deploy to Cloudflare Workers for serverless, global edge deployment:
```bash
# Production deployment
bun run deploy

# Staging deployment  
bun run deploy:staging
```

## Common Issues & Solutions

- **Unicode/Emoji corruption**: Fixed by removing emojis from templates and avoiding JSON.stringify on response text
- **Markdown spacing in Japanese**: Gemini is instructed to add proper spacing, and code automatically fixes common issues  
- **Punctuation formatting**: Code ensures spaces are added between markdown and Japanese punctuation (、。！？)
- **Event duplication**: Handled with KV storage and event_id tracking
- **URL fetch failures**: Gemini URLContext may fail on login-required or region-restricted pages - bot shows appropriate error message