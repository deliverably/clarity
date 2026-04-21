(function () {
  var PAGE_SIZE = 10;

  var listState = {
    data: null,
    segment: "all",
    statusFilter: "all",
    pageIndex: 0,
    awaitingFetch: false,
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusBadge(status) {
    var ok = ["ok", "tracking_url"];
    var cls =
      ok.indexOf(status) >= 0
        ? "bg-tertiary-fixed text-on-tertiary-fixed-variant border border-tertiary/10"
        : status === "broken"
          ? "bg-error-container text-on-error-container border border-error/10"
          : "bg-secondary-fixed text-on-secondary-fixed-variant border border-secondary/10";
    return (
      '<span class="px-2.5 py-1 ' +
      cls +
      ' text-[10px] font-bold rounded-full">' +
      String(status).toUpperCase() +
      "</span>"
    );
  }

  function protocolIcon(url) {
    return String(url || "").toLowerCase().startsWith("https")
      ? '<span class="material-symbols-outlined text-primary text-sm" title="HTTPS">lock</span>'
      : '<span class="material-symbols-outlined text-slate-300 text-sm" title="Non-HTTPS">lock_open</span>';
  }

  function isAlertLink(l) {
    if (!l) return false;
    if (l.status === "broken" || l.status === "wrong_redirect" || l.status === "redirect_loop") return true;
    return l.risk_level === "medium" || l.risk_level === "high";
  }

  function passesStatusFilter(l, f) {
    if (!f || f === "all") return true;
    if (f === "active") return l.status === "ok" || l.status === "tracking_url";
    if (f === "broken") return l.status === "broken";
    if (f === "redirect") {
      return (
        l.status === "redirect_loop" ||
        l.status === "wrong_redirect" ||
        ((l.hops || 0) > 0 && l.status !== "broken")
      );
    }
    return true;
  }

  function segmentFilteredLinks(links) {
    if (listState.segment === "alerts") return links.filter(isAlertLink);
    if (listState.segment === "archived") return [];
    return links.slice();
  }

  function filteredLinks() {
    var links = (listState.data && listState.data.links) || [];
    var seg = segmentFilteredLinks(links);
    return seg.filter(function (l) {
      return passesStatusFilter(l, listState.statusFilter);
    });
  }

  function formatSigned(n, suffix) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    var v = Number(n);
    var sign = v > 0 ? "+" : v < 0 ? "" : "";
    return sign + String(v) + (suffix || "");
  }

  function parseDeltaNum(text) {
    var n = parseFloat(String(text).replace(/[^0-9.+-eE]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function setDeltaEl(el, text, mode) {
    if (!el) return;
    el.textContent = text;
    var base = "font-bold text-xs ";
    if (text === "—") {
      el.className = base + "text-on-surface-variant";
      return;
    }
    var v = parseDeltaNum(text);
    if (mode === "ok") {
      el.className = base + (v < 0 ? "text-error" : "text-on-tertiary-fixed-variant");
    } else if (mode === "broken") {
      el.className = base + (v > 0 ? "text-error" : "text-on-tertiary-fixed-variant");
    } else if (mode === "redirect") {
      el.className = base + (v > 0 ? "text-error" : "text-on-secondary-fixed-variant");
    } else {
      el.className = base + (v > 0 ? "text-error" : "text-on-primary-fixed-variant");
    }
  }

  function applyTrendDeltas(summary) {
    var t = summary && summary.trends_30d;
    var okEl = document.getElementById("clarity-metric-ok-delta");
    var brEl = document.getElementById("clarity-metric-broken-delta");
    var rdEl = document.getElementById("clarity-metric-redirects-delta");
    var latEl = document.getElementById("clarity-metric-latency-delta");
    if (!t || typeof t !== "object") {
      setDeltaEl(okEl, "—", "ok");
      setDeltaEl(brEl, "—", "broken");
      setDeltaEl(rdEl, "—", "redirect");
      setDeltaEl(latEl, "—", "latency");
      return;
    }
    var ok = t.ok_percent_delta;
    var br = t.broken_delta;
    var rd = t.redirects_delta;
    var ld = t.avg_latency_ms_delta;
    setDeltaEl(okEl, ok == null || !Number.isFinite(Number(ok)) ? "—" : formatSigned(ok, "%"), "ok");
    setDeltaEl(brEl, br == null || !Number.isFinite(Number(br)) ? "—" : formatSigned(br, ""), "broken");
    setDeltaEl(rdEl, rd == null || !Number.isFinite(Number(rd)) ? "—" : formatSigned(rd, ""), "redirect");
    setDeltaEl(latEl, ld == null || !Number.isFinite(Number(ld)) ? "—" : formatSigned(ld, "ms"), "latency");
  }

  function meanLatencyMs(links) {
    var nums = (links || [])
      .map(function (l) {
        return l.latency_ms;
      })
      .filter(function (n) {
        return typeof n === "number" && n >= 0;
      });
    if (!nums.length) return null;
    return Math.round(nums.reduce(function (a, b) {
      return a + b;
    }, 0) / nums.length);
  }

  function paintLatencyHistogram(links) {
    var chart = document.getElementById("clarity-links-latency-chart");
    var sub = document.getElementById("clarity-links-latency-subtitle");
    if (sub) {
      sub.textContent =
        "Latency spread for the filtered link set in this email (check round-trips, ms).";
    }
    if (!chart) return;
    if (listState.data == null) {
      chart.className =
        "h-64 flex items-center justify-center gap-2 px-4 pt-8 pb-2 text-xs text-on-surface-variant";
      chart.innerHTML =
        "<span>Run analysis to plot latency. In workspace mode, results load automatically when HTML and the API are available.</span>";
      return;
    }
    chart.innerHTML = "";
    var latencies = (links || [])
      .map(function (l) {
        return l.latency_ms;
      })
      .filter(function (n) {
        return typeof n === "number" && n >= 0;
      });
    if (!latencies.length) {
      chart.className =
        "h-64 flex items-center justify-center gap-2 px-4 pt-8 pb-2 text-xs text-on-surface-variant";
      chart.innerHTML = "<span>No latency samples for the current filters.</span>";
      return;
    }
    var min = Math.min.apply(null, latencies);
    var max = Math.max.apply(null, latencies);
    var bins = 6;
    var edges = [];
    var i;
    if (max <= min) {
      edges = [min, min + 1];
    } else {
      for (i = 0; i <= bins; i++) {
        edges.push(min + ((max - min) * i) / bins);
      }
    }
    var counts = new Array(edges.length - 1).fill(0);
    latencies.forEach(function (ms) {
      var idx = counts.length - 1;
      for (i = 0; i < edges.length - 1; i++) {
        var lo = edges[i];
        var hi = edges[i + 1];
        var last = i === edges.length - 2;
        if ((last && ms >= lo && ms <= hi) || (!last && ms >= lo && ms < hi)) {
          idx = i;
          break;
        }
      }
      counts[idx] += 1;
    });
    var peak = Math.max.apply(null, counts.concat([1]));
    chart.className = "h-64 flex items-end justify-between gap-2 px-4 pt-8 pb-2";
    for (i = 0; i < counts.length; i++) {
      var hPct = Math.round((counts[i] / peak) * 100);
      var lo = Math.round(edges[i]);
      var hi = Math.round(edges[i + 1]);
      var col = document.createElement("div");
      col.className = "flex-1 flex flex-col items-center justify-end gap-1 min-w-0";
      var bar = document.createElement("div");
      bar.className = "w-full bg-primary rounded-t-md transition-all";
      bar.style.height = Math.max(8, hPct) + "%";
      bar.title = lo + "–" + hi + " ms · " + counts[i] + " links";
      var lab = document.createElement("span");
      lab.className = "text-[9px] text-on-surface-variant font-medium truncate max-w-full";
      lab.textContent = lo + "–" + hi;
      col.appendChild(bar);
      col.appendChild(lab);
      chart.appendChild(col);
    }
  }

  function buildHeuristicInsight(summary, links) {
    var total = (summary && summary.total) || links.length || 0;
    if (!total) {
      return {
        title: "No links to analyze",
        body: "This email HTML did not contain any extractable links. Add anchors or run analysis again after updating the design.",
      };
    }
    var broken = links.filter(function (l) {
      return l.status === "broken";
    }).length;
    var httpOnly = links.filter(function (l) {
      return l.status === "http_only";
    }).length;
    var wrongR = links.filter(function (l) {
      return l.status === "wrong_redirect";
    }).length;
    var loop = links.filter(function (l) {
      return l.status === "redirect_loop";
    }).length;
    var deepHop = links.filter(function (l) {
      return (l.hops || 0) > 2 && l.status !== "broken";
    }).length;
    var avg = summary && summary.avg_latency_ms != null ? summary.avg_latency_ms : meanLatencyMs(links);

    if (broken > 0) {
      return {
        title: broken + " broken link" + (broken === 1 ? "" : "s") + " need attention",
        body:
          "Subscribers hitting dead ends erodes trust and conversions. Fix or remove broken destinations first, then re-run link analysis to confirm clean health.",
      };
    }
    if (wrongR > 0 || loop > 0) {
      return {
        title: "Redirect integrity issues detected",
        body:
          (wrongR + loop) +
          " link(s) land on unexpected hosts or exceed safe redirect depth. Align final URLs with your brand host and shorten chains where possible.",
      };
    }
    if (deepHop > 0) {
      return {
        title: "Long redirect chains add latency",
        body:
          deepHop +
          " link(s) take more than two hops before the final response. Flattening redirects can improve perceived speed" +
          (avg != null ? " (current average check latency about " + avg + " ms)." : "."),
      };
    }
    if (httpOnly > 0) {
      return {
        title: "Mixed security: HTTP-only links",
        body:
          httpOnly +
          " link(s) still use http://. Upgrading to https:// where supported reduces filter false positives and protects subscribers in transit.",
      };
    }
    var top = (summary && summary.top_issues && summary.top_issues[0]) || "";
    if (top) {
      return {
        title: "Most common non-OK pattern: " + top.replace(/_/g, " "),
        body:
          "Most links resolve, but recurring " +
          String(top).replace(/_/g, " ") +
          " issues are worth monitoring across campaigns.",
      };
    }
    return {
      title: "Link health looks solid",
      body:
        "No critical failures were detected in this pass. Keep monitoring tracking wrappers and latency as content changes" +
        (avg != null ? " (average check latency about " + avg + " ms)." : "."),
    };
  }

  function paintInsight(summary, links) {
    var titleEl = document.getElementById("clarity-links-insight-title");
    var bodyEl = document.getElementById("clarity-links-insight-body");
    var ins = buildHeuristicInsight(summary, links);
    if (titleEl) titleEl.textContent = ins.title;
    if (bodyEl) bodyEl.textContent = ins.body;
  }

  function updateSegmentStyles() {
    var allB = document.getElementById("clarity-links-filter-all");
    var alB = document.getElementById("clarity-links-filter-alerts");
    var arB = document.getElementById("clarity-links-filter-archived");
    var active =
      "px-3 py-1.5 text-xs font-bold bg-white text-primary rounded-md shadow-sm";
    var idle =
      "px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-white/50 rounded-md transition-colors";
    if (allB) allB.className = "clarity-links-seg " + (listState.segment === "all" ? active : idle);
    if (alB) alB.className = "clarity-links-seg " + (listState.segment === "alerts" ? active : idle);
    if (arB) arB.className = "clarity-links-seg " + (listState.segment === "archived" ? active : idle);
  }

  function paintLinksTablePage(statusEl) {
    var tbody = document.getElementById("clarity-links-tbody");
    var pageInfo = document.getElementById("clarity-links-page-info");
    var pager = document.getElementById("clarity-links-pager");
    var pagerPages = document.getElementById("clarity-links-pager-pages");
    var pagerPrev = document.getElementById("clarity-links-pager-prev");
    var pagerNext = document.getElementById("clarity-links-pager-next");
    if (!tbody) return;

    if (listState.data == null) {
      tbody.innerHTML = "";
      var hint = document.createElement("tr");
      var msg = listState.awaitingFetch
        ? "Fetching link results for your workspace HTML…"
        : typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive()
          ? "No link results loaded yet. Confirm the design has saved HTML, the API is running at CLARITY_API_BASE, and try refreshing."
          : "No results yet. Use Bulk Analyze (above) to call the link API with your email HTML, or open this page from the Clarity workspace with ?workflow=1.";
      hint.innerHTML =
        '<td colspan="7" class="px-6 py-8 text-center text-sm text-on-surface-variant">' + esc(msg) + "</td>";
      tbody.appendChild(hint);
      if (pageInfo) pageInfo.textContent = "No results";
      if (pager) {
        pager.classList.add("hidden");
        pager.classList.remove("flex");
      }
      return;
    }

    var rows = filteredLinks();
    var total = rows.length;
    var pageSize = PAGE_SIZE;
    var pageCount = total === 0 ? 1 : Math.ceil(total / pageSize);
    if (listState.pageIndex >= pageCount) listState.pageIndex = Math.max(0, pageCount - 1);
    var start = listState.pageIndex * pageSize;
    var slice = rows.slice(start, start + pageSize);

    tbody.innerHTML = "";

    if (total === 0) {
      var empty = document.createElement("tr");
      var msg =
        listState.segment === "archived"
          ? "No archived links yet. Archiving will be available when designs support it."
          : "No links match the current filters.";
      empty.innerHTML =
        '<td colspan="7" class="px-6 py-8 text-center text-sm text-on-surface-variant">' + esc(msg) + "</td>";
      tbody.appendChild(empty);
    } else {
      slice.forEach(function (l) {
        var tr = document.createElement("tr");
        tr.className = "hover:bg-surface-container-low/40 transition-colors group";
        var path = "";
        try {
          var u = new URL(l.url);
          path = u.pathname + u.search;
        } catch (e) {
          path = l.url;
        }
        var latStr =
          typeof l.latency_ms === "number" && l.latency_ms >= 0 ? String(Math.round(l.latency_ms)) + "ms" : "—";
        tr.innerHTML =
          '<td class="px-6 py-5"><input type="checkbox" class="rounded-sm border-slate-300 text-primary focus:ring-primary/20" /></td>' +
          '<td class="px-6 py-5"><div class="flex flex-col">' +
          '<span class="text-sm font-semibold text-on-surface truncate max-w-[280px]">' +
          esc(l.anchor_text || path || "Link") +
          "</span>" +
          '<span class="text-[10px] text-slate-400 font-medium truncate max-w-[320px]">' +
          esc(l.url) +
          "</span>" +
          (l.location
            ? '<span class="text-[10px] text-indigo-500 font-medium">' + esc(l.location) + "</span>"
            : "") +
          "</div></td>" +
          '<td class="px-6 py-5 text-center">' +
          statusBadge(l.status) +
          '<div class="text-[10px] text-on-surface-variant mt-1">' +
          esc(l.status_note || "") +
          "</div></td>" +
          '<td class="px-6 py-5"><span class="text-xs text-on-surface-variant font-medium">now</span></td>' +
          '<td class="px-6 py-5 text-right"><span class="text-xs font-bold text-on-surface">' +
          esc(latStr) +
          "</span></td>" +
          '<td class="px-6 py-5 text-center">' +
          protocolIcon(l.url) +
          "</td>" +
          '<td class="px-6 py-5"><span class="text-[10px] text-on-surface-variant">Risk: ' +
          esc(l.risk_level || "") +
          (l.hops != null ? " · hops: " + String(l.hops) : "") +
          "</span></td>";
        tbody.appendChild(tr);
      });
    }

    if (pageInfo) {
      if (total === 0) pageInfo.textContent = "No results";
      else if (total <= pageSize) pageInfo.textContent = "Showing all " + total + " results";
      else
        pageInfo.textContent =
          "Showing " + (start + 1) + "–" + (start + slice.length) + " of " + total + " results";
    }

    if (pager) {
      if (total === 0 || total <= pageSize) {
        pager.classList.add("hidden");
        pager.classList.remove("flex");
      } else {
        pager.classList.remove("hidden");
        pager.classList.add("flex");
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
                "w-8 h-8 flex items-center justify-center text-xs font-bold rounded-md transition-colors " +
                (listState.pageIndex === pageIdx
                  ? "bg-primary-container text-white"
                  : "text-on-surface-variant hover:bg-surface-container-high");
              btn.addEventListener("click", function () {
                listState.pageIndex = pageIdx;
                paintLinksTablePage(statusEl);
              });
              pagerPages.appendChild(btn);
            })(p);
          }
        }
      }
    }
  }

  function renderLinksFromData(data, statusEl) {
    listState.awaitingFetch = false;
    listState.data = data;
    listState.pageIndex = 0;

    var s = data.summary || {};
    var links = data.links || [];

    var okPct = document.getElementById("clarity-metric-ok-pct");
    if (okPct) okPct.innerHTML = String(s.ok_percent ?? 0) + '<span class="text-xl">%</span>';

    var brokenN = links.filter(function (l) {
      return l.status === "broken";
    }).length;
    var broken = document.getElementById("clarity-metric-broken");
    if (broken) broken.textContent = String(brokenN);

    var redirN = links.filter(function (l) {
      return (l.hops || 0) > 0 && l.status !== "broken";
    }).length;
    var redir = document.getElementById("clarity-metric-redirects");
    if (redir) redir.textContent = String(redirN);

    var avg =
      s.avg_latency_ms != null && Number.isFinite(Number(s.avg_latency_ms))
        ? Math.round(Number(s.avg_latency_ms))
        : meanLatencyMs(links);
    var lat = document.getElementById("clarity-metric-latency");
    if (lat) {
      if (avg == null) lat.innerHTML = '—<span class="text-xl">ms</span>';
      else lat.innerHTML = String(avg) + '<span class="text-xl">ms</span>';
    }

    applyTrendDeltas(s);
    updateSegmentStyles();
    paintLinksTablePage(statusEl);
    paintLatencyHistogram(filteredLinks());
    paintInsight(s, links);

    if (statusEl) statusEl.textContent = "Done. " + (s.total || 0) + " links.";
  }

  function bindFilters(statusEl) {
    function seg(s) {
      listState.segment = s;
      listState.pageIndex = 0;
      updateSegmentStyles();
      paintLinksTablePage(statusEl);
      paintLatencyHistogram(filteredLinks());
      var s0 = listState.data && listState.data.summary;
      paintInsight(s0 || {}, (listState.data && listState.data.links) || []);
    }
    var allB = document.getElementById("clarity-links-filter-all");
    var alB = document.getElementById("clarity-links-filter-alerts");
    var arB = document.getElementById("clarity-links-filter-archived");
    if (allB && !allB._clarityBound) {
      allB._clarityBound = true;
      allB.addEventListener("click", function () {
        seg("all");
      });
    }
    if (alB && !alB._clarityBound) {
      alB._clarityBound = true;
      alB.addEventListener("click", function () {
        seg("alerts");
      });
    }
    if (arB && !arB._clarityBound) {
      arB._clarityBound = true;
      arB.addEventListener("click", function () {
        seg("archived");
      });
    }
    var sel = document.getElementById("clarity-links-status-filter");
    if (sel && !sel._clarityBound) {
      sel._clarityBound = true;
      sel.addEventListener("change", function () {
        listState.statusFilter = sel.value || "all";
        listState.pageIndex = 0;
        paintLinksTablePage(statusEl);
        paintLatencyHistogram(filteredLinks());
        var s0 = listState.data && listState.data.summary;
        paintInsight(s0 || {}, (listState.data && listState.data.links) || []);
      });
    }
    var pagerPrev = document.getElementById("clarity-links-pager-prev");
    var pagerNext = document.getElementById("clarity-links-pager-next");
    if (pagerPrev && !pagerPrev._clarityBound) {
      pagerPrev._clarityBound = true;
      pagerPrev.addEventListener("click", function () {
        if (listState.pageIndex > 0) {
          listState.pageIndex -= 1;
          paintLinksTablePage(statusEl);
        }
      });
    }
    if (pagerNext && !pagerNext._clarityBound) {
      pagerNext._clarityBound = true;
      pagerNext.addEventListener("click", function () {
        var rows = filteredLinks();
        var pageCount = Math.ceil(rows.length / PAGE_SIZE);
        if (listState.pageIndex < pageCount - 1) {
          listState.pageIndex += 1;
          paintLinksTablePage(statusEl);
        }
      });
    }
  }

  function persistLinksResult(data) {
    if (typeof window.clarityWorkflowActive !== "function" || !window.clarityWorkflowActive()) return;
    var bundle =
      typeof window.clarityReadWorkflowBundle === "function" ? window.clarityReadWorkflowBundle() : null;
    if (!bundle) return;
    if (!bundle.analysis) bundle.analysis = {};
    bundle.analysis.links = { status: "done", data: data, error: null };
    if (typeof window.clarityWriteWorkflowBundle === "function") window.clarityWriteWorkflowBundle(bundle);
    if (bundle.designId && typeof window.clarityPatchDesignById === "function") {
      window.clarityPatchDesignById(bundle.designId, { analysis: bundle.analysis });
    }
  }

  async function runLinksAnalysis() {
    ensureStandaloneDemoHtml();
    var htmlEl = document.getElementById("clarity-link-email-html");
    var hostEl = document.getElementById("clarity-link-expected-host");
    var baseEl = document.getElementById("clarity-link-base-url");
    var statusEl = document.getElementById("clarity-links-status");
    if (statusEl) statusEl.textContent = "Checking links…";
    var payload = { emailHtml: (htmlEl && htmlEl.value) || "" };
    var h = hostEl && hostEl.value.trim();
    if (h) payload.expectedHost = h;
    var b = baseEl && baseEl.value.trim();
    if (b) payload.baseUrl = b;
    var data = await window.ClarityAPI.runAnalysis("links", payload);
    persistLinksResult(data);
    renderLinksFromData(data, statusEl);
  }

  function tryWorkflowHydrate() {
    if (typeof window.clarityWorkflowActive !== "function" || !window.clarityWorkflowActive()) return;
    var bundle = typeof window.clarityReadWorkflowBundle === "function" ? window.clarityReadWorkflowBundle() : null;
    if (!bundle || !bundle.analysis || !bundle.analysis.links) return;
    var st = bundle.analysis.links;
    if (st.status !== "done" || !st.data) return;
    var htmlEl = document.getElementById("clarity-link-email-html");
    if (htmlEl && bundle.html) htmlEl.value = bundle.html;
    var statusEl = document.getElementById("clarity-links-status");
    bindFilters(statusEl);
    renderLinksFromData(st.data, statusEl);
    if (statusEl) statusEl.textContent = "Loaded from workspace. " + ((st.data.summary || {}).total || 0) + " links.";
  }

  function hydrateWorkflowBundleFromDesignId() {
    try {
      var p = new URLSearchParams(String(window.location && window.location.search) || "");
      if (p.get("workflow") !== "1") return;
      var id = p.get("designId");
      if (!id || typeof window.clarityHydrateSessionFromDesignId !== "function") return;
      window.clarityHydrateSessionFromDesignId(id);
    } catch (e) {
      console.warn("links-page: hydrate", e);
    }
  }

  function paintInsightPlaceholder() {
    var titleEl = document.getElementById("clarity-links-insight-title");
    var bodyEl = document.getElementById("clarity-links-insight-body");
    if (titleEl) titleEl.textContent = "Waiting for link data";
    if (bodyEl) {
      bodyEl.textContent =
        typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive()
          ? "Workspace mode loads your design from storage, then runs link analysis if results are not already saved."
          : "Run Bulk Analyze to generate an insight from your email’s links, or open this page from the Clarity workspace.";
    }
  }

  async function ensureLinksDataOrPlaceholder() {
    if (listState.data) return;
    var wf = typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive();
    var bundle = typeof window.clarityReadWorkflowBundle === "function" ? window.clarityReadWorkflowBundle() : null;
    var html = bundle && bundle.html ? String(bundle.html) : "";
    var htmlEl = document.getElementById("clarity-link-email-html");
    if (htmlEl && html) htmlEl.value = html;
    var statusEl = document.getElementById("clarity-links-status");

    if (wf && html && window.ClarityAPI && typeof window.ClarityAPI.runAnalysis === "function") {
      if (statusEl) statusEl.textContent = "Checking links…";
      try {
        var payload = { emailHtml: html };
        var h = document.getElementById("clarity-link-expected-host");
        var b = document.getElementById("clarity-link-base-url");
        if (h && h.value.trim()) payload.expectedHost = h.value.trim();
        if (b && b.value.trim()) payload.baseUrl = b.value.trim();
        var data = await window.ClarityAPI.runAnalysis("links", payload);
        persistLinksResult(data);
        renderLinksFromData(data, statusEl);
        if (statusEl) statusEl.textContent = "Done. " + ((data.summary || {}).total || 0) + " links.";
        return;
      } catch (e) {
        listState.awaitingFetch = false;
        if (statusEl) statusEl.textContent = "Could not analyze links: " + (e.message || String(e));
        console.error(e);
        paintInsightPlaceholder();
        paintLatencyHistogram([]);
        paintLinksTablePage(statusEl);
      }
    } else if (wf && !html && statusEl) {
      statusEl.textContent = "No HTML on this workspace session. Open the design from the studio (saved HTML) and try again.";
    }

    paintInsightPlaceholder();
    paintLatencyHistogram([]);
    paintLinksTablePage(statusEl);
  }

  function ensureStandaloneDemoHtml() {
    var wf = typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive();
    if (wf) return;
    var el = document.getElementById("clarity-link-email-html");
    if (!el || String(el.value || "").trim()) return;
    el.value =
      '<html><body><a href="https://example.com">Example</a> <a href="http://example.org/insecure">HTTP</a></body></html>';
  }

  function bindRunButton(btn) {
    if (!btn || btn._clarityRunBound) return;
    btn._clarityRunBound = true;
    btn.addEventListener("click", async function () {
      btn.disabled = true;
      try {
        await runLinksAnalysis();
      } catch (e) {
        var se = document.getElementById("clarity-links-status");
        if (se) se.textContent = e.message || String(e);
        console.error(e);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function fallbackBootPaint(err) {
    listState.data = null;
    listState.awaitingFetch = false;
    var statusEl = document.getElementById("clarity-links-status");
    if (statusEl) {
      statusEl.textContent =
        "Could not initialize link dashboard" +
        (err && err.message ? ": " + err.message : err ? ": " + String(err) : ".");
    }
    try {
      paintInsightPlaceholder();
    } catch (e2) {}
    try {
      paintLatencyHistogram([]);
    } catch (e3) {}
    try {
      paintLinksTablePage(statusEl);
    } catch (e4) {}
  }

  function bootLinksPage() {
    if (bootLinksPage._done) return;
    var statusEl = document.getElementById("clarity-links-status");
    try {
      hydrateWorkflowBundleFromDesignId();

      var runBtn = document.getElementById("clarity-run-links");
      var runToolbar = document.getElementById("clarity-run-links-toolbar");
      var runWorkflow = document.getElementById("clarity-run-links-workflow");

      var wfUi = typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive();
      if (runWorkflow && wfUi) {
        runWorkflow.classList.remove("hidden");
        runWorkflow.classList.add("inline-flex");
      }

      bindFilters(statusEl);
      bindRunButton(runBtn);
      bindRunButton(runToolbar);
      bindRunButton(runWorkflow);

      try {
        tryWorkflowHydrate();
      } catch (e) {
        console.error("links-page: tryWorkflowHydrate", e);
      }

      if (!listState.data) {
        var wf0 = typeof window.clarityWorkflowActive === "function" && window.clarityWorkflowActive();
        var b0 = typeof window.clarityReadWorkflowBundle === "function" ? window.clarityReadWorkflowBundle() : null;
        ensureStandaloneDemoHtml();
        listState.awaitingFetch = !!(wf0 && b0 && b0.html);
        if (wf0 && b0 && b0.html && statusEl) statusEl.textContent = "Checking links…";
        paintInsightPlaceholder();
        paintLatencyHistogram([]);
        paintLinksTablePage(statusEl);

        if (wf0) {
          void ensureLinksDataOrPlaceholder();
        } else if (window.ClarityAPI && typeof window.ClarityAPI.runAnalysis === "function") {
          void runLinksAnalysis().catch(function (err) {
            listState.awaitingFetch = false;
            console.error(err);
            var se = document.getElementById("clarity-links-status");
            if (se) {
              se.textContent =
                "Could not reach API at " +
                (window.CLARITY_API_BASE || "http://localhost:3000") +
                ". Start clarity-api (npm run dev) and use http://localhost to serve this UI (not file://). " +
                (err && err.message ? err.message : String(err));
            }
            paintInsightPlaceholder();
            paintLatencyHistogram([]);
            paintLinksTablePage(se);
          });
        }
      }
    } catch (e) {
      console.error("links-page: boot", e);
      fallbackBootPaint(e);
    } finally {
      bootLinksPage._done = true;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootLinksPage);
  } else {
    bootLinksPage();
  }

  window.__clarityLinksPageLoaded = true;

  window.addEventListener("load", function () {
    try {
      if (window.__clarityLinksPageLoaded) return;
      var tb = document.getElementById("clarity-links-tbody");
      var st = document.getElementById("clarity-links-status");
      if (st) {
        st.textContent =
          "links-page.js did not run. Serve the UI over HTTP (e.g. npx serve) so js/links-page.js loads; opening HTML as file:// often breaks script paths.";
      }
      if (tb) {
        tb.innerHTML =
          '<tr><td colspan="7" class="px-6 py-8 text-center text-sm text-error">' +
          "Failed to load js/links-page.js. Check Network for 404 or blocked requests." +
          "</td></tr>";
      }
    } catch (e) {}
  });
})();
