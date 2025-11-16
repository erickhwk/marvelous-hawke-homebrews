import { MODULE_ID } from "../../core/constants.js";

/**
 * Lê as runas instaladas no item.
 * Estrutura: item.flags[MODULE_ID].runes = [ { runeCategory, runeSubtype, runeTier }, ... ]
 */
export function getItemRunes(item) {
  return item.getFlag(MODULE_ID, "runes") ?? [];
}

/**
 * Salva o array de runas no item.
 */
export async function setItemRunes(item, runes) {
  return item.setFlag(MODULE_ID, "runes", Array.isArray(runes) ? runes : []);
}

/**
 * Por enquanto, só armas e armaduras podem ter runas.
 */
export function itemSupportsRunes(item) {
  const type = item?.type;
  return ["weapon", "armor"].includes(type);
}

/**
 * Instala uma runa em um item.
 * rune: Item de runa (ex.: "Lesser Precision Rune")
 */
export async function installRuneOnItem(item, rune) {
  if (!item || !rune) {
    return { ok: false, reason: "MISSING_ITEM_OR_RUNE" };
  }

  if (!itemSupportsRunes(item)) {
    return { ok: false, reason: "ITEM_NOT_COMPATIBLE" };
  }

  const runeData = rune.flags?.[MODULE_ID];
  if (!runeData) {
    return { ok: false, reason: "INVALID_RUNE_ITEM" };
  }

  const current = getItemRunes(item);

  // Não deixar duplicar mesma combinação subtype+tier
  if (current.some(r => r.runeSubtype === runeData.runeSubtype && r.runeTier === runeData.runeTier)) {
    return { ok: false, reason: "RUNE_ALREADY_INSTALLED" };
  }

  const updated = [...current, runeData];
  await setItemRunes(item, updated);

  await applyRuneEffectsToItem(item);

  return {
    ok: true,
    reason: "INSTALLED",
    added: runeData,
    total: updated.length
  };
}

/**
 * Remove uma runa específica do item comparando category+subtype+tier.
 */
export async function removeRuneFromItem(item, runeData) {
  if (!item || !runeData) return { ok: false, reason: "MISSING_ITEM_OR_RUNE" };

  const current = getItemRunes(item);
  const filtered = current.filter(r =>
    !(
      r.runeCategory === runeData.runeCategory &&
      r.runeSubtype === runeData.runeSubtype &&
      r.runeTier === runeData.runeTier
    )
  );

  await setItemRunes(item, filtered);
  await applyRuneEffectsToItem(item);

  return {
    ok: true,
    reason: "REMOVED",
    total: filtered.length
  };
}

/**
 * Converte tier de runa em bônus numérico.
 * lesser → +1, greater → +2, major → +3
 */
function tierToBonus(tier) {
  switch (tier) {
    case "greater": return 2;
    case "major":   return 3;
    case "lesser":
    default:        return 1;
  }
}

/**
 * Aplica os efeitos de TODAS as runas instaladas como um único Active Effect no item.
 * Por enquanto: só Precision Rune → bônus de ataque com armas.
 */
export async function applyRuneEffectsToItem(item) {
  if (!item) return;

  // 1) remover AE anterior de runas
  const prev = item.effects.find(e => e.getFlag(MODULE_ID, "runeEffect"));
  if (prev) await prev.delete();

  const runes = getItemRunes(item);
  if (!runes.length) return;

  const changes = [];

  for (const r of runes) {
    if (!r || !r.runeSubtype) continue;

    // Por enquanto, tratamos só Precision
    if (r.runeSubtype === "precision") {
      const bonus = tierToBonus(r.runeTier);
      if (!bonus) continue;

      changes.push(
        {
          key: "system.bonuses.mwak.attack",
          mode: foundry.CONST.ACTIVE_EFFECT_MODES.ADD,
          value: bonus
        },
        {
          key: "system.bonuses.rwak.attack",
          mode: foundry.CONST.ACTIVE_EFFECT_MODES.ADD,
          value: bonus
        }
      );
    }

    // Aqui depois entram os outros tipos:
    // - damage
    // - elemental
    // - reinforcement
    // - protection
    // etc.
  }

  if (!changes.length) return;

  await item.createEmbeddedDocuments("ActiveEffect", [{
    name: "Runes",
    img: item.img,
    origin: item.uuid,
    disabled: false,
    changes,
    flags: {
      [MODULE_ID]: { runeEffect: true }
    }
  }]);
}
