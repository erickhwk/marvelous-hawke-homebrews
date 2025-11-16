// scripts/features/runes/service.js

import { MODULE_ID } from "../../core/constants.js";

/**
 * Estrutura esperada em item.flags[MODULE_ID].runes:
 * [
 *   { runeCategory: "offensive", runeSubtype: "precision", runeTier: "lesser" },
 *   ...
 * ]
 *
 * Também guardamos:
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
  // MVP: só armas
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
 * Pega as activities cruas do _source como objeto { id: data }.
 */
function getActivitiesSource(item) {
  const src = item._source?.system?.activities ?? {};
  return foundry.utils.duplicate(src);
}

/**
 * Acha a activity de ataque no _source.
 * Retorna { id, data, all } onde:
 * - id   → ID da activity ("BFZXotvvF4YaAKeT")
 * - data → objeto da activity (editável)
 * - all  → objeto completo de activities (pra regravar depois)
 */
function getPrimaryAttackActivitySource(item) {
  const all = getActivitiesSource(item);
  const entries = Object.entries(all);

  for (const [id, data] of entries) {
    if (!data) continue;
    if (data.type === "attack") {
      console.log("[MHH][Runes] usando activity de ataque", id, data);
      return { id, data, all };
    }
  }

  console.warn("[MHH][Runes] nenhuma activity type 'attack' em", item.name, all);
  return null;
}

/* ---------------- API pública: instalar / remover ---------------- */

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
 * - preserva o bônus base original em baseAttackBonus
 */
export async function applyRuneEffectsToItem(item) {
  if (!item) return;

  const runes   = getItemRunes(item);
  const actInfo = getPrimaryAttackActivitySource(item);

  if (!actInfo) {
    return; // já logamos dentro do helper
  }

  const { id, data, all } = actInfo;

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

  all[id] = data;

  console.log("[MHH][Runes] aplicando bonus de ataque", {
    item: item.name,
    baseBonus,
    precisionBonus,
    finalBonus,
    activityId: id,
    activity: data
  });

  // regrava o objeto completo de activities no item
  await item.update({
    "system.activities": all,
  });
}
