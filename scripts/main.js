// scripts/main.js
const MODULE_ID = "marvelous-hawke-homebrews";
const FLAG_SCOPE = MODULE_ID;
const FLAG_MODE  = "ewMode"; // "normal" | "elite" | "weak"

Hooks.once("init", () => {
  console.log("[MHH] init");
});

Hooks.once("ready", () => {
  console.log("[MHH] ready");
});

/**
 * Robustly inject a header button into any Actor sheet (ApplicationV2 or themed sheets).
 * We use render-time DOM injection instead of getActorSheetHeaderButtons to ensure visibility.
 */
Hooks.on("renderActorSheet", async (sheet, html) => {
  try {
    const actor = sheet.actor;
    if (!actor) return;

    // Find the header actions container (V2) or fallback
    const root = html[0] ?? html; // html can be jQuery or Element
    const actions =
      root.querySelector(".window-header .header-actions") ||
      root.querySelector(".window-header .window-controls") ||
      root.querySelector(".header-actions") ||
      root.querySelector(".window-controls");

    if (!actions) return; // header container not found

    // Avoid duplicates on re-render
    if (actions.querySelector(".mhh-elite-weak-toggle")) return;

    // Read mode and compute next
    const mode = actor.getFlag(FLAG_SCOPE, FLAG_MODE) ?? "normal";
    const next = { normal: "elite", elite: "weak", weak: "normal" }[mode];
    const label = mode === "elite" ? "Elite ON" : mode === "weak" ? "Weak ON" : "Normal";

    // Build the button
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mhh-elite-weak-toggle";
    btn.title = "Cycle Elite / Weak / Normal";
    btn.innerHTML = `<i class="fas fa-arrows-rotate"></i><span>${label}</span>`;

    // Click handler
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const current = actor.getFlag(FLAG_SCOPE, FLAG_MODE) ?? "normal";
      const nextMode = { normal: "elite", elite: "weak", weak: "normal" }[current];
      await actor.setFlag(FLAG_SCOPE, FLAG_MODE, nextMode);
      ui.notifications?.info(`${actor.name}: mode set to ${nextMode.toUpperCase()}`);
      sheet.render(false); // refresh header label
    });

    // Insert as the first header action (leftmost)
    actions.prepend(btn);
  } catch (err) {
    console.error("[MHH] renderActorSheet injection failed:", err);
  }
});
