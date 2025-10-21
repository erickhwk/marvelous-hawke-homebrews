import { MODULE_ID, FLAGS } from "../../core/constants.js";
import { actorFromSheetApp } from "../../core/utils.js";
import { applyAdjustment, readModeFrom } from "./service.js";
import { MHHAdjustmentAppV2 } from "./app.js";

export function registerAdjustmentFeature() {

  // Reaplicar ajustes salvos/migrar (apenas NPCs)
  Hooks.once("ready", async () => {
    try {
      const actors = (game.actors ?? []).filter(a => a?.type === "npc");
      for (const actor of actors) {
        const v = await actor.getFlag(MODULE_ID, FLAGS.MODE);
        if (v === "normal") await actor.setFlag(MODULE_ID, FLAGS.MODE, "default");
        const mode = (await actor.getFlag(MODULE_ID, FLAGS.MODE)) ?? "default";
        await applyAdjustment(actor, mode, null);
      }
    } catch (e) {
      console.warn("[MHH] adjustment reapply skipped:", e);
    }
  });

  // Se o AE for removido manualmente, volta para default (apenas NPCs)
  Hooks.on("deleteActiveEffect", async (effect) => {
    try {
      if (effect?.parent?.documentName !== "Actor") return;
      const actor = effect.parent;
      if (actor?.type !== "npc") return;
      if (!effect.getFlag(MODULE_ID, "mhhAdjustmentEffect")) return;

      await actor.setFlag(MODULE_ID, FLAGS.MODE, "default");
      await applyAdjustment(actor, "default", null);
      ui.notifications?.warn(`${actor.name}: Adjustment effect removed — restored to DEFAULT.`);
    } catch (e) {
      console.error("[MHH] deleteActiveEffect handler failed:", e);
    }
  });

  // Header control V2 (apenas NPCs)
  Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
    try {
      const { actor, tokenDoc } = actorFromSheetApp(app);
      if (!actor) return;
      if (actor.type !== "npc") return; // <- restrição a NPCs
      if (controls.some(c => c.class?.includes("mhh-elite-weak-toggle"))) return;

      const current = readModeFrom(actor, tokenDoc);
      const labelMap = {
        default: "Adjustment: Default",
        elite:   "Adjustment: Elite",
        weak:    "Adjustment: Weak"
      };
      const label = labelMap[current] ?? "Adjustment: Default";

      controls.unshift({
        class: "mhh-elite-weak-toggle",
        icon: "fas fa-sliders",
        label,
        onClick: () => new MHHAdjustmentAppV2(actor, app).render(true)
      });
    } catch (e) {
      console.error("[MHH] getHeaderControlsActorSheetV2 failed:", e);
    }
  });
}
