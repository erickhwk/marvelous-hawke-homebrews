// modules/marvelous-hawke-homebrews/scripts/features/runes/app-actor.js

import { MODULE_ID, TEMPLATES } from "../../core/constants.js";
import {
  getItemRunes,
  setItemRunes,
  installRuneOnItem,
  applyRuneEffectsToItem,
  getMaxRuneSlots
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

  const armorTypes = ["light", "medium", "heavy", "shield"];
  const typeValue = sys.type?.value?.toLowerCase?.() ?? "";
  const baseItem  = sys.type?.baseItem?.toLowerCase?.() ?? "";

  if (armorTypes.includes(typeValue)) return true;
  if (armorTypes.includes(baseItem))  return true;

  if (Array.isArray(sys.properties) && sys.properties.includes("shd")) {
    return true;
  }

  const armorValue = Number(sys.armor?.value ?? 0);
  if (armorValue > 0) return true;

  return false;
}

/**
 * Foco arcano = equipment com "foc" nas properties
 */
function itemIsFocusLike(item) {
  const propsRaw = item?.system?.properties;
  const props = Array.isArray(propsRaw)
    ? propsRaw
    : propsRaw instanceof Set
      ? Array.from(propsRaw)
      : [];

  return props.includes("foc");
}

/* -------------------------------------------- */
/*  Helpers de estado / labels                  */
/* -------------------------------------------- */

function normalizeRarity(raw) {
  if (!raw) return "common";

  if (typeof raw === "object") {
    raw = raw.value ?? raw.label ?? "";
  }

  const s = String(raw).toLowerCase().replace(/\s+/g, "");
  if (s === "rarity") return "common"; // valor default do select
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
/*  ActorRunesConfig (ApplicationV2)            */
/* -------------------------------------------- */

export class ActorRunesConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(actor, parentApp = null) {
    super();
    this.actor = actor;
    this.parentApp = parentApp;
  }

  static DEFAULT_OPTIONS = {
    id: "mhh-actor-runes-config",
    title: "Runas do Personagem",
    classes: ["application", "sheet", "sheet-config", "mhh-runes-actor"],
    width: 700,
    height: "auto",
    resizable: true,
    window: {
      contentClasses: ["standard-form"]
    }
  };

  static PARTS = {
    body: { template: TEMPLATES.RUNES_ACTOR }
  };

  /**
   * Prepara o contexto usado pelo template Handlebars.
   */
  async _prepareContext(_options) {
    const actor = this.actor;
    const offensiveItems = [];
    const defensiveItems = [];

    // Runas disponíveis no inventário do ator (para os selects)
    const offensiveRunes = [];
    const defensiveRunes = [];

    for (const it of actor.items) {
      const category = it.getFlag(MODULE_ID, "runeCategory");
      const subtype  = it.getFlag(MODULE_ID, "runeSubtype");
      const tier     = it.getFlag(MODULE_ID, "runeTier");
      const dmgType  = it.getFlag(MODULE_ID, "runeDamageType");

      if (category && subtype && tier) {
        const labelParts = [tier, subtype];
        if (dmgType) labelParts.push(`(${dmgType})`);

        const entry = {
          id: it.id,
          name: it.name,
          category,
          subtype,
          tier,
          damageType: dmgType,
          label: `${it.name} – ${labelParts.join(" ")}`
        };

        if (category === "offensive") offensiveRunes.push(entry);
        if (category === "defensive") defensiveRunes.push(entry);
      }
    }

    // Itens que podem receber runas
    for (const item of actor.items) {
      const maxSlots = getMaxRuneSlots(item);
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

      const armorLike  = itemIsArmorLike(item);
      const weaponLike = itemIsWeapon(item);
      const focusLike  = itemIsFocusLike(item);

      console.debug("[MHH][Runes][UI] classify item", {
        itemName: item.name,
        type: item.type,
        rarity: item.system?.rarity,
        armorLike,
        weaponLike,
        focusLike,
        maxSlots
      });

      if (armorLike) {
        defensiveItems.push(row);
      } else if (weaponLike || focusLike) {
        offensiveItems.push(row);
      }
    }

    return {
      actor,
      offensiveItems,
      defensiveItems,
      offensiveRunes,
      defensiveRunes
    };
  }

  /**
   * ApplicationV2: usamos _replaceHTML para plugar os eventos no root.
   */
  async _replaceHTML(result, options) {
    await super._replaceHTML(result, options);
    const root = this.element;
    if (!root) return;

    // Evitar registrar listeners mais de uma vez
    if (root.dataset.mhhDelegated) return;
    root.dataset.mhhDelegated = "1";

    /* ------------------------------
       Delegação: Remover runa de um slot
    ------------------------------ */
    root.addEventListener("click", async ev => {
      const removeBtn = ev.target.closest(".mhh-runes-slot__remove");
      if (removeBtn) {
        ev.preventDefault();

        const itemId  = removeBtn.dataset.itemId;
        const slotIdx = Number(removeBtn.dataset.slot);

        const item = this.actor.items.get(itemId);
        if (!item) return;

        const runes = getItemRunes(item);
        if (!Array.isArray(runes) || !runes[slotIdx]) return;

        runes.splice(slotIdx, 1);
        await setItemRunes(item, runes);
        await applyRuneEffectsToItem(item);

        this.render(true);
        return;
      }

      const applyBtn = ev.target.closest(".mhh-runes-slot-apply");
      if (applyBtn) {
        ev.preventDefault();

        const itemId  = applyBtn.dataset.itemId;
        const slotIdx = Number(applyBtn.dataset.slot);

        const item = this.actor.items.get(itemId);
        if (!item) return;

        const select = root.querySelector(
          `.mhh-runes-slot-select[data-item-id="${itemId}"][data-slot="${slotIdx}"]`
        );
        if (!select) return;

        const runeId = select.value;
        if (!runeId) {
          ui.notifications.warn("Selecione uma runa primeiro.");
          return;
        }

        // As runas vivem no inventário do ator
        const runeItem = this.actor.items.get(runeId)
          ?? game.items?.get(runeId);
        if (!runeItem) {
          ui.notifications.error("Não foi possível encontrar o item de runa selecionado.");
          return;
        }

        console.debug("[MHH][Runes][UI] apply via select", {
          runeName: runeItem.name,
          itemName: item.name,
          slotIdx
        });

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
      }
    });

    // Drag & drop antigo foi abandonado em favor de select, então não registramos
    // mais "dragover"/"drop" aqui.
  }
}
