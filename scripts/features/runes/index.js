import { MODULE_ID, FLAGS } from "../../core/constants.js";
import { ActorRunesConfig } from "./app-actor.js";
import { applyDefensiveRunesToActor } from "./service.js";
import { actorFromSheetApp } from "../../core/utils.js";

export function registerRunesFeature() {

  console.log("[MHH][Runes] registerRunesFeature()");

  // ====== HEADER BUTTON (V2) - funciona com a ficha moderna do dnd5e ======
  Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
    try {
      const { actor } = actorFromSheetApp(app);
      if (!actor) return;

      // Se quiser restringir só a personagens:
      // if (actor.type !== "character") return;

      // evita duplicação
      if (controls.some(c => c.class?.includes("mhh-runes-button"))) return;

      controls.unshift({
        class: "mhh-runes-button",
        icon: "fas fa-gem",
        label: "Runas",
        onClick: () => {
          console.log("[MHH][Runes] Abrindo janela de runas para", actor.name);
          new ActorRunesConfig(actor, {}).render(true);
        }
      });

    } catch (err) {
      console.error("[MHH][Runes] getHeaderControlsActorSheetV2 failed:", err);
    }
  });

  // ====== REAPLICAR EFEITOS AO EQUIPAR/DES-EQUIPAR ======
  Hooks.on("updateItem", async (item, changes) => {
    const actor = item.parent;
    if (!actor) return;

    const hasProp = foundry.utils.hasProperty;

    const equippedChanged =
      hasProp(changes, "system.equipped") ||
      hasProp(changes, "system.equipped.value");

    const runesChanged =
      hasProp(changes, `flags.${MODULE_ID}.${FLAGS.ITEM_RUNES}`);

    if (!equippedChanged && !runesChanged) return;

    console.log("[MHH][Runes] updateItem → Reaplicando defensive runes para", actor.name);

    await applyDefensiveRunesToActor(actor);
  });
}
