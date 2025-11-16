import { MODULE_ID, FLAGS } from "../../core/constants.js";
import { getFlag, setFlag } from "../../core/utils.js";

const TIER_ORDER = ["lesser", "greater", "major"];

function tierRank(tier) {
  const i = TIER_ORDER.indexOf(String(tier));
  return i >= 0 ? i : 0;
}

/* ============================================================================================
 * Helpers
 * ==========================================================================================*/

/**
 * Retorna estrutura:
 *   [ { uuid, runeCategory, runeSubtype, runeTier, runeDamageType }, ... ]
 */
export function getItemRunes(item) {
  const arr = getFlag(item, "runes") ?? [];
  return Array.isArray(arr) ? arr : [];
}

export async function setItemRunes(item, list) {
  return setFlag(item, "runes", list ?? []);
}

/** Converter tier → bônus */
function tierToBonus(tier) {
  switch (tier) {
    case "greater": return 2;
    case "major":   return 3;
    case "lesser":
    default:        return 1;
  }
}

/** Converter tier → dado numérico (d4/d6/d8) */
function tierToDenomination(tier) {
  switch (tier) {
    case "greater": return 6; // d6
    case "major":   return 8; // d8
    case "lesser":
    default:        return 4; // d4
  }
}

/**
 * Retorna a activity principal de ataque do item em:
 * {
 *   id,
 *   data,
 *   all
 * }
 */
export function getPrimaryAttackActivitySource(item) {
  const entries = item._source?.system?.activities;
  if (!entries) return null;

  for (const [id, data] of Object.entries(entries)) {
    if (data.type === "attack") {
      return { id, data: foundry.utils.duplicate(data), all: foundry.utils.duplicate(entries) };
    }
  }
  return null;
}

/* ============================================================================================
 * Instalar / remover runas
 * ==========================================================================================*/

export async function installRuneOnItem(item, runeItem) {
  if (!item || !runeItem) return { ok: false, reason: "NO_ITEM" };

  // Lê a runa a partir dos flags do próprio item de runa
  const newRune = {
    runeCategory:   runeItem.getFlag(MODULE_ID, "runeCategory"),
    runeSubtype:    runeItem.getFlag(MODULE_ID, "runeSubtype"),
    runeTier:       runeItem.getFlag(MODULE_ID, "runeTier") ?? "lesser",
    runeDamageType: runeItem.getFlag(MODULE_ID, "runeDamageType") ?? "fire",
  };

  if (!newRune.runeSubtype) {
    return { ok: false, reason: "INVALID_RUNE_DATA" };
  }

  const runes = getItemRunes(item) ?? [];

  // Procura se já existe uma runa desse subtipo na arma
  const idxSameSubtype = runes.findIndex(r => r?.runeSubtype === newRune.runeSubtype);

  if (idxSameSubtype >= 0) {
    const existing = runes[idxSameSubtype];
    const oldRank  = tierRank(existing.runeTier);
    const newRank  = tierRank(newRune.runeTier);

    // nova é pior ou igual → não substitui
    if (newRank <= oldRank) {
      return {
        ok: false,
        reason: "RUNE_WEAKER_OR_EQUAL_EXISTS",
        existing,
        total: runes.length
      };
    }

    // nova é melhor → substitui a antiga
    runes[idxSameSubtype] = newRune;
    await setItemRunes(item, runes);
    await applyRuneEffectsToItem(item);

    return {
      ok: true,
      reason: "REPLACED_WEAKER",
      replaced: existing,
      added: newRune,
      total: runes.length
    };
  }

  // Não havia runa desse subtipo: adiciona normalmente
  runes.push(newRune);
  await setItemRunes(item, runes);
  await applyRuneEffectsToItem(item);

  return {
    ok: true,
    reason: "INSTALLED",
    added: newRune,
    total: runes.length
  };
}

export async function removeAllRunesFromItem(item) {
  await setItemRunes(item, []);
  await applyRuneEffectsToItem(item);
}

/* ============================================================================================
 * Aplicação das Runas (Activity-based)
 * ==========================================================================================*/

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

  // base = 0; só as runas definem bônus
  data.attack.bonus = precisionBonus ? String(precisionBonus) : "";

  /* ---------- Construir lista NOVA de damage.parts ---------- */
  // Regra: parts representa apenas dano EXTRA.
  const parts = [];

  /* ---------- DAMAGE: bônus fixo (+1/+2/+3) ---------- */

  let flatDamageBonus = 0;
  for (const r of runes) {
    if (r?.runeSubtype === "damage") {
      flatDamageBonus += tierToBonus(r.runeTier);
    }
  }

  if (flatDamageBonus) {
    parts.push({
      number: 1,
      denomination: null,       // flat, sem dado
      bonus: String(flatDamageBonus),
      types: [],
      custom: { enabled: false },
      scaling: { number: 1 }
    });
  }

  /* ---------- ELEMENTAL: 1d4/1d6/1d8 tipo X ---------- */

  const elementalParts = [];

  for (const r of runes) {
    if (r?.runeSubtype !== "elemental") continue;

    const denom = tierToDenomination(r.runeTier); // 4 / 6 / 8
    const type  = r.runeDamageType || "fire";

    elementalParts.push({
      number: 1,
      denomination: denom,
      bonus: "",
      types: [type],
      custom: { enabled: false },
      scaling: { number: 1 }
    });
  }

  data.damage.parts = [...parts, ...elementalParts];

  /* ---------- Atualizar activity ---------- */

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
    "system.activities": all
  });
}


