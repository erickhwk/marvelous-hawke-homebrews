// modules/marvelous-hawke-homebrews/scripts/features/runes/app-actor.js

import { MODULE_ID, TEMPLATES } from "../../core/constants.js";
import {
  getItemRunes,
  setItemRunes,
  installRuneOnItem,
  applyRuneEffectsToItem
} from "./service.js";

/* -------------------------------------------- */
/*  Helpers de tipo de item                     */
/* -------------------------------------------- */

function itemIsWeapon(item) {
  return item?.type === "weapon";
}

function itemIsArmorLike(item) {
  if (!item || item.type !== "equipment") return false;

  const sys = item.system ?? {};

  //
  // 1) Verificação correta de armaduras reais
  //    O D&D5e só considera armor quando:
  //    - system.type.value é "light", "medium", "heavy"
  //    - OU system.type.value é "shield"
  //
  const armorTypes = ["light", "medium", "heavy", "shield"];
  const eqType = sys.type?.value?.toLowerCase?.() ?? "";

  if (armorTypes.includes(eqType)) return true;

  //
  // 2) Fallback para a propriedade baseItem, caso alguém use tipos personalizados
  //
  const base = sys.type?.baseItem?.toLowerCase?.() ?? "";
  if (armorTypes.includes(base)) return true;

  //
  // 3) Caso especial: escudos geralmente têm a propriedade "shd"
  //
  if (Array.isArray(sys.properties) && sys.properties.includes("shd")) {
    return true;
  }

  //
  // 4) Caso especial: se realmente tiver AC definido (>0), trata como armor.
  //    Aqui sim temos um behavior confiável, diferente de sys.armor não-nulo.
  //
  const armorValue = Number(sys.armor?.value ?? 0);
  if (armorValue > 0) return true;

  //
  // Se chegou até aqui → não é armor
  //
  return false;
}

function itemIsFocusLike(item) {
  // qualquer equipment que não seja armor/escudo
  return item?.type === "equipment" && !itemIsArmorLike(item);
}

/* -------------------------------------------- */
/*  Helpers de Rarity / Slots                   */
/* -------------------------------------------- */

function normalizeRarity(raw) {
  if (!raw) return "common";

  if (typeof raw === "object") {
    raw = raw.value ?? raw.label ?? "";
  }

  const s = String(raw).toLowerCase().replace(/\s+/g, "");
  if (s === "rarity") return "common";
  if (s === "uncommon") return "uncommon";
  if (s === "rare") return "rare";
  if (s === "veryrare" || s === "very_rare") return "very-rare";
  if (s === "legendary") return "legendary";
  return "common";
}

function rarityLabel(raw) {
  const r = normalizeRarity(raw);
  switch (r) {
    case "uncommon":  return "Uncommon";
    case "rare":      return "Rare";
    case "very-rare": return "Very Rare";
    case "legendary": return "Legendary";
    default:          return "Common";
  }
}

function getMaxRuneSlotsForUI(item) {
  const rarityRaw = item?.system?.rarity ?? "common";
  const rarity = normalizeRarity(rarityRaw);

  switch (rarity) {
    case "uncommon":
    case "rare":
      return 1;
    case "very-rare":
      return 2;
    case "legendary":
      return 3;
    default:
      return 0;
  }
}

/* -------------------------------------------- */
/*  Helpers de estado                            */
/* -------------------------------------------- */

function isItemEquipped(item) {
  const eq = item.system?.equipped;
  if (typeof eq === "boolean") return eq;
  if (eq && typeof eq === "object") return !!eq.value;
  return false;
}

function makeRuneLabel(r) {
  if (!r) return "";
  const cat  = r.runeCategory   ?? "???";
  const sub  = r.runeSubtype    ?? "???";
  const tier = r.runeTier       ?? "???";
  const elem = r.runeDamageType ? ` (${r.runeDamageType})` : "";
  return `${cat} · ${sub} · ${tier}${elem}`;
}

/* -------------------------------------------- */
/*  Classe principal: ActorRunesConfig          */
/* -------------------------------------------- */

