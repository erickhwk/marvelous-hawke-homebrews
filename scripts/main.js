import { registerSettings } from "./core/settings.js";
import { registerAdjustmentFeature } from "./features/adjustment/index.js";

Hooks.once("init", () => {
  console.log("[MHH] init");
  registerSettings();         // onde você colocará o “hard-core mode” depois
});

Hooks.once("ready", async () => {
  console.log("[MHH] ready");
});

// Registrar as features (cada uma cuida dos próprios hooks)
registerAdjustmentFeature();
// ex.: registerFlankingFeature(); registerWoundedFeature(); etc.
