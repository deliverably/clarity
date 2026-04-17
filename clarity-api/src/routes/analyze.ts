import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { completeJsonWithRetry } from "../lib/llm.js";
import {
  GRAMMAR_SYSTEM,
  grammarUser,
  SPAM_SYSTEM,
  spamUser,
  PERFORMANCE_SYSTEM,
  performanceUser,
  KEYWORDS_SYSTEM,
  keywordsUser,
  HEATMAP_SYSTEM,
  heatmapUser,
  DESIGN_SYSTEM,
  designUser,
  ACCESSIBILITY_SYSTEM,
  accessibilityUser,
  HTML_ANALYZER_SYSTEM,
  htmlAnalyzerUser,
} from "../lib/prompts.js";
import {
  grammarResponseSchema,
  spamResponseSchema,
  performanceResponseSchema,
  keywordsResponseSchema,
  heatmapResponseSchema,
  designResponseSchema,
  accessibilityResponseSchema,
  htmlAnalyzerResponseSchema,
  linksResponseSchema,
} from "../lib/schemas.js";
import { analyzeLinks } from "../lib/linkMerge.js";

const emailContentBody = z.object({
  emailContent: z.string().max(500_000),
});

const grammarBody = emailContentBody;

const linksBody = z.object({
  emailHtml: z.string().max(2_000_000),
  expectedHost: z.string().max(255).optional().nullable(),
  baseUrl: z.string().url().optional(),
});

const spamBody = emailContentBody;

const performanceBody = z.object({
  subjectLine: z.string().max(500),
  previewText: z.string().max(2000).default(""),
  emailContent: z.string().max(500_000),
  industry: z.string().max(200).default("Unknown"),
});

const keywordsBody = z.object({
  emailContent: z.string().max(500_000),
  sector: z.string().max(200).default("Auto-detect"),
});

const heatmapBody = z.object({
  emailHtml: z.string().max(2_000_000),
  segment: z.string().max(200).default("none"),
  historicalJson: z.string().max(500_000).default("none"),
});

const designBody = z.object({
  emailHtml: z.string().max(2_000_000),
  subjectLine: z.string().max(500),
});

const accessibilityBody = z.object({
  emailHtml: z.string().max(2_000_000),
});

const htmlBody = z.object({
  emailHtml: z.string().max(2_000_000),
});

export async function registerAnalyzeRoutes(app: FastifyInstance) {
  app.post("/api/analyze/grammar", async (request, reply) => {
    const body = grammarBody.parse(request.body);
    const messages = [
      { role: "system" as const, content: GRAMMAR_SYSTEM },
      { role: "user" as const, content: grammarUser(body.emailContent) },
    ];
    const data = await completeJsonWithRetry(messages, (o) => grammarResponseSchema.parse(o));
    return reply.send(data);
  });

  app.post("/api/analyze/links", async (request, reply) => {
    const body = linksBody.parse(request.body);
    const merged = await analyzeLinks(body.emailHtml, body.expectedHost ?? null, body.baseUrl);
    const parsed = linksResponseSchema.safeParse(merged);
    if (!parsed.success) {
      return reply.status(500).send({ error: "Link response validation failed", details: parsed.error.flatten() });
    }
    return reply.send(parsed.data);
  });

  app.post("/api/analyze/spam", async (request, reply) => {
    const body = spamBody.parse(request.body);
    const messages = [
      { role: "system" as const, content: SPAM_SYSTEM },
      { role: "user" as const, content: spamUser(body.emailContent) },
    ];
    const data = await completeJsonWithRetry(messages, (o) => spamResponseSchema.parse(o));
    return reply.send(data);
  });

  app.post("/api/analyze/performance", async (request, reply) => {
    const body = performanceBody.parse(request.body);
    const messages = [
      { role: "system" as const, content: PERFORMANCE_SYSTEM },
      {
        role: "user" as const,
        content: performanceUser(body.subjectLine, body.previewText, body.emailContent, body.industry),
      },
    ];
    const data = await completeJsonWithRetry(messages, (o) => performanceResponseSchema.parse(o));
    return reply.send(data);
  });

  app.post("/api/analyze/keywords", async (request, reply) => {
    const body = keywordsBody.parse(request.body);
    const messages = [
      { role: "system" as const, content: KEYWORDS_SYSTEM },
      { role: "user" as const, content: keywordsUser(body.sector, body.emailContent) },
    ];
    const data = await completeJsonWithRetry(messages, (o) => keywordsResponseSchema.parse(o));
    return reply.send(data);
  });

  app.post("/api/analyze/heatmap", async (request, reply) => {
    const body = heatmapBody.parse(request.body);
    const messages = [
      { role: "system" as const, content: HEATMAP_SYSTEM },
      {
        role: "user" as const,
        content: heatmapUser(body.emailHtml, body.segment || "none", body.historicalJson || "none"),
      },
    ];
    const data = await completeJsonWithRetry(messages, (o) => heatmapResponseSchema.parse(o));
    return reply.send(data);
  });

  app.post("/api/analyze/design", async (request, reply) => {
    const body = designBody.parse(request.body);
    const messages = [
      { role: "system" as const, content: DESIGN_SYSTEM },
      { role: "user" as const, content: designUser(body.emailHtml, body.subjectLine) },
    ];
    const data = await completeJsonWithRetry(messages, (o) => designResponseSchema.parse(o));
    return reply.send(data);
  });

  app.post("/api/analyze/accessibility", async (request, reply) => {
    const body = accessibilityBody.parse(request.body);
    const messages = [
      { role: "system" as const, content: ACCESSIBILITY_SYSTEM },
      { role: "user" as const, content: accessibilityUser(body.emailHtml) },
    ];
    const data = await completeJsonWithRetry(messages, (o) => accessibilityResponseSchema.parse(o));
    return reply.send(data);
  });

  app.post("/api/analyze/html", async (request, reply) => {
    const body = htmlBody.parse(request.body);
    const messages = [
      { role: "system" as const, content: HTML_ANALYZER_SYSTEM },
      { role: "user" as const, content: htmlAnalyzerUser(body.emailHtml) },
    ];
    const data = await completeJsonWithRetry(messages, (o) => htmlAnalyzerResponseSchema.parse(o));
    return reply.send(data);
  });
}
