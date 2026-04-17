import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmProvider = "bedrock" | "openai" | "gemini";

/** Default for cost-sensitive / dev: Amazon Nova Micro (low on-demand token rates on Bedrock). Override with `BEDROCK_MODEL_ID`. */
const DEFAULT_BEDROCK_MODEL = "amazon.nova-micro-v1:0";

function geminiApiKey(): string | undefined {
  const a = process.env.GEMINI_API_KEY?.trim();
  const b = process.env.GOOGLE_API_KEY?.trim();
  if (a) return a;
  if (b) return b;
  return undefined;
}

function openaiApiKey(): string | undefined {
  const k = process.env.OPENAI_API_KEY?.trim();
  return k || undefined;
}

function bedrockModelId(): string {
  return process.env.BEDROCK_MODEL_ID?.trim() || DEFAULT_BEDROCK_MODEL;
}

function bedrockRegion(): string {
  return (
    process.env.AWS_REGION?.trim() ||
    process.env.BEDROCK_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    "us-east-1"
  );
}

function bedrockMaxTokens(): number {
  const n = Number(process.env.BEDROCK_MAX_TOKENS);
  if (!Number.isFinite(n) || n < 256) return 8192;
  return Math.min(Math.floor(n), 32000);
}

/**
 * Resolves which backend to call.
 *
 * Never returns `openai` / `gemini` unless the matching API key is set — avoids Docker/host
 * `LLM_PROVIDER=gemini` overriding `.env` while `GEMINI_API_KEY` is empty (would otherwise throw).
 *
 * When `LLM_PROVIDER` is unset: prefers OpenAI if `OPENAI_API_KEY` is set, else Gemini **only if
 * `GEMINI_API_KEY` is set** (not `GOOGLE_API_KEY` alone — that env is often used by other Google
 * APIs and must not force Gemini), else **Amazon Bedrock**.
 */
function getResolvedProvider(): LlmProvider {
  const raw = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (raw === "bedrock") return "bedrock";
  if (raw === "openai" && openaiApiKey()) return "openai";
  if (raw === "gemini" && geminiApiKey()) return "gemini";
  if (raw === "openai" || raw === "gemini") {
    return "bedrock";
  }
  if (openaiApiKey()) return "openai";
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  return "bedrock";
}

function openaiConfig() {
  const apiKey = openaiApiKey();
  const baseURL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    throw new Error(
      "OpenAI was selected but OPENAI_API_KEY is empty. Set OPENAI_API_KEY, or use LLM_PROVIDER=bedrock with AWS credentials.",
    );
  }
  return { apiKey, baseURL, model };
}

function geminiConfig() {
  const apiKey = geminiApiKey();
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const base =
    (process.env.GEMINI_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  if (!apiKey) {
    throw new Error(
      "No Gemini API key: set GEMINI_API_KEY (or GOOGLE_API_KEY with LLM_PROVIDER=gemini), or use LLM_PROVIDER=bedrock with AWS credentials. If you already use Bedrock, rebuild the API image (stale server bundles can still show old errors).",
    );
  }
  return { apiKey, model, base };
}

function bedrockClient(): BedrockRuntimeClient {
  const region = bedrockRegion();
  const endpoint = process.env.BEDROCK_ENDPOINT_URL?.trim();
  return new BedrockRuntimeClient({
    region,
    ...(endpoint ? { endpoint } : {}),
  });
}

/** Merge consecutive same-role messages so Bedrock Converse alternation rules hold. */
function mergeAdjacentSameRole(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n\n${m.content}`;
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

function messagesToBedrockConverse(messages: ChatMessage[]): {
  system: { text: string }[];
  messages: { role: "user" | "assistant"; content: { text: string }[] }[];
} {
  const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content.trim()).filter(Boolean);
  const jsonHint =
    "\n\nYou must respond with a single valid JSON object only. No markdown fences, no prose before or after.";
  const systemText = (systemParts.length ? systemParts.join("\n\n") : "You are a helpful assistant.") + jsonHint;
  const system = [{ text: systemText }];

  let conv = mergeAdjacentSameRole(messages);
  if (conv.length === 0) {
    conv = [{ role: "user", content: "{}" }];
  }
  if (conv[0].role === "assistant") {
    conv = [{ role: "user", content: "Follow the instructions in the system message and reply." }, ...conv];
  }

  const brMessages = conv.map((m) => ({
    role: m.role as "user" | "assistant",
    content: [{ text: m.content }],
  }));

  return { system, messages: brMessages };
}

async function completeJsonBedrock(messages: ChatMessage[]): Promise<unknown> {
  const modelId = bedrockModelId();
  const { system, messages: convMessages } = messagesToBedrockConverse(messages);
  const client = bedrockClient();
  const cmd = new ConverseCommand({
    modelId,
    system,
    messages: convMessages,
    inferenceConfig: {
      maxTokens: bedrockMaxTokens(),
      temperature: (() => {
        const t = Number(process.env.BEDROCK_TEMPERATURE);
        return Number.isFinite(t) && t >= 0 && t <= 1 ? t : 0.2;
      })(),
    },
  });

  let response;
  try {
    response = await client.send(cmd);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Bedrock error: ${msg.slice(0, 1200)}`);
  }

  const blocks = response.output?.message?.content ?? [];
  let text = "";
  for (const block of blocks) {
    if (block && "text" in block && typeof block.text === "string") {
      text += block.text;
    }
  }
  if (!text.trim()) {
    const reason = response.stopReason ?? "unknown";
    throw new Error(`Empty completion from Bedrock (stopReason=${reason})`);
  }
  return parseJsonObject(text);
}

