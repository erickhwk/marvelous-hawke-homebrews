// scripts/features/runes/index.js

import { MODULE_ID } from "../../core/constants.js";
import { applyDefensiveRunesToActor } from "./service.js";

export function registerRunesFeature() {
  // Recalcular defensivos quando um item for atualizado
  Hooks.on("updateItem", async (item, changes, options, userId) => {
    const actor = item.parent;
    if (!actor) return;

    // Só interessa pra actor (não compendium, etc.)
    if (!("items" in actor)) return;

    // Só queremos atualizar quando:
    // - mudar equipar/desequipar
    // - ou mudar as flags de runas
    const hasProp = foundry.utils.hasProperty;

    const equippedChanged =
      hasProp(changes, "system.equipped") ||
      hasProp(changes, "system.equipped.value");

    const runesChanged =
      hasProp(changes, `flags.${MODULE_ID}.runes`);

    if (!equippedChanged && !runesChanged) return;

    await applyDefensiveRunesToActor(actor);
  });
}
