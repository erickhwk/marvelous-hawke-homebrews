import { MODULE_ID, FLAGS, EFFECT, PROFILES, V, CR_STEPS, CR_TO_VALUE } from "../../core/constants.js";
import { getFlag, setFlag, path, updateSafe } from "../../core/utils.js";

const sign = (n) => (Number(n) >= 0 ? `+${Number(n)}` : `${Number(n)}`);

export function readModeFrom(actor, tokenDoc) {
  let m = tokenDoc?.getFlag?.(MODULE_ID, FLAGS.MODE);
  if (!m) m = actor?.getFlag?.(MODULE_ID, FLAGS.MODE);
  if (!m) {
    const eff = actor?.effects?.find(e => e.getFlag(MODULE_ID, FLAGS.AE_MARK));
    m = eff?.getFlag(MODULE_ID, "mode");
  }
  return m ?? "default";
}

/** ---------------- HP base ---------------- */
async function ensureBaseHp(actor) {
  const base = await getFlag(actor, FLAGS.BASE_HP);
  const current = path(actor, "system.attributes.hp.max");
  if (base === undefined && Number.isFinite(current)) {
    await setFlag(actor, FLAGS.BASE_HP, current);
  }
}

/** ---------------- Nomes base ---------------- */
async function ensureBaseNames(actor, tokenDoc) {
  const baseActor = await getFlag(actor, FLAGS.BASE_ACTOR_NAME);
  if (!baseActor) await setFlag(actor, FLAGS.BASE_ACTOR_NAME, actor.name);

  if (tokenDoc?.isLinked === false) {
    const baseToken = await getFlag(tokenDoc, FLAGS.BASE_TOKEN_NAME);
    if (!baseToken) await setFlag(tokenDoc, FLAGS.BASE_TOKEN_NAME, tokenDoc.name ?? actor.name);
  }
}

function computeAdjustedMax(base, profile) {
  let next = Math.round(base * (profile.hpMult ?? 1));
  const delta = next - base;
  const min = profile.minDelta ?? 0;
  if (min > 0 && delta < min) next = base + min;
  if (min < 0 && delta > min) next = base + min;
  return next;
}

/** ---------------- CR base + helpers (sem XP) ---------------- */
async function ensureBaseCR(actor) {
  const baseCR = await getFlag(actor, FLAGS.BASE_CR);
  if (baseCR === undefined) {
    const currentCRRaw = path(actor, "system.details.cr"); // pode ser número ou string
    await setFlag(actor, FLAGS.BASE_CR, crKeyFromValue(currentCRRaw));
  }
}

function crKeyFromValue(v) {
  if (v == null) return "0";
  if (typeof v === "string") {
    if (CR_STEPS.includes(v)) return v;
    const asNum = Number(v);
    if (!Number.isNaN(asNum)) return crKeyFromValue(asNum);
    return "0";
  }
  // number
  if (v < 0.1875) return "0";           // 0
  if (v < 0.3125) return "1/8";         // ~0.125
  if (v < 0.375)  return "1/4";         // ~0.25
  if (v < 0.75)   return "1/2";         // ~0.5
  const n = Math.max(1, Math.round(v));
  return String(Math.min(n, 30));
}

function stepCR(crKey, delta) {
  const i = CR_STEPS.indexOf(crKey);
  if (i < 0) return crKey;
  return CR_STEPS[Math.min(Math.max(i + delta, 0), CR_STEPS.length - 1)];
}

async function applyCR(actor, mode) {
  await ensureBaseCR(actor);

  const baseCRKey = (await getFlag(actor, FLAGS.BASE_CR)) ?? crKeyFromValue(path(actor, "system.details.cr"));
  let nextCRKey = baseCRKey;
  if (mode === "elite") nextCRKey = stepCR(baseCRKey, +1);
  if (mode === "weak")  nextCRKey = stepCR(baseCRKey, -1);

  const nextCRValue = CR_TO_VALUE[nextCRKey] ?? 0;

  await updateSafe(actor, { "system.details.cr": nextCRValue });
}

