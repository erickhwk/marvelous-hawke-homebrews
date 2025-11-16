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

function registerActorHeaderButtonHook(hookName) {
  Hooks.on(hookName, (sheet, buttons) => {
    const actor = sheet.actor;
    if (!actor) return;

    console.log(`[MHH][Runes] ${hookName} para actor`, actor.name);

    // Se quiser restringir só a PCs:
    // if (actor.type !== "character") return;

    buttons.unshift({
      label: "Runas",
      class: "mhh-runes-actor-button",
      icon: "fas fa-gem",
      onclick: () => {
        console.log("[MHH][Runes] Abrindo ActorRunesConfig para", actor.name);
        new ActorRunesConfig(actor, {}).render(true);
      }
    });
  });
}

export function registerRunesFeature() {
  console.log("[MHH][Runes] registerRunesFeature()");

  // Botão "Runas" no header da ficha de ator (core)
  registerActorHeaderButtonHook("getActorSheetHeaderButtons");

  // Botão "Runas" no header da ficha de ator 5e (caso o sistema use esse hook específico)
  registerActorHeaderButtonHook("getActorSheet5eHeaderButtons");

  // Recalcular efeitos de runas "de ator" (defensivas + arcanas) ao equipar/desequipar / mudar runas
  Hooks.on("updateItem", async (item, changes, options, userId) => {
    const actor = item.parent;
    if (!actor || !actor.items) return;

    const hasProp = foundry.utils.hasProperty;

    const equippedChanged =
      hasProp(changes, "system.equipped") ||
      hasProp(changes, "system.equipped.value");

    const runesChanged =
      hasProp(changes, `flags.${MODULE_ID}.itemRunes`);

    if (!equippedChanged && !runesChanged) return;

    console.log("[MHH][Runes] updateItem → recalculando efeitos de runas para", actor.name);
    await applyDefensiveRunesToActor(actor);
  });
}
