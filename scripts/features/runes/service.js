// scripts/features/runes/service.js

import { MODULE_ID, FLAGS } from "../../core/constants.js";

// -----------------------------------------------------------------------------
// Constantes / helpers de tiers e compatibilidade
// -----------------------------------------------------------------------------

const ITEM_RUNES_KEY    = FLAGS.ITEM_RUNES        ?? "runes";
const AE_RUNES_DEF_MARK = FLAGS.AE_RUNES_DEF_MARK ?? "mhhRunesDefEffect";
const SOCKET_FLAG       = FLAGS.RUNE_SOCKET_HOST  ?? "runeHost";

const TIER_ORDER = ["lesser", "greater", "major"];

function tierRank(tier) {
  const i = TIER_ORDER.indexOf(String(tier));
  return i >= 0 ? i : 0;
}

function tierToBonus(tier) {
  switch (tier) {
    case "greater": return 2;
    case "major":   return 3;
    case "lesser":
    default:        return 1;
  }
}

function tierToDenomination(tier) {
  // dano elemental: d4 / d6 / d8
  switch (tier) {
    case "greater": return 6; // d6
    case "major":   return 8; // d8
    case "lesser":
    default:        return 4; // d4
  }
}

function isItemEquipped(item) {
  const eq = item.system?.equipped;
  if (typeof eq === "boolean") return eq;
  if (eq && typeof eq === "object") return !!eq.value;
  return false;
}

function itemIsWeapon(item) {
  return item?.type === "weapon";
}

function itemIsArmorLike(item) {
  if (item?.type !== "equipment") return false;
  const sys = item.system ?? {};

  // armadura/escudo do dnd5e geralmente tem system.armor
  if (sys.armor) return true;

  const eqType = sys.equipmentType ?? sys.type?.value;
  if (!eqType) return false;
  const s = String(eqType).toLowerCase();
  return s.includes("armor") || s.includes("shield");
}

function itemSupportsRuneCategory(item, category) {
  if (!category) return true; // se não setou, não bloqueia (erro de setup)
  if (category === "offensive") return itemIsWeapon(item);
  if (category === "defensive") return itemIsArmorLike(item);
  return true;
}

// -----------------------------------------------------------------------------
// Flags de runas em itens
// -----------------------------------------------------------------------------

export function getItemRunes(item) {
  const arr = item?.getFlag(MODULE_ID, ITEM_RUNES_KEY) ?? [];
  return Array.isArray(arr) ? arr : [];
}

export async function setItemRunes(item, list) {
  const old = getItemRunes(item);
  const next = Array.isArray(list) ? list : [];

  // Descobrir quais runas foram removidas (por sourceUuid)
  const removed = old.filter(o =>
    o?.runeSourceUuid &&
    !next.some(n => n?.runeSourceUuid === o.runeSourceUuid)
  );

  for (const r of removed) {
    try {
      const runeDoc = await fromUuid(r.runeSourceUuid);
      if (!runeDoc) continue;
      // Só limpa se ela estava marcada como encaixada neste item
      const host = runeDoc.getFlag(MODULE_ID, SOCKET_FLAG);
      if (host === item.uuid) {
        await runeDoc.unsetFlag(MODULE_ID, SOCKET_FLAG);
      }
    } catch (err) {
      console.warn("[MHH][Runes] Falha ao limpar socket da runa removida", r, err);
    }
  }

  return item.setFlag(MODULE_ID, ITEM_RUNES_KEY, next);
}

// -----------------------------------------------------------------------------
// Activities de ataque (armas)
// -----------------------------------------------------------------------------

export function getPrimaryAttackActivitySource(item) {
  const activities = item._source?.system?.activities;
  if (!activities) return null;

  for (const [id, data] of Object.entries(activities)) {
    if (data?.type === "attack") {
      return {
        id,
        data: foundry.utils.duplicate(data),
        all:  foundry.utils.duplicate(activities)
      };
    }
  }

  console.warn("[MHH][Runes] Nenhuma Activity de ataque encontrada para o item", item);
  return null;
}

