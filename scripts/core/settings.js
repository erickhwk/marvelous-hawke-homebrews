import { MODULE_ID } from "./constants.js";

export function registerSettings() {
  // NEW: Enable/disable Flanking globally
  game.settings.register(MODULE_ID, "enableFlanking", {
    name: "Enable Flanking",
    hint: "If enabled, attackers get +2 to hit when an ally is exactly opposite the target with clear lines (no wall/terrain blocking). Applies only during attack rolls.",
    scope: "world",
    config: true,
    default: true,
    type: Boolean
  });
}
