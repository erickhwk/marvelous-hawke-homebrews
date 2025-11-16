import { MODULE_ID, FLAGS } from "../../core/constants.js";
import { getFlag, setFlag, path } from "../../core/utils.js";
import { getRuneDef, MHH_RUNE_TIERS } from "./config.js";

/**
 * Estrutura esperada em FLAGS.ITEM_RUNES no item:
 * [
 *   { uuid: "Compendium.mhh-runes.XYZ" },
 *   { uuid: "Actor.abc.Item.def" }
 * ]
 */

/* ---------------- Helpers de slots / raridade ---------------- */

function normalizeRarity(raw) {
  if (!raw) return "common";
  const s = String(raw).toLowerCase().replace(/\s+/g, "");
  if (s === "uncommon") return "uncommon";
  if (s === "rare") return "rare";
  if (s === "veryrare" || s === "very_rare") return "very-rare";
  if (s === "legendary") return "legendary";
  return "common";
}

/**
 * Quantidade máxima de runas que um item pode ter, baseado na raridade.
 *
 * Common:        0 slots
 * Uncommon/Rare: 1 slot
 * Very Rare:     2 slots
 * Legendary:     3 slots
 */
export function getMaxRuneSlots(item) {
  const rarity = normalizeRarity(path(item, "system.rarity") ?? "common");

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

/* ---------------- Leitura / escrita de flags ---------------- */

export async function getInstalledRunes(item) {
  const list = await getFlag(item, FLAGS.ITEM_RUNES);
  if (!Array.isArray(list)) return [];
  return list.filter(r => r && typeof r.uuid === "string");
}

export async function setInstalledRunes(item, entries) {
  const clean = (entries ?? []).filter(r => r && typeof r.uuid === "string");
  return setFlag(item, FLAGS.ITEM_RUNES, clean);
}

/**
 * Retorna true se ainda houver pelo menos 1 slot livre para runa.
 */
export async function hasFreeRuneSlot(item) {
  const max = getMaxRuneSlots(item);
  if (max <= 0) return false;
  const installed = await getInstalledRunes(item);
  return installed.length < max;
}

/* ---------------- Instalar / remover runa do item ---------------- */

/**
 * Tenta instalar uma runa em um item.
 *
 * - Verifica slots disponíveis
 * - Evita duplicata pelo mesmo uuid
 * - NÃO valida ainda tipo de item (arma/armadura) nem categoria (off/def)
 *   → isso pode ser adicionado depois, na UI ou aqui.
 */
export async function installRuneOnItem(item, runeUuid) {
  if (!runeUuid) return;

  const max = getMaxRuneSlots(item);
  if (max <= 0) {
    ui?.notifications?.warn?.("Este item não possui slots de runa.");
    return;
  }

  const installed = await getInstalledRunes(item);

  if (installed.some(r => r.uuid === runeUuid)) {
    // já instalada
    return;
  }

  if (installed.length >= max) {
    ui?.notifications?.warn?.("Este item já está com todos os slots de runa preenchidos.");
    return;
  }

  installed.push({ uuid: runeUuid });
  await setInstalledRunes(item, installed);
  await applyRunesToItem(item);
}

/**
 * Remove uma runa específica do item, pelo uuid.
 */
export async function removeRuneFromItem(item, runeUuid) {
  if (!runeUuid) return;
  const installed = await getInstalledRunes(item);
  const next = installed.filter(r => r.uuid !== runeUuid);
  await setInstalledRunes(item, next);
  await applyRunesToItem(item);
}

/* ---------------- Aplicar efeitos de runas no item ---------------- */

/**
 * Lê as runas instaladas, resolve cada uma para um Item via uuid,
 * consulta config.js e gera um único Active Effect consolidado.
 */
export async function applyRunesToItem(item) {
  if (!item) return;

  // 1) Remove efeito anterior de runas (se houver)
  const prev = item.effects.find(e => e.getFlag(MODULE_ID, FLAGS.AE_RUNES_MARK) === true);
  if (prev) await prev.delete();

  // 2) Lê lista de runas instaladas
  const installed = await getInstalledRunes(item);
  if (!installed.length) return;

  const changes = [];

  for (const entry of installed) {
    const { uuid } = entry;
    if (!uuid) continue;

    const runeItem = await fromUuid(uuid).catch(() => null);
    if (!runeItem) continue;

    // Flags definidas no próprio item de runa
    const category = runeItem.getFlag(MODULE_ID, FLAGS.RUNE_CATEGORY);
    const subtype  = runeItem.getFlag(MODULE_ID, FLAGS.RUNE_SUBTYPE);
    const tier     = runeItem.getFlag(MODULE_ID, FLAGS.RUNE_TIER) ?? "lesser";
    const dmgType  = runeItem.getFlag(MODULE_ID, FLAGS.RUNE_DAMAGE_TYPE) ?? "fire";

    if (!category || !subtype || !MHH_RUNE_TIERS[tier]) continue;

    const def = getRuneDef(category, subtype);
    if (!def || typeof def.buildChanges !== "function") continue;

    const runeChanges = def.buildChanges(tier, dmgType) ?? [];
    for (const ch of runeChanges) {
      if (!ch || !ch.key) continue;
      // duplica pra não mutar config global
      changes.push(foundry.utils.duplicate(ch));
    }
  }

  if (!changes.length) return;

  // 3) Cria novo AE consolidado
  await item.createEmbeddedDocuments("ActiveEffect", [{
    name: "Runes",
    img: item.img,
    origin: item.uuid,
    disabled: false,
    changes,
    flags: {
      [MODULE_ID]: {
        [FLAGS.AE_RUNES_MARK]: true,
      },
    },
  }]);
}