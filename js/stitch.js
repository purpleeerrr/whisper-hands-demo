(function () {
  "use strict";

  const HANDOFF_KEY = "whisper-hands:site-handoff:v1";
  let leaving = false;
  let studioReady = false;
  let openWhenReady = false;

  function safeCount(value) {
    return Array.isArray(value) ? value.length : 0;
  }

  function buildHandoffSummary() {
    let confirmedSlices = 0;
    let confirmedWorks = 0;
    let profileId = "";

    try {
      const layer = typeof window.getWhisperHandsMeaningLayer === "function"
        ? window.getWhisperHandsMeaningLayer()
        : null;
      confirmedSlices = safeCount(layer?.confirmedSlices);
      profileId = typeof layer?.profileId === "string" ? layer.profileId : "";
    } catch {
      // The site remains usable when storage is unavailable.
    }

    try {
      const works = typeof window.getWhisperHandsConfirmedWorks === "function"
        ? window.getWhisperHandsConfirmedWorks()
        : [];
      confirmedWorks = safeCount(works);
    } catch {
      // Only counts cross the handoff; raw onboarding material stays local.
    }

    return {
      version: 1,
      source: "onboarding",
      createdAt: new Date().toISOString(),
      profileId,
      confirmedSlices,
      confirmedWorks,
      rawMaterialIncluded: false,
    };
  }

  const frame = document.createElement("iframe");
  frame.id = "whisperStudioFrame";
  frame.title = "絮手创作过程工作台";
  frame.src = "studio.html?embedded=1";
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  document.body.appendChild(frame);

  function openStudio() {
    if (!studioReady) {
      openWhenReady = true;
      return;
    }
    document.body.classList.add("whisper-studio-open");
    frame.setAttribute("aria-hidden", "false");
    frame.removeAttribute("tabindex");
    frame.contentWindow?.focus();
  }

  frame.addEventListener("load", () => {
    studioReady = true;
    if (openWhenReady) openStudio();
  });

  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow || event.data?.type !== "whisper:return-to-garden") return;
    document.body.classList.remove("whisper-studio-open");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    leaving = false;
  });

  window.startWhisperSecondHalf = function startWhisperSecondHalf() {
    if (leaving) return;
    leaving = true;

    try {
      window.localStorage?.setItem(HANDOFF_KEY, JSON.stringify(buildHandoffSummary()));
    } catch {
      // The visual transition does not depend on persistence.
    }

    openStudio();
  };
})();
