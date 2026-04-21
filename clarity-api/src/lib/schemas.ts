import { z } from "zod";

const toneLabel = z.enum([
  "Confident",
  "Shocking",
  "Funny",
  "Inspiring",
  "Informal",
  "Admiring",
  "Urgent",
  "Empathetic",
  "Professional",
  "Friendly",
  "Persuasive",
  "Neutral",
]);

export const grammarResponseSchema = z.object({
  tone: z
    .array(
      z.object({
        label: z.union([toneLabel, z.string()]),
        explanation: z.string(),
      }),
    )
    .min(1)
    .max(3),
  issues: z.array(
    z.object({
      id: z.number().int(),
      type: z.enum(["Spelling", "Grammar", "Punctuation", "Style", "Clarity"]),
      original: z.string(),
      suggestion: z.string(),
      reason: z.string(),
      severity: z.enum(["Low", "Medium", "High"]),
    }),
  ),
});

const trends30dSchema = z
  .object({
    ok_percent_delta: z.number().nullable(),
    broken_delta: z.number().nullable(),
    redirects_delta: z.number().nullable(),
    avg_latency_ms_delta: z.number().nullable(),
  })
  .nullable()
  .optional();

export const linkSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  ok_count: z.number().int().nonnegative(),
  error_count: z.number().int().nonnegative(),
  ok_percent: z.number().int(),
  error_percent: z.number().int(),
  top_issues: z.array(z.string()).max(10),
  /** Mean latency (ms) over links with a measured `latency_ms`; null if none. */
  avg_latency_ms: z.number().nonnegative().nullable().optional(),
  /** Populated when historical analytics exist; otherwise omit or null. */
  trends_30d: trends30dSchema,
});

const linkStatus = z.enum([
  "ok",
  "broken",
  "redirect_loop",
  "wrong_redirect",
  "tracking_url",
  "http_only",
  "unknown",
]);

export const linkRowSchema = z.object({
  id: z.number().int(),
  url: z.string(),
  anchor_text: z.string(),
  location: z.string(),
  status: linkStatus,
  status_note: z.string(),
  risk_level: z.enum(["none", "low", "medium", "high"]),
  hops: z.number().int().nonnegative().optional(),
  latency_ms: z.number().int().nonnegative().nullable().optional(),
});

export const linksResponseSchema = z.object({
  summary: linkSummarySchema,
  links: z.array(linkRowSchema),
});

export const spamResponseSchema = z.object({
  summary: z.object({
    total_triggers: z.number().int().nonnegative(),
    spam_score: z.number().min(0).max(100),
    risk_level: z.enum(["safe", "low", "medium", "high", "critical"]),
    deliverability_impact: z.string(),
  }),
  triggers: z.array(
    z.object({
      id: z.number().int(),
      word: z.string(),
      context: z.string(),
      category: z.enum([
        "urgency",
        "money",
        "free_offer",
        "misleading",
        "excessive_caps",
        "punctuation_abuse",
        "phishing",
        "other",
      ]),
      risk: z.enum(["low", "medium", "high"]),
      reason: z.string(),
      replacement: z.string(),
      replacement_note: z.string(),
    }),
  ),
});

const factorSchema = z.object({
  factor: z.string(),
  impact: z.enum(["positive", "negative", "neutral"]),
  note: z.string(),
});

export const performanceResponseSchema = z.object({
  open_rate: z.object({
    predicted_min: z.number().int(),
    predicted_max: z.number().int(),
    benchmark_avg: z.number().int(),
    score: z.number().min(0).max(100),
    key_factors: z.array(factorSchema).min(1),
  }),
  ctr: z.object({
    predicted_min: z.number(),
    predicted_max: z.number(),
    benchmark_avg: z.number(),
    score: z.number().min(0).max(100),
    key_factors: z.array(factorSchema).min(1),
  }),
  subject_line_analysis: z.object({
    length_score: z.number().min(0).max(100),
    has_personalization: z.boolean(),
    has_emoji: z.boolean(),
    power_words: z.array(z.string()),
    issues: z.array(z.string()),
  }),
  overall_score: z.number().min(0).max(100),
  top_recommendations: z.array(z.string()).min(1),
});

export const keywordsResponseSchema = z.object({
  detected_sector: z.string(),
  sector_confidence: z.number().min(0).max(100),
  keyword_audit: z.array(
    z.object({
      word: z.string(),
      performance_tier: z.enum(["top", "average", "weak", "risky"]),
      sector_fit: z.number().min(0).max(100),
      note: z.string(),
    }),
  ),
  suggestions: z.array(
    z.object({
      type: z.enum(["add", "replace"]),
      /** LLM often sends null for "add" rows with no prior phrase. */
      original: z.string().nullish(),
      suggested: z.string(),
      reason: z.string(),
      expected_impact: z.enum(["low", "medium", "high"]),
    }),
  ),
  sector_top_keywords: z.array(z.string()),
  content_gaps: z.array(z.string()),
});

