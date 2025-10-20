// scripts/main.js
const MODULE_ID = "marvelous-hawke-homebrews";
const FLAG_SCOPE = MODULE_ID;
const FLAG_MODE  = "ewMode"; // "normal" | "elite" | "weak"

Hooks.once("init", () => console.log("[MHH] init"));
Hooks.once("ready", () => console.log("[MHH] ready"));

/** Utility: compute label and next mode */
function computeMode(actor) {
  const mode = actor.getFlag(FLAG_SCOPE, FLAG_MODE) ?? "normal";
  const next = { normal: "elite", elite: "weak", weak: "normal" }[mode];
  const label = mode === "elite" ? "Elite ON" : mode === "weak" ? "Weak ON" : "Normal";
  return { mode, next, label };
}

/** Insert the toggle button when any Actor sheet renders (V2-safe). */
Hooks.on("renderActorSheet", (sheet, html) => {
  try {
    const actor = sheet.actor;
    if (!actor) return;

    // Grab the full application element (includes window header in V2)
    const appEl = sheet.element?.[0] ?? html?.[0] ?? html;
    if (!appEl) return;

    // Try window header (preferred)
    const winHeader = appEl.querySelector(".window-header");
    let actionsContainer =
      winHeader?.querySelector(".header-actions, .window-controls");

    // Fallback: internal header inside content (some themes/sheets)
    if (!actionsContainer) {
      const contentRoot = appEl.querySelector(".window-content") ?? appEl;
      const innerHeader = contentRoot.querySelector(".sheet-header");
      actionsContainer = innerHeader?.querySelector(".header-actions, .window-controls, .header-controls");
    }

    if (!actionsContainer) {
      console.warn("[MHH] header container not found for sheet:", sheet.constructor?.name);
      return;
    }

    // Avoid duplicates
    if (actionsContainer.querySelector(".mhh-elite-weak-toggle")) return;

    const { label } = computeMode(actor);

    // Build button
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mhh-elite-weak-toggle";
    btn.title = "Cycle Elite / Weak / Normal";
    btn.innerHTML = `<i class="fas fa-arrows-rotate"></i><span>${label}</span>`;

    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const { next } = computeMode(actor);
      await actor.setFlag(FLAG_SCOPE, FLAG_MODE, next);
      ui.notifications?.info(`${actor.name}: mode set to ${next.toUpperCase()}`);
      sheet.render(false); // refresh label
    });

    // Insert at the beginning (leftmost)
    actionsContainer.prepend(btn);

    // Debug info
    console.debug("[MHH] injected toggle into:", sheet.constructor?.name, { actor: actor.name });
  } catch (err) {
    console.error("[MHH] renderActorSheet injection failed:", err);
  }
});
