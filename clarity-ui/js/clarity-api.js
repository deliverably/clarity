(function (global) {
  function baseUrl() {
    return String(global.CLARITY_API_BASE || "http://localhost:3000").replace(/\/$/, "");
  }

  function headers() {
    const h = { "Content-Type": "application/json" };
    if (global.CLARITY_API_KEY) {
      h["x-api-key"] = String(global.CLARITY_API_KEY);
    }
    return h;
  }

  var paths = {
    grammar: "/api/analyze/grammar",
    links: "/api/analyze/links",
    spam: "/api/analyze/spam",
    performance: "/api/analyze/performance",
    keywords: "/api/analyze/keywords",
    heatmap: "/api/analyze/heatmap",
    design: "/api/analyze/design",
    accessibility: "/api/analyze/accessibility",
    html: "/api/analyze/html",
  };

  async function runAnalysis(type, payload) {
    var p = paths[type];
    if (!p) throw new Error("Unknown analysis type: " + type);
    var res = await fetch(baseUrl() + p, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload || {}),
    });
    var text = await res.text();
    if (!res.ok) {
      throw new Error(text || res.statusText || String(res.status));
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("Invalid JSON from API");
    }
  }

  global.ClarityAPI = { runAnalysis: runAnalysis, paths: paths };
})(typeof window !== "undefined" ? window : globalThis);