/** True when link enrichment (optional LLM) can run. */
export function isLlmConfigured(): boolean {
  const p = getResolvedProvider();
  if (p === "openai") return Boolean(openaiApiKey());
  if (p === "gemini") return Boolean(geminiApiKey());
  return p === "bedrock";
}

/** Safe snapshot for /health (no secret values). */
export function getLlmHealthSnapshot(): {
  llmProviderEnv: string | null;
  llmProviderResolved: LlmProvider;
  hasGeminiKey: boolean;
  hasOpenaiKey: boolean;
  bedrockRegion: string;
  bedrockModelId: string;
} {
  return {
    llmProviderEnv: process.env.LLM_PROVIDER?.trim() || null,
    llmProviderResolved: getResolvedProvider(),
    hasGeminiKey: Boolean(geminiApiKey()),
    hasOpenaiKey: Boolean(openaiApiKey()),
    bedrockRegion: bedrockRegion(),
    bedrockModelId: bedrockModelId(),
  };
}

/** Parse JSON from model output; strip accidental fences. */
export function parseJsonObject(raw: string): unknown {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return JSON.parse(t) as unknown;
}

function messagesToGeminiPayload(messages: ChatMessage[]): {
  systemInstruction?: { parts: { text: string }[] };
  contents: { role: "user" | "model"; parts: { text: string }[] }[];
} {
  const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content.trim());
  const systemInstruction =
    systemParts.length > 0 ? { parts: [{ text: systemParts.join("\n\n") }] } : undefined;

  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const role = m.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: m.content }] });
  }
  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "{}" }] });
  }
  return { systemInstruction, contents };
}

async function completeJsonGemini(messages: ChatMessage[]): Promise<unknown> {
  const { apiKey, model, base } = geminiConfig();
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const { systemInstruction, contents } = messagesToGeminiPayload(messages);
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };
  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error ${res.status}: ${errText.slice(0, 800)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error(`Gemini: ${data.error.message}`);
  const parts = data.candidates?.[0]?.content?.parts;
  const text = parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Empty completion from Gemini");
  return parseJsonObject(text);
}

async function completeJsonOpenAI(messages: ChatMessage[]): Promise<unknown> {
  const { apiKey, baseURL, model } = openaiConfig();
  const url = `${baseURL}/chat/completions`;
  const body = {
    model,
    messages,
    temperature: 0.2,
    response_format: { type: "json_object" },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty completion from OpenAI");
  return parseJsonObject(content);
}

export async function completeJson(messages: ChatMessage[]): Promise<unknown> {
  let provider = getResolvedProvider();
  if (provider === "gemini" && !geminiApiKey()) provider = "bedrock";
  if (provider === "openai" && !openaiApiKey()) provider = "bedrock";
  if (provider === "openai") {
    return completeJsonOpenAI(messages);
  }
  if (provider === "gemini") {
    return completeJsonGemini(messages);
  }
  return completeJsonBedrock(messages);
}

export async function completeJsonWithRetry<T>(
  messages: ChatMessage[],
  validate: (obj: unknown) => T,
  repairHint?: string,
): Promise<T> {
  const hint =
    repairHint ||
    "Return ONLY valid JSON matching the schema from the instructions. Fix missing keys, enums, and array lengths.";
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msgs =
        attempt === 0
          ? messages
          : [
              ...messages,
              {
                role: "user" as const,
                content: `${hint} Validation error: ${
                  lastErr instanceof Error ? lastErr.message : String(lastErr)
                }`,
              },
            ];
      const obj = await completeJson(msgs);
      return validate(obj);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
