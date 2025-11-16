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

const TIER_ORDER = ["lesser", "greater", "major"];

function tierRank(tier) {
  const i = TIER_ORDER.indexOf(String(tier));
  return i >= 0 ? i : 0;
}

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

  // 1 arma só pode ter 1 runa de cada SUBTYPE (precision, damage, elemental...)
  const idxSameSubtype = current.findIndex(
    (r) => r.runeSubtype === runeData.runeSubtype
  );

  if (idxSameSubtype >= 0) {
    const existing = current[idxSameSubtype];
    const newRank  = tierRank(runeData.runeTier);
    const oldRank  = tierRank(existing.runeTier);

    // nova é pior ou igual → não substitui
    if (newRank <= oldRank) {
      return {
        ok: false,
        reason: "RUNE_WEAKER_OR_EQUAL_EXISTS",
        existing
      };
    }

    // nova é MAIOR → substitui a antiga
    current[idxSameSubtype] = runeData;

    await setItemRunes(item, current);
    await applyRuneEffectsToItem(item);

    return {
      ok: true,
      reason: "REPLACED_WEAKER",
      replaced: existing,
      added: runeData,
      total: current.length
    };
  }

  // não existe nenhuma desse subtype ainda → adiciona
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

  /* ---------- PRECISION: bônus de ataque ---------- */

  let precisionBonus = 0;
  for (const r of runes) {
    if (r?.runeSubtype === "precision") {
      precisionBonus += tierToBonus(r.runeTier);
    }
  }

  // MVP: assume base 0. Se não tiver nenhuma precision, campo fica vazio.
  data.attack.bonus = precisionBonus ? String(precisionBonus) : "";

  /* ---------- DAMAGE: bônus fixo na 1ª parte ---------- */

  const parts = Array.isArray(data.damage.parts)
    ? foundry.utils.duplicate(data.damage.parts)
    : [];

  if (!parts[0]) {
    parts[0] = {
      number: 1,
      denomination: "d6",
      bonus: "",
      types: []
    };
  }

  let flatDamageBonus = 0;
  for (const r of runes) {
    if (r?.runeSubtype === "damage") {
      flatDamageBonus += tierToBonus(r.runeTier);
    }
  }

  parts[0].bonus = flatDamageBonus ? String(flatDamageBonus) : "";

  /* ---------- ELEMENTAL: partes extras ---------- */

  const elementalParts = [];
  for (const r of runes) {
    if (r?.runeSubtype === "elemental") {
      const die  = tierToDie(r.runeTier);
      const type = r.runeDamageType || "fire";

      const base = foundry.utils.duplicate(parts[0]);
      base.number       = 1;
      base.denomination = die;
      base.bonus        = "";
      base.types        = [type];

      elementalParts.push(base);
    }
  }

  data.damage.parts = [...parts, ...elementalParts];

  /* ---------- limpar flags de base se não houver mais runas ---------- */

  if (!runes.length) {
    // se quiser, pode simplesmente ignorar isso;
    // mantive só pra não deixar lixo se você já vinha usando base* antes.
    await item.unsetFlag(MODULE_ID, "baseAttackBonus");
    await item.unsetFlag(MODULE_ID, "baseDamageBonus");
  }

  all[id] = data;

  console.log("[MHH][Runes] applyRuneEffectsToItem", {
    item: item.name,
    runes,
    precisionBonus,
    flatDamageBonus,
    elementalParts,
    activityId: id,
    activity: data
  });

  await item.update({
    "system.activities": all,
  });
}

