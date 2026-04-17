/** Shared by `index.html` workflow and standalone module pages (?workflow=1). */
(function (global) {
  global.CLARITY_WORKFLOW_BUNDLE_KEY = "clarityWorkflowBundle";

  global.clarityReadWorkflowBundle = function () {
    try {
      return JSON.parse(sessionStorage.getItem(global.CLARITY_WORKFLOW_BUNDLE_KEY) || "null");
    } catch (e) {
      return null;
    }
  };

  global.clarityWorkflowActive = function () {
    return /(?:^|[?&])workflow=1(?:&|$)/.test(String(global.location && global.location.search) || "");
  };

  /** Persist bundle for embedded module pages (?workflow=1). Returns false on quota / serialization errors. */
  global.clarityWriteWorkflowBundle = function (payload) {
    try {
      sessionStorage.setItem(global.CLARITY_WORKFLOW_BUNDLE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn("clarityWriteWorkflowBundle", e);
      return false;
    }
  };

  /** Hide paste/run sections on module pages when opened from the workspace (?workflow=1). */
  global.clarityHideManualWorkflowUI = function () {
    if (!global.clarityWorkflowActive || !global.clarityWorkflowActive()) return;
    try {
      document.documentElement.classList.add("clarity-workflow-mode");
    } catch (e) {}
    document.querySelectorAll("[data-clarity-manual-only]").forEach(function (el) {
      el.classList.add("hidden");
    });
  };

  document.addEventListener("DOMContentLoaded", function () {
    global.clarityHideManualWorkflowUI();
  });
})(typeof window !== "undefined" ? window : globalThis);
