(function (global) {
  var STORAGE_KEY = "clarity-workflow-designs-v1";

  /**
   * Pause after each module finishes, before starting the next (ms).
   * `window.CLARITY_ANALYSIS_STAGGER_MS`: set 0 to remove the pause (old “back-to-back” behavior,
   * still sequential so only one in-flight request at a time).
   */
  function staggerMs() {
    var m = global.CLARITY_ANALYSIS_STAGGER_MS;
    if (m === 0 || m === "0") return 0;
    if (m == null || m === "") return 3000;
    var n = Number(m);
    if (!isNaN(n) && n === 0) return 0;
    return !isNaN(n) && n > 0 ? n : 3000;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  var MODULE_ORDER = [
    "grammar",
    "links",
    "spam",
    "performance",
    "keywords",
    "heatmap",
    "design",
    "accessibility",
    "html",
  ];

  var MODULE_META = {
    grammar: { label: "Spelling & grammar", hint: "Tone + issue list" },
    links: { label: "Link analysis", hint: "URL status + analytics" },
    spam: { label: "Spam detection", hint: "Trigger words + fixes" },
    performance: { label: "Open rate & CTR", hint: "Performance prediction" },
    keywords: { label: "Keyword suggestions", hint: "Sector-aware AI" },
    heatmap: { label: "AI heatmap", hint: "Zone engagement scores" },
    design: { label: "Design analysis", hint: "Quality scores + suggestions" },
    accessibility: { label: "Accessibility", hint: "WCAG-style audit" },
    html: { label: "HTML analyzer", hint: "Optimized output + notes" },
  };

  function moduleWorkflowUrl(moduleId) {
    var path =
      {
        grammar: "grammar.html",
        links: "link_analysis.html",
        spam: "spamtrigger_list.html",
        performance: "multi-analysis.html",
        keywords: "multi-analysis.html",
        heatmap: "multi-analysis.html",
        design: "content_analysis.html",
        accessibility: "accessibilty.html",
        html: "html_analyzer.html",
      }[moduleId] || "grammar.html";
    var tab = "";
    if (moduleId === "keywords") tab = "&tab=kw";
    else if (moduleId === "heatmap") tab = "&tab=heat";
    else if (moduleId === "performance") tab = "&tab=perf";
    return path + "?workflow=1" + tab;
  }

  function workflowBundleForSession(design) {
    return {
      version: 1,
      designId: design.id,
      name: design.name,
      html: design.html,
      plainText: design.plainText,
      subject: design.subject,
      previewText: design.previewText,
      analysis: design.analysis,
    };
  }

  function uid() {
    return String(Date.now()) + "-" + String(Math.random()).slice(2, 9);
  }

  function textFromHtml(html) {
    var d = document.createElement("div");
    d.innerHTML = html || "";
    var t = (d.textContent || "").replace(/\s+/g, " ").trim();
    return t.length ? t : " ";
  }

  function parseEmlOrHtml(raw) {
    var s = String(raw || "");
    var htmlBlock = s.match(/<\s*html[\s\S]*<\/\s*html\s*>/i);
    if (htmlBlock) return htmlBlock[0];
    return s;
  }

  function guessSubject(html, rawUpload) {
    var subj = rawUpload && rawUpload.match(/^Subject:\s*(.+)$/im);
    if (subj) {
      return subj[1]
        .replace(/\r$/, "")
        .trim()
        .replace(/^=\?[^?]+\?[QB]\?/i, "")
        .replace(/\?=$/, "")
        .trim();
    }
    try {
      var doc = new DOMParser().parseFromString(html || "<div/>", "text/html");
      var t = doc.querySelector("title");
      if (t && t.textContent.trim()) return t.textContent.trim();
      var h = doc.querySelector("h1");
      if (h && h.textContent.trim()) return h.textContent.trim();
    } catch (e) {}
    return "Untitled email";
  }

  function guessPreviewText(html) {
    try {
      var doc = new DOMParser().parseFromString(html || "<div/>", "text/html");
      var m = doc.querySelector('meta[name="description"]');
      if (m && m.getAttribute("content")) return m.getAttribute("content").trim().slice(0, 500);
      var body = doc.body;
      if (body) return (body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 500);
    } catch (e) {}
    return "";
  }

  function emptyAnalysisState() {
    var o = {};
    MODULE_ORDER.forEach(function (id) {
      o[id] = { status: "idle", data: null, error: null };
    });
    return o;
  }

  function loadDesigns() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(function (d) {
        if (!d.analysis) d.analysis = emptyAnalysisState();
        MODULE_ORDER.forEach(function (id) {
          if (!d.analysis[id]) d.analysis[id] = { status: "idle", data: null, error: null };
        });
        return d;
      });
    } catch (e) {
      return [];
    }
  }

  function forStorage(design) {
    var o = {};
    Object.keys(design).forEach(function (k) {
      if (k === "previewUrl") return;
      o[k] = design[k];
    });
    return o;
  }

  function saveDesigns(list) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          list.map(function (d) {
            return forStorage(d);
          }),
        ),
      );
    } catch (e) {
      console.warn("clarity-app: could not persist designs", e);
    }
  }

  function revokePreview(design) {
    if (design && design.previewUrl && /^blob:/.test(design.previewUrl)) {
      try {
        URL.revokeObjectURL(design.previewUrl);
      } catch (e) {}
    }
  }

  function makePreviewUrl(html) {
    try {
      var blob = new Blob([html || "<html><body></body></html>"], { type: "text/html;charset=utf-8" });
      return URL.createObjectURL(blob);
    } catch (e) {
      return "";
    }
  }

  function buildPayloads(design) {
    var html = design.html || "";
    var text = design.plainText || textFromHtml(html);
    var subject = design.subject || "Untitled email";
    var preview = design.previewText || "";
    return {
      grammar: { emailContent: text },
      links: { emailHtml: html },
      spam: { emailContent: text },
      performance: {
        subjectLine: subject.slice(0, 500),
        previewText: preview.slice(0, 2000),
        emailContent: text.slice(0, 500000),
        industry: "Unknown",
      },
      keywords: { emailContent: text.slice(0, 500000), sector: "Auto-detect" },
      heatmap: { emailHtml: html, segment: "none", historicalJson: "none" },
      design: { emailHtml: html, subjectLine: subject.slice(0, 500) },
      accessibility: { emailHtml: html },
      html: { emailHtml: html },
    };
  }

  function runOneModule(design, moduleId) {
    var payloads = buildPayloads(design);
    var p = payloads[moduleId];
    if (!p) return Promise.reject(new Error("unknown module"));
    return window.ClarityAPI.runAnalysis(moduleId, p);
  }

  function summaryLine(moduleId, state) {
    if (state.status === "running") return "Running…";
    if (state.status === "pending") return "Queued…";
    if (state.status === "error") {
      var err = String(state.error || "Error");
      if (err.length > 96) err = err.slice(0, 93) + "…";
      if (/^\s*\{/.test(err)) err = "Request failed (open module for details)";
      return err;
    }
    if (state.status !== "done" || !state.data) return "—";
    var d = state.data;
    switch (moduleId) {
      case "grammar":
        return ((d.issues && d.issues.length) || 0) + " issues · tone: " + (((d.tone || [])[0] || {}).label || "—");
      case "links":
        return (d.summary && d.summary.ok_percent != null ? d.summary.ok_percent : "—") + "% OK · " + ((d.links || []).length + " links");
      case "spam":
        return ((d.summary && d.summary.total_triggers) || 0) + " triggers · " + ((d.summary && d.summary.risk_level) || "");
      case "performance": {
        var or = d.open_rate || {};
        var ctr = d.ctr || {};
        var openR =
          or.predicted_min != null && or.predicted_max != null
            ? or.predicted_min + "–" + or.predicted_max + "%"
            : "—";
        var ctrR =
          ctr.predicted_min != null && ctr.predicted_max != null
            ? ctr.predicted_min + "–" + ctr.predicted_max + "%"
            : "—";
        return "Open " + openR + " · CTR " + ctrR + " · overall " + (d.overall_score != null ? d.overall_score : "—");
      }
      case "keywords":
        return (
          (d.suggestions || []).length +
          (d.keyword_audit || []).length +
          " items · " +
          (d.detected_sector || "sector")
        );
      case "heatmap":
        return ((d.zones || []).length || 0) + " zones";
      case "design":
        return "Overall " + (((d.quality_scores || {}).overall != null ? d.quality_scores.overall : "—") + "");
      case "accessibility": {
        var sum = d.summary || {};
        return (
          "Score " +
          (sum.overall_score != null ? sum.overall_score : "—") +
          " · " +
          ((d.checks || []).length || 0) +
          " checks"
        );
      }
      case "html": {
        var hs = d.html_score || {};
        return (
          "Score " +
          (hs.before != null ? hs.before : "—") +
          " → " +
          (hs.after != null ? hs.after : "—") +
          " · " +
          ((d.improvements || []).length || 0) +
          " improvements"
        );
      }
      default:
        return "Done";
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var viewHome = document.getElementById("clarity-view-home");
    var viewStudio = document.getElementById("clarity-view-studio");
    var ta = document.getElementById("clarity-input-html");
    var nameEl = document.getElementById("clarity-design-name");
    var fileInput = document.getElementById("clarity-file-input");
    var btnPick = document.getElementById("clarity-btn-pick-file");
    var btnSave = document.getElementById("clarity-btn-save");
    var saveStatus = document.getElementById("clarity-save-status");
    var listEl = document.getElementById("clarity-designs-list");
    var gateNote = document.getElementById("clarity-gate-note");
    var btnBack = document.getElementById("clarity-btn-back");
    var gridEl = document.getElementById("clarity-module-grid");
    var studioSubtitle = document.getElementById("clarity-studio-subtitle");

    var designs = loadDesigns();
    var currentId = null;
    var lastRawUpload = "";

    designs.forEach(function (d) {
      if (d.html) d.previewUrl = makePreviewUrl(d.html);
    });

    function currentDesign() {
      return designs.find(function (d) {
        return d.id === currentId;
      });
    }

    function persist() {
      saveDesigns(designs);
    }

    function setViews(home) {
      if (viewHome) viewHome.classList.toggle("hidden", !home);
      if (viewStudio) viewStudio.classList.toggle("hidden", home);
    }

    function renderList() {
      if (!listEl) return;
      listEl.innerHTML = "";
      if (!designs.length) {
        listEl.innerHTML =
          '<p class="text-sm text-slate-500 col-span-full">No saved designs yet. Paste or upload HTML, name it, then save — all nine modules run automatically.</p>';
        if (gateNote) gateNote.classList.remove("hidden");
        return;
      }
      if (gateNote) gateNote.classList.add("hidden");
      designs
        .slice()
        .reverse()
        .forEach(function (d) {
          var card = document.createElement("button");
          card.type = "button";
          card.className =
            "text-left rounded-xl border border-slate-200 bg-white shadow-sm hover:border-indigo-300 hover:shadow transition overflow-hidden flex flex-col";
          card.setAttribute("data-design-id", d.id);
          var ready = MODULE_ORDER.every(function (id) {
            return d.analysis && d.analysis[id] && d.analysis[id].status === "done";
          });
          var anyRun = MODULE_ORDER.some(function (id) {
            return d.analysis && d.analysis[id] && d.analysis[id].status === "running";
          });
          var badge =
            '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ' +
            (anyRun ? "bg-amber-100 text-amber-800" : ready ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600") +
            '">' +
            (anyRun ? "Analyzing…" : ready ? "Ready" : "Partial / error") +
            "</span>";
          card.innerHTML =
            '<div class="h-28 bg-slate-100 relative border-b border-slate-100">' +
            (d.previewUrl
              ? '<iframe class="absolute inset-0 w-[200%] h-[200%] origin-top-left scale-50 pointer-events-none border-0" title="Preview" src="' +
                esc(d.previewUrl) +
                '"></iframe>'
              : '<div class="flex items-center justify-center h-full text-slate-400 text-xs">No preview</div>') +
            "</div>" +
            '<div class="p-3 flex-1 flex flex-col gap-1">' +
            '<div class="flex items-center justify-between gap-2">' +
            '<span class="font-bold text-slate-800 text-sm truncate">' +
            esc(d.name) +
            "</span>" +
            badge +
            "</div>" +
            '<p class="text-[10px] text-slate-500">' +
            new Date(d.createdAt).toLocaleString() +
            "</p></div>";
          card.addEventListener("click", function () {
            openStudio(d.id);
          });
          listEl.appendChild(card);
        });
    }

    function renderGrid() {
      if (!gridEl) return;
      var d = currentDesign();
      gridEl.innerHTML = "";
      if (!d) return;
      MODULE_ORDER.forEach(function (id) {
        var st = (d.analysis && d.analysis[id]) || { status: "idle" };
        var meta = MODULE_META[id];
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-400 hover:shadow-sm";
        var stLabel = st.status;
        if (stLabel === "done") stLabel = "✓";
        if (stLabel === "error") stLabel = "!";
        if (stLabel === "running" || stLabel === "pending") stLabel = "…";
        btn.innerHTML =
          '<div class="text-xs font-bold text-slate-800 leading-tight">' +
          esc(meta.label) +
          '</div><div class="text-[10px] text-slate-500 mt-1 line-clamp-2">' +
          esc(summaryLine(id, st)) +
          '</div><div class="text-[9px] font-mono text-slate-400 mt-1">' +
          esc(String(stLabel)) +
          "</div>";
        btn.addEventListener("click", function () {
          var st = (d.analysis && d.analysis[id]) || { status: "idle" };
          if (st.status === "done" && st.data) {
            var written =
              typeof global.clarityWriteWorkflowBundle === "function" &&
              global.clarityWriteWorkflowBundle(workflowBundleForSession(d));
            if (!written) {
              window.alert("Could not store results for the module page (browser storage limit). Try freeing site data or use a smaller HTML sample.");
              return;
            }
            var url = moduleWorkflowUrl(id);
            window.open(url, "_blank", "noopener,noreferrer");
            return;
          }
          if (st.status === "error") {
            window.alert((st.error && String(st.error).slice(0, 500)) || "This module failed.");
            return;
          }
          window.alert("This module is not ready yet. Wait until the tile shows a checkmark (✓), then click again.");
        });
        gridEl.appendChild(btn);
      });
    }

    function openStudio(id) {
      currentId = id;
      var d = currentDesign();
      if (studioSubtitle && d) {
        studioSubtitle.textContent =
          "Each tile summarizes one module. When a tile shows ✓, click it to open the full report in a new tab (content comes from your saved design).";
      }
      setViews(false);
      renderGrid();
    }

    function runAllAnalyses(design) {
      MODULE_ORDER.forEach(function (id) {
        design.analysis[id] = { status: "pending", data: null, error: null };
      });
      persist();
      renderList();
      if (currentId === design.id) {
        renderGrid();
      }

      var gap = staggerMs();
      (async function () {
        for (var i = 0; i < MODULE_ORDER.length; i++) {
          var id = MODULE_ORDER[i];
          design.analysis[id] = { status: "running", data: null, error: null };
          persist();
          renderList();
          if (currentId === design.id) {
            renderGrid();
          }
          try {
            var data = await runOneModule(design, id);
            design.analysis[id] = { status: "done", data: data, error: null };
          } catch (e) {
            design.analysis[id] = {
              status: "error",
              data: null,
              error: e.message || String(e),
            };
          }
          persist();
          renderList();
          if (currentId === design.id) {
            renderGrid();
          }
          if (i < MODULE_ORDER.length - 1 && gap > 0) {
            await sleep(gap);
          }
        }
      })();
    }

    if (btnPick && fileInput) {
      btnPick.addEventListener("click", function () {
        fileInput.click();
      });
    }
    if (fileInput && ta) {
      fileInput.addEventListener("change", function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          var raw = String(reader.result || "");
          lastRawUpload = raw.slice(0, 500000);
          ta.value = parseEmlOrHtml(raw);
          fileInput.value = "";
        };
        reader.readAsText(f);
      });
    }

    if (btnSave) {
      btnSave.addEventListener("click", function () {
        var html = (ta && ta.value.trim()) || "";
        if (!html) {
          if (saveStatus) saveStatus.textContent = "Add HTML or upload a file first.";
          return;
        }
        if (saveStatus) saveStatus.textContent = "";
        var subject = guessSubject(html, lastRawUpload);
        var previewText = guessPreviewText(html);
        var plain = textFromHtml(html);
        var name = (nameEl && nameEl.value.trim()) || subject || "Untitled design";
        var design = {
          id: uid(),
          name: name,
          html: html,
          subject: subject,
          previewText: previewText,
          plainText: plain,
          createdAt: Date.now(),
          analysis: emptyAnalysisState(),
          previewUrl: makePreviewUrl(html),
        };
        designs.push(design);
        persist();
        renderList();
        if (saveStatus) saveStatus.textContent = "Saved. Running all modules…";
        runAllAnalyses(design);
        openStudio(design.id);
        if (saveStatus) {
          setTimeout(function () {
            if (saveStatus) saveStatus.textContent = "";
          }, 4000);
        }
      });
    }

    if (btnBack) {
      btnBack.addEventListener("click", function () {
        currentId = null;
        setViews(true);
        renderList();
      });
    }

    renderList();
    setViews(true);
  });
})(typeof window !== "undefined" ? window : globalThis);
