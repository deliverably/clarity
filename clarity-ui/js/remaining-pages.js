(function () {
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pageName() {
    var p = (location.pathname || "").split("/").pop() || "";
    return p.toLowerCase();
  }

  function bindSpamRunners(fn) {
    var a = document.getElementById("clarity-run-spam");
    if (a) a.addEventListener("click", fn);
    document.querySelectorAll("[data-clarity-run-spam]").forEach(function (el) {
      el.addEventListener("click", fn);
    });
  }

  function renderSpamListFromData(data, email, totalEl, metaEl, tbody) {
    var sum = data.summary || {};
    if (totalEl) totalEl.textContent = String(sum.total_triggers ?? 0);
    if (metaEl) {
      metaEl.textContent =
        (sum.risk_level || "") +
        " risk · spam score " +
        String(sum.spam_score ?? "") +
        " — " +
        (sum.deliverability_impact || "");
    }
    if (tbody) {
      tbody.innerHTML = "";
      (data.triggers || []).forEach(function (t) {
        var tr = document.createElement("tr");
        tr.className = "hover:bg-surface-container-low/50 transition-colors";
        tr.innerHTML =
          '<td class="px-8 py-5"><div class="flex items-center gap-3"><span class="w-2 h-2 rounded-full ' +
          (t.risk === "high" ? "bg-error" : t.risk === "medium" ? "bg-amber-500" : "bg-slate-300") +
          '"></span><span class="font-semibold text-on-surface">' +
          esc(t.word) +
          '</span></div><p class="text-xs text-on-surface-variant mt-1">' +
          esc(t.context) +
          "</p></td>" +
          '<td class="px-8 py-5"><span class="px-3 py-1.5 bg-tertiary-fixed text-on-tertiary-fixed-variant rounded-lg font-medium text-sm">' +
          esc(t.replacement) +
          "</span></td>" +
          '<td class="px-8 py-5 text-right"><button type="button" class="clarity-spam-apply text-primary font-bold text-sm hover:underline">Apply</button></td>';
        tr.querySelector(".clarity-spam-apply").addEventListener("click", function () {
          if (!email || !t.word) return;
          email.value = email.value.split(t.word).join(t.replacement || "");
        });
        tbody.appendChild(tr);
      });
    }
  }

  function initSpamList() {
    var email = document.getElementById("clarity-spam-email");
    var tbody = document.getElementById("clarity-spam-tbody");
    var totalEl = document.getElementById("clarity-spam-total");
    var meta = document.getElementById("clarity-spam-risk-meta");
    var status = document.getElementById("clarity-spam-status");
    var applyAll = document.getElementById("clarity-spam-apply-all");

    async function run() {
      if (status) status.textContent = "Analyzing…";
      try {
        var data = await window.ClarityAPI.runAnalysis("spam", {
          emailContent: (email && email.value) || "",
        });
        renderSpamListFromData(data, email, totalEl, meta, tbody);
        if (status) status.textContent = "Done.";
      } catch (e) {
        if (status) status.textContent = e.message || String(e);
      }
    }

    bindSpamRunners(run);
    if (applyAll && email) {
      applyAll.addEventListener("click", async function () {
        try {
          var data = await window.ClarityAPI.runAnalysis("spam", { emailContent: email.value || "" });
          var v = email.value;
          (data.triggers || []).forEach(function (t) {
            if (t.word && t.replacement) v = v.split(t.word).join(t.replacement);
          });
          email.value = v;
        } catch (e) {
          alert(e.message || String(e));
        }
      });
    }

    if (typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive()) {
      var bundle = window.clarityReadWorkflowBundle && window.clarityReadWorkflowBundle();
      if (bundle && bundle.analysis && bundle.analysis.spam && bundle.analysis.spam.status === "done" && bundle.analysis.spam.data) {
        if (email && bundle.plainText != null) email.value = bundle.plainText;
        renderSpamListFromData(bundle.analysis.spam.data, email, totalEl, meta, tbody);
        if (status) status.textContent = "Loaded from workspace.";
      }
    }
  }

  function highlightText(text, triggers) {
    var sorted = (triggers || []).slice().sort(function (a, b) {
      return String(b.word || "").length - String(a.word || "").length;
    });
    var out = esc(text);
    sorted.forEach(function (t) {
      var w = t.word;
      if (!w) return;
      var re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      out = out.replace(re, function (m) {
        return '<mark class="bg-error/20 border-b-2 border-error text-error px-1">' + esc(m) + "</mark>";
      });
    });
    return out;
  }

  function renderSpamVisualFromData(data, email) {
    var body = document.getElementById("clarity-spam-visual-body");
    var cards = document.getElementById("clarity-spam-visual-cards");
    var countEl = document.getElementById("clarity-spam-visual-count");
    var n = (data.summary && data.summary.total_triggers) || 0;
    if (countEl) countEl.textContent = String(n) + " Spam Words Found";
    if (body) {
      body.innerHTML =
        '<div class="prose prose-sm max-w-none text-slate-700 leading-relaxed">' +
        highlightText((email && email.value) || "", data.triggers || []) +
        "</div>";
    }
    if (cards) {
      cards.innerHTML = "";
      (data.triggers || []).slice(0, 8).forEach(function (t) {
        var div = document.createElement("div");
        div.className = "p-4 bg-surface-container-lowest rounded-xl border-l-4 border-error shadow-sm";
        div.innerHTML =
          '<div class="flex justify-between mb-2"><span class="text-[10px] font-extrabold uppercase text-error">' +
          esc(t.risk) +
          ' risk</span><span class="text-xs text-on-surface-variant">' +
          esc(t.category) +
          "</span></div>" +
          '<p class="text-sm font-semibold mb-2">Instead of <span class="text-error">' +
          esc(t.word) +
          "</span></p>" +
          '<button type="button" class="clarity-repl px-3 py-1.5 bg-primary-fixed rounded-lg text-xs font-bold">' +
          esc(t.replacement) +
          "</button>" +
          '<p class="text-xs text-on-surface-variant mt-2">' +
          esc(t.replacement_note) +
          "</p>";
        div.querySelector(".clarity-repl").addEventListener("click", function () {
          if (!email || !t.word) return;
          email.value = email.value.split(t.word).join(t.replacement || "");
        });
        cards.appendChild(div);
      });
    }
  }

  function initSpamVisual() {
    var email = document.getElementById("clarity-spam-email");
    var status = document.getElementById("clarity-spam-status");

    async function run() {
      if (status) status.textContent = "Analyzing…";
      try {
        var data = await window.ClarityAPI.runAnalysis("spam", {
          emailContent: (email && email.value) || "",
        });
        renderSpamVisualFromData(data, email);
        if (status) status.textContent = "Done.";
      } catch (e) {
        if (status) status.textContent = e.message || String(e);
      }
    }
    bindSpamRunners(run);

    if (typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive()) {
      var bundle = window.clarityReadWorkflowBundle && window.clarityReadWorkflowBundle();
      if (bundle && bundle.analysis && bundle.analysis.spam && bundle.analysis.spam.status === "done" && bundle.analysis.spam.data) {
        if (email && bundle.plainText != null) email.value = bundle.plainText;
        renderSpamVisualFromData(bundle.analysis.spam.data, email);
        if (status) status.textContent = "Loaded from workspace.";
      }
    }
  }

  function renderPerfSummaryUI(data) {
    var el = document.getElementById("clarity-perf-ui");
    if (!el || !data) return;
    el.classList.remove("hidden");
    var or = data.open_rate || {};
    var ctr = data.ctr || {};
    var recs = (data.top_recommendations || [])
      .slice(0, 6)
      .map(function (r) {
        return "<li>" + esc(r) + "</li>";
      })
      .join("");
    el.innerHTML =
      '<p class="text-lg font-bold text-indigo-800">Overall score: ' +
      esc(String(data.overall_score != null ? data.overall_score : "—")) +
      "</p>" +
      "<p><strong>Open rate</strong> (predicted): " +
      esc(or.predicted_min != null ? String(or.predicted_min) : "—") +
      "–" +
      esc(or.predicted_max != null ? String(or.predicted_max) : "—") +
      "% · benchmark avg " +
      esc(or.benchmark_avg != null ? String(or.benchmark_avg) : "—") +
      "%</p>" +
      "<p><strong>CTR</strong> (predicted): " +
      esc(ctr.predicted_min != null ? String(ctr.predicted_min) : "—") +
      "–" +
      esc(ctr.predicted_max != null ? String(ctr.predicted_max) : "—") +
      "%</p>" +
      '<p class="text-xs font-bold text-slate-500 uppercase mt-3">Top recommendations</p><ul class="list-disc pl-5 text-xs text-slate-600 space-y-1">' +
      recs +
      "</ul>";
  }

  function renderKwSummaryUI(data) {
    var el = document.getElementById("clarity-kw-ui");
    if (!el || !data) return;
    el.classList.remove("hidden");
    var sug = (data.suggestions || [])
      .slice(0, 10)
      .map(function (s) {
        return (
          "<li class=\"text-xs\"><strong>" +
          esc(s.suggested || "") +
          "</strong> — " +
          esc(s.reason || "") +
          ' <span class="text-slate-400">(' +
          esc(s.expected_impact || "") +
          ")</span></li>"
        );
      })
      .join("");
    el.innerHTML =
      "<p><strong>Detected sector:</strong> " +
      esc(data.detected_sector || "—") +
      (data.sector_confidence != null ? " · confidence " + esc(String(data.sector_confidence)) + "%" : "") +
      "</p>" +
      '<p class="text-xs font-bold text-slate-500 uppercase mt-3">Suggestions</p><ol class="list-decimal pl-5 space-y-1">' +
      sug +
      "</ol>";
  }

  function renderHeatSummaryUI(data) {
    var el = document.getElementById("clarity-heat-ui");
    if (!el || !data) return;
    el.classList.remove("hidden");
    var zones = data.zones || [];
    var blocks = zones
      .slice(0, 10)
      .map(function (z) {
        return (
          '<div class="rounded-lg border border-slate-100 p-3 text-xs bg-slate-50"><strong>' +
          esc(z.zone_name || z.zone_id || "Zone") +
          "</strong> · " +
          esc(z.zone_type || "") +
          " · engagement " +
          esc(z.engagement_score != null ? String(z.engagement_score) : "—") +
          "<br/><span class=\"text-slate-600\">" +
          esc((z.insights && z.insights[0]) || "") +
          "</span></div>"
        );
      })
      .join("");
    var tips = (data.optimization_tips || []).slice(0, 3).map(function (t) {
      return "<li>" + esc(t) + "</li>";
    });
    el.innerHTML =
      "<p class=\"font-bold text-indigo-800\">" + zones.length + " zones analyzed</p>" +
      '<div class="space-y-2 mt-2">' +
      blocks +
      "</div>" +
      '<p class="text-xs font-bold text-slate-500 uppercase mt-3">Optimization tips</p><ul class="list-disc pl-5 text-xs">' +
      tips.join("") +
      "</ul>";
  }

  function renderDesignFromData(data) {
    var q = data.quality_scores || {};
    var ov = document.getElementById("clarity-design-overall");
    if (ov) ov.textContent = String(q.overall ?? "—");
    function bar(idBar, idPct, block) {
      var s = block && block.score;
      if (s == null) return;
      var b = document.getElementById(idBar);
      var p = document.getElementById(idPct);
      if (b) b.style.width = Math.min(100, Math.max(0, s)) + "%";
      if (p) p.textContent = String(s) + "%";
    }
    bar("clarity-bar-subject", "clarity-pct-subject", q.subject_line);
    bar("clarity-bar-content", "clarity-pct-content", q.content);
    bar("clarity-bar-cta", "clarity-pct-cta", q.ctas);
    var ul = document.getElementById("clarity-design-suggestions-ul");
    if (ul) {
      ul.innerHTML = "";
      (data.suggestions || []).forEach(function (sug) {
        var li = document.createElement("li");
        li.textContent = (sug.suggestion || "") + " (" + (sug.expected_impact || "") + " impact)";
        ul.appendChild(li);
      });
    }
  }

  function initDesign() {
    var sub = document.getElementById("clarity-design-subject");
    var html = document.getElementById("clarity-design-html");
    var btn = document.getElementById("clarity-run-design");
    var st = document.getElementById("clarity-design-status");
    if (btn) {
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        if (st) st.textContent = "…";
        try {
          var data = await window.ClarityAPI.runAnalysis("design", {
            emailHtml: (html && html.value) || "",
            subjectLine: (sub && sub.value) || "",
          });
          renderDesignFromData(data);
          if (st) st.textContent = "Done.";
        } catch (e) {
          if (st) st.textContent = e.message || String(e);
        } finally {
          btn.disabled = false;
        }
      });
    }

    if (typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive()) {
      var bundle = window.clarityReadWorkflowBundle && window.clarityReadWorkflowBundle();
      if (bundle && bundle.analysis && bundle.analysis.design && bundle.analysis.design.status === "done" && bundle.analysis.design.data) {
        if (html && bundle.html) html.value = bundle.html;
        if (sub && bundle.subject) sub.value = bundle.subject;
        renderDesignFromData(bundle.analysis.design.data);
        if (st) st.textContent = "Loaded from workspace.";
      }
    }
  }

  function renderA11yFromData(data) {
    var sum = data.summary || {};
    var meta = document.getElementById("clarity-a11y-meta");
    if (meta) {
      meta.textContent =
        (sum.fail_count || 0) +
        " fails · " +
        (sum.warning_count || 0) +
        " warnings · score " +
        (sum.overall_score ?? "—");
    }
    var cards = document.getElementById("clarity-a11y-cards");
    if (cards) {
      cards.innerHTML = "";
      (data.checks || []).forEach(function (c) {
        var div = document.createElement("div");
        div.className = "bg-surface-container-lowest p-5 rounded-xl border border-transparent shadow-sm";
        div.innerHTML =
          '<div class="flex justify-between mb-2"><h3 class="font-bold text-sm">' +
          esc(c.label) +
          '</h3><span class="text-[10px] font-bold uppercase">' +
          esc(c.status) +
          "</span></div>" +
          '<p class="text-xs text-on-surface-variant mb-2">' +
          esc(c.details) +
          "</p>" +
          '<p class="text-xs"><strong>Fix:</strong> ' +
          esc(c.fix) +
          "</p>" +
          '<p class="text-[10px] text-slate-400 mt-1">' +
          esc(c.wcag_reference) +
          "</p>";
        cards.appendChild(div);
      });
      (data.color_vision_flags || []).forEach(function (f) {
        var div = document.createElement("div");
        div.className = "bg-amber-50 border border-amber-100 p-4 rounded-xl text-sm";
        div.innerHTML =
          '<p class="font-bold text-amber-900">Color vision · ' +
          esc(f.deficiency_type || "") +
          "</p>" +
          '<p class="text-xs text-slate-700 mt-1">' +
          esc(f.zone || "") +
          "</p>" +
          '<p class="text-xs mt-2">' +
          esc(f.issue || "") +
          "</p>" +
          '<p class="text-xs mt-2"><strong>Suggestion:</strong> ' +
          esc(f.suggestion || "") +
          "</p>";
        cards.appendChild(div);
      });
    }
  }

  function initA11y() {
    var htmlEl = document.getElementById("clarity-a11y-html");
    var btn = document.getElementById("clarity-run-a11y");
    var st = document.getElementById("clarity-a11y-status");
    if (btn) {
    btn.addEventListener("click", async function () {
      btn.disabled = true;
      if (st) st.textContent = "…";
      try {
        var data = await window.ClarityAPI.runAnalysis("accessibility", {
          emailHtml: (htmlEl && htmlEl.value) || "",
        });
        renderA11yFromData(data);
        if (st) st.textContent = "Done.";
      } catch (e) {
        if (st) st.textContent = e.message || String(e);
      } finally {
        btn.disabled = false;
      }
    });
    }

    if (typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive()) {
      var bundle = window.clarityReadWorkflowBundle && window.clarityReadWorkflowBundle();
      if (bundle && bundle.analysis && bundle.analysis.accessibility && bundle.analysis.accessibility.status === "done" && bundle.analysis.accessibility.data) {
        if (htmlEl && bundle.html) htmlEl.value = bundle.html;
        renderA11yFromData(bundle.analysis.accessibility.data);
        if (st) st.textContent = "Loaded from workspace.";
      }
    }
  }

  function renderHtmlAnalyzerFromData(data, rawHtml) {
    var before = document.getElementById("clarity-html-before");
    var after = document.getElementById("clarity-html-after");
    var ul = document.getElementById("clarity-html-improvements");
    var sm = document.getElementById("clarity-html-marketer-summary");
    var raw = rawHtml || "";
    if (before) before.textContent = raw.slice(0, 4000) + (raw.length > 4000 ? "\n…" : "");
    if (after) after.textContent = (data.optimized_html || "").slice(0, 12000);
    if (ul) {
      ul.innerHTML = "";
      (data.improvements || []).forEach(function (im) {
        var li = document.createElement("li");
        li.innerHTML =
          "<strong>" +
          esc(im.title) +
          "</strong> — " +
          esc(im.marketer_explanation) +
          ' <span class="text-slate-400">(' +
          esc(im.impact) +
          ")</span>";
        ul.appendChild(li);
      });
    }
    if (sm) sm.textContent = data.summary_for_marketer || "";
  }

  function initHtmlAnalyzer() {
    var inp = document.getElementById("clarity-html-input");
    var btn = document.getElementById("clarity-run-html");
    var st = document.getElementById("clarity-html-status");
    if (btn) {
    btn.addEventListener("click", async function () {
      btn.disabled = true;
      if (st) st.textContent = "…";
      try {
        var raw = (inp && inp.value) || "";
        var data = await window.ClarityAPI.runAnalysis("html", { emailHtml: raw });
        renderHtmlAnalyzerFromData(data, raw);
        if (st) st.textContent = "Done.";
      } catch (e) {
        if (st) st.textContent = e.message || String(e);
      } finally {
        btn.disabled = false;
      }
    });
    }

    if (typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive()) {
      var bundle = window.clarityReadWorkflowBundle && window.clarityReadWorkflowBundle();
      if (bundle && bundle.analysis && bundle.analysis.html && bundle.analysis.html.status === "done" && bundle.analysis.html.data) {
        if (inp && bundle.html) inp.value = bundle.html;
        renderHtmlAnalyzerFromData(bundle.analysis.html.data, bundle.html);
        if (st) st.textContent = "Loaded from workspace.";
      }
    }
  }

  function initMulti() {
    var tabs = document.querySelectorAll(".tab-btn");
    var panels = {
      perf: document.getElementById("panel-perf"),
      kw: document.getElementById("panel-kw"),
      heat: document.getElementById("panel-heat"),
    };
    function show(which) {
      Object.keys(panels).forEach(function (k) {
        if (panels[k]) panels[k].classList.toggle("hidden", k !== which);
      });
      tabs.forEach(function (b) {
        var on = b.getAttribute("data-tab") === which;
        b.classList.toggle("bg-indigo-600", on);
        b.classList.toggle("text-white", on);
        b.classList.toggle("bg-white", !on);
      });
    }
    tabs.forEach(function (b) {
      b.addEventListener("click", function () {
        show(b.getAttribute("data-tab") || "perf");
      });
    });
    var tabParam = "perf";
    try {
      var q = new URLSearchParams(location.search).get("tab");
      if (q === "kw" || q === "heat" || q === "perf") tabParam = q;
    } catch (e) {}
    show(tabParam);

    var st = document.getElementById("multi-status");

    document.getElementById("perf-run") &&
      document.getElementById("perf-run").addEventListener("click", async function () {
        if (st) st.textContent = "";
        try {
          var data = await window.ClarityAPI.runAnalysis("performance", {
            subjectLine: document.getElementById("perf-subject").value,
            previewText: document.getElementById("perf-preview").value,
            emailContent: document.getElementById("perf-body").value,
            industry: document.getElementById("perf-industry").value,
          });
          document.getElementById("perf-out").textContent = JSON.stringify(data, null, 2);
          renderPerfSummaryUI(data);
        } catch (e) {
          if (st) st.textContent = e.message || String(e);
        }
      });

    document.getElementById("kw-run") &&
      document.getElementById("kw-run").addEventListener("click", async function () {
        if (st) st.textContent = "";
        try {
          var data = await window.ClarityAPI.runAnalysis("keywords", {
            emailContent: document.getElementById("kw-body").value,
            sector: document.getElementById("kw-sector").value,
          });
          document.getElementById("kw-out").textContent = JSON.stringify(data, null, 2);
          renderKwSummaryUI(data);
        } catch (e) {
          if (st) st.textContent = e.message || String(e);
        }
      });

    document.getElementById("heat-run") &&
      document.getElementById("heat-run").addEventListener("click", async function () {
        if (st) st.textContent = "";
        try {
          var data = await window.ClarityAPI.runAnalysis("heatmap", {
            emailHtml: document.getElementById("heat-html").value,
            segment: document.getElementById("heat-segment").value || "none",
            historicalJson: "none",
          });
          document.getElementById("heat-out").textContent = JSON.stringify(data, null, 2);
          renderHeatSummaryUI(data);
        } catch (e) {
          if (st) st.textContent = e.message || String(e);
        }
      });

    if (typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive()) {
      var bundle = window.clarityReadWorkflowBundle && window.clarityReadWorkflowBundle();
      if (bundle) {
        var ps = document.getElementById("perf-subject");
        var pp = document.getElementById("perf-preview");
        var pb = document.getElementById("perf-body");
        if (ps && bundle.subject) ps.value = bundle.subject;
        if (pp && bundle.previewText != null) pp.value = bundle.previewText;
        if (pb && bundle.plainText != null) pb.value = bundle.plainText;
        var kwb = document.getElementById("kw-body");
        if (kwb && bundle.plainText != null) kwb.value = bundle.plainText;
        var hh = document.getElementById("heat-html");
        if (hh && bundle.html) hh.value = bundle.html;
        if (bundle.analysis && bundle.analysis.performance && bundle.analysis.performance.status === "done" && bundle.analysis.performance.data) {
          var po = document.getElementById("perf-out");
          if (po) po.textContent = JSON.stringify(bundle.analysis.performance.data, null, 2);
          renderPerfSummaryUI(bundle.analysis.performance.data);
        }
        if (bundle.analysis && bundle.analysis.keywords && bundle.analysis.keywords.status === "done" && bundle.analysis.keywords.data) {
          var ko = document.getElementById("kw-out");
          if (ko) ko.textContent = JSON.stringify(bundle.analysis.keywords.data, null, 2);
          renderKwSummaryUI(bundle.analysis.keywords.data);
        }
        if (bundle.analysis && bundle.analysis.heatmap && bundle.analysis.heatmap.status === "done" && bundle.analysis.heatmap.data) {
          var ho = document.getElementById("heat-out");
          if (ho) ho.textContent = JSON.stringify(bundle.analysis.heatmap.data, null, 2);
          renderHeatSummaryUI(bundle.analysis.heatmap.data);
        }
        if (st) st.textContent = "Loaded from workspace.";
      }
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var n = pageName();
    if (n === "spamtrigger_list.html") initSpamList();
    else if (n === "spamtrigger_visual.html") initSpamVisual();
    else if (n === "content_analysis.html") initDesign();
    else if (n === "accessibilty.html") initA11y();
    else if (n === "html_analyzer.html") initHtmlAnalyzer();
    else if (n === "multi-analysis.html") initMulti();
  });
})();
