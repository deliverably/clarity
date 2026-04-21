(function () {
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Last path segment, lowercased (handles trailing slash; may omit .html depending on server). */
  function pageName() {
    var path = String(location.pathname || "").replace(/\/+$/, "");
    var parts = path.split("/").filter(function (s) {
      return s;
    });
    return (parts.pop() || "").toLowerCase();
  }

  function pageKey() {
    return pageName().replace(/\.html$/i, "");
  }

  /** True when this document is the HTML Check shell (survives odd URLs / hosting where pageKey() is wrong). */
  function isHtmlAnalyzerDocument() {
    return !!document.getElementById("clarity-html-before");
  }

  function bindSpamRunners(fn) {
    var a = document.getElementById("clarity-run-spam");
    if (a) a.addEventListener("click", fn);
    document.querySelectorAll("[data-clarity-run-spam]").forEach(function (el) {
      el.addEventListener("click", fn);
    });
  }

  var SPAM_LIST_PAGE_SIZE = 10;

  function spamTriggersSorted(triggers) {
    return (triggers || []).slice().sort(function (a, b) {
      return String(b.word || "").length - String(a.word || "").length;
    });
  }

  /** Ordered global replace; same approach for plain text and HTML (may alter URLs/markup if a word matches inside tags). */
  function applyTriggersToPlainOrHtml(text, triggers) {
    var v = String(text || "");
    spamTriggersSorted(triggers).forEach(function (t) {
      if (t.word && t.replacement != null) v = v.split(t.word).join(t.replacement);
    });
    return v;
  }

  function plainFromHtml(html) {
    var d = document.createElement("div");
    d.innerHTML = html || "";
    var t = (d.textContent || "").replace(/\s+/g, " ").trim();
    return t.length ? t : " ";
  }

  function persistSpamWorkflowEdits(html, plainText, statusEl) {
    if (typeof window.clarityWorkflowActive !== "function" || !window.clarityWorkflowActive()) return false;
    var bundle = window.clarityReadWorkflowBundle && window.clarityReadWorkflowBundle();
    if (!bundle || !bundle.designId) return false;
    bundle.html = html;
    bundle.plainText = plainText;
    var ok = window.clarityWriteWorkflowBundle && window.clarityWriteWorkflowBundle(bundle);
    var patched =
      window.clarityPatchDesignById &&
      window.clarityPatchDesignById(bundle.designId, { html: html, plainText: plainText });
    if (statusEl) {
      statusEl.textContent = ok && patched ? "Saved to workspace design." : "Could not save to workspace (storage).";
    }
    return !!(ok && patched);
  }

  function updateSpamSummaryElements(data, totalEl, metaEl) {
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
  }

  function initSpamList() {
    if (typeof window.clarityHideManualWorkflowUI === "function") {
      try {
        window.clarityHideManualWorkflowUI();
      } catch (e) {}
    }

    var email = document.getElementById("clarity-spam-email");
    var tbody = document.getElementById("clarity-spam-tbody");
    var totalEl = document.getElementById("clarity-spam-total");
    var meta = document.getElementById("clarity-spam-risk-meta");
    var status = document.getElementById("clarity-spam-status");
    var applyAll = document.getElementById("clarity-spam-apply-all");
    var pageInfo = document.getElementById("clarity-spam-page-info");
    var pager = document.getElementById("clarity-spam-pager");
    var pagerPages = document.getElementById("clarity-spam-pager-pages");
    var pagerPrev = document.getElementById("clarity-spam-pager-prev");
    var pagerNext = document.getElementById("clarity-spam-pager-next");
    var btnViewList = document.getElementById("clarity-spam-view-list");
    var btnViewImage = document.getElementById("clarity-spam-view-image");
    var tabSpam = document.getElementById("clarity-spam-tab-spam");
    var tabKw = document.getElementById("clarity-spam-tab-kw");
    var rootSpam = document.getElementById("clarity-spam-view-root");
    var rootKw = document.getElementById("clarity-kw-view-root");
    var kwSector = document.getElementById("kw-sector");
    var kwBody = document.getElementById("kw-body");
    var kwRun = document.getElementById("kw-run");
    var kwOut = document.getElementById("clarity-spam-kw-out");

    function applySpamMainView(which) {
      var isSpam = which === "spam";
      if (rootSpam) rootSpam.classList.toggle("hidden", !isSpam);
      if (rootKw) rootKw.classList.toggle("hidden", isSpam);
      if (tabSpam) {
        tabSpam.classList.toggle("bg-white", isSpam);
        tabSpam.classList.toggle("shadow-sm", isSpam);
        tabSpam.classList.toggle("font-bold", isSpam);
        tabSpam.classList.toggle("text-primary", isSpam);
        tabSpam.classList.toggle("font-medium", !isSpam);
        tabSpam.classList.toggle("text-on-surface-variant", !isSpam);
      }
      if (tabKw) {
        tabKw.classList.toggle("bg-white", !isSpam);
        tabKw.classList.toggle("shadow-sm", !isSpam);
        tabKw.classList.toggle("font-bold", !isSpam);
        tabKw.classList.toggle("text-primary", !isSpam);
        tabKw.classList.toggle("font-medium", isSpam);
        tabKw.classList.toggle("text-on-surface-variant", isSpam);
      }
      try {
        var u = new URL(String(window.location.href));
        u.searchParams.set("view", isSpam ? "spam" : "kw");
        window.history.replaceState(null, "", u.pathname + u.search + u.hash);
      } catch (e) {}
    }

    var initialView = "spam";
    try {
      var v = new URLSearchParams(window.location.search || "").get("view");
      if (v === "kw") initialView = "kw";
    } catch (e2) {}
    if (rootSpam || rootKw) {
      applySpamMainView(initialView);
    }

    if (tabSpam) {
      tabSpam.addEventListener("click", function () {
        applySpamMainView("spam");
      });
    }
    if (tabKw) {
      tabKw.addEventListener("click", function () {
        applySpamMainView("kw");
      });
    }

    if (kwRun) {
      kwRun.addEventListener("click", async function () {
        if (status) status.textContent = "Analyzing keywords…";
        try {
          var data = await window.ClarityAPI.runAnalysis("keywords", {
            emailContent: (kwBody && kwBody.value) || "",
            sector: (kwSector && kwSector.value) || "Auto-detect",
          });
          if (kwOut) kwOut.textContent = JSON.stringify(data, null, 2);
          renderKwSummaryUI(data);
          if (status) status.textContent = "Done.";
        } catch (e) {
          if (status) status.textContent = e.message || String(e);
        }
      });
    }

    var listState = { data: null, pageIndex: 0 };

    function workflowBundle() {
      return typeof window.clarityReadWorkflowBundle === "function" ? window.clarityReadWorkflowBundle() : null;
    }

    function currentPlainAndHtml() {
      var b = workflowBundle();
      var plain = (email && email.value) || "";
      var htmlStr = (b && b.html) || "";
      if (typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive() && b) {
        plain = plain || (b.plainText != null ? String(b.plainText) : "");
        htmlStr = htmlStr || "";
      }
      return { bundle: b, plain: plain, html: htmlStr };
    }

    function paintSpamListPage() {
      var data = listState.data;
      if (!tbody) return;
      tbody.innerHTML = "";
      if (!data) {
        if (pageInfo) pageInfo.textContent = "";
        if (pager) pager.classList.add("hidden");
        return;
      }
      updateSpamSummaryElements(data, totalEl, meta);
      var triggers = data.triggers || [];
      var total = triggers.length;
      var pageSize = SPAM_LIST_PAGE_SIZE;
      var pageCount = total === 0 ? 1 : Math.ceil(total / pageSize);
      if (listState.pageIndex >= pageCount) listState.pageIndex = Math.max(0, pageCount - 1);
      var start = listState.pageIndex * pageSize;
      var slice = triggers.slice(start, start + pageSize);

      if (total === 0) {
        var empty = document.createElement("tr");
        empty.innerHTML =
          '<td colspan="3" class="px-8 py-8 text-center text-sm text-on-surface-variant">No spam triggers in this analysis.</td>';
        tbody.appendChild(empty);
      } else {
        slice.forEach(function (t) {
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
            var bBefore = workflowBundle();
            var oldHtml = (bBefore && bBefore.html) || "";
            email.value = email.value.split(t.word).join(t.replacement || "");
            var newPlain = email.value;
            var newHtml = oldHtml ? oldHtml.split(t.word).join(t.replacement || "") : newPlain;
            if (bBefore && typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive()) {
              persistSpamWorkflowEdits(newHtml, newPlain, status);
            }
          });
          tbody.appendChild(tr);
        });
      }

      if (pageInfo) {
        if (total === 0) pageInfo.textContent = "No results";
        else if (total <= pageSize) pageInfo.textContent = "Showing all " + total + " results";
        else pageInfo.textContent = "Showing " + slice.length + " of " + total + " results";
      }

      if (pager) {
        if (total <= pageSize || total === 0) {
          pager.classList.add("hidden");
        } else {
          pager.classList.remove("hidden");
          if (pagerPrev) pagerPrev.disabled = listState.pageIndex <= 0;
          if (pagerNext) pagerNext.disabled = listState.pageIndex >= pageCount - 1;
          if (pagerPages) {
            pagerPages.innerHTML = "";
            for (var p = 0; p < pageCount; p++) {
              (function (pageIdx) {
                var btn = document.createElement("button");
                btn.type = "button";
                btn.textContent = String(pageIdx + 1);
                btn.className =
                  "w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all " +
                  (listState.pageIndex === pageIdx
                    ? "bg-primary text-white"
                    : "text-on-surface-variant hover:bg-surface-container-high");
                btn.addEventListener("click", function () {
                  listState.pageIndex = pageIdx;
                  paintSpamListPage();
                });
                pagerPages.appendChild(btn);
              })(p);
            }
          }
        }
      }
    }

    function setSpamListData(data) {
      listState.data = data;
      listState.pageIndex = 0;
      paintSpamListPage();
    }

    if (pagerPrev) {
      pagerPrev.addEventListener("click", function () {
        if (listState.pageIndex > 0) {
          listState.pageIndex--;
          paintSpamListPage();
        }
      });
    }
    if (pagerNext) {
      pagerNext.addEventListener("click", function () {
        var triggers = (listState.data && listState.data.triggers) || [];
        var pageCount = triggers.length === 0 ? 1 : Math.ceil(triggers.length / SPAM_LIST_PAGE_SIZE);
        if (listState.pageIndex < pageCount - 1) {
          listState.pageIndex++;
          paintSpamListPage();
        }
      });
    }

    if (btnViewImage) {
      btnViewImage.addEventListener("click", function () {
        window.location.href = "spamtrigger_visual.html" + window.location.search;
      });
    }
    if (btnViewList) {
      btnViewList.addEventListener("click", function () {
        var el = document.getElementById("clarity-spam-detected");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    async function run() {
      if (status) status.textContent = "Analyzing…";
      try {
        var data = await window.ClarityAPI.runAnalysis("spam", {
          emailContent: (email && email.value) || "",
        });
        setSpamListData(data);
        if (status) status.textContent = "Done.";
      } catch (e) {
        if (status) status.textContent = e.message || String(e);
      }
    }

    bindSpamRunners(run);
    if (applyAll && email) {
      applyAll.addEventListener("click", async function () {
        try {
          var data = listState.data;
          var wf =
            typeof window.clarityWorkflowActive === "function" &&
            window.clarityWorkflowActive() &&
            workflowBundle() &&
            workflowBundle().analysis &&
            workflowBundle().analysis.spam &&
            workflowBundle().analysis.spam.status === "done";
          if (wf) {
            data = workflowBundle().analysis.spam.data;
          } else {
            data = await window.ClarityAPI.runAnalysis("spam", { emailContent: email.value || "" });
            setSpamListData(data);
          }
          if (!data || !data.triggers) return;
          var ctx = currentPlainAndHtml();
          var newPlain = applyTriggersToPlainOrHtml(ctx.plain, data.triggers);
          var newHtml = applyTriggersToPlainOrHtml(ctx.html || ctx.plain, data.triggers);
          email.value = newPlain;
          if (wf) persistSpamWorkflowEdits(newHtml, newPlain, status);
          else if (status) status.textContent = "Applied all suggestions to text.";
        } catch (e) {
          window.alert(e.message || String(e));
        }
      });
    }

    if (typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive()) {
      var params = new URLSearchParams(location.search || "");
      var designId = params.get("designId");
      var bundle = workflowBundle();
      var spamReady =
        bundle &&
        bundle.analysis &&
        bundle.analysis.spam &&
        bundle.analysis.spam.status === "done" &&
        bundle.analysis.spam.data;
      if (
        !spamReady &&
        designId &&
        typeof window.clarityHydrateSessionFromDesignId === "function" &&
        window.clarityHydrateSessionFromDesignId(designId)
      ) {
        bundle = workflowBundle();
        spamReady =
          bundle &&
          bundle.analysis &&
          bundle.analysis.spam &&
          bundle.analysis.spam.status === "done" &&
          bundle.analysis.spam.data;
      }
      if (spamReady) {
        if (email && bundle.plainText != null) email.value = bundle.plainText;
        setSpamListData(bundle.analysis.spam.data);
        if (kwBody && bundle.plainText != null) kwBody.value = bundle.plainText;
        if (kwSector) kwSector.value = "Auto-detect";
        var kwBundleReady =
          bundle.analysis &&
          bundle.analysis.keywords &&
          bundle.analysis.keywords.status === "done" &&
          bundle.analysis.keywords.data;
        if (kwBundleReady) {
          if (kwOut) kwOut.textContent = JSON.stringify(bundle.analysis.keywords.data, null, 2);
          renderKwSummaryUI(bundle.analysis.keywords.data);
        }
        if (status) status.textContent = "Loaded from workspace.";
      } else if (status) {
        status.textContent = designId
          ? "Could not load this design, or spam analysis is not finished yet."
          : "No session data in this tab. Open the module again from the workspace (links include your design id).";
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

  function renderSpamVisualFromData(data, email, opts) {
    opts = opts || {};
    var bundle = opts.bundle;
    var previewSource =
      bundle && bundle.html ? plainFromHtml(bundle.html) : (email && email.value) || "";
    var body = document.getElementById("clarity-spam-visual-body");
    var cards = document.getElementById("clarity-spam-visual-cards");
    var countEl = document.getElementById("clarity-spam-visual-count");
    var sum = data.summary || {};
    var n = sum.total_triggers != null ? sum.total_triggers : (data.triggers || []).length;
    if (countEl) countEl.textContent = String(n) + " Spam Words Found";
    var pctEl = document.getElementById("clarity-spam-visual-health-pct");
    var barEl = document.getElementById("clarity-spam-visual-health-bar");
    var copyEl = document.getElementById("clarity-spam-visual-health-copy");
    if (pctEl) {
      if (sum.spam_score != null) pctEl.textContent = String(sum.spam_score) + "%";
      else pctEl.textContent = "—";
    }
    if (barEl) {
      if (sum.spam_score != null) barEl.style.width = Math.min(100, Math.max(0, sum.spam_score)) + "%";
      else barEl.style.width = "0%";
    }
    if (copyEl) {
      var line = ((sum.risk_level ? "Risk: " + sum.risk_level + ". " : "") + (sum.deliverability_impact || "")).trim();
      copyEl.textContent = line || "Spam score and risk appear here after analysis.";
    }
    if (body) {
      body.innerHTML =
        '<div class="prose prose-sm max-w-none text-slate-700 leading-relaxed">' +
        highlightText(previewSource, data.triggers || []) +
        "</div>";
    }
    if (cards) {
      cards.innerHTML = "";
      (data.triggers || []).forEach(function (t) {
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
          var b =
            typeof window.clarityReadWorkflowBundle === "function" ? window.clarityReadWorkflowBundle() : null;
          if (
            b &&
            typeof window.clarityWorkflowActive === "function" &&
            window.clarityWorkflowActive() &&
            b.designId
          ) {
            var newPlain = email.value;
            var newHtml = (b.html || "").split(t.word).join(t.replacement || "");
            persistSpamWorkflowEdits(newHtml, newPlain, document.getElementById("clarity-spam-status"));
            var b2 = window.clarityReadWorkflowBundle && window.clarityReadWorkflowBundle();
            renderSpamVisualFromData(data, email, { bundle: b2 });
          }
        });
        cards.appendChild(div);
      });
    }
  }

  function initSpamVisual() {
    var email = document.getElementById("clarity-spam-email");
    var status = document.getElementById("clarity-spam-status");
    var visualDataRef = { data: null, bundle: null };

    var btnSource = document.getElementById("clarity-spam-visual-source");
    if (btnSource) {
      btnSource.addEventListener("click", function () {
        window.location.href = "spamtrigger_list.html" + window.location.search;
      });
    }
    var btnAuto = document.getElementById("clarity-spam-visual-auto-replace");
    if (btnAuto && email) {
      btnAuto.addEventListener("click", function () {
        var data = visualDataRef.data;
        if (!data || !data.triggers) return;
        var low = (data.triggers || []).filter(function (t) {
          return t.risk === "low";
        });
        if (!low.length) {
          if (status) status.textContent = "No low-risk triggers to replace.";
          return;
        }
        var b =
          typeof window.clarityReadWorkflowBundle === "function" ? window.clarityReadWorkflowBundle() : null;
        var plain = (email && email.value) || (b && b.plainText) || "";
        var htmlStr = (b && b.html) || plain;
        var newPlain = applyTriggersToPlainOrHtml(plain, low);
        var newHtml = applyTriggersToPlainOrHtml(htmlStr, low);
        email.value = newPlain;
        if (b && typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive()) {
          persistSpamWorkflowEdits(newHtml, newPlain, status);
          var b2 = window.clarityReadWorkflowBundle && window.clarityReadWorkflowBundle();
          renderSpamVisualFromData(data, email, { bundle: b2 });
        } else if (status) status.textContent = "Applied low-risk replacements.";
      });
    }

    async function run() {
      if (status) status.textContent = "Analyzing…";
      try {
        var data = await window.ClarityAPI.runAnalysis("spam", {
          emailContent: (email && email.value) || "",
        });
        visualDataRef.data = data;
        visualDataRef.bundle = null;
        renderSpamVisualFromData(data, email, {});
        if (status) status.textContent = "Done.";
      } catch (e) {
        if (status) status.textContent = e.message || String(e);
      }
    }
    bindSpamRunners(run);

    if (typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive()) {
      var params = new URLSearchParams(location.search || "");
      var designId = params.get("designId");
      var bundle = window.clarityReadWorkflowBundle && window.clarityReadWorkflowBundle();
      var spamReady =
        bundle &&
        bundle.analysis &&
        bundle.analysis.spam &&
        bundle.analysis.spam.status === "done" &&
        bundle.analysis.spam.data;
      if (
        !spamReady &&
        designId &&
        typeof window.clarityHydrateSessionFromDesignId === "function" &&
        window.clarityHydrateSessionFromDesignId(designId)
      ) {
        bundle = window.clarityReadWorkflowBundle && window.clarityReadWorkflowBundle();
        spamReady =
          bundle &&
          bundle.analysis &&
          bundle.analysis.spam &&
          bundle.analysis.spam.status === "done" &&
          bundle.analysis.spam.data;
      }
      if (spamReady) {
        if (email && bundle.plainText != null) email.value = bundle.plainText;
        visualDataRef.data = bundle.analysis.spam.data;
        visualDataRef.bundle = bundle;
        renderSpamVisualFromData(bundle.analysis.spam.data, email, { bundle: bundle });
        if (status) status.textContent = "Loaded from workspace.";
      } else if (status) {
        status.textContent = designId
          ? "Could not load this design, or spam analysis is not finished yet."
          : "No session data in this tab. Open from the workspace so the URL includes your design id.";
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

  function renderKwSummaryUI(data, optionalRoot) {
    var el = null;
    if (optionalRoot) {
      if (typeof optionalRoot === "string") el = document.getElementById(optionalRoot);
      else if (optionalRoot && optionalRoot.nodeType === 1) el = optionalRoot;
    }
    if (!el) el = document.getElementById("clarity-kw-ui");
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

  /** Circumference for r=58 (matches content_analysis.html SVG). */
  var DESIGN_SCORE_RING_C = 2 * Math.PI * 58;

  /** Visual scale for email thumbnail (shell is unscaled layout; scaler clips to scaled size). */
  var DESIGN_PREVIEW_SCALE_DESKTOP = 0.68;
  var DESIGN_PREVIEW_SCALE_MOBILE = 0.76;
  var designPreviewScale = DESIGN_PREVIEW_SCALE_DESKTOP;

  function hydrateDesignWorkflowBundleFromDesignId() {
    try {
      var p = new URLSearchParams(String(window.location && window.location.search) || "");
      if (p.get("workflow") !== "1") return;
      var id = p.get("designId");
      if (!id || typeof window.clarityHydrateSessionFromDesignId !== "function") return;
      window.clarityHydrateSessionFromDesignId(id);
    } catch (e) {
      console.warn("design-page: hydrate", e);
    }
  }

  function seedDesignWorkflowBundleFromOpener() {
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
      console.warn("design-page: opener bundle", e);
    }
  }

  function wrapEmailHtmlForPreview(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    if (/<\s*html[\s>]/i.test(s)) return s;
    return (
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<style>html,body{margin:0;padding:0;}</style></head><body>" +
      s +
      "</body></html>"
    );
  }

  function setDesignPreviewEmptyVisible(show) {
    var el = document.getElementById("clarity-design-preview-empty");
    if (!el) return;
    if (show) {
      el.classList.remove("hidden");
      el.classList.add("flex");
      el.style.display = "flex";
    } else {
      el.classList.add("hidden");
      el.classList.remove("flex");
      el.style.display = "none";
    }
  }

  function sizeDesignPreviewIframe() {
    var frame = document.getElementById("clarity-design-preview-frame");
    if (!frame) return;
    try {
      var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
      if (!doc || !doc.body) return;
      var h = Math.max(
        doc.body.scrollHeight || 0,
        doc.documentElement ? doc.documentElement.scrollHeight || 0 : 0,
        frame.offsetHeight || 0,
        200,
      );
      h = Math.min(h, 12000);
      frame.style.height = h + "px";
    } catch (e) {
      console.warn("sizeDesignPreviewIframe", e);
    }
  }

  function layoutDesignPreviewScale() {
    var scaler = document.getElementById("clarity-design-thumb-scaler");
    var shell = document.getElementById("clarity-design-preview-shell");
    var frame = document.getElementById("clarity-design-preview-frame");
    if (!scaler || !shell || !frame) return;
    var w = shell.offsetWidth || 600;
    var h = Math.max(frame.offsetHeight || 0, 200);
    var s = designPreviewScale;
    shell.style.width = w + "px";
    shell.style.transform = "scale(" + s + ")";
    shell.style.transformOrigin = "top left";
    scaler.style.width = Math.ceil(w * s) + "px";
    scaler.style.height = Math.ceil(h * s) + "px";
  }

  function scheduleDesignPreviewLayout() {
    sizeDesignPreviewIframe();
    layoutDesignPreviewScale();
    window.setTimeout(function () {
      sizeDesignPreviewIframe();
      layoutDesignPreviewScale();
    }, 350);
  }

  function renderDesignPreview(htmlRaw) {
    var frame = document.getElementById("clarity-design-preview-frame");
    if (!frame) return;
    var wrapped = wrapEmailHtmlForPreview(htmlRaw);
    if (!wrapped) {
      try {
        frame.removeAttribute("srcdoc");
      } catch (e) {}
      frame.srcdoc = "";
      setDesignPreviewEmptyVisible(true);
      return;
    }
    try {
      frame.onload = function () {
        scheduleDesignPreviewLayout();
      };
      frame.srcdoc = wrapped;
    } catch (e) {
      console.warn("renderDesignPreview", e);
    }
    setDesignPreviewEmptyVisible(false);
    window.setTimeout(function () {
      scheduleDesignPreviewLayout();
    }, 0);
  }

  /**
   * Map API target_zone strings to approximate pin positions over the preview frame (percent).
   * Used because annotations have no x/y coordinates.
   */
  function designAnnotationPosition(targetZone) {
    var z = String(targetZone || "").toLowerCase();
    if (/footer|bottom|legal|unsubscribe/.test(z)) return { top: "88%", left: "50%" };
    if (/cta|button|action|conversion/.test(z)) return { top: "72%", left: "50%" };
    if (/hero|banner|image|photo|graphic/.test(z)) return { top: "30%", left: "50%" };
    if (/header|preheader|top|logo|nav/.test(z)) return { top: "10%", left: "50%" };
    if (/sidebar|aside|column/.test(z)) return { top: "45%", left: "18%" };
    if (/body|copy|text|paragraph|content/.test(z)) return { top: "52%", left: "50%" };
    return { top: "45%", left: "50%" };
  }

  function annotationTypeClasses(type) {
    if (type === "praise")
      return {
        pin: "bg-secondary ring-secondary/30",
        chip: "bg-secondary/15 text-secondary",
        callout: "border-secondary/40 ring-1 ring-secondary/20",
      };
    if (type === "issue")
      return {
        pin: "bg-error ring-error/30",
        chip: "bg-error-container text-on-error-container",
        callout: "border-error/50 ring-1 ring-error/25",
      };
    return {
      pin: "bg-primary ring-primary/30",
      chip: "bg-primary/10 text-primary",
      callout: "border-primary/40 ring-1 ring-primary/20",
    };
  }

  function renderDesignAnnotations(annotations) {
    var layer = document.getElementById("clarity-design-annotation-layer");
    if (!layer) return;
    layer.innerHTML = "";
    (annotations || []).forEach(function (ann, idx) {
      var pos = designAnnotationPosition(ann.target_zone);
      var styles = annotationTypeClasses(ann.type);
      /** Stagger overlapping pins so callouts remain readable */
      var jitterX = (idx % 5) * 10 - 20;
      var jitterY = Math.floor(idx / 5) * 8;
      var wrap = document.createElement("div");
      wrap.className = "absolute pointer-events-auto";
      wrap.style.top = "calc(" + pos.top + " + " + jitterY + "px)";
      wrap.style.left = "calc(" + pos.left + " + " + jitterX + "px)";
      wrap.style.transform = "translate(-50%, -50%)";
      wrap.style.zIndex = String(30 + idx);
      var typeLabel =
        ann.type === "praise" ? "Optimization" : ann.type === "issue" ? "Fix" : "Strategy";
      var detail = String(ann.detail || "");
      if (detail.length > 220) detail = detail.slice(0, 217) + "…";
      /** Callout sits directly above the pin; pin is centered on the zone (issue location). */
      wrap.innerHTML =
        '<div class="absolute bottom-full left-1/2 z-30 mb-1 w-[min(200px,42vw)] -translate-x-1/2 rounded-lg border bg-white/95 p-2.5 text-left shadow-lg backdrop-blur-sm ' +
        styles.callout +
        ' pointer-events-auto">' +
        '<p class="text-[9px] font-bold uppercase tracking-wide ' +
        styles.chip +
        ' inline-block rounded px-1.5 py-0.5">' +
        esc(typeLabel) +
        "</p>" +
        '<p class="mt-1 text-[11px] font-bold leading-tight text-on-surface">' +
        esc(ann.title || "") +
        "</p>" +
        '<p class="mt-1 max-h-[4.5rem] overflow-hidden text-[10px] leading-snug text-on-surface-variant">' +
        esc(detail) +
        "</p>" +
        '<p class="mt-1.5 border-t border-outline-variant/20 pt-1 text-[9px] text-on-surface-variant/80">' +
        esc(ann.target_zone || "") +
        " · " +
        esc(ann.priority || "") +
        "</p></div>" +
        '<button type="button" class="relative z-20 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full ' +
        styles.pin +
        ' text-white shadow-md ring-4 animate-pulse" aria-label="' +
        esc(ann.title || "Marker") +
        '"><span class="material-symbols-outlined text-xs" style="font-variation-settings: \'FILL\' 1;">auto_awesome</span></button>';
      layer.appendChild(wrap);
    });
  }

  function strategyAreaMeta(area) {
    var a = String(area || "");
    var map = {
      subject_line: { icon: "alternate_email", label: "Subject" },
      content: { icon: "article", label: "Content" },
      cta: { icon: "call_to_action", label: "CTA" },
      layout: { icon: "dashboard", label: "Layout" },
      imagery: { icon: "image", label: "Imagery" },
    };
    return map[a] || { icon: "tune", label: a.replace(/_/g, " ") };
  }

  /** Distinct card + button styling — rotate palette so adjacent cards differ. */
  function strategyCardTheme(index) {
    var themes = [
      {
        card: "border-primary/35 bg-primary-fixed/20",
        icon: "bg-primary-container text-white",
        badge: "bg-primary/15 text-primary border border-primary/25",
        apply: "bg-primary text-white hover:bg-primary-container",
        ignore: "border-primary/30 text-primary",
      },
      {
        card: "border-secondary/35 bg-secondary-fixed/25",
        icon: "bg-secondary text-white",
        badge: "bg-secondary/15 text-secondary border border-secondary/25",
        apply: "bg-secondary text-white hover:bg-secondary-container",
        ignore: "border-secondary/30 text-secondary",
      },
      {
        card: "border-tertiary/40 bg-tertiary-fixed/30",
        icon: "bg-tertiary text-white",
        badge: "bg-tertiary/15 text-tertiary border border-tertiary/30",
        apply: "bg-tertiary text-white hover:bg-tertiary-container",
        ignore: "border-tertiary/40 text-tertiary",
      },
      {
        card: "border-outline-variant/40 bg-surface-container-high/50",
        icon: "bg-on-surface text-white",
        badge: "bg-surface-container-highest text-on-surface border border-outline-variant/30",
        apply: "bg-on-surface text-white hover:bg-primary",
        ignore: "border-outline-variant/40 text-on-surface-variant",
      },
    ];
    return themes[index % themes.length];
  }

  function renderStrategyCards(suggestions) {
    var host = document.getElementById("clarity-strategy-cards");
    var empty = document.getElementById("clarity-strategy-empty");
    if (!host) return;
    host.innerHTML = "";
    var list = (suggestions || []).slice().sort(function (a, b) {
      return (a.rank || 0) - (b.rank || 0);
    });
    if (empty) empty.classList.toggle("hidden", list.length > 0);
    list.forEach(function (sug, ix) {
      var meta = strategyAreaMeta(sug.area);
      var th = strategyCardTheme(ix);
      var card = document.createElement("div");
      card.className =
        "rounded-xl border p-5 shadow-sm transition-shadow hover:shadow-md " + th.card;
      card.innerHTML =
        '<div class="flex justify-between items-start mb-3 gap-2">' +
        '<div class="rounded-lg p-2 ' +
        th.icon +
        '"><span class="material-symbols-outlined text-sm">' +
        esc(meta.icon) +
        "</span></div>" +
        '<span class="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ' +
        th.badge +
        '">' +
        esc(meta.label) +
        " · " +
        esc(String(sug.expected_impact || "")) +
        " impact</span></div>" +
        '<p class="mb-4 text-xs leading-relaxed text-on-surface">' +
        esc(sug.suggestion || "") +
        "</p>" +
        '<div class="flex gap-2">' +
        '<button type="button" class="clarity-strategy-apply flex-1 rounded-lg py-2 text-[11px] font-bold transition-colors ' +
        th.apply +
        '" title="Coming soon">Apply</button>' +
        '<button type="button" class="clarity-strategy-ignore rounded-lg border px-4 py-2 text-[11px] font-bold ' +
        th.ignore +
        '" title="Coming soon">Ignore</button>' +
        "</div>";
      var applyBtn = card.querySelector(".clarity-strategy-apply");
      var ignBtn = card.querySelector(".clarity-strategy-ignore");
      if (applyBtn)
        applyBtn.addEventListener("click", function (e) {
          e.preventDefault();
        });
      if (ignBtn)
        ignBtn.addEventListener("click", function (e) {
          e.preventDefault();
        });
      host.appendChild(card);
    });
  }

  function setDesignScoreRing(overall) {
    var ring = document.getElementById("clarity-design-score-ring");
    if (!ring) return;
    var v = overall;
    if (v == null || isNaN(Number(v))) {
      ring.setAttribute("stroke-dashoffset", String(DESIGN_SCORE_RING_C));
      return;
    }
    var pct = Math.min(100, Math.max(0, Number(v)));
    ring.setAttribute("stroke-dashoffset", String(DESIGN_SCORE_RING_C * (1 - pct / 100)));
  }

  function setDimensionFeedback(elId, block) {
    var el = document.getElementById(elId);
    if (!el) return;
    if (!block) {
      el.textContent = "";
      return;
    }
    var parts = [];
    if (block.label) parts.push(String(block.label));
    if (block.feedback) parts.push(String(block.feedback));
    el.textContent = parts.join(" · ");
  }

  function heroSummaryFromQuality(q) {
    var sl = q.subject_line || {};
    var co = q.content || {};
    var ct = q.ctas || {};
    var dims = [
      { score: sl.score, feedback: sl.feedback, name: "subject line" },
      { score: co.score, feedback: co.feedback, name: "content clarity" },
      { score: ct.score, feedback: ct.feedback, name: "CTAs" },
    ];
    var scored = dims.filter(function (d) {
      return d.score != null && !isNaN(Number(d.score));
    });
    if (!scored.length) return "No dimension scores in the API response.";
    var min = Math.min.apply(
      null,
      scored.map(function (d) {
        return Number(d.score);
      }),
    );
    var weak = scored.find(function (d) {
      return Number(d.score) === min;
    });
    var overall = q.overall != null ? "Overall " + String(q.overall) + "/100. " : "";
    var focus = weak.feedback
      ? "Weakest area (" + weak.name + "): " + weak.feedback
      : "Focus on improving your " + weak.name + " (score " + min + ").";
    return overall + focus;
  }

  function renderDesignFromData(data, previewHtml) {
    var q = data.quality_scores || {};
    var ov = document.getElementById("clarity-design-overall");
    if (ov) ov.textContent = q.overall != null ? String(q.overall) : "—";
    setDesignScoreRing(q.overall);
    var hero = document.getElementById("clarity-design-hero-summary");
    if (hero) hero.textContent = heroSummaryFromQuality(q);

    function bar(idBar, idPct, block) {
      var s = block && block.score;
      var b = document.getElementById(idBar);
      var p = document.getElementById(idPct);
      if (s == null) {
        if (b) b.style.width = "0%";
        if (p) p.textContent = "—%";
        return;
      }
      if (b) b.style.width = Math.min(100, Math.max(0, s)) + "%";
      if (p) p.textContent = String(s) + "%";
    }
    bar("clarity-bar-subject", "clarity-pct-subject", q.subject_line);
    bar("clarity-bar-content", "clarity-pct-content", q.content);
    bar("clarity-bar-cta", "clarity-pct-cta", q.ctas);
    setDimensionFeedback("clarity-feedback-subject", q.subject_line);
    setDimensionFeedback("clarity-feedback-content", q.content);
    setDimensionFeedback("clarity-feedback-cta", q.ctas);

    var htmlEl = document.getElementById("clarity-design-html");
    var src = previewHtml != null ? previewHtml : htmlEl && htmlEl.value;
    renderDesignPreview(src || "");

    renderDesignAnnotations(data.annotations || []);
    renderStrategyCards(data.suggestions || []);

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
    if (typeof window.clarityHideManualWorkflowUI === "function") {
      try {
        window.clarityHideManualWorkflowUI();
      } catch (e) {}
    }
    hydrateDesignWorkflowBundleFromDesignId();
    seedDesignWorkflowBundleFromOpener();

    var sub = document.getElementById("clarity-design-subject");
    var html = document.getElementById("clarity-design-html");
    var btn = document.getElementById("clarity-run-design");
    var st = document.getElementById("clarity-design-status");
    var desktopBtn = document.getElementById("clarity-design-view-desktop");
    var mobileBtn = document.getElementById("clarity-design-view-mobile");
    var previewOuter = document.getElementById("clarity-design-preview-outer");
    var previewShell = document.getElementById("clarity-design-preview-shell");

    function setPreviewMode(mode) {
      if (!previewOuter) return;
      if (mode === "mobile") {
        previewOuter.classList.remove("max-w-5xl");
        previewOuter.classList.add("max-w-[375px]");
        designPreviewScale = DESIGN_PREVIEW_SCALE_MOBILE;
        if (previewShell) previewShell.style.width = "375px";
        if (desktopBtn) {
          desktopBtn.classList.remove("ring-2", "ring-primary/30", "bg-surface-container-low");
          desktopBtn.classList.add("text-on-surface-variant");
        }
        if (mobileBtn) {
          mobileBtn.classList.add("ring-2", "ring-primary/30", "bg-surface-container-low");
          mobileBtn.classList.remove("text-on-surface-variant");
        }
      } else {
        previewOuter.classList.add("max-w-5xl");
        previewOuter.classList.remove("max-w-[375px]");
        designPreviewScale = DESIGN_PREVIEW_SCALE_DESKTOP;
        if (previewShell) previewShell.style.width = "600px";
        if (desktopBtn) {
          desktopBtn.classList.add("ring-2", "ring-primary/30", "bg-surface-container-low");
          desktopBtn.classList.remove("text-on-surface-variant");
        }
        if (mobileBtn) {
          mobileBtn.classList.remove("ring-2", "ring-primary/30", "bg-surface-container-low");
          mobileBtn.classList.add("text-on-surface-variant");
        }
      }
      scheduleDesignPreviewLayout();
    }

    if (desktopBtn)
      desktopBtn.addEventListener("click", function () {
        setPreviewMode("desktop");
      });
    if (mobileBtn)
      mobileBtn.addEventListener("click", function () {
        setPreviewMode("mobile");
      });
    setPreviewMode("desktop");

    if (btn) {
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        if (st) st.textContent = "…";
        try {
          var htmlStr = (html && html.value) || "";
          var data = await window.ClarityAPI.runAnalysis("design", {
            emailHtml: htmlStr,
            subjectLine: (sub && sub.value) || "",
          });
          renderDesignFromData(data, htmlStr);
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
      if (bundle) {
        if (html && bundle.html) html.value = bundle.html;
        if (sub && bundle.subject != null) sub.value = bundle.subject;
        var htmlStr = (html && html.value) || "";
        renderDesignPreview(htmlStr);
        if (bundle.analysis && bundle.analysis.design && bundle.analysis.design.status === "done" && bundle.analysis.design.data) {
          renderDesignFromData(bundle.analysis.design.data, htmlStr);
          if (st) st.textContent = "Loaded from workspace.";
        } else if (st) st.textContent = "Workspace design loaded. Run analysis to score.";
      }
    } else if (html && html.value) {
      renderDesignPreview(html.value);
    }
  }

  function sortA11yChecks(checks) {
    return (checks || []).slice().sort(function (a, b) {
      var sa = String(a.status || "");
      var sb = String(b.status || "");
      var oa = sa === "fail" ? 0 : sa === "warning" ? 1 : sa === "pass" ? 2 : 3;
      var ob = sb === "fail" ? 0 : sb === "warning" ? 1 : sb === "pass" ? 2 : 3;
      if (oa !== ob) return oa - ob;
      var order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      var ra = order[String(a.severity || "").toLowerCase()];
      var rb = order[String(b.severity || "").toLowerCase()];
      if (ra == null) ra = 5;
      if (rb == null) rb = 5;
      return ra - rb;
    });
  }

  function a11yOutcomeBadgeHtml(status, muted) {
    var s = String(status || "").toLowerCase();
    var label =
      s === "pass" ? "Passed" : s === "fail" ? "Failed" : s === "warning" ? "Warning" : s === "not_applicable" ? "N/A" : String(status || "—");
    if (muted && s === "pass") {
      return (
        '<span class="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-md bg-slate-200/90 text-slate-500 border border-slate-300/70">' +
        esc(label) +
        "</span>"
      );
    }
    var cls =
      s === "pass"
        ? "bg-emerald-100 text-emerald-900 border border-emerald-200/80"
        : s === "fail"
        ? "bg-red-100 text-red-900 border border-red-200/80"
        : s === "warning"
        ? "bg-amber-100 text-amber-950 border border-amber-200/80"
        : "bg-slate-100 text-slate-700 border border-slate-200/80";
    return '<span class="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-md ' + cls + '">' + esc(label) + "</span>";
  }

  function a11ySeverityBadgeHtml(severity, muted) {
    var s = String(severity || "").toLowerCase();
    var label =
      s === "critical"
        ? "Critical"
        : s === "high"
        ? "High risk"
        : s === "medium"
        ? "Medium"
        : s === "low"
        ? "Low"
        : s === "info"
        ? "Info"
        : String(severity || "—");
    if (muted) {
      return (
        '<span class="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-slate-100 text-slate-400 border border-slate-200/70">' +
        esc(label) +
        "</span>"
      );
    }
    var cls =
      s === "critical"
        ? "bg-red-50 text-red-800 border border-red-200/80"
        : s === "high"
        ? "bg-orange-50 text-orange-900 border border-orange-200/80"
        : s === "medium"
        ? "bg-amber-50 text-amber-900 border border-amber-200/70"
        : s === "low"
        ? "bg-sky-50 text-sky-900 border border-sky-200/80"
        : "bg-slate-50 text-slate-600 border border-slate-200/80";
    return '<span class="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ' + cls + '">' + esc(label) + "</span>";
  }

  function partitionA11yChecksByPass(checks) {
    var pass = [];
    var rest = [];
    (checks || []).forEach(function (c) {
      if (String(c.status || "").toLowerCase() === "pass") pass.push(c);
      else rest.push(c);
    });
    pass.sort(function (a, b) {
      return String(a.label || "").localeCompare(String(b.label || ""));
    });
    return { pass: pass, rest: sortA11yChecks(rest) };
  }

  function splitHtmlIntoNarrationSegments(html) {
    var d = document.createElement("div");
    d.innerHTML = html || "";
    var t = (d.textContent || "").replace(/\s+/g, " ").trim();
    if (!t) return [];
    var out = [];
    var max = 280;
    while (t.length) {
      var chunk = t.slice(0, max);
      var sp = chunk.lastIndexOf(" ");
      if (sp > 50) chunk = t.slice(0, sp);
      out.push(chunk.trim());
      t = t.slice(chunk.length).trim();
      if (out.length > 40) break;
    }
    return out.filter(Boolean);
  }

  function chunkNarrationLine(line, maxLen) {
    var t = String(line || "").replace(/\s+/g, " ").trim();
    if (!t) return [];
    var m = maxLen || 320;
    if (t.length <= m) return [t];
    var out = [];
    while (t.length) {
      var chunk = t.slice(0, m);
      var sp = chunk.lastIndexOf(" ");
      if (sp > 40) chunk = t.slice(0, sp);
      out.push(chunk.trim());
      t = t.slice(chunk.length).trim();
      if (out.length > 120) break;
    }
    return out.filter(Boolean);
  }

  /**
   * Build TTS segments in approximate document/reading order (not just CTAs).
   * Prefer this over raw API audio_content when we have HTML, so the narrator reads the full email.
   */
  function buildEmailNarrationSegmentsFromHtml(html) {
    var raw = String(html || "").trim();
    if (!raw) return [];
    var wrapped = wrapEmailHtmlForPreview(raw);
    var doc;
    try {
      doc = new DOMParser().parseFromString(wrapped, "text/html");
    } catch (e) {
      return splitHtmlIntoNarrationSegments(raw);
    }
    var body = doc.body;
    if (!body) return splitHtmlIntoNarrationSegments(raw);

    var SKIP = { SCRIPT: true, STYLE: true, NOSCRIPT: true, TEMPLATE: true };
    var lines = [];

    function norm(s) {
      return String(s || "").replace(/\s+/g, " ").trim();
    }

    function pushLine(prefix, text) {
      var t = norm(text);
      if (!t) return;
      chunkNarrationLine((prefix ? prefix : "") + t).forEach(function (c) {
        lines.push(c);
      });
    }

    var titleEl = doc.querySelector("title");
    if (titleEl && norm(titleEl.textContent)) {
      pushLine("Title: ", titleEl.textContent);
    }

    function walk(el) {
      if (!el || el.nodeType !== 1) return;
      var tag = el.tagName;
      if (SKIP[tag]) return;

      if (tag === "IMG") {
        var alt = norm(el.getAttribute("alt"));
        lines.push.apply(lines, chunkNarrationLine(alt ? "Image: " + alt : "Image with no alternative text."));
        return;
      }

      if (/^H[1-6]$/.test(tag)) {
        pushLine("Heading: ", el.textContent);
        return;
      }

      if (tag === "BUTTON") {
        pushLine("Button: ", el.textContent);
        return;
      }

      if (tag === "INPUT") {
        var typ = String(el.getAttribute("type") || "text").toLowerCase();
        if (typ === "submit" || typ === "button" || typ === "reset") {
          pushLine("Button: ", el.getAttribute("value") || el.getAttribute("aria-label") || "");
        } else if (typ !== "hidden") {
          var lab = norm(el.getAttribute("aria-label") || el.getAttribute("placeholder") || "");
          if (lab) pushLine("Form field: ", lab);
        }
        return;
      }

      if (tag === "A") {
        var kids = el.children;
        if (kids && kids.length === 1 && kids[0].tagName === "IMG") {
          walk(kids[0]);
          var linkText = norm(el.getAttribute("title") || el.textContent);
          if (linkText) pushLine("Link: ", linkText);
          return;
        }
        pushLine("Link: ", el.textContent);
        return;
      }

      if (tag === "P" || tag === "LI") {
        pushLine("", el.textContent);
        return;
      }

      if (tag === "TD" || tag === "TH") {
        var c = norm(el.textContent);
        if (c) pushLine("Table cell: ", c);
        return;
      }

      var structural =
        tag === "TABLE" ||
        tag === "TBODY" ||
        tag === "THEAD" ||
        tag === "TFOOT" ||
        tag === "TR" ||
        tag === "DIV" ||
        tag === "SECTION" ||
        tag === "ARTICLE" ||
        tag === "CENTER" ||
        tag === "MAIN" ||
        tag === "SPAN" ||
        tag === "FONT";

      if (structural) {
        if (el.firstElementChild) {
          for (var cx = el.firstElementChild; cx; cx = cx.nextElementSibling) walk(cx);
        } else {
          var leaf = norm(el.textContent);
          if (leaf) pushLine("", leaf);
        }
        return;
      }

      if (el.children && el.firstElementChild) {
        for (var c3 = el.firstElementChild; c3; c3 = c3.nextElementSibling) walk(c3);
      } else {
        var o = norm(el.textContent);
        if (o) pushLine("", o);
      }
    }

    for (var b = body.firstElementChild; b; b = b.nextElementSibling) walk(b);

    if (!lines.length) {
      try {
        var it = norm(body.innerText || body.textContent || "");
        if (it) {
          it.split(/\n+/).forEach(function (ln) {
            var s = norm(ln);
            if (s) lines.push.apply(lines, chunkNarrationLine(s));
          });
        }
      } catch (e2) {}
    }

    return lines.filter(Boolean);
  }

  function sizeA11yPreviewIframe() {
    var frame = document.getElementById("clarity-a11y-preview-frame");
    if (!frame) return;
    try {
      var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
      if (!doc || !doc.body) return;
      var h = Math.max(
        doc.body.scrollHeight || 0,
        doc.documentElement ? doc.documentElement.scrollHeight || 0 : 0,
        320,
      );
      h = Math.min(h, 12000);
      frame.style.height = h + "px";
    } catch (e) {
      console.warn("sizeA11yPreviewIframe", e);
    }
  }

  function scheduleA11yPreviewLayout() {
    sizeA11yPreviewIframe();
    window.setTimeout(function () {
      sizeA11yPreviewIframe();
    }, 350);
  }

  function setA11yPreviewEmptyVisible(show) {
    var el = document.getElementById("clarity-a11y-preview-empty");
    if (!el) return;
    el.classList.toggle("hidden", !show);
  }

  function renderA11yEmailPreview(htmlRaw) {
    var frame = document.getElementById("clarity-a11y-preview-frame");
    if (!frame) return;
    var wrapped = wrapEmailHtmlForPreview(htmlRaw);
    if (!wrapped) {
      try {
        frame.removeAttribute("srcdoc");
      } catch (e) {}
      frame.srcdoc = "";
      setA11yPreviewEmptyVisible(true);
      return;
    }
    try {
      frame.onload = function () {
        scheduleA11yPreviewLayout();
      };
      frame.srcdoc = wrapped;
    } catch (e) {
      console.warn("renderA11yEmailPreview", e);
    }
    setA11yPreviewEmptyVisible(false);
    window.setTimeout(scheduleA11yPreviewLayout, 0);
  }

  var clarityA11yLastEmailHtml = "";
  var clarityA11yNarrator = {
    segments: [],
    idx: 0,
    playing: false,
    captionsOn: false,
    chainActive: false,
  };

  function clarityA11yNarratorStop() {
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) {}
    clarityA11yNarrator.playing = false;
    clarityA11yNarrator.chainActive = false;
  }

  function clarityA11yNarratorUpdateUi() {
    var total = Math.max(clarityA11yNarrator.segments.length, 1);
    var idx = Math.min(clarityA11yNarrator.idx, Math.max(total - 1, 0));
    var prog = document.getElementById("clarity-a11y-narr-progress");
    var time = document.getElementById("clarity-a11y-narr-time");
    var cap = document.getElementById("clarity-a11y-captions");
    var playIcon = document.getElementById("clarity-a11y-narr-play-icon");
    var title = document.getElementById("clarity-a11y-narrator-title");
    var pct = clarityA11yNarrator.segments.length ? ((idx + (clarityA11yNarrator.playing ? 0.35 : 0)) / total) * 100 : 0;
    if (prog) prog.style.width = Math.min(100, Math.max(0, pct)) + "%";
    if (time) time.textContent = clarityA11yNarrator.segments.length ? idx + 1 + " / " + clarityA11yNarrator.segments.length : "0 / 0";
    if (playIcon) playIcon.textContent = clarityA11yNarrator.playing ? "pause" : "play_arrow";
    if (title) {
      title.textContent = clarityA11yNarrator.segments.length
        ? "Screen reader simulation · segment " + (idx + 1) + " of " + clarityA11yNarrator.segments.length
        : "Run an audit to generate narration";
    }
    if (cap && !cap.classList.contains("hidden") && clarityA11yNarrator.captionsOn) {
      cap.textContent = clarityA11yNarrator.segments[idx] || "";
    }
  }

  function clarityA11yNarratorSpeakFrom(startIdx) {
    clarityA11yNarratorStop();
    if (!window.speechSynthesis || !clarityA11yNarrator.segments.length) {
      clarityA11yNarratorUpdateUi();
      return;
    }
    var i = Math.max(0, Math.min(startIdx, clarityA11yNarrator.segments.length - 1));
    clarityA11yNarrator.idx = i;
    clarityA11yNarrator.playing = true;
    clarityA11yNarrator.chainActive = true;
    clarityA11yNarratorUpdateUi();

    function speakAt(j) {
      if (!clarityA11yNarrator.chainActive || j >= clarityA11yNarrator.segments.length) {
        clarityA11yNarrator.playing = false;
        clarityA11yNarrator.chainActive = false;
        clarityA11yNarratorUpdateUi();
        return;
      }
      clarityA11yNarrator.idx = j;
      clarityA11yNarratorUpdateUi();
      var u = new SpeechSynthesisUtterance(clarityA11yNarrator.segments[j] || "");
      u.onend = function () {
        if (!clarityA11yNarrator.chainActive) return;
        speakAt(j + 1);
      };
      u.onerror = function () {
        clarityA11yNarrator.playing = false;
        clarityA11yNarrator.chainActive = false;
        clarityA11yNarratorUpdateUi();
      };
      try {
        window.speechSynthesis.speak(u);
      } catch (e) {
        clarityA11yNarrator.playing = false;
        clarityA11yNarrator.chainActive = false;
        clarityA11yNarratorUpdateUi();
      }
    }
    speakAt(i);
  }

  function clarityA11yNarratorSetSegmentsFromAudit(data, htmlFallback) {
    var html = htmlFallback || "";
    var fromEmail = buildEmailNarrationSegmentsFromHtml(html);
    var apiSegs = [];
    (data && data.audio_content ? data.audio_content : []).forEach(function (s) {
      var t = String(s || "").trim();
      if (t) apiSegs.push(t);
    });
    var segs = [];
    if (fromEmail.length) {
      segs = fromEmail.slice();
      if (apiSegs.length) {
        segs.push("Notes from the accessibility audit.");
        apiSegs.forEach(function (line) {
          segs.push(line);
        });
      }
    } else if (apiSegs.length) {
      segs = apiSegs.slice();
    } else {
      segs = splitHtmlIntoNarrationSegments(html);
    }
    clarityA11yNarrator.segments = segs;
    clarityA11yNarrator.idx = 0;
    clarityA11yNarrator.playing = false;
    clarityA11yNarratorUpdateUi();
  }

  function bindA11yNarratorControlsOnce() {
    if (bindA11yNarratorControlsOnce._done) return;
    bindA11yNarratorControlsOnce._done = true;
    var play = document.getElementById("clarity-a11y-narr-play");
    var prev = document.getElementById("clarity-a11y-narr-prev");
    var next = document.getElementById("clarity-a11y-narr-next");
    var capBtn = document.getElementById("clarity-a11y-narr-captions");
    var cap = document.getElementById("clarity-a11y-captions");
    if (play) {
      play.addEventListener("click", function () {
        if (!clarityA11yNarrator.segments.length) return;
        if (clarityA11yNarrator.playing) {
          clarityA11yNarratorStop();
          clarityA11yNarratorUpdateUi();
        } else {
          clarityA11yNarratorSpeakFrom(clarityA11yNarrator.idx);
        }
      });
    }
    if (prev) {
      prev.addEventListener("click", function () {
        clarityA11yNarratorStop();
        clarityA11yNarrator.idx = Math.max(0, clarityA11yNarrator.idx - 1);
        clarityA11yNarratorUpdateUi();
      });
    }
    if (next) {
      next.addEventListener("click", function () {
        clarityA11yNarratorStop();
        clarityA11yNarrator.idx = Math.min(
          Math.max(clarityA11yNarrator.segments.length - 1, 0),
          clarityA11yNarrator.idx + 1,
        );
        clarityA11yNarratorUpdateUi();
      });
    }
    if (capBtn && cap) {
      capBtn.addEventListener("click", function () {
        clarityA11yNarrator.captionsOn = !clarityA11yNarrator.captionsOn;
        capBtn.setAttribute("aria-pressed", clarityA11yNarrator.captionsOn ? "true" : "false");
        cap.classList.toggle("hidden", !clarityA11yNarrator.captionsOn);
        clarityA11yNarratorUpdateUi();
      });
    }
  }

  function bindA11ySimulationControlsOnce() {
    if (bindA11ySimulationControlsOnce._done) return;
    bindA11ySimulationControlsOnce._done = true;
    var host = document.getElementById("clarity-a11y-preview-filter-host");
    var scaler = document.getElementById("clarity-a11y-preview-scaler");
    var buttons = document.querySelectorAll("#clarity-a11y-sim-bar .clarity-a11y-sim-btn");
    function setActive(mode) {
      buttons.forEach(function (b) {
        var on = b.getAttribute("data-a11y-sim") === mode;
        b.classList.toggle("bg-primary-container", on);
        b.classList.toggle("text-white", on);
        b.classList.toggle("shadow-lg", on);
        b.classList.toggle("shadow-primary/10", on);
        b.classList.toggle("bg-surface-container-lowest", !on);
        b.classList.toggle("text-on-surface-variant", !on);
      });
      if (scaler) {
        if (mode === "zoom") {
          scaler.setAttribute("data-a11y-zoom", "1");
        } else {
          scaler.setAttribute("data-a11y-zoom", "0");
        }
      }
      if (host) {
        if (mode === "zoom") {
          host.setAttribute("data-a11y-sim", "standard");
        } else {
          host.setAttribute("data-a11y-sim", mode);
        }
      }
    }
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        var mode = b.getAttribute("data-a11y-sim") || "standard";
        setActive(mode);
      });
    });
    setActive("standard");
  }

  function renderA11yFromData(data, emailHtmlForNarration) {
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
      var parts = partitionA11yChecksByPass(data.checks || []);
      parts.rest.forEach(function (c) {
        var div = document.createElement("div");
        div.className = "bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/15 shadow-sm";
        div.innerHTML =
          '<div class="flex flex-wrap items-start justify-between gap-2 mb-2">' +
          '<h3 class="font-bold text-sm text-on-surface flex-1 min-w-0">' +
          esc(c.label) +
          "</h3>" +
          '<div class="flex flex-wrap items-center gap-2 shrink-0">' +
          a11yOutcomeBadgeHtml(c.status) +
          a11ySeverityBadgeHtml(c.severity) +
          "</div></div>" +
          '<p class="text-xs text-on-surface-variant mb-2 leading-relaxed">' +
          esc(c.details) +
          "</p>" +
          '<p class="text-xs text-on-surface"><strong>Fix:</strong> ' +
          esc(c.fix) +
          "</p>" +
          '<p class="text-[10px] text-slate-400 mt-2">' +
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
      if (parts.pass.length) {
        var sep = document.createElement("div");
        sep.className = "flex items-center gap-3 py-3 my-1";
        sep.innerHTML =
          '<div class="flex-1 h-px bg-outline-variant/25"></div>' +
          '<span class="text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">Passed</span>' +
          '<div class="flex-1 h-px bg-outline-variant/25"></div>';
        cards.appendChild(sep);
        parts.pass.forEach(function (c) {
          var div = document.createElement("div");
          div.className =
            "bg-slate-50 dark:bg-slate-900/25 p-5 rounded-xl border border-slate-200/60 dark:border-slate-700/50 shadow-none opacity-85";
          div.innerHTML =
            '<div class="flex flex-wrap items-start justify-between gap-2 mb-2">' +
            '<h3 class="font-bold text-sm text-slate-500 flex-1 min-w-0">' +
            esc(c.label) +
            "</h3>" +
            '<div class="flex flex-wrap items-center gap-2 shrink-0">' +
            a11yOutcomeBadgeHtml(c.status, true) +
            a11ySeverityBadgeHtml(c.severity, true) +
            "</div></div>" +
            '<p class="text-xs text-slate-400 mb-2 leading-relaxed">' +
            esc(c.details) +
            "</p>" +
            '<p class="text-xs text-slate-400"><strong class="text-slate-500">Fix:</strong> ' +
            esc(c.fix) +
            "</p>" +
            '<p class="text-[10px] text-slate-400/80 mt-2">' +
            esc(c.wcag_reference) +
            "</p>";
          cards.appendChild(div);
        });
      }
    }
    var narrHtml = emailHtmlForNarration != null ? emailHtmlForNarration : clarityA11yLastEmailHtml;
    clarityA11yNarratorSetSegmentsFromAudit(data, narrHtml);
    bindA11yNarratorControlsOnce();
    clarityA11yNarratorUpdateUi();
  }

  function initA11y() {
    if (initA11y._ran) return;
    initA11y._ran = true;
    if (typeof window.clarityHideManualWorkflowUI === "function") {
      try {
        window.clarityHideManualWorkflowUI();
      } catch (e) {}
    }
    hydrateDesignWorkflowBundleFromDesignId();
    seedDesignWorkflowBundleFromOpener();

    var htmlEl = document.getElementById("clarity-a11y-html");
    var btn = document.getElementById("clarity-run-a11y");
    var st = document.getElementById("clarity-a11y-status");
    var wf = typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive();

    bindA11ySimulationControlsOnce();
    bindA11yNarratorControlsOnce();
    clarityA11yNarratorUpdateUi();

    function syncHtmlSource() {
      var raw = (htmlEl && htmlEl.value) || "";
      var h =
        typeof window.clarityParseEmlOrHtml === "function" ? window.clarityParseEmlOrHtml(raw) : String(raw);
      clarityA11yLastEmailHtml = h;
      renderA11yEmailPreview(h);
      return h;
    }

    if (btn) {
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        if (st) st.textContent = "…";
        try {
          var html = syncHtmlSource();
          if (htmlEl) htmlEl.value = html;
          var data = await window.ClarityAPI.runAnalysis("accessibility", {
            emailHtml: html,
          });
          renderA11yFromData(data, html);
          if (st) st.textContent = "Done.";
        } catch (e) {
          if (st) st.textContent = e.message || String(e);
        } finally {
          btn.disabled = false;
        }
      });
    }

    if (htmlEl && !wf) {
      htmlEl.addEventListener("input", function () {
        syncHtmlSource();
      });
    }

    var bundle = wf && window.clarityReadWorkflowBundle && window.clarityReadWorkflowBundle();
    var a11yDone =
      bundle &&
      bundle.analysis &&
      bundle.analysis.accessibility &&
      bundle.analysis.accessibility.status === "done" &&
      bundle.analysis.accessibility.data;

    if (wf && a11yDone) {
      var disp =
        typeof window.clarityParseEmlOrHtml === "function"
          ? window.clarityParseEmlOrHtml(bundle.html || "")
          : String(bundle.html || "");
      if (htmlEl && bundle.html) htmlEl.value = disp;
      clarityA11yLastEmailHtml = disp;
      renderA11yEmailPreview(disp);
      renderA11yFromData(bundle.analysis.accessibility.data, disp);
      if (st) st.textContent = "Loaded from workspace.";
    } else if (wf && bundle && bundle.html) {
      var dispPartial =
        typeof window.clarityParseEmlOrHtml === "function"
          ? window.clarityParseEmlOrHtml(bundle.html)
          : String(bundle.html);
      if (htmlEl) htmlEl.value = dispPartial;
      clarityA11yLastEmailHtml = dispPartial;
      renderA11yEmailPreview(dispPartial);
      if (st) st.textContent = "Workspace HTML loaded. Run accessibility from the workspace or use Run accessibility audit when visible.";
    } else if (htmlEl) {
      syncHtmlSource();
    }
  }

  function renderHtmlAnalyzerFromData(data, rawHtml) {
    var before = document.getElementById("clarity-html-before");
    var after = document.getElementById("clarity-html-after");
    var root = document.getElementById("clarity-html-explanation-root");
    var sm = document.getElementById("clarity-html-marketer-summary");
    var html =
      typeof window.clarityParseEmlOrHtml === "function"
        ? window.clarityParseEmlOrHtml(rawHtml || "")
        : String(rawHtml || "");
    if (before) before.textContent = html;
    if (after) after.textContent = data.optimized_html || "";
    if (sm) sm.textContent = data.summary_for_marketer || "";
    if (root) {
      root.innerHTML = "";
      (data.improvements || []).forEach(function (im) {
        var card = document.createElement("article");
        card.className =
          "rounded-xl border border-outline-variant/20 bg-surface-container-low/40 dark:bg-slate-900/30 p-5";
        var head = document.createElement("div");
        head.className = "flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2";
        var h = document.createElement("h3");
        h.className = "headline text-base font-bold text-on-surface";
        h.textContent = im.title || "";
        head.appendChild(h);
        var meta = document.createElement("span");
        meta.className = "text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant";
        meta.textContent = [im.category, im.impact ? "impact: " + im.impact : ""]
          .filter(Boolean)
          .join(" · ");
        head.appendChild(meta);
        card.appendChild(head);
        var body = document.createElement("p");
        body.className = "text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-3";
        body.textContent = im.marketer_explanation || "";
        card.appendChild(body);
        if (im.technical_change) {
          var tc = document.createElement("p");
          tc.className = "text-xs text-on-surface-variant mb-2 leading-relaxed";
          tc.innerHTML = '<span class="font-semibold text-on-surface">Technical change</span> — ' + esc(im.technical_change);
          card.appendChild(tc);
        }
        if (im.before_snippet || im.after_snippet) {
          var grid = document.createElement("div");
          grid.className = "grid grid-cols-1 md:grid-cols-2 gap-3 mt-2";
          if (im.before_snippet) {
            var colBefore = document.createElement("div");
            var lb = document.createElement("p");
            lb.className = "text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1";
            lb.textContent = "Before";
            colBefore.appendChild(lb);
            var pre1 = document.createElement("pre");
            pre1.className =
              "code-font text-[11px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 p-3 rounded-lg overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap";
            pre1.textContent = im.before_snippet;
            colBefore.appendChild(pre1);
            grid.appendChild(colBefore);
          }
          if (im.after_snippet) {
            var colAfter = document.createElement("div");
            var la = document.createElement("p");
            la.className = "text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1";
            la.textContent = "After";
            colAfter.appendChild(la);
            var pre2 = document.createElement("pre");
            pre2.className =
              "code-font text-[11px] text-emerald-900 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-lg overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap";
            pre2.textContent = im.after_snippet;
            colAfter.appendChild(pre2);
            grid.appendChild(colAfter);
          }
          card.appendChild(grid);
        }
        root.appendChild(card);
      });
    }
  }

  /** Show original markup in the read-only pane before/without API results; clear optimized + explanations. */
  function syncHtmlAnalyzerPreAnalysis(rawHtml) {
    var before = document.getElementById("clarity-html-before");
    var after = document.getElementById("clarity-html-after");
    var root = document.getElementById("clarity-html-explanation-root");
    var sm = document.getElementById("clarity-html-marketer-summary");
    var html =
      typeof window.clarityParseEmlOrHtml === "function"
        ? window.clarityParseEmlOrHtml(rawHtml || "")
        : String(rawHtml || "");
    if (before) {
      before.textContent = html.trim()
        ? html
        : "No HTML yet. Paste markup in the field above, or save a design from the Clarity workspace and open HTML Check from there.";
    }
    if (after) {
      after.textContent =
        "Run the HTML analyzer to see optimized markup here.";
    }
    if (sm) sm.textContent = "";
    if (root) root.innerHTML = "";
  }

  function bindHtmlAnalyzerPaneToggles() {
    function wire(btnId, panelId, defaultExpanded) {
      var btn = document.getElementById(btnId);
      var panel = document.getElementById(panelId);
      if (!btn || !panel) return;
      var icon = btn.querySelector("[data-clarity-html-toggle-icon]");
      function apply(expanded) {
        btn.setAttribute("aria-expanded", expanded ? "true" : "false");
        panel.classList.toggle("hidden", !expanded);
        if (icon) icon.textContent = expanded ? "expand_less" : "expand_more";
      }
      apply(!!defaultExpanded);
      btn.addEventListener("click", function () {
        apply(btn.getAttribute("aria-expanded") !== "true");
      });
    }
    wire("clarity-html-toggle-before", "clarity-html-before-collapsible", false);
    wire("clarity-html-toggle-after", "clarity-html-after-collapsible", true);
  }

  function initHtmlAnalyzer() {
    if (initHtmlAnalyzer._ran) return;
    initHtmlAnalyzer._ran = true;
    if (typeof window.clarityHideManualWorkflowUI === "function") {
      try {
        window.clarityHideManualWorkflowUI();
      } catch (e) {}
    }
    hydrateDesignWorkflowBundleFromDesignId();
    seedDesignWorkflowBundleFromOpener();
    var inp = document.getElementById("clarity-html-input");
    var btn = document.getElementById("clarity-run-html");
    var st = document.getElementById("clarity-html-status");
    var wf = typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive();
    if (btn) {
    btn.addEventListener("click", async function () {
      btn.disabled = true;
      if (st) st.textContent = "…";
      try {
        var raw = (inp && inp.value) || "";
        var html =
          typeof window.clarityParseEmlOrHtml === "function"
            ? window.clarityParseEmlOrHtml(raw)
            : String(raw);
        if (inp) inp.value = html;
        var data = await window.ClarityAPI.runAnalysis("html", { emailHtml: html });
        renderHtmlAnalyzerFromData(data, html);
        if (st) st.textContent = "Done.";
      } catch (e) {
        if (st) st.textContent = e.message || String(e);
      } finally {
        btn.disabled = false;
      }
    });
    }

    var bundle = wf && window.clarityReadWorkflowBundle && window.clarityReadWorkflowBundle();
    var htmlDone =
      bundle &&
      bundle.analysis &&
      bundle.analysis.html &&
      bundle.analysis.html.status === "done" &&
      bundle.analysis.html.data;

    if (wf && htmlDone) {
      var dispDone =
        typeof window.clarityParseEmlOrHtml === "function"
          ? window.clarityParseEmlOrHtml(bundle.html || "")
          : String(bundle.html || "");
      if (inp && bundle.html) inp.value = dispDone;
      renderHtmlAnalyzerFromData(bundle.analysis.html.data, dispDone);
      if (st) st.textContent = "Loaded from workspace.";
    } else if (wf && bundle && bundle.html) {
      var dispPartial =
        typeof window.clarityParseEmlOrHtml === "function"
          ? window.clarityParseEmlOrHtml(bundle.html)
          : String(bundle.html);
      if (inp) inp.value = dispPartial;
      syncHtmlAnalyzerPreAnalysis(dispPartial);
      if (st) {
        st.textContent =
          "Original email HTML loaded from workspace. Open this page after the HTML analyzer step finishes, or run analysis from the workspace, to see optimized HTML and explanations.";
      }
    } else if (wf) {
      syncHtmlAnalyzerPreAnalysis("");
      if (st) {
        st.textContent =
          "No design HTML in this tab’s session. Open HTML Check from the Clarity workspace after saving a design, or use a link that includes your design id.";
      }
    } else if (inp) {
      syncHtmlAnalyzerPreAnalysis(inp.value);
      inp.addEventListener("input", function () {
        syncHtmlAnalyzerPreAnalysis(inp.value);
      });
    } else {
      syncHtmlAnalyzerPreAnalysis("");
    }

    bindHtmlAnalyzerPaneToggles();
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

  function bootStandaloneModulePages() {
    var pk = pageKey();
    if (pk === "spamtrigger_list") initSpamList();
    else if (pk === "spamtrigger_visual") initSpamVisual();
    else if (pk === "content_analysis") initDesign();
    else if (pk === "accessibilty") initA11y();
    else if (pk === "html_analyzer" || isHtmlAnalyzerDocument()) initHtmlAnalyzer();
    else if (pk === "multi-analysis") initMulti();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootStandaloneModulePages);
  } else {
    bootStandaloneModulePages();
  }
})();
