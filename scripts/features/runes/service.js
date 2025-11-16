import { MODULE_ID } from "../../core/constants.js";

/**
 * Runa armazenada no item:
 * item.flags[MODULE_ID].runes = [
 *   { runeCategory, runeSubtype, runeTier },
 *   ...
 * ]
 */

export function getItemRunes(item) {
  return item.getFlag(MODULE_ID, "runes") ?? [];
}

export async function setItemRunes(item, runes) {
  return item.setFlag(MODULE_ID, "runes", Array.isArray(runes) ? runes : []);
}

export function itemSupportsRunes(item) {
  const type = item?.type;
  // por enquanto, só arma
  return type === "weapon";
}

/**
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
 * Instala uma runa no item (mesmo esquema que você já testou)
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

  // trava duplicar mesma combinação subtype+tier
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
 * Acha a primeira Activity de ataque da arma.
 * Se teu schema estiver um pouco diferente, a gente ajusta esse helper.
 */
function getPrimaryAttackActivity(item) {
  const acts = item.system?.activities;
  if (!acts) return null;

  for (const [key, data] of Object.entries(acts)) {
    if (!data) continue;
    if (data.type === "attack") {
      return { key, data: foundry.utils.duplicate(data) };
    }
  }

  return null;
}

/**
 * Aplica os efeitos das runas diretamente na Activity de ataque.
 * Neste teste: só Precision Rune → bônus de To Hit.
 */
export async function applyRuneEffectsToItem(item) {
  if (!item) return;

  const runes = getItemRunes(item);
  if (!runes.length) return;

  const actInfo = getPrimaryAttackActivity(item);
  if (!actInfo) {
    console.warn("[MHH][Runes] Nenhuma Attack Activity encontrada para o item", item);
    return;
  }

  const { key, data } = actInfo;

  // soma todos os bônus de precisão
  let precisionBonus = 0;
  for (const r of runes) {
    if (r.runeSubtype === "precision") {
      precisionBonus += tierToBonus(r.runeTier);
    }
  }

  // se não tem precision, por enquanto não fazemos nada
  if (!precisionBonus) {
    return;
  }

  // garante estrutura
  data.attack = data.attack ?? {};

  // campo provável do To Hit Bonus; se o seu for outro, a gente ajusta
  const current = Number(data.attack.toHitBonus ?? 0) || 0;
  data.attack.toHitBonus = current + precisionBonus;

  // aplica de volta na arma
  await item.update({
    [`system.activities.${key}`]: data
  });
}
