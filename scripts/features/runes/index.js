import { MODULE_ID } from "../../core/constants.js";
import { ActorRunesConfig } from "./app-actor.js";
import { applyDefensiveRunesToActor } from "./service.js";

/** Helpers pra não depender do service aqui */
function itemIsWeapon(item) {
  return item?.type === "weapon";
}

function itemIsArmorLike(item) {
  if (item?.type !== "equipment") return false;
  const sys = item.system ?? {};
  if (sys.armor) return true;

  const eqType = sys.equipmentType ?? sys.type?.value;
  if (!eqType) return false;
  const s = String(eqType).toLowerCase();
  return s.includes("armor") || s.includes("shield");
}

export function registerRunesFeature() {

  // Botão "Runas" no header da ficha de ator
  Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
    const actor = sheet.actor;
    if (!actor) return;

    // Se quiser restringir só a PCs, pode testar actor.type === "character"
    buttons.unshift({
      label: "Runas",
      class: "mhh-runes-actor-button",
      icon: "fas fa-gem",
      onclick: () => {
        new ActorRunesConfig(actor, {}).render(true);
      }
    });
  });

  // Recalcular efeitos de runas "de ator" (defensivas + arcanas)
  Hooks.on("updateItem", async (item, changes, options, userId) => {
    const actor = item.parent;
    if (!actor || !actor.items) return;

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
