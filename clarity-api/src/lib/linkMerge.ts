import { extractLinksFromHtml, guessLocation } from "./extractLinks.js";
import { checkUrl, hostOf, looksLikeTrackingUrl, type CheckResult } from "./linkChecker.js";
import { completeJson, isLlmConfigured } from "./llm.js";
import { LINK_ENRICH_SYSTEM, linkEnrichUser } from "./prompts.js";
import { z } from "zod";

const locationsResponse = z.object({
  locations: z.array(z.object({ id: z.number().int(), location: z.string() })),
});

export type LinkAnalysisRow = {
  id: number;
  url: string;
  anchor_text: string;
  location: string;
  status: string;
  status_note: string;
  risk_level: "none" | "low" | "medium" | "high";
  hops?: number;
  latency_ms?: number | null;
};

function classify(
  url: string,
  check: CheckResult,
  expectedHost?: string | null,
): Pick<LinkAnalysisRow, "status" | "status_note" | "risk_level"> {
  if (check.error || check.statusCode === null || check.statusCode >= 400) {
    return {
      status: "broken",
      status_note: check.error || `HTTP ${check.statusCode ?? "error"}.`,
      risk_level: "high",
    };
  }
  if (check.hops > 2) {
    return {
      status: "redirect_loop",
      status_note: `More than 2 redirects (${check.hops} hops) before final response.`,
      risk_level: "medium",
    };
  }
  const exp = expectedHost?.toLowerCase().replace(/^www\./, "") || null;
  const finalH = hostOf(check.finalUrl);
  if (exp && finalH) {
    const matches = finalH === exp || finalH.endsWith(`.${exp}`);
    if (!matches) {
      return {
        status: "wrong_redirect",
        status_note: `Final host ${finalH} differs from expected brand ${exp}.`,
        risk_level: "high",
      };
    }
  }
  if (url.trim().toLowerCase().startsWith("http://")) {
    return {
      status: "http_only",
      status_note: "Non-HTTPS link may trigger spam filters.",
      risk_level: "medium",
    };
  }
  if (looksLikeTrackingUrl(url) || looksLikeTrackingUrl(check.finalUrl)) {
    return {
      status: "tracking_url",
      status_note: "Appears to be a tracking or redirect wrapper URL.",
      risk_level: "low",
    };
  }
  if (check.statusCode >= 200 && check.statusCode < 400) {
    return {
      status: "ok",
      status_note: "Resolves correctly.",
      risk_level: "none",
    };
  }
  return {
    status: "unknown",
    status_note: "Could not classify response.",
    risk_level: "low",
  };
}

async function enrichLocations(
  rows: { id: number; url: string; anchor_text: string }[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (!isLlmConfigured() || rows.length === 0) return map;
  try {
    const payload = JSON.stringify(rows);
    const raw = await completeJson([
      { role: "system", content: LINK_ENRICH_SYSTEM },
      { role: "user", content: linkEnrichUser(payload) },
    ]);
    const parsed = locationsResponse.safeParse(raw);
    if (!parsed.success) return map;
    for (const loc of parsed.data.locations) {
      map.set(loc.id, loc.location);
    }
  } catch {
    /* optional */
  }
  return map;
}

export async function analyzeLinks(emailHtml: string, expectedHost?: string | null, baseUrl?: string) {
  const extracted = extractLinksFromHtml(emailHtml, baseUrl);
  const total = extracted.length;
  const checks: CheckResult[] = [];
  for (const row of extracted) {
    checks.push(await checkUrl(row.url));
  }

  const prelim = extracted.map((e, i) => ({
    id: i + 1,
    url: e.url,
    anchor_text: e.anchor_text,
    check: checks[i]!,
  }));

  const locMap = await enrichLocations(prelim.map((p) => ({ id: p.id, url: p.url, anchor_text: p.anchor_text })));

  const links: LinkAnalysisRow[] = prelim.map((p, idx) => {
    const e = extracted[idx]!;
    const loc =
      locMap.get(p.id) ||
      guessLocation(e.index, extracted.length, e.anchor_text);
    const cls = classify(p.url, p.check, expectedHost);
    const latency_ms =
      typeof p.check.latency_ms === "number" && Number.isFinite(p.check.latency_ms)
        ? Math.max(0, Math.round(p.check.latency_ms))
        : null;
    return {
      id: p.id,
      url: p.url,
      anchor_text: p.anchor_text,
      location: loc,
      hops: p.check.hops,
      latency_ms,
      ...cls,
    };
  });

  const ok_count = links.filter((l) => l.status === "ok").length;
  const error_count = total - ok_count;
  const ok_percent = total === 0 ? 0 : Math.round((ok_count / total) * 100);
  const error_percent = total === 0 ? 0 : Math.round((error_count / total) * 100);

  const issueCounts = new Map<string, number>();
  for (const l of links) {
    if (l.status !== "ok") {
      issueCounts.set(l.status, (issueCounts.get(l.status) || 0) + 1);
    }
  }
  const top_issues = [...issueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  const latencies = links
    .map((l) => l.latency_ms)
    .filter((n): n is number => typeof n === "number" && n >= 0);
  const avg_latency_ms =
    latencies.length === 0 ? null : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);

  return {
    summary: {
      total,
      ok_count,
      error_count,
      ok_percent,
      error_percent,
      top_issues,
      avg_latency_ms,
      trends_30d: null,
    },
    links,
  };
}
