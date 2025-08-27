// No imports needed - using REST API directly

export interface GeminiOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface SummaryResult {
  summary: string;
  translatedBody?: string;
  language?: string;
  metadata?: any;
}

// Structured output schema removed - using raw text output with Slack markdown formatting

export async function summarizeUrlsWithGemini(
  urls: string[],
  options: GeminiOptions
): Promise<SummaryResult> {
  const { apiKey, model = "gemini-2.5-flash" } = options;
  
  if (!urls || urls.length === 0) {
    throw new Error("No URLs provided for summarization");
  }
  
  // Include URLs directly in the prompt
  const prompt = `以下のWebページを読んで、日本語で要約してください:
${urls.join('\n')}

【出力形式】
Slackに投稿するマークダウン形式で出力してください：

*要約*
• 重要ポイント1をここに書く
• 重要ポイント2をここに書く  
• 重要ポイント3をここに書く
（3〜6個の箇条書き）

【Slack公式マークダウン仕様】
以下の形式のみ使用可能です：
- *太字* → シングルアスタリスク（例: *重要*）
- _斜体_ → アンダースコア（例: _注釈_）
- ~取り消し線~ → チルダ（例: ~削除~）
- \`コード\` → バッククォート（例: \`npm install\`）
- 箇条書き → • （U+2022）で開始
- 引用 → > で開始

【使用禁止】
- **text** → ダブルアスタリスクは使わない
- 番号付きリスト → Slackは1. 2. 3.をサポートしない
- # 見出し → Slackはマークダウン見出しをサポートしない
- [リンク](URL) → この形式は使わない、URLは直接記載

【重要な注意点】
- 日本語（ひらがな、カタカナ、漢字）とマークダウンの間には必ず半角スペースを入れる
- これは全てのマークダウン記法に適用される：
  * 太字: これは *重要* です（正しい）、これは*重要*です（間違い）
  * コード: 設定で \`tsconfig.json\` を編集（正しい）、設定で\`tsconfig.json\`を編集（間違い）
  * 斜体: ここは _注意_ が必要（正しい）、ここは_注意_が必要（間違い）
  * 取り消し線: この機能は ~廃止~ されました（正しい）、この機能は~廃止~されました（間違い）
- 句読点（、。）の後にマークダウンが来る場合も半角スペースを入れる
  例: 移行する際、 \`tsconfig.json\` のパス（正しい）
- マークダウンの内側にスペースを入れない（*重要* は正しい、* 重要 * は間違い）

必ず日本語で、上記のSlack仕様に従って出力してください。`;

  try {
    console.log(`Using model: ${model}`);
    // Use REST API directly with url_context tool
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          contents: [{ 
            parts: [{ text: prompt }] 
          }],
          tools: [{ url_context: {} }],  // Enable URLContext tool
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048
            // NOTE: Cannot use responseMimeType with url_context tool
          }
        })
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }
    
    const data = await response.json() as any;
    
    // Extract the text from the response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // Log raw response for debugging
    console.log("=== RAW GEMINI RESPONSE ===");
    console.log(text);
    console.log("=== END RAW RESPONSE ===");
    
    // Check if response is in English (error message)
    if (text.toLowerCase().includes("could not be fetched") || 
        text.toLowerCase().includes("unable to access") ||
        text.toLowerCase().includes("apologize") ||
        text.toLowerCase().includes("cannot summarize")) {
      throw new Error("URLContext could not fetch the provided URL");
    }
    
    // Check for URLContext metadata and errors
    const urlMetadata = data.candidates?.[0]?.urlContextMetadata || data.candidates?.[0]?.url_context_metadata;
    
    if (urlMetadata) {
      console.log("URLContext Metadata:", JSON.stringify(urlMetadata, null, 2));
      
      // Check if any URLs failed to fetch
      if (urlMetadata.failedUrls && urlMetadata.failedUrls.length > 0) {
        console.warn("Failed to fetch URLs:", urlMetadata.failedUrls);
        
        // If all URLs failed, throw a specific error
        if (urlMetadata.failedUrls.length === urls.length) {
          throw new Error("URLContext could not fetch any of the provided URLs. The pages may be protected or inaccessible.");
        }
      }
    } else {
      console.log("WARNING: No URLContext metadata found in response!");
    }
    
    // Clean up the response text for Slack
    let summary = text;
    
    // Convert double asterisks to single for Slack (if Gemini uses them)
    summary = summary.replace(/\*\*([^*]+)\*\*/g, '*$1*');
    
    // Remove any markdown code block markers if present
    summary = summary.replace(/```[a-z]*\n?/g, '').replace(/```/g, '');
    
    // Just in case Gemini doesn't follow our instructions perfectly,
    // fix any spaces that ended up inside markdown markers
    summary = summary.replace(/\*\s+([^*]+?)\s+\*/g, '*$1*');
    summary = summary.replace(/_\s+([^_]+?)\s+_/g, '_$1_');
    summary = summary.replace(/~\s+([^~]+?)\s+~/g, '~$1~');
    
    // Add space after Japanese punctuation (、。) when followed by markdown
    summary = summary.replace(/([、。])(`[^`]+`)/g, '$1 $2');
    summary = summary.replace(/([、。])(\*[^*]+\*)/g, '$1 $2');
    summary = summary.replace(/([、。])(_[^_]+_)/g, '$1 $2');
    summary = summary.replace(/([、。])(~[^~]+~)/g, '$1 $2');
    
    return {
      summary: summary.trim(),
      translatedBody: undefined,
      language: "ja",
      metadata: urlMetadata
    };
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error(`Failed to summarize URLs: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function removed - no longer needed since we use raw output directly