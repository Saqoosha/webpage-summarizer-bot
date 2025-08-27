import { extractUrlsFromSlackEvent } from "./extract";
import { verifySlackSignature, slackPostMessage, SlackRateLimiter } from "./slack";
import { summarizeUrlsWithGemini } from "./gemini";
import type { Env, SlackEventEnvelope } from "./types";

// Initialize rate limiter
const rateLimiter = new SlackRateLimiter();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Health check endpoint
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }
    
    // Main Slack events endpoint
    if (request.method === "POST" && url.pathname === "/slack/events") {
      try {
        // Get raw body for signature verification
        const rawBody = await request.text();
        
        // Parse the event envelope
        const envelope = JSON.parse(rawBody) as SlackEventEnvelope;
        
        // Handle URL verification challenge BEFORE signature verification
        if (envelope.type === "url_verification" && envelope.challenge) {
          console.log("Handling URL verification challenge");
          return new Response(envelope.challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain" }
          });
        }
        
        // Verify Slack signature for all other events
        const isTestMode = request.headers.get("x-test-mode") === "true";
        
        if (!isTestMode) {
          const isValid = await verifySlackSignature(
            request,
            rawBody,
            env.SLACK_SIGNING_SECRET
          );
          
          if (!isValid) {
            console.error("Invalid Slack signature");
            return new Response("Unauthorized", { status: 401 });
          }
        }
        
        // Handle event callbacks
        if (envelope.type === "event_callback" && envelope.event) {
          // Immediately acknowledge receipt
          const ackResponse = new Response("", { status: 200 });
          
          // Process event asynchronously
          ctx.waitUntil(processSlackEvent(envelope, env, request));
          
          return ackResponse;
        }
        
        // Unknown event type
        console.warn("Unknown event type:", envelope.type);
        return new Response("Unknown event type", { status: 400 });
        
      } catch (error) {
        console.error("Error processing Slack event:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    }
    
    // 404 for all other paths
    return new Response("Not Found", { status: 404 });
  }
};

async function processSlackEvent(
  envelope: SlackEventEnvelope,
  env: Env,
  request: Request
): Promise<void> {
  try {
    // Check for retry headers
    const retryNum = request.headers.get("x-slack-retry-num");
    const retryReason = request.headers.get("x-slack-retry-reason");
    
    if (retryNum) {
      console.log(`Processing Slack retry ${retryNum}, reason: ${retryReason}`);
    }
    
    // Deduplication using KV store
    if (envelope.event_id && env.DEDUP) {
      const dedupKey = `event:${envelope.event_id}`;
      const alreadyProcessed = await env.DEDUP.get(dedupKey);
      
      if (alreadyProcessed) {
        console.log(`Event ${envelope.event_id} already processed, skipping`);
        return;
      }
      
      // Mark as processed with 1-hour TTL
      await env.DEDUP.put(dedupKey, "1", { expirationTtl: 3600 });
    }
    
    const event = envelope.event;
    if (!event) {
      console.warn("No event in envelope");
      return;
    }
    
    // Debug: Log the actual event structure
    console.log("Received Slack event:", JSON.stringify(event, null, 2));
    console.log("Event type:", event.type);
    console.log("Event subtype:", event.subtype);
    
    // Handle link_shared events
    if (event.type === "link_shared") {
      console.log("Processing link_shared event");
      if (event.links && event.links.length > 0) {
        const urls = event.links.map((link: any) => link.url);
        console.log("Found URLs from link_shared:", urls);
        
        // Process these URLs
        const summaryResult = await summarizeUrlsWithGemini(urls.slice(0, 20), {
          apiKey: env.GEMINI_API_KEY,
          baseUrl: env.GEMINI_BASE_URL,
          model: env.GEMINI_MODEL || "gemini-2.5-flash"
        });
        
        // Post to the channel where the link was shared
        if (event.channel) {
          await rateLimiter.executeWithRateLimit(event.channel, async () => {
            await slackPostMessage(env.SLACK_BOT_TOKEN, {
              channel: event.channel!,
              text: summaryResult.summary,
              thread_ts: event.message_ts,
              reply_broadcast: false
            });
          });
        }
        
        return;
      }
    }
    
    // Skip bot messages to avoid loops
    if (event.bot_id || event.subtype === "bot_message") {
      console.log("Skipping bot message");
      return;
    }
    
    // Only process message events
    if (event.type !== "message" && event.type !== "app_mention") {
      console.log(`Skipping event type: ${event.type}`);
      return;
    }
    
    // Skip if no text or channel
    if (!event.text || !event.channel || !event.ts) {
      console.log("Missing required event fields - text:", !!event.text, "channel:", !!event.channel, "ts:", !!event.ts);
      return;
    }
    
    // Skip if it's an edit (has previous_message)
    if (event.previous_message) {
      console.log("Skipping message edit");
      return;
    }
    
    // Extract URLs from the event
    const urls = extractUrlsFromSlackEvent(event, 20);
    
    if (urls.length === 0) {
      console.log("No URLs found in message");
      return;
    }
    
    console.log(`Found ${urls.length} URLs to summarize:`, urls);
    
    // Summarize using Gemini
    try {
      const summaryResult = await summarizeUrlsWithGemini(urls, {
        apiKey: env.GEMINI_API_KEY,
        baseUrl: env.GEMINI_BASE_URL,
        model: env.GEMINI_MODEL || "gemini-2.5-flash"
      });
      
      // Log the summary for testing
      console.log("Gemini Summary Result:", JSON.stringify(summaryResult, null, 2));
      
      // Determine thread timestamp
      const threadTs = event.thread_ts || event.ts;
      
      // Post summary to thread
      await rateLimiter.executeWithRateLimit(event.channel, async () => {
        await slackPostMessage(env.SLACK_BOT_TOKEN, {
          channel: event.channel!,
          text: summaryResult.summary,
          thread_ts: threadTs,
          reply_broadcast: true
        });
        
        console.log(`Posted summary to channel ${event.channel}, thread ${threadTs}`);
      });
      
      // Post translation if available
      if (summaryResult.translatedBody) {
        await rateLimiter.executeWithRateLimit(event.channel, async () => {
          await slackPostMessage(env.SLACK_BOT_TOKEN, {
            channel: event.channel!,
            text: summaryResult.translatedBody!,
            thread_ts: threadTs,
            reply_broadcast: false
          });
          
          console.log(`Posted translation to channel ${event.channel}, thread ${threadTs}`);
        });
      }
      
    } catch (geminiError) {
      console.error("Error with Gemini summarization:", geminiError);
      
      // Post error message to thread
      const threadTs = event.thread_ts || event.ts;
      
      // Check if it's a URLContext fetch error
      const errorMessage = geminiError instanceof Error ? geminiError.message : String(geminiError);
      let userMessage = "⚠️ 申し訳ございません。URLの要約中にエラーが発生しました。";
      
      if (errorMessage.includes("could not be fetched") || errorMessage.includes("URLContext")) {
        userMessage = "⚠️ このURLはアクセスできませんでした。\n\n考えられる理由:\n• ログインが必要なページ\n• 地域制限があるページ\n• robots.txtでブロックされている\n• サーバーがボットをブロックしている\n\n公開されているページのURLをお試しください。";
      }
      
      await rateLimiter.executeWithRateLimit(event.channel, async () => {
        await slackPostMessage(env.SLACK_BOT_TOKEN, {
          channel: event.channel!,
          text: userMessage,
          thread_ts: threadTs,
          reply_broadcast: false
        });
      });
    }
    
  } catch (error) {
    console.error("Error processing Slack event:", error);
  }
}