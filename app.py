import logging

logging.basicConfig(level=logging.INFO)

import json
import logging
import os
import re
import urllib.parse
from functools import wraps
from pprint import pformat

import html2text
import requests
from cachetools import TTLCache
from extractcontent3 import ExtractContent
from openai import AsyncOpenAI, OpenAIError
from slack_bolt.adapter.socket_mode.async_handler import AsyncSocketModeHandler
from slack_bolt.async_app import AsyncApp
from slack_sdk.errors import SlackApiError

app = AsyncApp(token=os.environ.get("SLACK_BOT_TOKEN"))
openAIClient = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

extractor = ExtractContent()
extractor.set_option({"threshold": 0})

logger = logging.getLogger(__name__)


def retry(exceptions, total_tries=4, initial_wait=0.5, backoff_factor=2):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            wait_time = initial_wait
            for i in range(total_tries):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    logger.error(f"Exception caught: {str(e)}, retrying in {wait_time} seconds...")
                    if i == total_tries - 1:
                        raise
                    else:
                        await asyncio.sleep(wait_time)
                        wait_time *= backoff_factor

        return wrapper

    return decorator


@retry((OpenAIError,), total_tries=3, initial_wait=1, backoff_factor=2)
async def chat_completion_create(*args, **kwargs):
    return await openAIClient.chat.completions.create(*args, **kwargs)


@retry((SlackApiError,), total_tries=3, initial_wait=1, backoff_factor=2)
async def chat_post_message(client, *args, **kwargs):
    return await client.chat_postMessage(*args, **kwargs)


def format_reply(args, logger):
    logger.info(pformat(args))
    summary = f"""
*要約*
{args.get("summary", "???")}
"""
    body = None
    if args.get("language") != "ja" and "body_translated" in args:
        body = f"""
*日本語翻訳*
{args.get("body_translated", "???")}
"""
    return (summary, body)


async def summerize_text(event, text, slackClient, logger):
    prompt = f"""### タスク

あなたはWebページの要約&翻訳のプロフェッショナルです。

- 与えられたHTMLテキストを要約してください。
  - 短すぎるのはダメです。
  - 省略しすぎないでください。
- 本文が日本語以外の場合は日本語に翻訳してください。
  - ただし1000文字を超える部分は省略してください。
- 要約・翻訳した本文以外のテキストは含めないでください。


### 返答フォーマット(JSON)

{{
    "summary": "要約したWebページの内容",
    "language": "ISO 639-1 で表されるWebページ本文の言語",
    "body_translated": "日本語に翻訳されたWebページ本文（日本語以外の言語の場合のみ）",
}}


### 要約すべき内容

{text}

"""
    # logger.info(pformat(prompt))

    completion = await chat_completion_create(
        model="gpt-4-1106-preview",
        messages=[
            {
                "role": "system",
                "content": prompt,
            },
        ],
        functions=[
            {
                "name": "reply_processed_text",
                "description": "処理した内容を返信する",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string", "description": "Webページの要約"},
                        "language": {"type": "string", "description": "ISO 639-1 で表される本文の言語"},
                        "body_translated": {
                            "type": "string",
                            "description": "日本語に翻訳されたWebページ本文（日本語以外の言語の場合のみ）s",
                        },
                    },
                    "required": ["summary", "language"],
                },
            }
        ],
        response_format={"type": "json_object"},
        function_call="auto",
        timeout=60,
    )
    logger.info(pformat(completion))

    message = completion.choices[0].message
    content = (message.content or "???").strip()
    summary = None
    body = None
    if message.function_call:
        if message.function_call.name == "reply_processed_text":
            arguments = json.loads(message.function_call.arguments)
            (summary, body) = format_reply(arguments, logger)
    else:
        try:
            arguments = json.loads(content)
            (summary, body) = format_reply(arguments, logger)
        except:
            body = f"Parse `content` failed: ```{content}```"

    if summary:
        await chat_post_message(
            slackClient,
            channel=event["channel"],
            text=summary,
            thread_ts=event["ts"],
            reply_broadcast=True,
            timeout=10,
        )
    if body:
        await chat_post_message(
            slackClient,
            channel=event["channel"],
            text=body,
            thread_ts=event["ts"],
            timeout=10,
        )


async def process_link(event, url, slackClient, logger):
    logger.info(f"Processing link: {url}")

    if url.startswith("https://www.google.com/url?"):
        parsed_url = urllib.parse.urlparse(url)

        # Extract query parameters
        query_params = urllib.parse.parse_qs(parsed_url.query)

        # Check if 'url' parameter exists and return its value
        redirected_url = query_params.get("url")

        if redirected_url:
            # Return the first 'url' value if it exists
            url = redirected_url[0]

    response = requests.get(url, timeout=60)
    response.raise_for_status()
    # logger.info(response.text)
    extractor.analyse(response.text)
    text, title = extractor.as_text()
    logger.info(f"Title: {title}")
    logger.info(f"Text: {text}")
    await summerize_text(event, text, slackClient, logger)


processed_ids = TTLCache(maxsize=100, ttl=60)


@app.event("message")
async def handle_message_events(body, ack, client, logger):
    await ack()

    event = body["event"]

    # skip if it's a OG preview
    if event.get("previous_message") is not None:
        return

    # https://github.com/slackapi/python-slack-sdk/issues/736#issuecomment-653115442
    message_id = event["channel"] + "." + event["event_ts"]
    if message_id in processed_ids:
        return
    processed_ids[message_id] = True

    # logger.info("---------------------------------------------------")
    # logger.info(pformat(body))

    for block in event.get("blocks", []):
        for element in block.get("elements", []):
            for item in element.get("elements", []):
                if item.get("type") == "link":
                    await process_link(event, item["url"], client, logger)


async def main():
    handler = AsyncSocketModeHandler(app, os.environ["SLACK_APP_TOKEN"])
    await handler.start_async()


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
