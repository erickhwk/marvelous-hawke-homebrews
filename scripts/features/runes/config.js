// scripts/features/runes/config.js

// Tiers de poder (Lesser / Greater / Major)
export const MHH_RUNE_TIERS = {
  lesser: {
    id: "lesser",
    label: "Lesser Rune",
    bonus: 1,
    dice: "1d4",
  },
  greater: {
    id: "greater",
    label: "Greater Rune",
    bonus: 2,
    dice: "1d6",
  },
  major: {
    id: "major",
    label: "Major Rune",
    bonus: 3,
    dice: "1d8",
  },
};

// Definições de runas por categoria/subtipo
// Isso é basicamente a tua tabela de "Tipos de Runas"
export const MHH_RUNE_DEFS = {
  offensive: {
    elemental: {
      id: "elemental",
      category: "offensive",
      label: "Elemental",
      // o tipo de dano (fogo/gelo/etc.) pode ser definido na própria runa-item
      buildChanges: (tier, damageType = "fire") => {
        const dice = MHH_RUNE_TIERS[tier].dice;
        return [
          {
            key: "system.bonuses.mwak.damage",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: `+${dice} ${damageType}`,
          },
          {
            key: "system.bonuses.rwak.damage",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: `+${dice} ${damageType}`,
          },
        ];
      },
    },

    precision: {
      id: "precision",
      category: "offensive",
      label: "Precision",
      buildChanges: (tier) => {
        const bonus = MHH_RUNE_TIERS[tier].bonus;
        return [
          {
            key: "system.bonuses.mwak.attack",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: bonus,
          },
          {
            key: "system.bonuses.rwak.attack",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: bonus,
          },
        ];
      },
    },

    damage: {
      id: "damage",
      category: "offensive",
      label: "Damage",
      buildChanges: (tier) => {
        const bonus = MHH_RUNE_TIERS[tier].bonus;
        return [
          {
            key: "system.bonuses.mwak.damage",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: bonus,
          },
          {
            key: "system.bonuses.rwak.damage",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: bonus,
          },
        ];
      },
    },

    arcaneOppression: {
      id: "arcaneOppression",
      category: "offensive",
      label: "Arcane Oppression",
      buildChanges: (tier) => {
        const bonus = MHH_RUNE_TIERS[tier].bonus;
        return [
          {
            key: "system.bonuses.spell.dc",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: bonus,
          },
        ];
      },
    },

    magicPrecision: {
      id: "magicPrecision",
      category: "offensive",
      label: "Magic Precision",
      buildChanges: (tier) => {
        const bonus = MHH_RUNE_TIERS[tier].bonus;
        return [
          {
            key: "system.bonuses.msak.attack",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: bonus,
          },
          {
            key: "system.bonuses.rsak.attack",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: bonus,
          },
        ];
      },
    },
  },

  defensive: {
    reinforcement: {
      id: "reinforcement",
      category: "defensive",
      label: "Reinforcement",
      buildChanges: (tier) => {
        const bonus = MHH_RUNE_TIERS[tier].bonus;
        return [
          {
            key: "system.attributes.ac.bonus",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: bonus,
          },
        ];
      },
    },

    protection: {
      id: "protection",
      category: "defensive",
      label: "Protection",
      buildChanges: (tier) => {
        const bonus = MHH_RUNE_TIERS[tier].bonus;
        return [
          {
            key: "system.bonuses.abilities.save",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: bonus,
          },
        ];
      },
    },
  },
};

// Helper pra lookup rápido
export function getRuneDef(category, subtype) {
  return MHH_RUNE_DEFS?.[category]?.[subtype] ?? null;
}
