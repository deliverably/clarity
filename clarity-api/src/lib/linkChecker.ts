export type CheckResult = {
  finalUrl: string;
  statusCode: number | null;
  hops: number;
  error?: string;
};

const TRACKING_HOST_FRAGMENTS = [
  "googleads",
  "doubleclick",
  "facebook.com/tr",
  "fb.com/tr",
  "list-manage",
  "sendgrid",
  "hubspot",
  "ct.sendgrid",
  "click.",
  "links.",
  "urldefense",
];

export function looksLikeTrackingUrl(url: string): boolean {
  const u = url.toLowerCase();
  return TRACKING_HOST_FRAGMENTS.some((f) => u.includes(f)) || /[?&]utm_/i.test(u);
}

/** Follow redirects manually to count hops (response.redirect not always enough across runtimes). */
export async function checkUrl(
  initialUrl: string,
  opts?: { maxHops?: number; timeoutMs?: number },
): Promise<CheckResult> {
  const maxHops = opts?.maxHops ?? 10;
  const timeoutMs = opts?.timeoutMs ?? 12000;
  let current = initialUrl;
  let hops = 0;
  let lastCode: number | null = null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let i = 0; i <= maxHops; i++) {
      const reqInit: RequestInit = {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "ClarityLinkBot/1.0 (+https://example.com)",
          accept: "*/*",
        },
      };

      let res = await fetch(current, reqInit).catch((e: Error) => {
        throw new Error(e.message || "fetch failed");
      });

      if (res.status === 405 || res.status === 501) {
        res = await fetch(current, { ...reqInit, method: "GET" }).catch((e: Error) => {
          throw new Error(e.message || "fetch failed");
        });
      }

      lastCode = res.status;

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) {
          return { finalUrl: current, statusCode: lastCode, hops, error: "redirect without location" };
        }
        hops += 1;
        current = new URL(loc, current).href;
        continue;
      }

      return { finalUrl: current, statusCode: lastCode, hops };
    }
    return { finalUrl: current, statusCode: lastCode, hops, error: "too many redirects" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { finalUrl: current, statusCode: null, hops, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
