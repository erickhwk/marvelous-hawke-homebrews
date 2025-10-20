// scripts/main.js
const MODULE_ID = "marvelous-hawke-homebrews";
const FLAG_SCOPE = MODULE_ID;       // where we store flags
const FLAG_MODE  = "ewMode";        // "normal" | "elite" | "weak"

Hooks.once("init", () => {
  console.log("Marvelous Hawke Homebrews | init");
});

Hooks.once("ready", () => {
  console.log("Marvelous Hawke Homebrews | ready");
});

/**
 * Inject a header button into Actor sheets to toggle Elite/Weak/Normal.
 * This hook is provided by most systems (including dnd5e) that use ApplicationV2-based sheets.
 */
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  const actor = sheet.actor;
  if (!actor) return;

  // Read current mode from flags
  const mode = actor.getFlag(FLAG_SCOPE, FLAG_MODE) ?? "normal";
  const nextMode = { normal: "elite", elite: "weak", weak: "normal" }[mode];

  // Choose label and icon
  const label = mode === "elite" ? "Elite ON"
               : mode === "weak" ? "Weak ON"
               : "Normal";
  const icon  = "fas fa-arrows-rotate";

  // Insert our button at the left of the header
  buttons.unshift({
    label,
    class: "mhh-elite-weak-toggle",
    icon,
    onclick: async () => {
      await setEliteWeakMode(actor, nextMode);
      ui.notifications?.info(`${actor.name}: mode set to ${nextMode.toUpperCase()}`);
      // Re-render the sheet so the header button reflects the new label
      sheet.render(false);
    }
  });
});

/**
 * Persist the chosen mode in actor flags.
 * Effects and mechanics will be applied in the next step.
 */
async function setEliteWeakMode(actor, mode) {
  await actor.setFlag(FLAG_SCOPE, FLAG_MODE, mode);
}