export class ActorRunesConfig extends Application {

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "mhh-actor-runes-config",
      classes: ["mhh-runes-actor", "sheet"],
      template: TEMPLATES.RUNES_ACTOR,
      width: 700,
      height: "auto",
      resizable: true,
      title: "Runas do Personagem"
    });
  }

  /* -------------------------------------------- */
  /*  getData                                     */
  /* -------------------------------------------- */
  getData(options = {}) {
    const actor = this.actor;

    const offensiveItems = [];
    const defensiveItems = [];

    for (const item of actor.items) {
      const maxSlots = getMaxRuneSlotsForUI(item);
      if (maxSlots <= 0) continue;

      const runes = getItemRunes(item);
      const slots = [];

      for (let i = 0; i < maxSlots; i++) {
        const rune = runes[i] ?? null;
        slots.push({
          index: i,
          rune,
          label: rune ? makeRuneLabel(rune) : null
        });
      }

      const row = {
        id: item.id,
        name: item.name,
        img: item.img,
        rarityLabel: rarityLabel(item.system?.rarity),
        maxSlots,
        equipped: isItemEquipped(item),
        slots
      };

      if (itemIsArmorLike(item)) {
        defensiveItems.push(row);
      } else if (itemIsWeapon(item) || itemIsFocusLike(item)) {
        offensiveItems.push(row);
      }
    }

    return {
      actor,
      offensiveItems,
      defensiveItems
    };
  }

  /* -------------------------------------------- */
  /*  activateListeners                            */
  /* -------------------------------------------- */
  activateListeners(html) {
    super.activateListeners(html);

    /* ------------------------------
       Remover uma runa do slot
    ------------------------------ */
    html.find(".mhh-runes-slot__remove").on("click", async ev => {
      ev.preventDefault();
      const btn     = ev.currentTarget;
      const itemId  = btn.dataset.itemId;
      const slotIdx = Number(btn.dataset.slot);

      const item = this.actor.items.get(itemId);
      if (!item) return;

      const runes = getItemRunes(item);
      if (!Array.isArray(runes) || !runes[slotIdx]) return;

      runes.splice(slotIdx, 1);
      await setItemRunes(item, runes);
      await applyRuneEffectsToItem(item);

      // NÃO recalcula runas defensivas aqui.
      // updateItem → index.js → applyDefensiveRunesToActor.

      this.render(true);
    });

    /* ------------------------------
       Drag & Drop de runa
    ------------------------------ */

    const root = html[0];

    root.addEventListener("dragover", ev => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "copy";
    });

    root.addEventListener("drop", async ev => {
      ev.preventDefault();

      let data;
      try {
        data = JSON.parse(ev.dataTransfer.getData("text/plain"));
      } catch {
        return;
      }

      if (data.type !== "Item" || !data.uuid) return;

      const runeItem = await fromUuid(data.uuid).catch(() => null);
      if (!runeItem) return;

      const rowEl = ev.target.closest(".mhh-runes-item-row");
      if (!rowEl) return;
      const itemId = rowEl.dataset.itemId;
      const item   = this.actor.items.get(itemId);
      if (!item) return;

      const result = await installRuneOnItem(item, runeItem);

      if (!result?.ok) {
        const reason = result.reason;
        if (reason === "RUNE_WEAKER_OR_EQUAL_EXISTS") {
          const existing = result.existing;
          ui.notifications.warn(
            `O item ${item.name} já tem uma runa ${existing.runeTier} ${existing.runeSubtype} igual ou melhor.`
          );
        } else if (reason === "ITEM_NOT_COMPATIBLE") {
          ui.notifications.error(`${runeItem.name} não é compatível com ${item.name}.`);
        } else if (reason === "RUNE_ALREADY_SOCKETED") {
          ui.notifications.error(
            `${runeItem.name} já está encaixada em outro item. Remova de lá antes.`
          );
        } else if (reason === "NO_RUNE_SLOTS") {
          ui.notifications.error(`${item.name} não possui slots de runa (raridade muito baixa).`);
        } else if (reason === "NO_FREE_RUNE_SLOT") {
          ui.notifications.error(`${item.name} já está com todos os slots de runa preenchidos.`);
        } else {
          ui.notifications.error(
            `Falha ao instalar runa em ${item.name}. Motivo: ${reason ?? "desconhecido"}.`
          );
        }
      } else {
        if (result.reason === "REPLACED_WEAKER") {
          ui.notifications.info(
            `${runeItem.name} instalada em ${item.name}, substituindo uma runa mais fraca.`
          );
        } else {
          ui.notifications.info(`${runeItem.name} instalada em ${item.name}.`);
        }
      }

      this.render(true);
    });
  }
}
