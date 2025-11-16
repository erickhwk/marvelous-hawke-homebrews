import { MODULE_ID, RUNE_FLAGS } from "../../core/constants.js";
import { getFlag, setFlag, updateSafe } from "../../core/utils.js";

/**
 * Retorna as flags de runa dentro de item.flags[MODULE_ID].runes
 */
export function getItemRunes(item) {
  return item.getFlag(MODULE_ID, "runes") ?? [];
}

/**
 * Salva o array de runas no item
 */
export async function setItemRunes(item, runes) {
  return item.setFlag(MODULE_ID, "runes", runes);
}

/**
 * Verifica se item suporta runas (por enquanto checagem simples)
 */
export function itemSupportsRunes(item) {
  const type = item?.type;
  return ["weapon", "armor"].includes(type);
}

/**
 * Instala uma runa em um item
 * @param {Item} item - o item que receberá a runa
 * @param {Item} rune - o item que é a runa
 */
export async function installRuneOnItem(item, rune) {
  // 1 — Checar se item pode receber runas
  if (!itemSupportsRunes(item)) {
    return { ok: false, reason: "ITEM_NOT_COMPATIBLE" };
  }

  const runeData = rune.flags?.[MODULE_ID];
  if (!runeData) {
    return { ok: false, reason: "INVALID_RUNE_ITEM" };
  }

  // 2 — Obter runas já instaladas
  const current = getItemRunes(item);

  // 3 — Impedir duplicatas
  if (current.some(r => r.runeSubtype === runeData.runeSubtype && r.runeTier === runeData.runeTier)) {
    return { ok: false, reason: "RUNE_ALREADY_INSTALLED" };
  }

  // 4 — Por enquanto, sem slots — vamos apenas adicionar
  const updated = [...current, runeData];

  await setItemRunes(item, updated);

  return {
    ok: true,
    reason: "INSTALLED",
    added: runeData,
    total: updated.length
  };
}