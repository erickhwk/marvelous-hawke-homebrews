export const MODULE_ID  = "marvelous-hawke-homebrews";

export const FLAGS = {
  MODE: "ewMode",
  BASE_HP: "baseHpMax",
  BASE_ACTOR_NAME: "baseActorName",
  BASE_TOKEN_NAME: "baseTokenName",
  AE_MARK: "mhhAdjustmentEffect"
};

export const EFFECT = {
  NAME: "Creature Adjustment",
  ICONS: {
    elite: "icons/skills/melee/strike-sword-blood-red.webp",
    weak:  "icons/skills/wounds/blood-drip-droplet-red.webp"
  }
};

export const PROFILES = {
  elite:  { ac:+1, atk:+1, dc:+1, check:+1, save:+1, dmg:+2, hpMult:1.25, minDelta:+10, prefix: "Elite " },
  weak:   { ac:-1, atk:-1, dc:-1, check:-1, save:-1, dmg:-2, hpMult:0.80, minDelta:-10, prefix: "Weakling " },
  default:{ ac: 0, atk: 0, dc: 0, check: 0, save: 0, dmg: 0, hpMult:1.00, minDelta:  0, prefix: "" }
};

export const TEMPLATES = {
  ADJ_FORM:   "modules/marvelous-hawke-homebrews/templates/adjustments.hbs",
  ADJ_FOOTER: "modules/marvelous-hawke-homebrews/templates/adjustment-footer.hbs"
};

export const V = {
  AE_ADD: foundry.CONST.ACTIVE_EFFECT_MODES.ADD,
  U: foundry.utils
};
