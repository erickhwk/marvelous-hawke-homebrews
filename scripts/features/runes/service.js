// scripts/features/runes/service.js
import { MODULE_ID, FLAGS, V } from "../../core/constants.js";
import { path } from "../../core/utils.js";

/* ------------------------------------------------------------------------- */
/*  Helpers gerais                                                           */
/* ------------------------------------------------------------------------- */

const TIER_ORDER = ["lesser", "greater", "major"];

function tierRank(t) {
  const i = TIER_ORDER.indexOf(String(t || "").toLowerCase());
  return i < 0 ? 0 : i;
}

function tierToBonus(tier) {
  switch (String(tier || "").toLowerCase()) {
    case "greater": return 2;
    case "major":   return 3;
    case "lesser":
    default:        return 1;
  }
}

function tierToDie(tier) {
  switch (String(tier || "").toLowerCase()) {
    case "greater": return 6;
    case "major":   return 8;
    case "lesser":
    default:        return 4;
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
  if (sys.armor) return true;

  const eqType = sys.equipmentType ?? sys.type?.value;
  if (!eqType) return false;
  const s = String(eqType).toLowerCase();
  return s.includes("armor") || s.includes("shield");
}

function itemIsFocusLike(item) {
  // tratamos qualquer equipment que NÃO seja armor/escudo como foco
  return item?.type === "equipment" && !itemIsArmorLike(item);
}

/* ------------------------------------------------------------------------- */
/*  Slots por raridade                                                       */
/* ------------------------------------------------------------------------- */

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

/**
 * Common:        0 slots
 * Uncommon/Rare: 1 slot
 * Very Rare:     2 slots
 * Legendary:     3 slots
 */
export function getMaxRuneSlots(item) {
  const rarityRaw = path(item, "system.rarity") ?? "common";
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

/* ------------------------------------------------------------------------- */
/*  Suporte de categoria/subtipo por tipo de item                            */
/* ------------------------------------------------------------------------- */

export function itemSupportsRuneCategory(item, category, subtype) {
  category = String(category || "").toLowerCase();
  subtype  = String(subtype  || "").toLowerCase();

  // normaliza subtipo pra evitar variações
  const normSub = subtype.replace(/[\s_]+/g, "-"); // "Arcane Precision" → "arcane-precision"

  if (category === "offensive") {
    // Runas ofensivas de arma
    if (["precision", "damage", "elemental"].includes(normSub)) {
      return itemIsWeapon(item);
    }

    // Runas arcanas: SÓ foco ("foc"), não-armor
    if (["arcane-precision", "arcane-oppression"].includes(normSub)) {
      return itemIsFocusLike(item);
    }

    // fallback conservador: se subtipo ofensivo desconhecido, só deixamos em arma
    return itemIsWeapon(item);
  }

  if (category === "defensive") {
    // defensivas: armor/shield
    return itemIsArmorLike(item);
  }

  // categoria desconhecida → não suporta
  return false;
}

/* ------------------------------------------------------------------------- */
/*  Leitura / escrita de runas no item                                       */
/* ------------------------------------------------------------------------- */

/**
 * Estrutura em FLAGS.ITEM_RUNES:
 * [
 *   {
 *     runeCategory: "offensive" | "defensive",
 *     runeSubtype:  "precision" | "damage" | "elemental" | "reinforcement" | "protection" | ...
 *     runeTier:     "lesser" | "greater" | "major",
 *     runeDamageType?: "fire" | "cold" | ...,
 *     runeSourceUuid: "uuid do item de runa"
 *   },
 *   ...
 * ]
 */

export function getItemRunes(item) {
  if (!item) return [];
  const list = item.getFlag(MODULE_ID, FLAGS.ITEM_RUNES);
  if (!Array.isArray(list)) return [];
  return list.filter(r => r && typeof r.runeSubtype === "string");
}

export async function setItemRunes(item, entries) {
  const clean = (entries ?? []).filter(r => r && typeof r.runeSubtype === "string");
  return item.setFlag(MODULE_ID, FLAGS.ITEM_RUNES, clean);
}

/* ------------------------------------------------------------------------- */
/*  Activities de arma (ofensivas)                                           */
/* ------------------------------------------------------------------------- */

function getPrimaryAttackActivitySource(item) {
  const coll = item.system?.activities;
  if (!coll) return null;

  // coll é ActivityCollection
  let attackActivity = null;
  for (const act of coll) {
    if (act?.type === "attack") {
      attackActivity = act;
      break;
    }
  }
  if (!attackActivity) return null;

  // usamos o _source para garantir que é compatível com system.activities
  return foundry.utils.duplicate(attackActivity._source ?? attackActivity);
}

// flags internas só deste arquivo (não estão em constants)
const FLAG_BASE_ATTACK_BONUS   = "baseAttackBonus";
const FLAG_BASE_DAMAGE_BONUS   = "baseDamageBonus";
const FLAG_BASE_ELEMENTAL_PARTS = "baseElementalParts";

/**
 * Aplica runas OFENSIVAS diretamente na activity de ataque da arma.
 * - precision: bônus de ataque
 * - damage:    bônus fixo de dano
 * - elemental: adiciona dado elemental
 *
 * Para armaduras/focos, esta função é ignorada (efeitos vão pro ator).
 */
export async function applyRuneEffectsToItem(item) {
  if (!item) return;

  // Só armas têm activity de ataque relevante
  if (!itemIsWeapon(item)) {
    console.debug("[MHH][Runes] applyRuneEffectsToItem ignorado para item não-arma:", item.name);
    return;
  }

  // Lê runas instaladas
  const runes = getItemRunes(item).filter(r => r.runeCategory === "offensive");
  const attackSrc = getPrimaryAttackActivitySource(item);
  if (!attackSrc) {
    console.warn("[MHH][Runes] Nenhuma Activity de ataque encontrada para o item", item);
    return;
  }

  // Baseline: atac + dano + partes elementais NÃO vindas de runa
  let baseAttackBonus  = item.getFlag(MODULE_ID, FLAG_BASE_ATTACK_BONUS);
  let baseDamageBonus  = item.getFlag(MODULE_ID, FLAG_BASE_DAMAGE_BONUS);
  let baseElementParts = item.getFlag(MODULE_ID, FLAG_BASE_ELEMENTAL_PARTS);

  if (baseAttackBonus === undefined || baseDamageBonus === undefined || !Array.isArray(baseElementParts)) {
    const dmgParts = Array.isArray(attackSrc.damage?.parts) ? attackSrc.damage.parts : [];

    baseAttackBonus  = Number(attackSrc.attack?.bonus || 0) || 0;
    baseDamageBonus  = Number(dmgParts[0]?.bonus || 0) || 0;
    baseElementParts = dmgParts.slice(1); // tudo além do primeiro dano "base"

    await item.setFlag(MODULE_ID, FLAG_BASE_ATTACK_BONUS, baseAttackBonus);
    await item.setFlag(MODULE_ID, FLAG_BASE_DAMAGE_BONUS, baseDamageBonus);
    await item.setFlag(MODULE_ID, FLAG_BASE_ELEMENTAL_PARTS, baseElementParts);
  }

  let finalAttackBonus = baseAttackBonus;
  let flatDamageBonus  = baseDamageBonus;
  const extraElementalParts = [];

  for (const r of runes) {
    if (!r) continue;
    const tier  = r.runeTier ?? "lesser";
    const bonus = tierToBonus(tier);
    const sub   = String(r.runeSubtype || "").toLowerCase();

    switch (sub) {
      case "precision":
        finalAttackBonus += bonus;
        break;

      case "damage":
        flatDamageBonus += bonus;
        break;

      case "elemental": {
        const dmgType = r.runeDamageType || "fire";
        extraElementalParts.push({
          bonus: "",
          custom: { enabled: false },
          denomination: tierToDie(tier),
          number: 1,
          scaling: { number: 1 },
          types: [dmgType]
        });
        break;
      }

      default:
        break;
    }
  }

  // Construímos nova activity a partir do baseline
  const activity = foundry.utils.duplicate(attackSrc);

  // Attack bonus
  activity.attack = activity.attack || {};
  activity.attack.bonus = String(finalAttackBonus || "");

  // Damage parts
  const basePart = Array.isArray(attackSrc.damage?.parts) && attackSrc.damage.parts[0]
    ? foundry.utils.duplicate(attackSrc.damage.parts[0])
    : {
        bonus: "",
        custom: { enabled: false },
        denomination: 8,
        number: 1,
        scaling: { number: 1 },
        types: []
      };

  basePart.bonus = String(flatDamageBonus || "");

  const parts = [basePart];

  // Reaplicamos os danos elementais "nativos" do item
  if (Array.isArray(baseElementParts) && baseElementParts.length) {
    for (const p of baseElementParts) {
      parts.push(foundry.utils.duplicate(p));
    }
  }

  // E então as partes criadas pelas runas elementais
  for (const p of extraElementalParts) {
    parts.push(foundry.utils.duplicate(p));
  }

  activity.damage = activity.damage || {};
  activity.damage.includeBase = activity.damage.includeBase ?? true;
  activity.damage.parts = parts;

  // Atualiza system.activities no item
  const activitiesData = foundry.utils.duplicate(path(item, "_source.system.activities") ?? {});
  activitiesData[activity._id] = activity;

  await item.update({ "system.activities": activitiesData });
}

/* ------------------------------------------------------------------------- */
/*  Efeitos defensivos / arcanos no ATOR                                     */
/* ------------------------------------------------------------------------- */

export async function applyDefensiveRunesToActor(actor) {
  if (!actor) return;

  // Remove TODOS os efeitos antigos de runas defensivas/arcanas deste ator
  const prev = actor.effects.filter(e =>
    e.getFlag(MODULE_ID, FLAGS.AE_RUNES_DEF_MARK) === true
  );
  if (prev.length) {
    await actor.deleteEmbeddedDocuments(
      "ActiveEffect",
      prev.map(e => e.id)
    );
  }

  let acBonus          = 0;
  let saveBonus        = 0;
  let spellAttackBonus = 0;
  let spellDcBonus     = 0;

  // Varrendo apenas itens equipados
  for (const item of actor.items) {
    if (!isItemEquipped(item)) continue;

    const runes = getItemRunes(item);
    if (!Array.isArray(runes) || !runes.length) continue;

    for (const r of runes) {
      if (!r) continue;

      const tier  = r.runeTier ?? "lesser";
      const bonus = tierToBonus(tier);
      const cat   = String(r.runeCategory || "").toLowerCase();
      const sub   = String(r.runeSubtype  || "").toLowerCase();

      // ---- DEFENSIVAS: armaduras / escudos ----
      if (cat === "defensive") {
        if (sub === "reinforcement") {
          acBonus += bonus;
        }
        if (sub === "protection") {
          saveBonus += bonus;
        }
      }

      // ---- ARCANAS: em focos, mas categoria continua sendo "offensive" ----
      if (cat === "offensive" && itemIsFocusLike(item)) {
        if (sub === "arcane-precision") {
          spellAttackBonus += bonus;
        }
        if (sub === "arcane-oppression") {
          spellDcBonus += bonus;
        }
      }
    }
  }

  if (!acBonus && !saveBonus && !spellAttackBonus && !spellDcBonus) {
    console.debug("[MHH][Runes] applyDefensiveRunesToActor → nenhum bônus encontrado para", actor.name);
    return;
  }

  const changes = [];

  if (acBonus) {
    changes.push({
      key: "system.attributes.ac.bonus",
      mode: V.AE_ADD,
      value: String(acBonus)
    });
  }

  if (saveBonus) {
    changes.push({
      key: "system.bonuses.abilities.save",
      mode: V.AE_ADD,
      value: String(saveBonus)
    });
  }

  if (spellAttackBonus) {
    changes.push(
      {
        key: "system.bonuses.msak.attack",
        mode: V.AE_ADD,
        value: String(spellAttackBonus)
      },
      {
        key: "system.bonuses.rsak.attack",
        mode: V.AE_ADD,
        value: String(spellAttackBonus)
      }
    );
  }

  if (spellDcBonus) {
    changes.push({
      key: "system.bonuses.spell.dc",
      mode: V.AE_ADD,
      value: String(spellDcBonus)
    });
  }

  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: "Runes (defensive)",
    icon: "icons/magic/defensive/shield-barrier-glowing-triangle-blue.webp",
    origin: actor.uuid,
    disabled: false,
    changes,
    flags: {
      [MODULE_ID]: {
        [FLAGS.AE_RUNES_DEF_MARK]: true
      }
    }
  }]);

  console.debug("[MHH][Runes] applyDefensiveRunesToActor → criado AE para", actor.name,
    { acBonus, saveBonus, spellAttackBonus, spellDcBonus });
}

