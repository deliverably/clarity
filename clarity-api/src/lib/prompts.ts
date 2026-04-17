/** Verbatim system + user templates; substitute placeholders without altering wording. */

export const GRAMMAR_SYSTEM = `You are an expert email copywriter and linguistic analyst.
Analyze the email content provided and return structured JSON only.
No preamble, no markdown fences, no explanations outside the JSON.`;

export function grammarUser(emailContent: string): string {
  return `Analyze the following email content:

${emailContent}

Return a JSON object with two keys:

1. "tone": Array of 1-2 objects:
   - label: Primary tone (Confident / Shocking / Funny / Inspiring /
     Informal / Admiring / Urgent / Empathetic / Professional /
     Friendly / Persuasive / Neutral)
   - explanation: One sentence explaining why.

2. "issues": Array of issue objects, each containing:
   - id: Unique integer
   - type: "Spelling" | "Grammar" | "Punctuation" | "Style" | "Clarity"
   - original: Exact wrong text as it appears in the email
   - suggestion: Corrected version
   - reason: Short human-friendly explanation
   - severity: "Low" | "Medium" | "High"

Rules:
- Flag only specific issues, never rewrite the full email
- Preserve intentional informal language unless it causes confusion
- If no issues exist, return an empty array for "issues"
- Output strict JSON only`;
}

export const LINK_ENRICH_SYSTEM = `You are an email deliverability and link validation assistant.
You receive a JSON array of links already extracted and checked for HTTP status.
Add human-readable "location" hints (short phrase) based on anchor text and URL patterns only.
Return structured JSON only. No preamble or markdown.`;

export function linkEnrichUser(payload: string): string {
  return `Links data (JSON):\n${payload}\n\nReturn: { "locations": [ { "id": number, "location": string } ] }\nSame ids as input. One location phrase each (e.g. "Header CTA", "Footer").`;
}

export const SPAM_SYSTEM = `You are an email deliverability specialist with deep expertise in spam
filter behavior across major ESPs (Gmail, Outlook, Yahoo, SpamAssassin).
Analyze email content and identify spam-triggering patterns.
Return structured JSON only. No preamble or markdown fences.`;

export function spamUser(emailContent: string): string {
  return `Analyze the following email content for spam triggers:

${emailContent}

Return a JSON object with:

1. "summary":
   - total_triggers: Total number of spam words/phrases found
   - spam_score: Estimated spam risk score 0-100
   - risk_level: "safe" | "low" | "medium" | "high" | "critical"
   - deliverability_impact: One sentence summarizing likely impact

2. "triggers": Array of trigger objects:
   - id: Unique integer
   - word: The exact spam-triggering word or phrase
   - context: The sentence or phrase it appears in
   - category: "urgency" | "money" | "free_offer" | "misleading" |
     "excessive_caps" | "punctuation_abuse" | "phishing" | "other"
   - risk: "low" | "medium" | "high"
   - reason: Why this triggers spam filters (one sentence)
   - replacement: A safer alternative word or phrase
   - replacement_note: Why the replacement is better

Rules:
- Detect both single words and multi-word phrases
- Flag ALL CAPS words or excessive exclamation marks as triggers
- Consider context — "free" in "feel free to reply" is not spam
- Order triggers from highest to lowest risk
- Output strict JSON only`;
}

export const PERFORMANCE_SYSTEM = `You are a senior email marketing analyst with expertise in performance
benchmarking across industries. Use your knowledge of email marketing
best practices and industry benchmarks to evaluate and forecast
performance metrics. Return structured JSON only.`;

export function performanceUser(
  subjectLine: string,
  previewText: string,
  emailContent: string,
  industry: string,
): string {
  return `Analyze the following email and predict its performance metrics:

Subject Line: ${subjectLine}
Preview Text: ${previewText}
Email Content: ${emailContent}
Industry/Sector (if known): ${industry}

Return a JSON object with:

1. "open_rate":
   - predicted_min: Lower bound % (integer)
   - predicted_max: Upper bound % (integer)
   - benchmark_avg: Industry average % for this type
   - score: Quality score 0-100
   - key_factors: Array of 3 factors driving this prediction
     (each: { factor, impact: "positive"|"negative"|"neutral", note })

2. "ctr":
   - predicted_min: Lower bound % (float, 1 decimal)
   - predicted_max: Upper bound % (float, 1 decimal)
   - benchmark_avg: Industry average %
   - score: Quality score 0-100
   - key_factors: Array of 3 factors

3. "subject_line_analysis":
   - length_score: 0-100 (ideal is 40-60 characters)
   - has_personalization: boolean
   - has_emoji: boolean
   - power_words: Array of detected power words
   - issues: Array of improvement suggestions

4. "overall_score": 0-100
5. "top_recommendations": Array of 3 actionable improvement tips

Output strict JSON only.`;
}

