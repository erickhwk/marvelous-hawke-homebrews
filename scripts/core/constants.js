export const MODULE_ID  = "marvelous-hawke-homebrews";

export const FLAGS = {
  MODE: "ewMode",
  BASE_HP: "baseHpMax",
  BASE_ACTOR_NAME: "baseActorName",
  BASE_TOKEN_NAME: "baseTokenName",
  AE_MARK: "mhhAdjustmentEffect",
  BASE_CR: "baseCR",

  // ---------- RUNES ----------
  ITEM_RUNES: "itemRunes",            // lista de runas instaladas no item
  RUNE_CATEGORY: "runeCategory",      // offensive / defensive
  RUNE_SUBTYPE: "runeSubtype",        // elemental / precision / damage / etc.
  RUNE_TIER: "runeTier",              // lesser / greater / major
  RUNE_DAMAGE_TYPE: "runeDamageType", // fire / cold / acid / lightning
  AE_RUNES_MARK: "mhhRuneEffect"      // AE gerado pelo service de runas
};


export const EFFECT = {
  NAME: "Creature Adjustment",
  ICONS: {
    elite: "icons/skills/melee/strike-sword-blood-red.webp",
    weak:  "icons/skills/wounds/blood-drip-droplet-red.webp"
  }
};

// Use aqui seus valores ajustados (inclui seu buff de elite)
export const PROFILES = {
  elite:  { ac:+2, atk:+2, dc:+2, check:+2, save:+1, dmg:+4, hpMult:1.25, minDelta:+10, prefix: "Elite " },
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

/** Ordem de passos de CR e seus valores numéricos (usados pelo dnd5e) */
export const CR_STEPS = ["0","1/8","1/4","1/2",
  "1","2","3","4","5","6","7","8","9","10",
  "11","12","13","14","15","16","17","18","19","20",
  "21","22","23","24","25","26","27","28","29","30"
];

export const CR_TO_VALUE = {
  "0": 0, "1/8": 0.125, "1/4": 0.25, "1/2": 0.5,
  "1": 1,  "2": 2,  "3": 3,  "4": 4,  "5": 5,  "6": 6,  "7": 7,  "8": 8,  "9": 9,  "10": 10,
  "11": 11,"12": 12,"13": 13,"14": 14,"15": 15,"16": 16,"17": 17,"18": 18,"19": 19,"20": 20,
  "21": 21,"22": 22,"23": 23,"24": 24,"25": 25,"26": 26,"27": 27,"28": 28,"29": 29,"30": 30
};