// -----------------------------------------------------------------------------
// Aplicar efeitos ofensivos (weapon activities)
// -----------------------------------------------------------------------------

export async function applyRuneEffectsToItem(item) {
  if (!item) return;

  const runes   = getItemRunes(item);
  const actInfo = getPrimaryAttackActivitySource(item);
  if (!actInfo) return;

  const { id, data, all } = actInfo;

  data.attack = data.attack ?? {};
  data.damage = data.damage ?? { includeBase: true, parts: [] };

  // -------- Precision → attack.bonus --------
  let precisionBonus = 0;
  for (const r of runes) {
    if (!r) continue;
    if (r.runeSubtype === "precision") {
      precisionBonus += tierToBonus(r.runeTier);
    }
  }
  data.attack.bonus = precisionBonus ? String(precisionBonus) : "";

  // -------- Damage / Elemental → damage.parts --------
  // Regra: parts representa APENAS dano extra (base vem de includeBase).

  const parts = [];

  // Damage: bônus fixo
  let flatDamageBonus = 0;
  for (const r of runes) {
    if (!r) continue;
    if (r.runeSubtype === "damage") {
      flatDamageBonus += tierToBonus(r.runeTier);
    }
  }
  if (flatDamageBonus) {
    parts.push({
      number: 1,
      denomination: null,              // bônus fixo, sem dado
      bonus: String(flatDamageBonus),
      types: [],
      custom: { enabled: false },
      scaling: { number: 1 }
    });
  }

  // Elemental: 1d4/1d6/1d8 do tipo X
  const elementalParts = [];
  for (const r of runes) {
    if (!r) continue;
    if (r.runeSubtype !== "elemental") continue;

    const denom = tierToDenomination(r.runeTier);
    const type  = r.runeDamageType || "fire";

    elementalParts.push({
      number: 1,
      denomination: denom,             // 4 → d4, 6 → d6, 8 → d8
      bonus: "",
      types: [type],
      custom: { enabled: false },
      scaling: { number: 1 }
    });
  }

  data.damage.parts = [...parts, ...elementalParts];

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

  await item.update({ "system.activities": all });
}

// -----------------------------------------------------------------------------
// Runas defensivas → ActiveEffect no actor
// -----------------------------------------------------------------------------

export async function applyDefensiveRunesToActor(actor) {
  if (!actor) return;

  // remove AE anterior de runas defensivas
  const prev = actor.effects.find(e => e.getFlag(MODULE_ID, AE_RUNES_DEF_MARK));
  if (prev) await prev.delete();

  let acBonus   = 0; // reinforcement
  let saveBonus = 0; // protection

  for (const item of actor.items) {
    if (!isItemEquipped(item)) continue;

    const runes = getItemRunes(item);
    for (const r of runes) {
      if (!r || r.runeCategory !== "defensive") continue;

      const bonus = tierToBonus(r.runeTier);

      if (r.runeSubtype === "reinforcement") {
        acBonus += bonus;
      } else if (r.runeSubtype === "protection") {
        saveBonus += bonus;
      }
    }
  }

  const changes = [];

  if (acBonus) {
    changes.push({
      key: "system.attributes.ac.bonus",
      mode: foundry.CONST.ACTIVE_EFFECT_MODES.ADD,
      value: `+${acBonus}`
    });
  }

  if (saveBonus) {
    changes.push({
      key: "system.bonuses.abilities.save",
      mode: foundry.CONST.ACTIVE_EFFECT_MODES.ADD,
      value: `+${saveBonus}`
    });
  }

  if (!changes.length) return;

  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: "Runes (defensive)",
    icon: "icons/magic/defensive/shield-barrier-glowing-blue.webp",
    origin: actor.uuid,
    disabled: false,
    changes,
    flags: {
      [MODULE_ID]: {
        [AE_RUNES_DEF_MARK]: true
      }
    }
  }]);
}

// -----------------------------------------------------------------------------
// Instalar / remover runas em itens
// -----------------------------------------------------------------------------