export const heatmapResponseSchema = z.object({
  zones: z.array(
    z.object({
      zone_id: z.string(),
      zone_name: z.string(),
      zone_type: z.enum(["header", "hero", "body", "cta", "image", "footer", "nav"]),
      position: z.enum(["above_fold", "below_fold"]),
      engagement_score: z.number().min(0).max(100),
      click_probability: z.number().min(0).max(100),
      scroll_reach_probability: z.number().min(0).max(100),
      heatmap_color: z.string(),
      insights: z.array(z.string()).min(1),
    }),
  ),
  /** LLM may omit this or send null when no segment split was modeled. */
  segment_variations: z
    .object({
      segment: z.string(),
      behavioral_notes: z.string(),
      adjusted_zones: z.array(
        z.object({
          zone_id: z.string(),
          adjusted_score: z.number(),
          reason: z.string(),
        }),
      ),
    })
    .nullish(),
  attention_path: z.array(z.string()),
  optimization_tips: z.array(z.string()).min(1),
});

export const designResponseSchema = z.object({
  quality_scores: z.object({
    subject_line: z.object({
      score: z.number().min(0).max(100),
      label: z.string(),
      feedback: z.string(),
    }),
    content: z.object({
      score: z.number().min(0).max(100),
      label: z.string(),
      feedback: z.string(),
    }),
    ctas: z.object({
      score: z.number().min(0).max(100),
      label: z.string(),
      feedback: z.string(),
    }),
    overall: z.number().min(0).max(100),
  }),
  annotations: z.array(
    z.object({
      id: z.number().int(),
      target_zone: z.string(),
      type: z.enum(["praise", "issue", "suggestion"]),
      title: z.string(),
      detail: z.string(),
      priority: z.enum(["low", "medium", "high"]),
    }),
  ),
  suggestions: z.array(
    z.object({
      rank: z.number().int(),
      area: z.enum(["subject_line", "content", "cta", "layout", "imagery"]),
      suggestion: z.string(),
      expected_impact: z.enum(["low", "medium", "high"]),
    }),
  ),
  design_patterns_detected: z.array(z.string()),
});

const checkStatus = z.enum(["pass", "fail", "warning", "not_applicable"]);
const checkSeverity = z.enum(["info", "low", "medium", "high", "critical"]);

/** LLMs often return title case; API contract is lowercase. */
const colorVisionDeficiencySchema = z.preprocess(
  (val) => (typeof val === "string" ? val.toLowerCase().trim() : val),
  z.enum(["deuteranopia", "protanopia", "tritanopia", "achromatopsia"]),
);

export const accessibilityResponseSchema = z.object({
  summary: z.object({
    pass_count: z.number().int().nonnegative(),
    fail_count: z.number().int().nonnegative(),
    warning_count: z.number().int().nonnegative(),
    overall_score: z.number().min(0).max(100),
  }),
  checks: z.array(
    z.object({
      check_id: z.string(),
      label: z.string(),
      status: checkStatus,
      severity: checkSeverity,
      details: z.string(),
      fix: z.string(),
      wcag_reference: z.string(),
    }),
  ),
  /** Ordered lines for screen-reader-style narration (TTS); short lines preferred. */
  audio_content: z.array(z.string()).max(20).optional(),
  color_vision_flags: z.array(
    z.object({
      zone: z.string(),
      deficiency_type: colorVisionDeficiencySchema,
      issue: z.string(),
      suggestion: z.string(),
    }),
  ),
});

export const htmlAnalyzerResponseSchema = z.object({
  optimized_html: z.string(),
  improvements: z.array(
    z.object({
      id: z.number().int(),
      category: z.enum([
        "compatibility",
        "deliverability",
        "performance",
        "accessibility",
        "structure",
        "best_practice",
      ]),
      title: z.string(),
      technical_change: z.string(),
      marketer_explanation: z.string(),
      impact: z.enum(["low", "medium", "high"]),
      before_snippet: z.string(),
      after_snippet: z.string(),
    }),
  ),
  html_score: z.object({
    before: z.number().min(0).max(100),
    after: z.number().min(0).max(100),
    improvement: z.number(),
  }),
  compatibility_flags: z.array(
    z.object({
      client: z.string(),
      issue: z.string(),
      fix_applied: z.boolean(),
      fix_description: z.string(),
    }),
  ),
  summary_for_marketer: z.string(),
});
