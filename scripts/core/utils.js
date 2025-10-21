import { MODULE_ID } from "./constants.js";

export const U = foundry.utils;

export function getFlag(doc, key)  { return doc?.getFlag?.(MODULE_ID, key); }
export function setFlag(doc, key, v){ return doc?.setFlag?.(MODULE_ID, key, v); }

export function path(obj, p) { return U.getProperty(obj, p); }

export async function updateSafe(doc, data) {
  if (!doc || !data) return;
  return await doc.update(data);
}

export function actorFromSheetApp(app) {
  const tokenDoc = app.token ?? app.object?.document ?? null;
  const actorBase = app.document ?? app.actor ?? null;
  const actor = tokenDoc?.isLinked === false ? (tokenDoc.actor ?? actorBase) : actorBase;
  return { actor, tokenDoc };
}
