// scripts/features/runes/service.js

import { MODULE_ID } from "../../core/constants.js";

/**
 * Estrutura esperada em item.flags[MODULE_ID].runes:
 * [
 *   {
 *     runeCategory: "offensive",
 *     runeSubtype: "precision" | "damage" | "elemental",
 *     runeTier: "lesser" | "greater" | "major",
 *     runeDamageType?: "fire" | "cold" | "acid" | "lightning" | ...
 *   },
 *   ...
 * ]
 *
 * Flags extras no item:
 * - baseAttackBonus  → bônus base original em attack.bonus
 * - baseDamageBonus  → bônus base original em damage.parts[0].bonus
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

async function ensureBaseDamageBonus(item, baseValue) {
  const existing = await item.getFlag(MODULE_ID, "baseDamageBonus");
  if (existing === undefined) {
    await item.setFlag(MODULE_ID, "baseDamageBonus", baseValue);
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

/**
 * lesser → d4, greater → d6, major → d8
 * usado para runas elementais
 */
function tierToDie(tier) {
  switch (tier) {
    case "greater": return "d6";
    case "major":   return "d8";
    case "lesser":
    default:        return "d4";
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
 */
function getPrimaryAttackActivitySource(item) {
  const all = getActivitiesSource(item);
  const entries = Object.entries(all);

  for (const [id, data] of entries) {
    if (!data) continue;
    if (data.type === "attack") {
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

export async function applyRuneEffectsToItem(item) {
  if (!item) return;

  const runes   = getItemRunes(item);
  const actInfo = getPrimaryAttackActivitySource(item);

  if (!actInfo) return;

  const { id, data, all } = actInfo;

  data.attack = data.attack ?? {};
  data.damage = data.damage ?? { includeBase: true, parts: [] };

  // ---------- PRECISION: bônus de ataque ----------
  const currentAtkBonus = Number(data.attack.bonus || 0) || 0;
  const baseAttackBonus = await ensureBaseAttackBonus(item, currentAtkBonus);

  let precisionBonus = 0;
  for (const r of runes) {
    if (r?.runeSubtype === "precision") {
      precisionBonus += tierToBonus(r.runeTier);
    }
  }
  const finalAttackBonus = baseAttackBonus + precisionBonus;
  data.attack.bonus = finalAttackBonus ? String(finalAttackBonus) : "";

  // ---------- DAMAGE: bônus fixo no primeiro damage part ----------
  const parts = Array.isArray(data.damage.parts)
    ? foundry.utils.duplicate(data.damage.parts)
    : [];

  // garante que temos ao menos 1 parte de dano pra aplicar bônus fixo
  if (!parts[0]) {
    parts[0] = {
      number: 1,
      denomination: "d6", // fallback seguro; não mexe no dado base da arma
      bonus: "",
      types: [],
    };
  }

  const currentDmgBonus = Number(parts[0].bonus || 0) || 0;
  const baseDamageBonus = await ensureBaseDamageBonus(item, currentDmgBonus);

  let flatDamageBonus = 0;
  for (const r of runes) {
    if (r?.runeSubtype === "damage") {
      flatDamageBonus += tierToBonus(r.runeTier);
    }
  }

  const finalDamageBonus = baseDamageBonus + flatDamageBonus;
  parts[0].bonus = finalDamageBonus ? String(finalDamageBonus) : "";

  // ---------- ELEMENTAL: parte extra de dano ----------
  const elementalParts = [];
  for (const r of runes) {
    if (r?.runeSubtype === "elemental") {
      const die  = tierToDie(r.runeTier);
      const type = r.runeDamageType || "fire";

      elementalParts.push({
        number: 1,
        denomination: die,
        bonus: "",
        types: [type],
      });
    }
  }

  data.damage.parts = [...parts, ...elementalParts];

  // grava de volta
  all[id] = data;

  console.log("[MHH][Runes] applyRuneEffectsToItem", {
    item: item.name,
    runes,
    baseAttackBonus,
    finalAttackBonus,
    baseDamageBonus,
    flatDamageBonus,
    elementalParts,
    activityId: id,
    activity: data
  });

  await item.update({
    "system.activities": all,
  });
}
