import { SlackEvent } from "./types";

const SLACK_URL_RE = /<(https?:\/\/[^>|]+)(?:\|[^>]+)?>/g;
const PLAIN_URL_RE = /\bhttps?:\/\/[^\s<>)+"]+/g;

export function extractUrlsFromSlackText(text: string, max = 20): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  
  SLACK_URL_RE.lastIndex = 0;
  while ((m = SLACK_URL_RE.exec(text)) && set.size < max) {
    let url = m[1];
    
    // Handle Google redirect URLs
    if (url.startsWith("https://www.google.com/url?")) {
      const parsed = new URL(url);
      const redirectedUrl = parsed.searchParams.get("url");
      if (redirectedUrl) {
        url = redirectedUrl;
      }
    }
    
    set.add(url);
  }
  
  const plains = text.match(PLAIN_URL_RE) ?? [];
  for (const u of plains) {
    if (set.size >= max) break;
    
    let url = u;
    // Handle Google redirect URLs for plain URLs too
    if (url.startsWith("https://www.google.com/url?")) {
      try {
        const parsed = new URL(url);
        const redirectedUrl = parsed.searchParams.get("url");
        if (redirectedUrl) {
          url = redirectedUrl;
        }
      } catch {
        // If URL parsing fails, use original
      }
    }
    
    set.add(url);
  }
  
  return Array.from(set);
}

export function extractUrlsFromSlackEvent(event: SlackEvent, max = 20): string[] {
  const urls = new Set<string>();
  
  // Extract from text
  if (event.text) {
    const textUrls = extractUrlsFromSlackText(event.text, max);
    for (const url of textUrls) {
      urls.add(url);
      if (urls.size >= max) return Array.from(urls);
    }
  }
  
  // Extract from blocks (for rich formatted messages)
  if (event.blocks) {
    for (const block of event.blocks) {
      if (block.elements) {
        for (const element of block.elements) {
          if (element.elements) {
            for (const item of element.elements) {
              if (item.type === "link" && item.url) {
                let url = item.url;
                
                // Handle Google redirect URLs
                if (url.startsWith("https://www.google.com/url?")) {
                  try {
                    const parsed = new URL(url);
                    const redirectedUrl = parsed.searchParams.get("url");
                    if (redirectedUrl) {
                      url = redirectedUrl;
                    }
                  } catch {
                    // If URL parsing fails, use original
                  }
                }
                
                urls.add(url);
                if (urls.size >= max) return Array.from(urls);
              }
            }
          }
        }
      }
    }
  }
  
  return Array.from(urls);
}