export async function installRuneOnItem(item, runeItem) {
  if (!item || !runeItem) {
    return { ok: false, reason: "NO_ITEM" };
  }

  // Dados da runa a partir dos flags do item de runa
  const subtype  = runeItem.getFlag(MODULE_ID, "runeSubtype");
  const category = runeItem.getFlag(MODULE_ID, "runeCategory");
  const tier     = runeItem.getFlag(MODULE_ID, "runeTier") ?? "lesser";

  if (!subtype) {
    return { ok: false, reason: "INVALID_RUNE_DATA" };
  }

  // Valida compatibilidade item x categoria
  if (!itemSupportsRuneCategory(item, category)) {
    return { ok: false, reason: "ITEM_NOT_COMPATIBLE" };
  }

  // Verificar se esta runa JÁ está encaixada em outro item
  const currentHost = runeItem.getFlag(MODULE_ID, SOCKET_FLAG);
  if (currentHost && currentHost !== item.uuid) {
    // Já está encaixada em outro equipamento
    return {
      ok: false,
      reason: "RUNE_ALREADY_SOCKETED",
      host: currentHost
    };
  }

  // runeDamageType só faz sentido para runas elementais
  let runeDamageType = runeItem.getFlag(MODULE_ID, "runeDamageType");
  if (subtype === "elemental") {
    runeDamageType = runeDamageType || "fire";
  } else {
    runeDamageType = undefined;
  }

  const newRune = {
    runeCategory:   category,
    runeSubtype:    subtype,
    runeTier:       tier,
    runeSourceUuid: runeItem.uuid
  };
  if (runeDamageType !== undefined) {
    newRune.runeDamageType = runeDamageType;
  }

  const runes = getItemRunes(item);

  // Regra: 1 runa por subtipo
  const idxSameSubtype = runes.findIndex(r => r?.runeSubtype === newRune.runeSubtype);

  if (idxSameSubtype >= 0) {
    const existing = runes[idxSameSubtype];
    const oldRank  = tierRank(existing.runeTier);
    const newRank  = tierRank(newRune.runeTier);

    // nova runa é pior ou igual → não substitui
    if (newRank <= oldRank) {
      return {
        ok: false,
        reason: "RUNE_WEAKER_OR_EQUAL_EXISTS",
        existing,
        total: runes.length
      };
    }

    // nova é melhor → substitui
    runes[idxSameSubtype] = newRune;
    await setItemRunes(item, runes);

    // se a runa antiga tinha sourceUuid, limpa o host dela
    if (existing?.runeSourceUuid) {
      try {
        const oldRuneDoc = await fromUuid(existing.runeSourceUuid);
        if (oldRuneDoc) {
          const host = oldRuneDoc.getFlag(MODULE_ID, SOCKET_FLAG);
          if (host === item.uuid) {
            await oldRuneDoc.unsetFlag(MODULE_ID, SOCKET_FLAG);
          }
        }
      } catch (err) {
        console.warn("[MHH][Runes] Falha ao limpar host da runa substituída", existing, err);
      }
    }

    // marca a nova runa como encaixada neste item
    await runeItem.setFlag(MODULE_ID, SOCKET_FLAG, item.uuid);

    await applyRuneEffectsToItem(item);
    const actor = item.parent;
    if (actor) await applyDefensiveRunesToActor(actor);

    return {
      ok: true,
      reason: "REPLACED_WEAKER",
      replaced: existing,
      added: newRune,
      total: runes.length
    };
  }

  // não havia runa desse subtipo ainda → adiciona
  runes.push(newRune);
  await setItemRunes(item, runes);

  // marca a nova runa como encaixada neste item
  await runeItem.setFlag(MODULE_ID, SOCKET_FLAG, item.uuid);

  await applyRuneEffectsToItem(item);

  const actor = item.parent;
  if (actor) await applyDefensiveRunesToActor(actor);

  return {
    ok: true,
    reason: "INSTALLED",
    added: newRune,
    total: runes.length
  };
}


export async function removeAllRunesFromItem(item) {
  if (!item) return;

  await setItemRunes(item, []);
  await applyRuneEffectsToItem(item);

  const actor = item.parent;
  if (actor) await applyDefensiveRunesToActor(actor);
}
