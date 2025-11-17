import { MODULE_ID, FLAGS, TEMPLATES } from "../../core/constants.js";
import { applyAdjustment, readModeFrom } from "./service.js";

export class MHHAdjustmentAppV2 extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(actor, parentApp) {
    super();
    this.actor = actor;
    this.parentApp = parentApp;
  }

  static DEFAULT_OPTIONS = {
    id: "mhh-adjustment",
    title: "Creature Adjustment",
    classes: ["application", "sheet", "sheet-config"],
    width: 500,
    height: "auto",
    window: { contentClasses: ["standard-form"] }
  };

  static PARTS = {
    form:   { template: TEMPLATES.ADJ_FORM },
    footer: { template: TEMPLATES.ADJ_FOOTER }
  };

  async _replaceHTML(result, options) {
    await super._replaceHTML(result, options);
    const root = this.element;
    if (!root) return;

    // Pré-seleciona valor
    try {
      const tokenDoc = this.parentApp?.token ?? this.parentApp?.object?.document ?? null;
      const current = readModeFrom(this.actor, tokenDoc);
      const sel = root.querySelector('select[name="ewMode"]');
      if (sel) sel.value = current;
    } catch (e) { /* noop */ }

    if (!root.dataset.mhhDelegated) {
      root.addEventListener("click", async (ev) => {
        const btn = ev.target?.closest?.("#mhh-save-btn");
        if (!btn) return;

        const form = root.querySelector('form[data-mhh-adjustment]') ?? root.querySelector("form");
        if (!form) return ui.notifications?.error("MHH: Could not find adjustment form.");
        const fd = new FormData(form);
        const nextMode = (fd.get("ewMode") || "default");

        const tokenDoc = this.parentApp?.token ?? this.parentApp?.object?.document ?? null;

        // grava flags
        await this.actor.setFlag(MODULE_ID, FLAGS.MODE, nextMode);
        if (tokenDoc?.isLinked === false) await tokenDoc.setFlag(MODULE_ID, FLAGS.MODE, nextMode);

        await applyAdjustment(this.actor, nextMode, tokenDoc);

        ui.notifications?.info(`${this.actor.name}: Adjustment set to ${String(nextMode).toUpperCase()}`);

        if (this.parentApp?.requestHeaderControls) this.parentApp.requestHeaderControls();
        this.parentApp?.render(false);
        this.close();
      });
      root.dataset.mhhDelegated = "1";
    }
  }
}
