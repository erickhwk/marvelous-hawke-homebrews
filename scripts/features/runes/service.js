// modules/marvelous-hawke-homebrews/scripts/features/runes/service.js

import { MODULE_ID, FLAGS, V } from "../../core/constants.js";

let DEFENSIVE_RUNE_LOCK = false;

/* -------------------------------------------- */
/*  Helpers utilitários                         */
/* -------------------------------------------- */

function sign(n) {
  const v = Number(n) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}

function getItemPropertiesArray(item) {
  const raw = item?.system?.properties;

  if (Array.isArray(raw)) return raw;
  if (raw instanceof Set) return Array.from(raw);

  return [];
}

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

function tierRank(tier) {
  const t = String(tier ?? "lesser").toLowerCase();
  if (t === "greater") return 2;
  if (t === "major" || t === "superior") return 3;
  return 1; // lesser / default
}

function tierToBonus(tier) {
  const t = String(tier ?? "lesser").toLowerCase();
  if (t === "greater") return 2;
  if (t === "major" || t === "superior") return 3;
  return 1; // lesser / default
}

function isItemEquipped(item) {
  const eq = item?.system?.equipped;
  if (typeof eq === "boolean") return eq;
  if (eq && typeof eq === "object") return !!eq.value;
  return false;
}

/* -------------------------------------------- */
/*  Slots de runa por raridade                  */
/* -------------------------------------------- */

/**
 * Quantidade máxima de runas que um item pode ter, baseado na raridade.
 *
 * Common        → 0 slots
 * Uncommon/Rare → 1 slot
 * Very Rare     → 2 slots
 * Legendary     → 3 slots
 */