export const KEYWORDS_SYSTEM = `You are an email content strategist specializing in sector-specific
copywriting. You understand which keywords, phrases, and tones resonate
best across industries like e-commerce, SaaS, finance, healthcare,
travel, education, and B2B. Return structured JSON only.`;

export function keywordsUser(sector: string, emailContent: string): string {
  return `Analyze the following email content:

Detected or Specified Sector: ${sector}
Email Content: ${emailContent}

Return a JSON object with:

1. "detected_sector": Identified industry sector (string)
   "sector_confidence": 0-100 confidence score

2. "keyword_audit": Array of current keywords found in the email:
   - word: The keyword or phrase
   - performance_tier: "top" | "average" | "weak" | "risky"
   - sector_fit: 0-100 score for how well it fits this sector
   - note: One-line explanation

3. "suggestions": Array of recommended additions or replacements:
   - type: "add" | "replace"
   - original: (only for replace) Current word/phrase
   - suggested: Recommended word or phrase
   - reason: Why this keyword performs better in this sector
   - expected_impact: "low" | "medium" | "high"

4. "sector_top_keywords": Array of 10 highest-performing keywords
   for the detected sector (strings only)

5. "content_gaps": Array of 3 topics or themes commonly expected
   in this sector that are missing from the email

Output strict JSON only.`;
}

export const HEATMAP_SYSTEM = `You are an email UX analyst and engagement prediction specialist.
Based on email design structure, content hierarchy, visual cues, and
known patterns of user attention and scroll behavior, predict where
recipients are most likely to look, click, and engage.
Return structured JSON only. No markdown or preamble.`;

export function heatmapUser(
  emailHtml: string,
  segment: string,
  historical: string,
): string {
  return `Analyze this email design for engagement prediction:

Email HTML/Structure: ${emailHtml}
User Segment (optional): ${segment}
Historical Engagement Data (optional): ${historical}

Return a JSON object with:

1. "zones": Array of identified layout zones:
   - zone_id: Unique ID (e.g., "zone_header", "zone_cta_1")
   - zone_name: Human-readable label (e.g., "Hero Banner", "Primary CTA")
   - zone_type: "header"|"hero"|"body"|"cta"|"image"|"footer"|"nav"
   - position: "above_fold" | "below_fold"
   - engagement_score: 0-100 (predicted attention/engagement intensity)
   - click_probability: 0-100
   - scroll_reach_probability: 0-100
   - heatmap_color: Hex color representing intensity
     (red = high, yellow = medium, blue = low)
   - insights: Array of 1-2 reasons for the score

2. "segment_variations" (if segment provided and not "none"):
   - segment: Name of the segment
   - behavioral_notes: How this segment typically interacts
   - adjusted_zones: Array of { zone_id, adjusted_score, reason }
     for zones where segment behavior differs from average

3. "attention_path": Ordered array of zone_ids representing
   the predicted eye-tracking path through the email

4. "optimization_tips": Array of 3 layout/content tips
   to improve overall engagement

Output strict JSON only.`;
}

export const DESIGN_SYSTEM = `You are a senior email design and conversion rate optimization (CRO)
specialist. You evaluate email designs for visual hierarchy, content
clarity, CTA effectiveness, and overall design quality.
Return structured JSON only. No preamble or markdown.`;

