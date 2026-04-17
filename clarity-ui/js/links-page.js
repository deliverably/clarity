(function () {
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

  function renderLinksFromData(data, statusEl) {
    var s = data.summary || {};
    var okPct = document.getElementById("clarity-metric-ok-pct");
    if (okPct) okPct.innerHTML = String(s.ok_percent ?? 0) + '<span class="text-xl">%</span>';
    var broken = document.getElementById("clarity-metric-broken");
    var links = data.links || [];
    var brokenN = links.filter(function (l) {
      return l.status === "broken";
    }).length;
    if (broken) broken.textContent = String(brokenN).padStart(2, "0");
    var redir = document.getElementById("clarity-metric-redirects");
    var redirN = links.filter(function (l) {
      return l.hops > 0 && l.status !== "broken";
    }).length;
    if (redir) redir.textContent = String(redirN);
    var lat = document.getElementById("clarity-metric-latency");
    if (lat) lat.innerHTML = '—<span class="text-xl">ms</span>';

    var tbody = document.getElementById("clarity-links-tbody");
    if (tbody) {
      tbody.innerHTML = "";
      links.forEach(function (l) {
        var tr = document.createElement("tr");
        tr.className = "hover:bg-surface-container-low/40 transition-colors group";
        var path = "";
        try {
          var u = new URL(l.url);
          path = u.pathname + u.search;
        } catch (e) {
          path = l.url;
        }
        void path;
        tr.innerHTML =
          '<td class="px-6 py-5"><input type="checkbox" class="rounded-sm border-slate-300 text-primary focus:ring-primary/20" /></td>' +
          '<td class="px-6 py-5"><div class="flex flex-col">' +
          '<span class="text-sm font-semibold text-on-surface truncate max-w-[280px]">' +
          String(l.anchor_text || "").replace(/</g, "&lt;") +
          "</span>" +
          '<span class="text-[10px] text-slate-400 font-medium truncate max-w-[320px]">' +
          String(l.url).replace(/</g, "&lt;") +
          "</span>" +
          '<span class="text-[10px] text-indigo-500 font-medium">' +
          String(l.location || "").replace(/</g, "&lt;") +
          "</span></div></td>" +
          '<td class="px-6 py-5 text-center">' +
          statusBadge(l.status) +
          '<div class="text-[10px] text-on-surface-variant mt-1">' +
          String(l.status_note || "").replace(/</g, "&lt;") +
          "</div></td>" +
          '<td class="px-6 py-5"><span class="text-xs text-on-surface-variant font-medium">now</span></td>' +
          '<td class="px-6 py-5 text-right"><span class="text-xs font-bold text-on-surface">—</span></td>' +
          '<td class="px-6 py-5 text-center">' +
          protocolIcon(l.url) +
          "</td>" +
          '<td class="px-6 py-5"><span class="text-[10px] text-on-surface-variant">Risk: ' +
          String(l.risk_level || "") +
          (l.hops != null ? " · hops: " + String(l.hops) : "") +
          "</span></td>";
        tbody.appendChild(tr);
      });
    }
    if (statusEl) statusEl.textContent = "Done. " + (s.total || 0) + " links.";
  }

  async function runLinksAnalysis() {
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
    renderLinksFromData(st.data, document.getElementById("clarity-links-status"));
    var se = document.getElementById("clarity-links-status");
    if (se) se.textContent = "Loaded from workspace. " + ((st.data.summary || {}).total || 0) + " links.";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var runBtn = document.getElementById("clarity-run-links");
    var runToolbar = document.getElementById("clarity-run-links-toolbar");
    function bind(btn) {
      if (!btn) return;
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        try {
          await runLinksAnalysis();
        } catch (e) {
          var statusEl = document.getElementById("clarity-links-status");
          if (statusEl) statusEl.textContent = e.message || String(e);
          console.error(e);
        } finally {
          btn.disabled = false;
        }
      });
    }
    bind(runBtn);
    bind(runToolbar);
    tryWorkflowHydrate();
  });
})();
