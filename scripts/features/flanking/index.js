import { MODULE_ID } from "../../core/constants.js";
import { computeFlanking } from "./service.js";

/**
 * Try to extract a single target for the attack.
 * Priority: options?.targets (Set) → user targets → undefined
 */
function pickTarget(options) {
  const set = options?.targets ?? game.user?.targets;
  if (set && set.size) return set.values().next().value;
  return undefined;
}

/**
 * Adds +2 to an attack config (supports common shapes across dnd5e 5.x).
 */
function addAttackBonus(config, amount) {
  if (!config) return false;
  // Common places the system reads from:
  if (typeof config.attackBonus === "number") {
    config.attackBonus += amount; return true;
  }
  if (Array.isArray(config.parts)) {
    config.parts.push(`${amount >= 0 ? "+" : ""}${amount}`); return true;
  }
  if (Array.isArray(config.rollParts)) {
    config.rollParts.push(`${amount >= 0 ? "+" : ""}${amount}`); return true;
  }
  // Fallback tag for newer roll builders
  if (config.bonus ?? false) {
    config.bonus = `${config.bonus} + ${amount}`; return true;
  }
  return false;
}

export function registerFlankingFeature() {
  // pre-attack hook (runs before the system builds the final roll)
  Hooks.on("dnd5e.preAttackRoll", (item, config, options) => {
    try {
      if (!game.settings.get(MODULE_ID, "enableFlanking")) return;
      const actor = item?.actor;
      const attackerToken = canvas.tokens?.get(actor?.token?.id) || actor?.getActiveTokens()?.[0];
      const targetToken = pickTarget(options);
      if (!attackerToken || !targetToken) return;

      const res = computeFlanking(attackerToken, targetToken, { requireAllyRay: true });
      if (!res.isFlanking) return;

      const ok = addAttackBonus(config, +2);
      if (ok) {
        config.flankingApplied = true;
        config.flankingProvider = res.ally?.name;
        ui.notifications?.info(`Flanking (+2): ${actor.name} vs ${targetToken.name} (ally: ${res.ally?.name ?? "ally"})`, { permanent: false });
      } else {
        console.warn("[MHH-Flanking] Could not inject +2 into attack config", config);
      }
    } catch (e) {
      console.error("[MHH-Flanking] preAttackRoll failed:", e);
    }
  });

  // Optional: fallback for older or alternate flows (if your system build fires this)
  Hooks.on("dnd5e.preRollAttack", (actor, item, config, options) => {
    try {
      if (!game.settings.get(MODULE_ID, "enableFlanking")) return;
      const attackerToken = canvas.tokens?.get(actor?.token?.id) || actor?.getActiveTokens()?.[0];
      const targetToken = pickTarget(options);
      if (!attackerToken || !targetToken) return;

      const res = computeFlanking(attackerToken, targetToken, { requireAllyRay: true });
      if (!res.isFlanking) return;

      addAttackBonus(config, +2);
    } catch (e) {
      // silent fallback
    }
  });
}