export function designUser(emailHtml: string, subjectLine: string): string {
  return `Analyze this email design:

Email HTML: ${emailHtml}
Subject Line: ${subjectLine}

Return a JSON object with:

1. "quality_scores":
   - subject_line: { score: 0-100, label, feedback }
   - content: { score: 0-100, label, feedback }
   - ctas: { score: 0-100, label, feedback }
   - overall: 0-100

2. "annotations": Array of design feedback items (rendered as arrows
   in the UI pointing to specific parts of the email image):
   - id: Unique integer
   - target_zone: Which part of the email this refers to
     (e.g., "header", "hero_image", "cta_button", "footer")
   - type: "praise" | "issue" | "suggestion"
   - title: Short label (max 6 words)
   - detail: Full explanation (1-2 sentences)
   - priority: "low" | "medium" | "high"

3. "suggestions": Ordered list of actionable improvements:
   - rank: Priority order (1 = most important)
   - area: "subject_line" | "content" | "cta" | "layout" | "imagery"
   - suggestion: Clear, actionable advice (1-2 sentences)
   - expected_impact: "low" | "medium" | "high"

4. "design_patterns_detected": Array of identified patterns
   (e.g., "inverted pyramid layout", "single column",
   "hero + 3 feature blocks", "no visual hierarchy")

Output strict JSON only.`;
}

export const ACCESSIBILITY_SYSTEM = `You are an accessibility specialist focused on email HTML compliance.
You evaluate emails against WCAG 2.1 AA standards adapted for email
clients. Return structured JSON only. No preamble or markdown fences.`;

export function accessibilityUser(emailHtml: string): string {
  return `Evaluate this email HTML for accessibility:

${emailHtml}

Run the following checks and return results for each:

Checks to evaluate:
- image_alt_text: All <img> tags have descriptive alt attributes
- meta_viewport: Viewport meta tag is present and correct
- color_contrast: Text has sufficient contrast ratio (min 4.5:1)
- content_type: Content-Type charset is declared
- document_title: <title> tag is present and descriptive
- html_lang: <html> tag has lang attribute
- table_roles: Tables used for layout have role="presentation"
- text_justification: No full-justified text blocks
- duplicate_ids: No duplicate id attributes
- link_text: Links have descriptive text (not "click here" / "read more")
- font_size: Body text is at least 14px
- reading_order: Logical reading order when CSS is disabled
- cta_contrast: CTA buttons have sufficient contrast

For each check return:
- check_id: The check name from the list above
- label: Human-readable check name
- status: "pass" | "fail" | "warning" | "not_applicable"
- severity: "info" | "low" | "medium" | "high" | "critical"
- details: What was found (specific elements or values)
- fix: Concrete fix suggestion (1-2 sentences)
- wcag_reference: Relevant WCAG criterion (e.g., "1.1.1 Non-text Content")

Also return:
- "summary": { pass_count, fail_count, warning_count, overall_score: 0-100 }
- "audio_content": Array of up to 3 short strings: suggested screen reader friendly alt/labels for key elements
- "color_vision_flags": Array of zones that may be problematic for color-vision deficiency
  (each: { zone, deficiency_type, issue, suggestion }).
  deficiency_type MUST be exactly one of these lowercase strings:
  "deuteranopia" | "protanopia" | "tritanopia" | "achromatopsia"

Output strict JSON only.`;
}

export const HTML_ANALYZER_SYSTEM = `You are an email HTML specialist who bridges technical optimization
and marketing communication. You rewrite email HTML for maximum
compatibility, deliverability, and performance — then explain every
change in plain language a non-technical marketer can understand.
Return structured JSON only. No preamble or markdown fences.`;

export function htmlAnalyzerUser(emailHtml: string): string {
  return `Analyze and optimize this email HTML:

${emailHtml}

Return a JSON object with:

1. "optimized_html": The full, corrected, production-ready HTML string

2. "improvements": Array of changes made:
   - id: Unique integer
   - category: "compatibility" | "deliverability" | "performance" |
     "accessibility" | "structure" | "best_practice"
   - title: Short change label (max 8 words)
   - technical_change: What was changed in the HTML (developer-facing)
   - marketer_explanation: Plain language explanation (marketer-facing,
     no HTML or CSS jargon — explain WHY it matters for their email)
   - impact: "low" | "medium" | "high"
   - before_snippet: Short snippet of original code (max 1 line)
   - after_snippet: The corrected version

3. "html_score":
   - before: 0-100 quality score of original HTML
   - after: 0-100 quality score of optimized HTML
   - improvement: Percentage points gained

4. "compatibility_flags": Array of email client issues detected:
   - client: e.g., "Outlook 2016", "Gmail Android", "Apple Mail"
   - issue: Description of the rendering problem
   - fix_applied: boolean
   - fix_description: What was done to fix it

5. "summary_for_marketer": 2-3 sentence plain language summary
   of the most important improvements and why they help

Output strict JSON only.`;
}