export function getMaxRuneSlots(item) {
  const rarityRaw = item?.system?.rarity ?? "common";
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

/* -------------------------------------------- */
/*  Leitura / escrita de runas no item          */
/* -------------------------------------------- */

export function getItemRunes(item) {
  const list = item?.getFlag(MODULE_ID, FLAGS.ITEM_RUNES);
  if (!Array.isArray(list)) return [];
  return list.filter(r => r && typeof r === "object");
}

export async function setItemRunes(item, runes) {
  const clean = (runes ?? []).filter(r => r && typeof r === "object");
  return item.setFlag(MODULE_ID, FLAGS.ITEM_RUNES, clean);
}

/* -------------------------------------------- */
/*  Tipos de item (compatibilidade básica)      */
/* -------------------------------------------- */

function itemIsWeapon(item) {
  return item?.type === "weapon";
}

function itemIsArmorLike(item) {
  if (!item || item.type !== "equipment") return false;

  const sys   = item.system ?? {};
  const props = getItemPropertiesArray(item);

  const armorTypes = ["light", "medium", "heavy", "shield"];
  const typeValue  = sys.type?.value?.toLowerCase?.() ?? "";
  const baseItem   = sys.type?.baseItem?.toLowerCase?.() ?? "";

  if (armorTypes.includes(typeValue)) return true;
  if (armorTypes.includes(baseItem))  return true;

  if (props.includes("shd")) return true;

  const armorValue = Number(sys.armor?.value ?? 0);
  if (armorValue > 0) return true;

  return false;
}

/** Focus = equipment com "foc" e NÃO armor-like */
function itemIsFocus(item) {
  if (!item || item.type !== "equipment") return false;

  const props = getItemPropertiesArray(item);
  if (!props.includes("foc")) return false;
  if (itemIsArmorLike(item)) return false;

  return true;
}

/* -------------------------------------------- */
/*  Compatibilidade item x runa                 */
/* -------------------------------------------- */

export function itemSupportsRuneCategory(item, category, subtype) {
  if (!item) return false;

  const sys      = item.system ?? {};
  const props    = getItemPropertiesArray(item);
  const isWeapon = itemIsWeapon(item);

  const catRaw = category ?? "";
  const subRaw = subtype ?? "";

  const cat  = String(catRaw).toLowerCase();
  const sub  = String(subRaw).toLowerCase();
  const norm = sub.replace(/[\s_]+/g, "-");

  // Arcane Precision / Arcane Oppression → foco (equipment + "foc")
  if (["arcane-precision", "arcane-oppression"].includes(norm)) {
    const isFocus =
      item.type === "equipment" &&
      props.includes("foc");

    console.debug("[MHH][Runes] compat (arcane-precision/arcane-oppression)", {
      itemName: item.name,
      itemType: item.type,
      props,
      result: isFocus
    });

    return isFocus;
  }

  // Ofensivas de arma
  if (["precision", "damage", "elemental"].includes(norm)) {
    const result = isWeapon;
    console.debug("[MHH][Runes] compat (weapon offensive)", {
      itemName: item.name,
      itemType: item.type,
      norm,
      result
    });
    return result;
  }

  // Defensivas (armor-like)
  if (["reinforcement", "protection"].includes(norm)) {
    const armorTypes = ["light", "medium", "heavy", "shield"];
    const typeValue  = sys.type?.value?.toLowerCase?.() ?? "";
    const baseItem   = sys.type?.baseItem?.toLowerCase?.() ?? "";
    const hasShieldProp = props.includes("shd");
    const armorValue = Number(sys.armor?.value ?? 0);

    const armorLike =
      armorTypes.includes(typeValue) ||
      armorTypes.includes(baseItem)  ||
      hasShieldProp                  ||
      armorValue > 0;

    console.debug("[MHH][Runes] compat (defensive armor-like)", {
      itemName: item.name,
      itemType: item.type,
      norm,
      armorLike
    });

    return armorLike;
  }

  console.debug("[MHH][Runes] compat (unknown subtype -> false)", {
    itemName: item.name,
    itemType: item.type,
    norm
  });
  return false;
}

/* -------------------------------------------- */
/*  Instalar / remover runa no item             */
/* -------------------------------------------- */

export async function installRuneOnItem(item, runeItem) {
  console.log("[MHH][Runes] installRuneOnItem(ENTER)", {
    itemName: item?.name,
    itemType: item?.type,
    runeName: runeItem?.name
  });

  if (!item || !runeItem) {
    console.warn("[MHH][Runes] installRuneOnItem → NO_ITEM");
    return { ok: false, reason: "NO_ITEM" };
  }

  const subtype  = await runeItem.getFlag(MODULE_ID, FLAGS.RUNE_SUBTYPE);
  const category = await runeItem.getFlag(MODULE_ID, FLAGS.RUNE_CATEGORY);
  const tier     = (await runeItem.getFlag(MODULE_ID, FLAGS.RUNE_TIER)) ?? "lesser";

  console.log("[MHH][Runes] installRuneOnItem → rune flags", {
    subtype,
    category,
    tier
  });

  if (!subtype) {
    console.warn("[MHH][Runes] installRuneOnItem → INVALID_RUNE_DATA (sem subtype)");
    return { ok: false, reason: "INVALID_RUNE_DATA" };
  }

  const supports = itemSupportsRuneCategory(item, category, subtype);

  console.log("[MHH][Runes] installRuneOnItem → supports?", { supports });

  if (!supports) {
    console.warn("[MHH][Runes] installRuneOnItem → ITEM_NOT_COMPATIBLE", {
      itemName: item.name,
      runeName: runeItem.name,
      category,
      subtype
    });
    return { ok: false, reason: "ITEM_NOT_COMPATIBLE" };
  }

  // Impede usar a mesma runa em dois itens
  const currentHost = await runeItem.getFlag(MODULE_ID, FLAGS.RUNE_SOCKET_HOST);
  if (currentHost && currentHost !== item.uuid) {
    console.warn("[MHH][Runes] installRuneOnItem → RUNE_ALREADY_SOCKETED", { currentHost });
    return {
      ok: false,
      reason: "RUNE_ALREADY_SOCKETED",
      host: currentHost
    };
  }

  let runeDamageType = await runeItem.getFlag(MODULE_ID, FLAGS.RUNE_DAMAGE_TYPE);
  const normSubtype  = String(subtype).toLowerCase().replace(/[\s_]+/g, "-");

  if (normSubtype === "elemental") {
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

  // Regras: 1 runa por subtipo, a mais forte substitui
  const idxSameSubtype = runes.findIndex(r => r?.runeSubtype === newRune.runeSubtype);

  if (idxSameSubtype >= 0) {
    const existing = runes[idxSameSubtype];
    const oldRank  = tierRank(existing.runeTier);
    const newRank  = tierRank(newRune.runeTier);

    if (newRank <= oldRank) {
      console.log("[MHH][Runes] installRuneOnItem → RUNE_WEAKER_OR_EQUAL_EXISTS", {
        existing,
        newRune
      });
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

    const actor = item.parent;
    if (actor) await applyDefensiveRunesToActor(actor);

    console.log("[MHH][Runes] installRuneOnItem(RETURN) → REPLACED_WEAKER");

    return {
      ok: true,
      reason: "REPLACED_WEAKER",
      replaced: existing,
      added: newRune,
      total: runes.length
    };
  }

  // Checa slots
  const maxSlots = getMaxRuneSlots(item);
  if (maxSlots <= 0) {
    console.warn("[MHH][Runes] installRuneOnItem → NO_RUNE_SLOTS");
    return { ok: false, reason: "NO_RUNE_SLOTS" };
  }
  if (runes.length >= maxSlots) {
    console.warn("[MHH][Runes] installRuneOnItem → NO_FREE_RUNE_SLOT");
    return { ok: false, reason: "NO_FREE_RUNE_SLOT" };
  }

  runes.push(newRune);
  await setItemRunes(item, runes);
  await runeItem.setFlag(MODULE_ID, FLAGS.RUNE_SOCKET_HOST, item.uuid);
  await applyRuneEffectsToItem(item);

  const actor = item.parent;
  if (actor) await applyDefensiveRunesToActor(actor);

  console.log("[MHH][Runes] installRuneOnItem(RETURN) → INSTALLED");

  return {
    ok: true,
    reason: "INSTALLED",
    added: newRune,
    total: runes.length
  };
}

export async function removeRuneFromItem(item, runeIndex) {
  if (!item) return;
  const runes = getItemRunes(item);
  if (!Array.isArray(runes) || runeIndex < 0 || runeIndex >= runes.length) return;

  const [removed] = runes.splice(runeIndex, 1);
  await setItemRunes(item, runes);

  if (removed?.runeSourceUuid) {
    const doc = await fromUuid(removed.runeSourceUuid).catch(() => null);
    if (doc) {
      await doc.unsetFlag(MODULE_ID, FLAGS.RUNE_SOCKET_HOST);
    }
  }

  await applyRuneEffectsToItem(item);

  const actor = item.parent;
  if (actor) await applyDefensiveRunesToActor(actor);
}

/* -------------------------------------------- */
/*  Runas ofensivas → item (armas)              */
/* -------------------------------------------- */

/**
 * Pega a primeira activity de ataque do item (v2024).
 */
function getPrimaryAttackActivity(item) {
  const activities = item.system?.activities;
  if (!activities) {
    console.log("[MHH][Runes] Nenhuma Activity encontrada para o item", item);
    return null;
  }

  // ActivityCollection (tem .contents)
  const list = activities.contents
    ? activities.contents
    : Array.isArray(activities)
      ? activities
      : Array.from(activities);

  const attack = list.find(a => a.type === "attack");
  if (!attack) {
    console.log("[MHH][Runes] Nenhuma Activity de ataque encontrada para o item", item);
    return null;
  }
  return attack;
}

/**
 * Aplica efeitos de runas ofensivas no item (arma).
 * Ignora itens que não sejam armas.
 */
export async function applyRuneEffectsToItem(item) {
  if (!item) return;

  if (!itemIsWeapon(item)) {
    console.log("[MHH][Runes] applyRuneEffectsToItem ignorado para item não-arma:", item.name);
    return;
  }

  const runes = getItemRunes(item);
  if (!runes.length) {
    // nada instalado → não mexe na activity
    console.log("[MHH][Runes] applyRuneEffectsToItem → sem runas em", item.name);
    return;
  }

  let precisionBonus   = 0;
  let flatDamageBonus  = 0;
  const elementalParts = [];

  for (const r of runes) {
    if (!r) continue;
    const rawSubtype = r.runeSubtype ?? "";
    const norm = String(rawSubtype).toLowerCase().replace(/[\s_]+/g, "-");
    const tBonus = tierToBonus(r.runeTier);

    if (norm === "precision") {
      precisionBonus += tBonus;
    } else if (norm === "damage") {
      flatDamageBonus += tBonus;
    } else if (norm === "elemental") {
      const dmgType = r.runeDamageType || "fire";
      // TODO: ajuste a escala de dados conforme tua regra real
      const dice = tBonus === 1 ? "1d4" : (tBonus === 2 ? "1d6" : "1d8");
      elementalParts.push({ dice, damageType: dmgType });
    }
  }

  console.log("[MHH][Runes] applyRuneEffectsToItem", {
    item: item.name,
    runes,
    precisionBonus,
    flatDamageBonus,
    elementalParts
  });

  const atk = getPrimaryAttackActivity(item);
  if (!atk) return;

  const actId   = atk.id ?? atk._id;
  const actPath = `system.activities.${actId}`;

  const src = atk._source ?? atk;

  // Effects: removemos apenas os nossos
  const existingEffects = Array.isArray(src.effects) ? src.effects : [];
  const baseEffects = existingEffects.filter(e => !e?.flags?.[MODULE_ID]?.mhhRuneEffect);

  const nextEffects = [...baseEffects];

  if (precisionBonus) {
    nextEffects.push({
      label: "Rune: Precision",
      // schema aproximado; ajuste se necessário
      type: "attack",
      target: "attack",
      value: sign(precisionBonus),
      flags: {
        [MODULE_ID]: {
          mhhRuneEffect: true,
          kind: "precision"
        }
      }
    });
  }

  if (flatDamageBonus) {
    nextEffects.push({
      label: "Rune: Damage",
      type: "damage",
      target: "damage",
      value: sign(flatDamageBonus),
      flags: {
        [MODULE_ID]: {
          mhhRuneEffect: true,
          kind: "damage"
        }
      }
    });
  }

  // Damage parts: remove as nossas anteriores (denomination === "mhh-rune")
  const existingParts = src.damage?.parts ?? [];
  const baseParts = existingParts.filter(p => p?.denomination !== "mhh-rune");

  const runeParts = elementalParts.map(ep => ({
    number: ep.dice,
    denomination: "mhh-rune",
    types: [ep.damageType]
  }));

  const nextParts = [...baseParts, ...runeParts];

  const updates = {};
  updates[`${actPath}.effects`] = nextEffects;
  updates[`${actPath}.damage.parts`] = nextParts;

  await item.update(updates);
}

/* -------------------------------------------- */
/*  Runas defensivas / arcanas → ator           */
/* -------------------------------------------- */

/**
 * Lê todas as runas defensivas/arcanas dos itens EQUIPADOS
 * e gera um único Active Effect no ator com:
 * - AC / saves (reinforcement / protection)
 * - msak/rsak attack (arcane-precision)
 * - spell DC (arcane-oppression)
 */
export async function applyDefensiveRunesToActor(actor) {
  if (!actor) return;

  // Evita execução dupla
  if (DEFENSIVE_RUNE_LOCK) {
    console.log("[MHH][Runes] applyDefensiveRunesToActor → SKIPPED (locked)");
    return;
  }

  DEFENSIVE_RUNE_LOCK = true;

  try {
    // Remove AE antigo
    const prev = actor.effects.filter(e => e.getFlag(MODULE_ID, FLAGS.AE_RUNES_DEF_MARK));
    if (prev.length) {
      try {
        await actor.deleteEmbeddedDocuments(
          "ActiveEffect",
          prev.map(e => e.id)
        );
      } catch (err) {
        console.warn("[MHH][Runes] applyDefensiveRunesToActor → erro ao remover AE antigo", err);
      }
    }

    let acBonus       = 0;
    let saveBonus     = 0;
    let spellAtkBonus = 0;
    let spellDcBonus  = 0;

    for (const item of actor.items) {
      if (!isItemEquipped(item)) continue;

      const runes = getItemRunes(item);
      if (!Array.isArray(runes) || !runes.length) continue;

      for (const r of runes) {
        if (!r) continue;
        const rawSubtype = r.runeSubtype ?? "";
        const norm = String(rawSubtype).toLowerCase().replace(/[\s_]+/g, "-");
        const tBonus = tierToBonus(r.runeTier);

        if (norm === "reinforcement") {
          acBonus += tBonus;
        } else if (norm === "protection") {
          saveBonus += tBonus;
        } else if (norm === "arcane-precision") {
          spellAtkBonus += tBonus;
        } else if (norm === "arcane-oppression") {
          spellDcBonus += tBonus;
        }
      }
    }

    if (!acBonus && !saveBonus && !spellAtkBonus && !spellDcBonus) {
      console.log(
        "[MHH][Runes] applyDefensiveRunesToActor → nenhum bônus encontrado para",
        actor.name
      );
      return;
    }

    const changes = [];

    if (acBonus) {
      changes.push({
        key: "system.attributes.ac.bonus",
        mode: V.AE_ADD,
        value: sign(acBonus)
      });
    }

    if (saveBonus) {
      changes.push({
        key: "system.bonuses.abilities.save",
        mode: V.AE_ADD,
        value: sign(saveBonus)
      });
    }

    if (spellAtkBonus) {
      changes.push(
        {
          key: "system.bonuses.msak.attack",
          mode: V.AE_ADD,
          value: sign(spellAtkBonus)
        },
        {
          key: "system.bonuses.rsak.attack",
          mode: V.AE_ADD,
          value: sign(spellAtkBonus)
        }
      );
    }

    if (spellDcBonus) {
      changes.push({
        key: "system.bonuses.spell.dc",
        mode: V.AE_ADD,
        value: sign(spellDcBonus)
      });
    }

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Runes (Defensive & Arcane)",
      img: actor.img,
      origin: actor.uuid,
      disabled: false,
      changes,
      flags: {
        [MODULE_ID]: {
          [FLAGS.AE_RUNES_DEF_MARK]: true
        }
      }
    }]);

    console.log("[MHH][Runes] applyDefensiveRunesToActor → criado AE para", actor.name, {
      acBonus,
      saveBonus,
      spellAtkBonus,
      spellDcBonus
    });

  } finally {
    // Libera o lock
    DEFENSIVE_RUNE_LOCK = false;
  }
}
