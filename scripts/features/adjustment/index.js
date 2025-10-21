import { MODULE_ID, FLAGS } from "../../core/constants.js";
import { actorFromSheetApp } from "../../core/utils.js";
import { applyAdjustment, readModeFrom } from "./service.js";
import { MHHAdjustmentAppV2 } from "./app.js";

export function registerAdjustmentFeature() {

  // Reaplicar ajustes salvos/migrar (se quiser pode mover para um “core/hooks.js”)
  Hooks.once("ready", async () => {
    try {
      for (const actor of game.actors ?? []) {
        const v = await actor.getFlag(MODULE_ID, FLAGS.MODE);
        if (v === "normal") await actor.setFlag(MODULE_ID, FLAGS.MODE, "default");
        const mode = (await actor.getFlag(MODULE_ID, FLAGS.MODE)) ?? "default";
        await applyAdjustment(actor, mode, null);
      }
    } catch (e) {
      console.warn("[MHH] adjustment reapply skipped:", e);
    }
  });

  // Se o AE for removido manualmente, volta para default
  Hooks.on("deleteActiveEffect", async (effect) => {
    try {
      if (effect?.parent?.documentName !== "Actor") return;
      if (!effect.getFlag(MODULE_ID, "mhhAdjustmentEffect")) return;
      const actor = effect.parent;
      await actor.setFlag(MODULE_ID, FLAGS.MODE, "default");
      await applyAdjustment(actor, "default", null);
      ui.notifications?.warn(`${actor.name}: Adjustment effect removed — restored to DEFAULT.`);
    } catch (e) {
      console.error("[MHH] deleteActiveEffect handler failed:", e);
    }
  });

  // Header control V2
  Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
    try {
      const { actor, tokenDoc } = actorFromSheetApp(app);
      if (!actor) return;
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
