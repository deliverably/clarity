(function () {
  var PAGE_SIZE = 10;

  var SPECTRUM_KEYS = ["Confident", "Shocking", "Funny", "Inspiring", "Informal", "Admiring"];

  /** Map API tone labels to one of the six spectrum tiles (display only). */
  function mapApiLabelToSpectrum(label) {
    var s = String(label || "").trim();
    if (!s) return null;
    var lower = s.toLowerCase();
    for (var i = 0; i < SPECTRUM_KEYS.length; i++) {
      if (SPECTRUM_KEYS[i].toLowerCase() === lower) return SPECTRUM_KEYS[i];
    }
    var map = {
      professional: "Confident",
      friendly: "Admiring",
      neutral: "Informal",
      urgent: "Confident",
      empathetic: "Admiring",
      persuasive: "Confident",
    };
    return map[lower] || null;
  }

  var TILE_SELECTED =
    "bg-primary-fixed/30 border-primary/10 opacity-100 text-primary ring-1 ring-primary/20";
  var TILE_MUTED =
    "bg-surface-container-low border-outline-variant/10 opacity-50 text-on-surface-variant hover:opacity-80";

  function updateToneSpectrumUI(activeKey) {
    var tiles = document.querySelectorAll("[data-clarity-tone-spectrum]");
    tiles.forEach(function (tile) {
      var key = tile.getAttribute("data-clarity-tone-spectrum");
      var icon = tile.querySelector(".icon");
      var label = tile.querySelector(".label");
      var on = activeKey && key === activeKey;
      tile.className =
        "clarity-tone-spectrum-tile flex flex-col items-center gap-3 p-3 rounded-lg border transition-colors text-left w-full " +
        (on ? TILE_SELECTED : TILE_MUTED);
      if (icon) {
        icon.className =
          "material-symbols-outlined icon " + (on ? "text-primary" : "text-on-surface-variant");
      }
      if (label) {
        label.className = "label text-xs " + (on ? "font-bold text-primary" : "font-medium text-on-surface-variant");
      }
    });
  }

  window.__clarityGrammarState = {
    allIssues: [],
    pageIndex: 0,
    spectrumOverride: null,
    apiSpectrumKey: null,
    hasGrammarResult: false,
  };

  function hydrateWorkflowBundleFromDesignId() {
    try {
      var p = new URLSearchParams(String(window.location && window.location.search) || "");
      if (p.get("workflow") !== "1") return;
      var id = p.get("designId");
      if (!id || typeof window.clarityHydrateSessionFromDesignId !== "function") return;
      window.clarityHydrateSessionFromDesignId(id);
    } catch (e) {
      console.warn("grammar-page: hydrate", e);
    }
  }

  /**
   * `window.open` loads a new tab with empty sessionStorage; the studio writes the bundle to the
   * opener tab only. If designId hydration from localStorage failed (or is stale), copy the bundle
   * from the opener when same-origin.
   */
  function seedWorkflowBundleFromOpener() {
    if (typeof window.clarityWorkflowActive !== "function" || !window.clarityWorkflowActive()) return;
    var read = window.clarityReadWorkflowBundle;
    var write = window.clarityWriteWorkflowBundle;
    if (typeof read !== "function" || typeof write !== "function") return;
    var cur = read();
    if (cur && (cur.html || cur.plainText)) return;
    try {
      var op = window.opener;
      if (!op || op.closed || typeof op.clarityReadWorkflowBundle !== "function") return;
      var b = op.clarityReadWorkflowBundle();
      if (!b || (!b.html && !b.plainText)) return;
      write(JSON.parse(JSON.stringify(b)));
    } catch (e) {
      console.warn("grammar-page: opener bundle", e);
    }
  }

  function setGrammarWorkflowHint(msg) {
    var el = document.getElementById("clarity-grammar-status");
    if (el) el.textContent = msg;
  }

  function badgeClass(type) {
    var map = {
      Spelling: "bg-error-container text-on-error-container",
      Grammar: "bg-secondary-fixed text-on-secondary-fixed-variant",
      Punctuation: "bg-primary-fixed text-on-primary-fixed-variant",
      Style: "bg-surface-container-highest text-on-surface-variant",
      Clarity: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
    };
    return map[type] || "bg-surface-container-highest text-on-surface-variant";
  }

  function sevClass(sev) {
    if (sev === "High") return "text-error font-bold";
    if (sev === "Medium") return "text-orange-600 font-semibold";
    return "text-on-surface-variant text-xs";
  }

  function getFilteredIssues() {
    var list = (window.__clarityGrammarState.allIssues || []).slice();
    var sel = document.getElementById("clarity-issue-type-filter");
    var v = sel ? sel.value : "all";
    if (v === "spelling") list = list.filter(function (i) {
      return i.type === "Spelling";
    });
    else if (v === "grammar")
      list = list.filter(function (i) {
        return i.type === "Grammar";
      });
    else if (v === "clarity")
      list = list.filter(function (i) {
        return i.type === "Clarity";
      });
    var qEl = document.getElementById("clarity-issue-search");
    var q = qEl ? String(qEl.value || "").trim().toLowerCase() : "";
    if (q) {
      list = list.filter(function (i) {
        return (
          String(i.original || "")
            .toLowerCase()
            .indexOf(q) >= 0 ||
          String(i.suggestion || "")
            .toLowerCase()
            .indexOf(q) >= 0 ||
          String(i.reason || "")
            .toLowerCase()
            .indexOf(q) >= 0
        );
      });
    }
    return list;
  }

  function renderIssueRows(issues, emailEl) {
    var root = document.getElementById("clarity-issues-root");
    if (!root) return;
    root.innerHTML = "";
    if (!issues || !issues.length) {
      root.innerHTML =
        '<div class="px-6 py-10 text-center text-on-surface-variant text-sm">No issues match the current filters.</div>';
      return;
    }
    issues.forEach(function (issue) {
      var row = document.createElement("div");
      row.className =
        "grid grid-cols-12 px-6 py-6 hover:bg-surface-container-low transition-colors items-center group";
      var origEsc = String(issue.original || "").replace(/</g, "&lt;");
      row.innerHTML =
        '<div class="col-span-5 pr-8">' +
        '<div class="flex items-center gap-2 mb-2 flex-wrap">' +
        '<span class="px-2 py-0.5 ' +
        badgeClass(issue.type) +
        ' text-[10px] font-bold rounded uppercase tracking-tighter">' +
        (issue.type || "") +
        "</span>" +
        '<span class="' +
        sevClass(issue.severity) +
        ' text-[10px] uppercase">' +
        (issue.severity || "") +
        "</span>" +
        "</div>" +
        '<p class="text-sm font-body text-on-surface leading-relaxed">“<span class="bg-error/10 border-b-2 border-error text-error font-medium">' +
        origEsc +
        "</span>”</p>" +
        '<p class="text-xs text-on-surface-variant mt-1">' +
        String(issue.reason || "").replace(/</g, "&lt;") +
        "</p>" +
        "</div>" +
        '<div class="col-span-4">' +
        '<div class="flex items-center gap-3 text-sm font-body text-primary font-semibold">' +
        '<span class="material-symbols-outlined text-lg">trending_flat</span>' +
        "<span>" +
        String(issue.suggestion || "").replace(/</g, "&lt;") +
        "</span>" +
        "</div>" +
        "</div>" +
        '<div class="col-span-3 flex justify-end gap-3">' +
        '<button type="button" class="clarity-ignore p-2 text-on-surface-variant hover:bg-surface-container-highest rounded-lg transition-colors" title="Ignore">' +
        '<span class="material-symbols-outlined">close</span></button>' +
        '<button type="button" class="clarity-apply bg-primary-fixed text-on-primary-fixed-variant px-4 py-2 rounded-lg text-xs font-bold hover:bg-primary-container hover:text-white transition-all">Apply</button>' +
        "</div>" +
        "</div>";
      row.querySelector(".clarity-apply").addEventListener("click", function () {
        if (!emailEl) return;
        var v = emailEl.value;
        if (!issue.original) return;
        emailEl.value = v.split(issue.original).join(issue.suggestion || "");
        window.__clarityGrammarState.allIssues = window.__clarityGrammarState.allIssues.filter(function (x) {
          return x.id !== issue.id;
        });
        paintGrammarIssuesPage();
      });
      row.querySelector(".clarity-ignore").addEventListener("click", function () {
        window.__clarityGrammarState.allIssues = window.__clarityGrammarState.allIssues.filter(function (x) {
          return x.id !== issue.id;
        });
        paintGrammarIssuesPage();
      });
      root.appendChild(row);
    });
  }

  function updateGrammarPager(total, start, sliceLen, pageCount) {
    var pageInfo = document.getElementById("clarity-grammar-page-info");
    var pager = document.getElementById("clarity-grammar-pager");
    var pagerPages = document.getElementById("clarity-grammar-pager-pages");
    var pagerPrev = document.getElementById("clarity-grammar-pager-prev");
    var pagerNext = document.getElementById("clarity-grammar-pager-next");
    var pageSize = PAGE_SIZE;

    if (pageInfo) {
      if (total === 0) pageInfo.textContent = "No results";
      else if (total <= pageSize) pageInfo.textContent = "Showing all " + total + " issue" + (total === 1 ? "" : "s");
      else pageInfo.textContent = "Showing " + (start + 1) + "–" + (start + sliceLen) + " of " + total + " issues";
    }

    if (pager) {
      if (total === 0 || total <= pageSize) {
        pager.classList.add("hidden");
        pager.classList.remove("flex");
      } else {
        pager.classList.remove("hidden");
        pager.classList.add("flex");
        var idx = window.__clarityGrammarState.pageIndex;
        if (pagerPrev) pagerPrev.disabled = idx <= 0;
        if (pagerNext) pagerNext.disabled = idx >= pageCount - 1;
        if (pagerPages) {
          pagerPages.innerHTML = "";
          for (var p = 0; p < pageCount; p++) {
            (function (pageIdx) {
              var btn = document.createElement("button");
              btn.type = "button";
              btn.textContent = String(pageIdx + 1);
              btn.className =
                "w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg transition-colors " +
                (idx === pageIdx
                  ? "bg-primary-container text-white"
                  : "text-on-surface-variant hover:bg-surface-container-highest");
              btn.addEventListener("click", function () {
                window.__clarityGrammarState.pageIndex = pageIdx;
                paintGrammarIssuesPage();
              });
              pagerPages.appendChild(btn);
            })(p);
          }
        }
      }
    }
  }

  function paintGrammarIssuesPage() {
    var emailEl = document.getElementById("clarity-email-content");
    var root = document.getElementById("clarity-issues-root");
    var allN = (window.__clarityGrammarState.allIssues || []).length;
    var filtered = getFilteredIssues();
    var total = filtered.length;

    if (allN === 0 && root) {
      root.innerHTML =
        '<div class="px-6 py-10 text-center text-on-surface-variant text-sm">Run analysis to see issues here.</div>';
      var pageInfo = document.getElementById("clarity-grammar-page-info");
      if (pageInfo) pageInfo.textContent = "No analysis run yet.";
      var pager = document.getElementById("clarity-grammar-pager");
      if (pager) {
        pager.classList.add("hidden");
        pager.classList.remove("flex");
      }
      return;
    }

    var pageSize = PAGE_SIZE;
    var pageCount = total === 0 ? 1 : Math.ceil(total / pageSize);
    var idx = window.__clarityGrammarState.pageIndex;
    if (idx >= pageCount) window.__clarityGrammarState.pageIndex = Math.max(0, pageCount - 1);
    idx = window.__clarityGrammarState.pageIndex;
    var start = idx * pageSize;
    var slice = filtered.slice(start, start + pageSize);
    renderIssueRows(slice, emailEl);
    updateGrammarPager(total, start, slice.length, pageCount);
  }

  function applyFilter() {
    window.__clarityGrammarState.pageIndex = 0;
    paintGrammarIssuesPage();
  }

  function bindSpectrumClicks() {
    var tiles = document.querySelectorAll("[data-clarity-tone-spectrum]");
    tiles.forEach(function (tile) {
      if (tile._clarityBound) return;
      tile._clarityBound = true;
      tile.addEventListener("click", function () {
        var key = tile.getAttribute("data-clarity-tone-spectrum");
        window.__clarityGrammarState.spectrumOverride = key;
        updateToneSpectrumUI(key);
      });
    });
  }

  function applyGrammarFromData(data, emailContent, statusMessage) {
    var emailEl = document.getElementById("clarity-email-content");
    var statusEl = document.getElementById("clarity-grammar-status");
    if (emailEl && emailContent != null) emailEl.value = emailContent;

    var tones = (data && data.tone) || [];
    var tone = tones[0] || {};
    var labelEl = document.getElementById("clarity-tone-label");
    var expEl = document.getElementById("clarity-tone-explanation");
    if (labelEl) labelEl.textContent = tone.label || "—";
    var expl = tone.explanation || "";
    if (tones.length > 1) {
      var bits = [];
      for (var t = 1; t < tones.length; t++) {
        if (tones[t] && tones[t].label) bits.push(tones[t].label + (tones[t].explanation ? ": " + tones[t].explanation : ""));
      }
      if (bits.length) expl = (expl ? expl + "\n\n" : "") + "Also noted: " + bits.join(" · ");
    }
    if (expEl) expEl.textContent = expl || "Run analysis to detect tone and issues.";

    window.__clarityGrammarState.spectrumOverride = null;
    var apiKey = mapApiLabelToSpectrum(tone.label);
    window.__clarityGrammarState.apiSpectrumKey = apiKey;
    window.__clarityGrammarState.hasGrammarResult = true;
    updateToneSpectrumUI(apiKey);

    window.__clarityGrammarState.allIssues = (data && data.issues) || [];
    window.__clarityGrammarState.pageIndex = 0;
    paintGrammarIssuesPage();

    if (statusEl && statusMessage) statusEl.textContent = statusMessage;
  }

  function tryWorkflowHydrate() {
    if (typeof window.clarityWorkflowActive !== "function" || !window.clarityWorkflowActive()) return;
    var bundle = typeof window.clarityReadWorkflowBundle === "function" ? window.clarityReadWorkflowBundle() : null;
    if (!bundle || !bundle.analysis || !bundle.analysis.grammar) return;
    var st = bundle.analysis.grammar;
    if (st.status !== "done" || !st.data) return;
    applyGrammarFromData(st.data, bundle.plainText != null ? bundle.plainText : bundle.html, "Loaded from workspace.");
  }

  function bundleEmailText(bundle) {
    if (!bundle) return "";
    var text = bundle.plainText != null ? String(bundle.plainText) : "";
    if (String(text).trim()) return text;
    var html = bundle.html != null ? String(bundle.html) : "";
    if (!String(html).trim()) return "";
    try {
      var d = document.createElement("div");
      d.innerHTML = html;
      return String(d.textContent || d.innerText || "").trim();
    } catch (e) {
      return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  }

  function persistGrammarResult(data) {
    try {
      if (typeof window.clarityWorkflowActive !== "function" || !window.clarityWorkflowActive()) return;
      var bundle = typeof window.clarityReadWorkflowBundle === "function" ? window.clarityReadWorkflowBundle() : null;
      if (!bundle) return;
      if (!bundle.analysis) bundle.analysis = {};
      bundle.analysis.grammar = { status: "done", data: data, error: null };
      if (typeof window.clarityWriteWorkflowBundle === "function") window.clarityWriteWorkflowBundle(bundle);
      if (bundle.designId && typeof window.clarityPatchDesignById === "function") {
        window.clarityPatchDesignById(bundle.designId, { analysis: bundle.analysis });
      }
    } catch (e) {
      console.warn("persistGrammarResult", e);
    }
  }

  var __grammarRunInFlight = false;

  async function runGrammarFromContent(emailContent, statusMessage) {
    var runBtn = document.getElementById("clarity-run-grammar");
    var runWf = document.getElementById("clarity-run-grammar-workflow");
    var statusEl = document.getElementById("clarity-grammar-status");
    if (!window.ClarityAPI || typeof window.ClarityAPI.runAnalysis !== "function") {
      if (statusEl) {
        statusEl.textContent =
          "API client missing. Ensure js/clarity-api.js loads and the page is served over http(s), not file://.";
      }
      return;
    }
    if (__grammarRunInFlight) return;
    __grammarRunInFlight = true;
    if (runBtn) runBtn.disabled = true;
    if (runWf) runWf.disabled = true;
    if (statusEl) statusEl.textContent = "Analyzing…";
    try {
      var data = await window.ClarityAPI.runAnalysis("grammar", {
        emailContent: emailContent || "",
      });
      persistGrammarResult(data);
      applyGrammarFromData(data, null, statusMessage != null ? statusMessage : "Done.");
    } catch (e) {
      if (statusEl) statusEl.textContent = e.message || String(e);
      console.error(e);
    } finally {
      __grammarRunInFlight = false;
      if (runBtn) runBtn.disabled = false;
      if (runWf) runWf.disabled = false;
    }
  }

  async function ensureGrammarFromWorkspace() {
    if (window.__clarityGrammarState.hasGrammarResult) return;
    if (typeof window.clarityWorkflowActive !== "function" || !window.clarityWorkflowActive()) return;
    var bundle = typeof window.clarityReadWorkflowBundle === "function" ? window.clarityReadWorkflowBundle() : null;
    if (!bundle) {
      setGrammarWorkflowHint(
        "No workspace session. Open Grammar from the Clarity studio tile (after ✓), or use ?workflow=1&designId=… matching a saved design.",
      );
      return;
    }
    var text = bundleEmailText(bundle);
    if (!String(text).trim()) {
      setGrammarWorkflowHint("This design has no body text or HTML to analyze. Edit the design in Clarity and save again.");
      return;
    }
    var emailEl = document.getElementById("clarity-email-content");
    if (emailEl) emailEl.value = text;
    await runGrammarFromContent(text, "Done.");
  }

  function bootGrammarPage() {
    try {
      if (typeof window.clarityHideManualWorkflowUI === "function") {
        try {
          window.clarityHideManualWorkflowUI();
        } catch (e) {}
      }

      hydrateWorkflowBundleFromDesignId();
      seedWorkflowBundleFromOpener();

      var emailEl = document.getElementById("clarity-email-content");
      var runBtn = document.getElementById("clarity-run-grammar");
      var runWf = document.getElementById("clarity-run-grammar-workflow");

      if (runWf && typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive()) {
        runWf.classList.remove("hidden");
        runWf.classList.add("inline-flex");
        runWf.classList.add("items-center");
      }

      bindSpectrumClicks();

    var filter = document.getElementById("clarity-issue-type-filter");
    if (filter) {
      filter.addEventListener("change", function () {
        applyFilter();
      });
    }

    var search = document.getElementById("clarity-issue-search");
    if (search) {
      search.addEventListener("input", function () {
        applyFilter();
      });
    }

    var pagerPrev = document.getElementById("clarity-grammar-pager-prev");
    var pagerNext = document.getElementById("clarity-grammar-pager-next");
    if (pagerPrev) {
      pagerPrev.addEventListener("click", function () {
        if (window.__clarityGrammarState.pageIndex > 0) {
          window.__clarityGrammarState.pageIndex -= 1;
          paintGrammarIssuesPage();
        }
      });
    }
    if (pagerNext) {
      pagerNext.addEventListener("click", function () {
        var filtered = getFilteredIssues();
        var pageCount = Math.ceil(filtered.length / PAGE_SIZE);
        if (window.__clarityGrammarState.pageIndex < pageCount - 1) {
          window.__clarityGrammarState.pageIndex += 1;
          paintGrammarIssuesPage();
        }
      });
    }

    var applyAll = document.getElementById("clarity-apply-all");
    if (applyAll) {
      applyAll.addEventListener("click", function () {
        if (!emailEl) return;
        var v = emailEl.value;
        (window.__clarityGrammarState.allIssues || []).forEach(function (issue) {
          if (issue.original && issue.suggestion) {
            v = v.split(issue.original).join(issue.suggestion);
          }
        });
        emailEl.value = v;
        window.__clarityGrammarState.allIssues = [];
        applyFilter();
        var pageInfo = document.getElementById("clarity-grammar-page-info");
        if (pageInfo) pageInfo.textContent = "No issues remaining.";
      });
    }

    if (runBtn && emailEl) {
      runBtn.addEventListener("click", function () {
        runGrammarFromContent(emailEl.value || "", "Done.");
      });
    }

    if (runWf) {
      runWf.addEventListener("click", function () {
        var t = emailEl ? String(emailEl.value || "") : "";
        if (!t.trim()) {
          var b = typeof window.clarityReadWorkflowBundle === "function" ? window.clarityReadWorkflowBundle() : null;
          t = bundleEmailText(b || {});
        }
        runGrammarFromContent(t, "Done.");
      });
    }

    tryWorkflowHydrate();

    if (!window.__clarityGrammarState.hasGrammarResult) {
      updateToneSpectrumUI(null);
    }
    paintGrammarIssuesPage();

      ensureGrammarFromWorkspace().catch(function (e) {
        console.error(e);
        setGrammarWorkflowHint(e.message || String(e));
      });
    } catch (err) {
      console.error("grammar-page: boot", err);
      setGrammarWorkflowHint("Could not initialize grammar page: " + (err && err.message ? err.message : String(err)));
    }

    try {
      window.__clarityGrammarPageLoaded = true;
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootGrammarPage);
  } else {
    bootGrammarPage();
  }

  window.addEventListener("load", function () {
    try {
      if (window.__clarityGrammarPageLoaded) return;
      setGrammarWorkflowHint(
        "grammar-page.js may not have run. Serve clarity-ui over HTTP (e.g. npx serve) so js/grammar-page.js loads; file:// often breaks scripts.",
      );
    } catch (e) {}
  });
})();
