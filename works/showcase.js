(() => {
  const forceFallback = new URLSearchParams(window.location.search).get("fallback") === "1";
  const controllers = new Map();

  const createFrameController = (frame) => {
    const device = frame.closest(".device");
    const loading = device?.querySelector("[data-frame-loading]");
    const fallback = device?.querySelector("[data-frame-fallback]");
    const source = frame.dataset.src || frame.getAttribute("src");
    let activated = frame.hasAttribute("src");
    let ready = false;
    let fallbackTimer = 0;

    if (!device || !loading || !fallback || !source) return null;

    const showReady = () => {
      if (forceFallback) return;
      ready = true;
      window.clearTimeout(fallbackTimer);
      loading.hidden = true;
      fallback.hidden = true;
      frame.classList.add("is-ready");
      frame.closest(".device-wrap")?.classList.remove("is-fallback");
      frame.setAttribute("aria-busy", "false");
    };

    const showFallback = () => {
      if (ready) return;
      loading.hidden = true;
      fallback.hidden = false;
      frame.classList.remove("is-ready");
      frame.closest(".device-wrap")?.classList.add("is-fallback");
      frame.setAttribute("aria-busy", "false");
    };

    const activate = () => {
      if (activated) return;
      activated = true;
      loading.hidden = false;
      fallback.hidden = true;
      frame.setAttribute("aria-busy", "true");
      frame.addEventListener("load", showReady, { once: true });

      if (forceFallback) {
        window.setTimeout(showFallback, 120);
        return;
      }

      frame.setAttribute("src", source);
      fallbackTimer = window.setTimeout(showFallback, 12000);
    };

    if (activated) {
      frame.addEventListener("load", showReady, { once: true });
      if (forceFallback) {
        frame.removeAttribute("src");
        window.setTimeout(showFallback, 120);
      } else {
        fallbackTimer = window.setTimeout(showFallback, 12000);
      }
    }

    return { activate };
  };

  document.querySelectorAll("[data-work-frame]").forEach((frame) => {
    const controller = createFrameController(frame);
    if (controller) controllers.set(frame, controller);
  });

  const dialog = document.querySelector("[data-experience-dialog]");
  const opener = document.querySelector("[data-open-experience]");
  const dialogFrame = dialog?.querySelector("[data-dialog-frame]");
  const closeButton = dialog?.querySelector(".dialog-close");
  let restoreFocus = null;
  let closeTimer = 0;

  if (!dialog || !opener || !dialogFrame || !closeButton) return;

  const openDialog = () => {
    window.clearTimeout(closeTimer);
    const useFullPageExperience = document.body.classList.contains("theme-parent")
      && window.matchMedia("(max-width: 780px)").matches;
    if (useFullPageExperience) {
      const source = dialogFrame.dataset.src || dialogFrame.getAttribute("src");
      if (source) window.location.assign(source);
      return;
    }
    restoreFocus = document.activeElement;
    dialog.hidden = false;
    document.body.classList.add("dialog-open");
    window.requestAnimationFrame(() => dialog.classList.add("is-open"));
    controllers.get(dialogFrame)?.activate();
    closeButton.focus();
  };

  const closeDialog = () => {
    if (dialog.hidden) return;
    dialog.classList.remove("is-open");
    document.body.classList.remove("dialog-open");
    closeTimer = window.setTimeout(() => {
      dialog.hidden = true;
      restoreFocus?.focus();
    }, 190);
  };

  opener.addEventListener("click", openDialog);
  dialog.querySelectorAll("[data-close-experience]").forEach((control) => {
    control.addEventListener("click", closeDialog);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dialog.hidden) closeDialog();
  });
})();
