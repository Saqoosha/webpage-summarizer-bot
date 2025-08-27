export interface Env {
  SLACK_SIGNING_SECRET: string;
  SLACK_BOT_TOKEN: string;
  GEMINI_API_KEY: string;
  GEMINI_BASE_URL?: string;
  GEMINI_MODEL?: string;
  DEDUP: KVNamespace;
}

export interface SlackEventEnvelope {
  token?: string;
  type: "url_verification" | "event_callback";
  challenge?: string;
  event_id?: string;
  team_id?: string;
  api_app_id?: string;
  event?: SlackEvent;
}

export interface SlackEvent {
  type: string;
  text?: string;
  user?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
  channel_type?: string;
  subtype?: string;
  bot_id?: string;
  blocks?: SlackBlock[];
  event_ts?: string;
  previous_message?: any;
  // For link_shared events
  links?: Array<{ url: string; domain: string }>;
  message_ts?: string;
}

export interface SlackBlock {
  type: string;
  block_id?: string;
  elements?: SlackBlockElement[];
}

export interface SlackBlockElement {
  type: string;
  elements?: SlackElement[];
}

export interface SlackElement {
  type: string;
  url?: string;
  text?: string;
}

export interface SlackPostMessageParams {
  channel: string;
  text: string;
  thread_ts?: string;
  reply_broadcast?: boolean;
}