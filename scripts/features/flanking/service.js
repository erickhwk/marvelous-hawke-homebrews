// Geometry + collision helpers for Flanking
// Foundry: Core v13+, System: dnd5e v5.1.x

/**
 * Get token center as a PIXI Point-like {x,y}
 */
function centerOf(tok) {
  if (!tok) return null;
  const p = tok.center ?? tok.object?.center ?? { x: tok.x + tok.w / 2, y: tok.y + tok.h / 2 };
  return { x: p.x, y: p.y };
}

/**
 * Returns true if there is NO blocking wall/terrain between A and B.
 * Uses the modern polygon backend when available, falls back to canvas.walls.checkCollision.
 */
function hasClearRay(a, b) {
  const A = centerOf(a);
  const B = centerOf(b);
  if (!A || !B) return false;
  const ray = new Ray(A, B);

  // Prefer polygon backend when present
  const poly = CONFIG.Canvas?.polygonBackends?.walls;
  if (poly?.testCollision) {
    return !poly.testCollision(ray, { type: "move", mode: "any" });
  }

  // Fallback
  return !canvas.walls?.checkCollision?.(ray, { type: "move", mode: "any" });
}

/**
 * Is a token adjacent to target (5 ft including diagonals)?
 * Uses scene grid distance. Good enough for reach 5’ baseline.
 */
function isAdjacent(a, target) {
  const A = centerOf(a);
  const T = centerOf(target);
  if (!A || !T) return false;

  // distance in scene units (ft)
  const d = canvas.grid.measureDistance(A, T, { gridSpaces: true });
  return d === 1; // exactly 1 grid step (adjacent incl. diagonals)
}

/**
 * Are attacker and ally exactly on opposite sides of the target?
 * Works for orthogonals and diagonals: E/W, N/S, NE/SW, NW/SE.
 * Uses the sign of delta in grid space.
 */
function areOppositeAroundTarget(attacker, ally, target) {
  const gs = canvas.grid.size;
  const A = centerOf(attacker);
  const L = centerOf(ally);
  const T = centerOf(target);
  if (!A || !L || !T) return false;

  // Convert deltas to grid steps (-1, 0, or 1)
  const dxA = Math.sign(Math.round((A.x - T.x) / gs));
  const dyA = Math.sign(Math.round((A.y - T.y) / gs));
  const dxL = Math.sign(Math.round((L.x - T.x) / gs));
  const dyL = Math.sign(Math.round((L.y - T.y) / gs));

  // Must be adjacent vectors (no 0,0) and exact opposites
  const aAdj = (dxA !== 0 || dyA !== 0) && Math.abs(dxA) <= 1 && Math.abs(dyA) <= 1;
  const lAdj = (dxL !== 0 || dyL !== 0) && Math.abs(dxL) <= 1 && Math.abs(dyL) <= 1;

  return aAdj && lAdj && (dxA === -dxL) && (dyA === -dyL);
}

/**
 * Find ONE ally that provides flanking with attacker against target.
 * Rules:
 *  - attacker and ally must be adjacent to target (grid distance = 1)
 *  - ally must be exactly opposite side relative to attacker (incl. diagonals)
 *  - clear rays: attacker↔target AND ally↔target (and optional attacker↔ally)
 *  - disregard unconscious/defeated tokens (overlayEffect)
 */
export function computeFlanking(attackerToken, targetToken, { requireAllyRay = true } = {}) {
  const fail = (reason) => ({ isFlanking: false, reason });

  if (!attackerToken || !targetToken) return fail("missing tokens");

  if (!isAdjacent(attackerToken, targetToken)) return fail("attacker not adjacent");
  if (!hasClearRay(attackerToken, targetToken)) return fail("blocked attacker→target");

  // Allies: same disposition as attacker, on the canvas, visible, not defeated
  const allies = canvas.tokens?.placeables?.filter(t => {
    if (t === attackerToken || t === targetToken) return false;
    if (t.document.disposition !== attackerToken.document.disposition) return false;
    if (t.document.overlayEffect) return false; // crude defeated check
    return isAdjacent(t, targetToken);
  }) ?? [];

  for (const ally of allies) {
    if (!areOppositeAroundTarget(attackerToken, ally, targetToken)) continue;
    if (!hasClearRay(ally, targetToken)) continue;
    if (requireAllyRay && !hasClearRay(attackerToken, ally)) continue;

    return { isFlanking: true, ally };
  }

  return fail("no opposite ally");
}
