import { registerSettings } from "./core/settings.js";
import { registerAdjustmentFeature } from "./features/adjustment/index.js";
import { registerFlankingFeature } from "./features/flanking/index.js";


Hooks.once("init", () => {
  console.log("[MHH] init");
  registerSettings();
});

Hooks.once("ready", async () => {
  console.log("[MHH] ready");
});

// Registrar as features (cada uma cuida dos próprios hooks)
registerAdjustmentFeature();
registerFlankingFeature();
