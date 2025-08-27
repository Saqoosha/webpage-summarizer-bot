import { SlackPostMessageParams } from "./types";

const SIGN_VERSION = 'v0';

export async function verifySlackSignature(
  request: Request,
  rawBody: string,
  signingSecret: string
): Promise<boolean> {
  const timestamp = request.headers.get('x-slack-request-timestamp');
  const signature = request.headers.get('x-slack-signature');
  
  if (!timestamp || !signature) {
    console.error('Missing Slack signature headers');
    return false;
  }
  
  // Debug: Check if signing secret is empty
  if (!signingSecret || signingSecret.length === 0) {
    console.error('SLACK_SIGNING_SECRET is empty or undefined');
    return false;
  }
  
  // Check timestamp to prevent replay attacks (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const requestTimestamp = parseInt(timestamp, 10);
  
  if (Math.abs(now - requestTimestamp) > 60 * 5) {
    console.error('Request timestamp too old');
    return false;
  }
  
  // Compute signature
  const encoder = new TextEncoder();
  const baseString = `${SIGN_VERSION}:${timestamp}:${rawBody}`;
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(baseString));
  const expectedSignature = `${SIGN_VERSION}=${arrayBufferToHex(mac)}`;
  
  // Constant-time comparison
  if (expectedSignature.length !== signature.length) {
    return false;
  }
  
  let diff = 0;
  for (let i = 0; i < expectedSignature.length; i++) {
    diff |= expectedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  
  return diff === 0;
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function slackPostMessage(
  token: string,
  params: SlackPostMessageParams
): Promise<any> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...params,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });
  
  const data = await response.json() as any;
  
  if (!data.ok) {
    console.error('Slack API error:', data);
    throw new Error(`Slack postMessage failed: ${data.error}`);
  }
  
  return data;
}

export class SlackRateLimiter {
  private lastMessageTime: Map<string, number> = new Map();
  private messageQueue: Map<string, Array<() => Promise<void>>> = new Map();
  private readonly minInterval = 1000; // 1 second between messages per channel
  
  async executeWithRateLimit(
    channel: string,
    fn: () => Promise<void>
  ): Promise<void> {
    const now = Date.now();
    const lastTime = this.lastMessageTime.get(channel) ?? 0;
    const timeSinceLastMessage = now - lastTime;
    
    if (timeSinceLastMessage >= this.minInterval) {
      // Can send immediately
      this.lastMessageTime.set(channel, now);
      await fn();
      
      // Process queue if any
      const queue = this.messageQueue.get(channel);
      if (queue && queue.length > 0) {
        const nextFn = queue.shift();
        if (nextFn) {
          setTimeout(() => {
            this.executeWithRateLimit(channel, nextFn);
          }, this.minInterval);
        }
      }
    } else {
      // Need to queue
      const queue = this.messageQueue.get(channel) ?? [];
      queue.push(fn);
      this.messageQueue.set(channel, queue);
      
      // Schedule execution
      const delay = this.minInterval - timeSinceLastMessage;
      setTimeout(() => {
        const nextFn = queue.shift();
        if (nextFn) {
          this.executeWithRateLimit(channel, nextFn);
        }
      }, delay);
    }
  }
}