/** ---------------- AEs / HP / Nomes ---------------- */
export async function applyAdjustmentEffect(actor, mode) {
  const prev = actor.effects.find(e => e.getFlag(MODULE_ID, FLAGS.AE_MARK) === true);
  if (prev) await prev.delete();
  if (mode === "default") return;

  const p = PROFILES[mode];
  const changes = [
    { key: "system.attributes.ac.bonus", mode: V.AE_ADD, value: sign(p.ac) },
    { key: "system.attributes.ac.value", mode: V.AE_ADD, value: sign(p.ac) },
    { key: "system.bonuses.mwak.attack", mode: V.AE_ADD, value: sign(p.atk) },
    { key: "system.bonuses.rwak.attack", mode: V.AE_ADD, value: sign(p.atk) },
    { key: "system.bonuses.msak.attack", mode: V.AE_ADD, value: sign(p.atk) },
    { key: "system.bonuses.rsak.attack", mode: V.AE_ADD, value: sign(p.atk) },
    { key: "system.bonuses.spell.dc",    mode: V.AE_ADD, value: sign(p.dc)  },
    { key: "system.bonuses.abilities.check", mode: V.AE_ADD, value: sign(p.check) },
    { key: "system.bonuses.abilities.save",  mode: V.AE_ADD, value: sign(p.save) },
    { key: "system.bonuses.mwak.damage", mode: V.AE_ADD, value: sign(p.dmg) },
    { key: "system.bonuses.rwak.damage", mode: V.AE_ADD, value: sign(p.dmg) },
    { key: "system.bonuses.msak.damage", mode: V.AE_ADD, value: sign(p.dmg) },
    { key: "system.bonuses.rsak.damage", mode: V.AE_ADD, value: sign(p.dmg) }
  ];

  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `${EFFECT.NAME} (${mode})`,
    img: mode === "elite" ? EFFECT.ICONS.elite : EFFECT.ICONS.weak,
    origin: actor.uuid,
    disabled: false,
    changes,
    flags: { [MODULE_ID]: { [FLAGS.AE_MARK]: true, mode } }
  }]);
}

export async function applyMaxHp(actor, mode) {
  await ensureBaseHp(actor);
  const base = await getFlag(actor, FLAGS.BASE_HP);
  const baseMax = Number.isFinite(base) ? base : path(actor, "system.attributes.hp.max");
  if (!Number.isFinite(baseMax)) return;

  const pathMax   = "system.attributes.hp.max";
  const pathValue = "system.attributes.hp.value";

  if (mode === "default") {
    await updateSafe(actor, { [pathMax]: baseMax, [pathValue]: baseMax });
    return;
  }
  const p = PROFILES[mode];
  const next = computeAdjustedMax(baseMax, p);
  await updateSafe(actor, { [pathMax]: next, [pathValue]: next });
}

async function setDisplayNames(actor, tokenDoc, mode) {
  await ensureBaseNames(actor, tokenDoc);

  const baseActor = (await getFlag(actor, FLAGS.BASE_ACTOR_NAME)) || actor.name;
  const baseToken = tokenDoc?.isLinked === false
    ? ((await getFlag(tokenDoc, FLAGS.BASE_TOKEN_NAME)) || tokenDoc.name || baseActor)
    : null;

  const prefix = PROFILES[mode]?.prefix ?? "";
  const nextActorName = prefix ? `${prefix}${baseActor}` : baseActor;

  const updates = [];
  if (actor.name !== nextActorName) updates.push(actor.update({ name: nextActorName }));
  if (tokenDoc?.isLinked === false) {
    const nextTokenName = prefix ? `${prefix}${baseToken}` : baseToken;
    if (tokenDoc.name !== nextTokenName) updates.push(tokenDoc.update({ name: nextTokenName }));
  }
  if (updates.length) await Promise.allSettled(updates);
}

/** ---------------- Orquestra tudo ---------------- */
export async function applyAdjustment(actor, mode, tokenDoc) {
  if (!["default","elite","weak"].includes(mode)) mode = "default";
  await applyAdjustmentEffect(actor, mode);
  await applyMaxHp(actor, mode);
  await applyCR(actor, mode);
  await setDisplayNames(actor, tokenDoc, mode);
}
