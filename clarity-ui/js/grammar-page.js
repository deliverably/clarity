(function () {
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

  function renderIssues(issues, emailEl) {
    var root = document.getElementById("clarity-issues-root");
    if (!root) return;
    root.innerHTML = "";
    if (!issues || !issues.length) {
      root.innerHTML =
        '<div class="px-6 py-10 text-center text-on-surface-variant text-sm">No issues found.</div>';
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
        applyFilter();
      });
      row.querySelector(".clarity-ignore").addEventListener("click", function () {
        window.__clarityGrammarState.allIssues = window.__clarityGrammarState.allIssues.filter(function (x) {
          return x.id !== issue.id;
        });
        applyFilter();
      });
      root.appendChild(row);
    });
  }

  function applyFilter() {
    var emailEl = document.getElementById("clarity-email-content");
    var sel = document.getElementById("clarity-issue-type-filter");
    var v = sel ? sel.value : "all";
    var list = window.__clarityGrammarState.allIssues || [];
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
    renderIssues(list, emailEl);
  }

  window.__clarityGrammarState = { allIssues: [] };

  function applyGrammarFromData(data, emailContent) {
    var emailEl = document.getElementById("clarity-email-content");
    var statusEl = document.getElementById("clarity-grammar-status");
    if (emailEl && emailContent != null) emailEl.value = emailContent;
    var tone = (data.tone && data.tone[0]) || {};
    var labelEl = document.getElementById("clarity-tone-label");
    var expEl = document.getElementById("clarity-tone-explanation");
    if (labelEl) labelEl.textContent = tone.label || "—";
    if (expEl) expEl.textContent = tone.explanation || "";
    window.__clarityGrammarState.allIssues = data.issues || [];
    applyFilter();
    var foot = document.getElementById("clarity-issues-footer");
    if (foot) {
      var n = window.__clarityGrammarState.allIssues.length;
      foot.textContent = "Showing " + String(n) + " identified improvement" + (n === 1 ? "" : "s");
    }
    if (statusEl) statusEl.textContent = "Loaded from workspace.";
  }

  function tryWorkflowHydrate() {
    if (typeof window.clarityWorkflowActive !== "function" || !window.clarityWorkflowActive()) return;
    var bundle = typeof window.clarityReadWorkflowBundle === "function" ? window.clarityReadWorkflowBundle() : null;
    if (!bundle || !bundle.analysis || !bundle.analysis.grammar) return;
    var st = bundle.analysis.grammar;
    if (st.status !== "done" || !st.data) return;
    applyGrammarFromData(st.data, bundle.plainText != null ? bundle.plainText : bundle.html);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var emailEl = document.getElementById("clarity-email-content");
    var runBtn = document.getElementById("clarity-run-grammar");
    var statusEl = document.getElementById("clarity-grammar-status");

    var filter = document.getElementById("clarity-issue-type-filter");
    if (filter) {
      filter.addEventListener("change", function () {
        applyFilter();
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
        var foot = document.getElementById("clarity-issues-footer");
        if (foot) foot.textContent = "No issues remaining.";
      });
    }

    if (runBtn && emailEl) {
      runBtn.addEventListener("click", async function () {
        runBtn.disabled = true;
        if (statusEl) statusEl.textContent = "Analyzing…";
        try {
          var data = await window.ClarityAPI.runAnalysis("grammar", {
            emailContent: emailEl.value || "",
          });
          applyGrammarFromData(data, null);
          if (statusEl) statusEl.textContent = "Done.";
        } catch (e) {
          if (statusEl) statusEl.textContent = e.message || String(e);
          console.error(e);
        } finally {
          runBtn.disabled = false;
        }
      });
    }

    tryWorkflowHydrate();
  });
})();
