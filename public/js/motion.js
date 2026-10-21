const canAnimate = () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches && document.documentElement.dataset.motion !== "off";

export function installMotion() {
  if (window.__openchatMotionInstalled) return;
  window.__openchatMotionInstalled = true;
  document.addEventListener("pointerdown", (event) => {
    if (!canAnimate() || event.button !== 0) return;
    const target = event.target.closest("button, .suggestion-card, .conversation-row, .plugin-card, .artifact-card, .request-item, .model-top-button, .thinking-chip");
    if (!target || target.disabled) return;
    try {
      target.animate(
        [{ transform: "scale(1)" }, { transform: "scale(.965)" }, { transform: "scale(1.012)" }, { transform: "scale(1)" }],
        { duration: document.documentElement.dataset.motion === "subtle" ? 180 : 360, easing: "cubic-bezier(.2,1.35,.35,1)" }
      );
    } catch {}
  }, { passive: true });
  document.addEventListener("pointermove", (event) => {
    const card = event.target.closest(".suggestion-card");
    if (!card || !canAnimate()) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    card.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }, { passive: true });
}

export function animateIn(element, keyframes, options = {}) {
  if (!element || !canAnimate() || !element.animate) return;
  element.animate(keyframes, { duration: 320, easing: "cubic-bezier(.2,1.35,.35,1)", fill: "both", ...options });
}
