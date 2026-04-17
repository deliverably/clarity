import * as cheerio from "cheerio";

export type ExtractedLink = {
  url: string;
  anchor_text: string;
  /** 0-based order in document */
  index: number;
};

function normalizeUrl(href: string, baseUrl?: string): string | null {
  const t = href.trim();
  if (!t || t.startsWith("#") || t.toLowerCase().startsWith("javascript:") || t.toLowerCase().startsWith("mailto:")) {
    return null;
  }
  try {
    const base = baseUrl?.endsWith("/") ? baseUrl : `${baseUrl || "https://email.invalid"}/`;
    return new URL(t, base).href;
  } catch {
    return null;
  }
}

export function extractLinksFromHtml(html: string, baseUrl?: string): ExtractedLink[] {
  const $ = cheerio.load(html);
  const out: ExtractedLink[] = [];
  let index = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const url = normalizeUrl(href, baseUrl);
    if (!url) return;
    const imgs = $(el).find("img[alt]");
    let anchor = $(el).text().replace(/\s+/g, " ").trim();
    if (!anchor && imgs.length) {
      anchor = imgs
        .map((_, i) => $(i).attr("alt") || "")
        .get()
        .join(" ")
        .trim();
    }
    if (!anchor) anchor = "(no text)";
    out.push({ url, anchor_text: anchor.slice(0, 500), index });
    index += 1;
  });
  return out;
}

export function guessLocation(index: number, total: number, anchor: string): string {
  const a = anchor.toLowerCase();
  if (index === 0) return "Primary / top link";
  if (index === total - 1 && /unsubscribe|preferences|opt.?out/i.test(a)) return "Footer unsubscribe";
  if (/shop|buy|cta|get started|sign up|subscribe/i.test(a)) return "CTA";
  if (total > 1 && index < Math.ceil(total * 0.25)) return "Header / upper body";
  if (index > Math.floor(total * 0.75)) return "Footer area";
  return `Body link ${index + 1}`;
}
