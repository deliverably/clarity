/** Shared by `index.html` workflow and standalone module pages (?workflow=1). */
(function (global) {
  global.CLARITY_WORKFLOW_BUNDLE_KEY = "clarityWorkflowBundle";
  global.CLARITY_DESIGNS_STORAGE_KEY = "clarity-workflow-designs-v1";

  /**
   * If raw content looks like EML (or MIME) with an embedded document, extract the first
   * `<html>...</html>` block; otherwise return the string unchanged.
   * Used by the workspace upload flow and the HTML analyzer manual input.
   */
  global.clarityParseEmlOrHtml = function (raw) {
    var s = String(raw || "");
    var htmlBlock = s.match(/<\s*html[\s\S]*<\/\s*html\s*>/i);
    if (htmlBlock) return htmlBlock[0];
    return s;
  };

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

  /**
   * Merge fields into the saved design with matching id (localStorage).
   * @returns {boolean} true if a design was updated
   */
  /**
   * New tabs do not inherit sessionStorage from the opener; re-seed the workflow bundle from a saved design.
   * Expects `?workflow=1&designId=<id>` (designId is added when opening module pages from the workspace).
   */
  global.clarityHydrateSessionFromDesignId = function (designId) {
    if (!designId) return false;
    try {
      var key = global.CLARITY_DESIGNS_STORAGE_KEY;
      var raw = global.localStorage.getItem(key);
      if (!raw) return false;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return false;
      var design = null;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].id === designId) {
          design = arr[i];
          break;
        }
      }
      if (!design) return false;
      var payload = {
        version: 1,
        designId: design.id,
        name: design.name,
        html: design.html,
        plainText: design.plainText,
        subject: design.subject,
        previewText: design.previewText,
        analysis: design.analysis,
      };
      return global.clarityWriteWorkflowBundle(payload);
    } catch (e) {
      console.warn("clarityHydrateSessionFromDesignId", e);
      return false;
    }
  };

  global.clarityPatchDesignById = function (designId, partial) {
    if (!designId || !partial || typeof partial !== "object") return false;
    try {
      var key = global.CLARITY_DESIGNS_STORAGE_KEY;
      var raw = global.localStorage.getItem(key);
      if (!raw) return false;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return false;
      var ix = -1;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].id === designId) {
          ix = i;
          break;
        }
      }
      if (ix < 0) return false;
      var d = arr[ix];
      Object.keys(partial).forEach(function (k) {
        d[k] = partial[k];
      });
      d.updatedAt = Date.now();
      arr[ix] = d;
      global.localStorage.setItem(key, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.warn("clarityPatchDesignById", e);
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
