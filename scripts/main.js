import { registerSettings } from "./core/settings.js";
import { registerAdjustmentFeature } from "./features/adjustment/index.js";
import { registerRunesFeature } from "./features/runes/index.js";

Hooks.once("init", () => {
  console.log("[MHH] init");
  registerSettings();
});

Hooks.once("ready", async () => {
  console.log("[MHH] ready");
});

// Registrar as features
registerAdjustmentFeature();
registerRunesFeature();
