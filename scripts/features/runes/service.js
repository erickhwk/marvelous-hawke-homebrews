// scripts/features/runes/service.js

import { MODULE_ID } from "../../core/constants.js";

/**
 * Estrutura esperada em item.flags[MODULE_ID].runes:
 * [
 *   { runeCategory: "offensive", runeSubtype: "precision", runeTier: "lesser" },
 *   ...
 * ]
 *
 * Além disso, guardamos:
 * item.flags[MODULE_ID].baseAttackBonus → bônus base original da activity de ataque
 */

/* ---------------- Helpers de flags ---------------- */

export function getItemRunes(item) {
  return item.getFlag(MODULE_ID, "runes") ?? [];
}

export async function setItemRunes(item, runes) {
  return item.setFlag(
    MODULE_ID,
    "runes",
    Array.isArray(runes) ? runes : []
  );
}

/**
 * Armazena o bônus base original da Activity de ataque
 * (antes das runas mexerem).
 */
async function ensureBaseAttackBonus(item, baseValue) {
  const existing = await item.getFlag(MODULE_ID, "baseAttackBonus");
  if (existing === undefined) {
    await item.setFlag(MODULE_ID, "baseAttackBonus", baseValue);
    return baseValue;
  }
  return Number(existing) || 0;
}

/* ---------------- Compatibilidade de item ---------------- */

export function itemSupportsRunes(item) {
  const type = item?.type;
  // por enquanto, só armas
  return type === "weapon";
}

/* ---------------- Tier helpers ---------------- */

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

/* ---------------- Activities helpers ---------------- */

/**
 * Retorna a Activity de ataque principal.
 * Suporta tanto array quanto objeto em system.activities.
 */
function getPrimaryAttackActivity(item) {
  const acts = item.system?.activities;
  if (!acts) return null;

  // Caso 1: array (é o que o seu dump mostrou)
  if (Array.isArray(acts)) {
    for (let i = 0; i < acts.length; i++) {
      const data = acts[i];
      if (!data) continue;
      if (data.type === "attack") {
        return {
          index: i,
          key: i, // só para log
          data: foundry.utils.duplicate(data),
          all: foundry.utils.duplicate(acts)
        };
      }
    }
    return null;
  }

  // Caso 2: objeto indexado por id/slug (outros itens podem vir assim)
  const clone = foundry.utils.duplicate(acts);
  const entries = Object.entries(clone);
  for (let i = 0; i < entries.length; i++) {
    const [key, data] = entries[i];
    if (!data) continue;
    if (data.type === "attack") {
      return {
        index: i,
        key,
        data,
        all: clone
      };
    }
  }

  return null;
}

/* ---------------- API pública: instalar / remover ---------------- */

/**
 * Instala uma runa no item.
 * - item: arma (Item)
 * - rune: item de runa (Item) com flags do módulo
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

  // evita duplicar mesma combinação subtype+tier
  if (
    current.some(
      (r) =>
        r.runeSubtype === runeData.runeSubtype &&
        r.runeTier === runeData.runeTier
    )
  ) {
    return { ok: false, reason: "RUNE_ALREADY_INSTALLED" };
  }

  const updated = [...current, runeData];
  await setItemRunes(item, updated);

  await applyRuneEffectsToItem(item);

  return {
    ok: true,
    reason: "INSTALLED",
    added: runeData,
    total: updated.length,
  };
}

/**
 * Remove uma runa do item, comparando category+subtype+tier.
 */
export async function removeRuneFromItem(item, runeData) {
  if (!item || !runeData) {
    return { ok: false, reason: "MISSING_ITEM_OR_RUNE" };
  }

  const current = getItemRunes(item);
  const filtered = current.filter(
    (r) =>
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
    total: filtered.length,
  };
}

/* ---------------- Aplicar efeitos nas Activities ---------------- */

/**
 * Recalcula as Activities da arma com base nas runas instaladas.
 *
 * MVP: só Precision Rune
 * - soma bônus de ataque em attack.bonus
 * - preserva o bônus base original numa flag
 */
export async function applyRuneEffectsToItem(item) {
  if (!item) return;

  const runes = getItemRunes(item);
  const actInfo = getPrimaryAttackActivity(item);

  if (!actInfo) {
    console.warn("[MHH][Runes] Nenhuma Activity de ataque encontrada para o item", item.name, item);
    return;
  }

  const { data, all } = actInfo;

  data.attack = data.attack ?? {};

  // bônus atual (string → número)
  const currentBonus = Number(data.attack.bonus || 0) || 0;

  // garante que temos guardado o valor base original
  const baseBonus = await ensureBaseAttackBonus(item, currentBonus);

  // soma todos os bônus de Precision
  let precisionBonus = 0;
  for (const r of runes) {
    if (r?.runeSubtype === "precision") {
      precisionBonus += tierToBonus(r.runeTier);
    }
  }

  const finalBonus = baseBonus + precisionBonus;
  data.attack.bonus = finalBonus ? String(finalBonus) : "";

  // agora reescreve de volta em system.activities,
  // respeitando se era array ou objeto
  if (Array.isArray(item.system.activities)) {
    const acts = all;
    acts[actInfo.index] = data;
    await item.update({ "system.activities": acts });
  } else {
    const acts = all;
    acts[actInfo.key] = data;
    await item.update({ "system.activities": acts });
  }
}