/* ------------------------------------------------------------------------- */
/*  Instalar / remover runas                                                 */
/* ------------------------------------------------------------------------- */

export async function installRuneOnItem(item, runeItem) {
  if (!item || !runeItem) {
    return { ok: false, reason: "NO_ITEM" };
  }

  const subtype  = runeItem.getFlag(MODULE_ID, FLAGS.RUNE_SUBTYPE);
  const category = runeItem.getFlag(MODULE_ID, FLAGS.RUNE_CATEGORY);
  const tier     = runeItem.getFlag(MODULE_ID, FLAGS.RUNE_TIER) ?? "lesser";

  if (!subtype) {
    return { ok: false, reason: "INVALID_RUNE_DATA" };
  }

  if (!itemSupportsRuneCategory(item, category, subtype)) {
    return { ok: false, reason: "ITEM_NOT_COMPATIBLE" };
  }

  // Verificar se a runa já está encaixada em outro item
  const currentHost = runeItem.getFlag(MODULE_ID, FLAGS.RUNE_SOCKET_HOST);
  if (currentHost && currentHost !== item.uuid) {
    return {
      ok: false,
      reason: "RUNE_ALREADY_SOCKETED",
      host: currentHost
    };
  }

  let runeDamageType = runeItem.getFlag(MODULE_ID, FLAGS.RUNE_DAMAGE_TYPE);
  if (String(subtype).toLowerCase() === "elemental") {
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

  // 1 runa por subtipo
  const idxSameSubtype = runes.findIndex(r => r?.runeSubtype === newRune.runeSubtype);

  if (idxSameSubtype >= 0) {
    const existing = runes[idxSameSubtype];
    const oldRank  = tierRank(existing.runeTier);
    const newRank  = tierRank(newRune.runeTier);

    if (newRank <= oldRank) {
      return {
        ok: false,
        reason: "RUNE_WEAKER_OR_EQUAL_EXISTS",
        existing,
        total: runes.length
      };
    }

    runes[idxSameSubtype] = newRune;
    await setItemRunes(item, runes);
    await runeItem.setFlag(MODULE_ID, FLAGS.RUNE_SOCKET_HOST, item.uuid);
    await applyRuneEffectsToItem(item);

    return {
      ok: true,
      reason: "REPLACED_WEAKER",
      replaced: existing,
      added: newRune,
      total: runes.length
    };
  }

  // slots máximos
  const maxSlots = getMaxRuneSlots(item);
  if (maxSlots <= 0) {
    return { ok: false, reason: "NO_RUNE_SLOTS" };
  }
  if (runes.length >= maxSlots) {
    return { ok: false, reason: "NO_FREE_RUNE_SLOT" };
  }

  runes.push(newRune);
  await setItemRunes(item, runes);
  await runeItem.setFlag(MODULE_ID, FLAGS.RUNE_SOCKET_HOST, item.uuid);
  await applyRuneEffectsToItem(item);

  return {
    ok: true,
    reason: "INSTALLED",
    added: newRune,
    total: runes.length
  };
}

/**
 * Remove runas do item.
 * - predicate: function(rune) → boolean, ou
 *   string com runeSourceUuid para remoção direta.
 */
export async function removeRuneFromItem(item, predicate) {
  const runes = getItemRunes(item);
  if (!runes.length) {
    return { ok: false, reason: "NO_RUNES" };
  }

  const removed = [];
  const keep    = [];

  for (const r of runes) {
    let match = false;
    if (!predicate) {
      match = true;
    } else if (typeof predicate === "function") {
      match = !!predicate(r);
    } else if (typeof predicate === "string") {
      match = r.runeSourceUuid === predicate;
    }

    if (match) removed.push(r);
    else keep.push(r);
  }

  if (!removed.length) {
    return { ok: false, reason: "NO_MATCH" };
  }

  await setItemRunes(item, keep);
  await applyRuneEffectsToItem(item);

  // Limpa o socket host das runas removidas
  for (const r of removed) {
    if (!r.runeSourceUuid) continue;
    try {
      const runeItem = await fromUuid(r.runeSourceUuid).catch(() => null);
      if (runeItem?.getFlag(MODULE_ID, FLAGS.RUNE_SOCKET_HOST) === item.uuid) {
        await runeItem.unsetFlag(MODULE_ID, FLAGS.RUNE_SOCKET_HOST);
      }
    } catch (e) {
      console.warn("[MHH][Runes] Falha ao limpar host da runa removida:", e);
    }
  }

  return { ok: true, reason: "REMOVED", removed, total: keep.length };
}
