# Hawke’s Marvelous Homebrews

A lightweight suite of optional homebrew rules for **Foundry VTT** (system: **D&D 5e**).

> ✅ Built for **Foundry Core v13+** and **D&D5e v5.1.x** (uses the ApplicationV2 API and the v5 data schema).  
> ▶️ **Demo video:** [Watch on YouTube](https://www.youtube.com/watch?v=Gue1p9HiASw)

**Manifest (raw):** https://raw.githubusercontent.com/erickhwk/marvelous-hawke-homebrews/refs/heads/main/module.json

---

## ✨ Feature: Creature Adjustments (NPC-only)

Quickly scale an NPC up or down without rewriting the stat block. The module adds a native header control to NPC sheets that opens a small dialog to pick an **Adjustment**:

- **Default** – restores the creature to its original state.  
- **Elite** – tougher and more dangerous.  
- **Weakling** – softer and less accurate.

When you **Save** an adjustment, the module:

1. **Applies mechanical changes** via a single Active Effect (`"Creature Adjustment"`).
2. **Recalculates Hit Points** and sets **current HP = new Max**.
3. **Shifts Challenge Rating** by **±1 step** (e.g., 1 → 2 for Elite; 2 → 1 for Weakling).
4. **Renames** the Actor (and any **unlinked** Token) with a prefix.
5. **Persists** the chosen mode in flags (survives reloads); removing the effect resets to **Default**.

### Numbers at a Glance

| Mode      | AC | Attack | DC  | Checks | Saves | Damage (per attack) | HP Multiplier | Min HP Delta | CR Shift | Name Prefix |
|-----------|----|--------|-----|--------|-------|----------------------|---------------|--------------|----------|-------------|
| **Elite** | +2 | +2     | +2  | +2     | +1    | +4                   | ×1.25         | +10          | +1 step  | `Elite `    |
| **Weakling** | −1 | −1  | −1  | −1     | −1    | −2                   | ×0.80         | −10          | −1 step  | `Weakling ` |
| **Default** | 0 | 0     | 0   | 0      | 0     | 0                    | ×1.00         | 0            | reset    | (none)      |

> The module stores “base” values the first time you apply an adjustment, so you can flip between modes without losing the original stat line.

### What Exactly Changes?

- **Active Effect keys** (D&D5e v5):
  - `system.attributes.ac.bonus`, `system.attributes.ac.value`
  - `system.bonuses.{mwak|rwak|msak|rsak}.attack`
  - `system.bonuses.{mwak|rwak|msak|rsak}.damage`
  - `system.bonuses.spell.dc`
  - `system.bonuses.abilities.{check|save}`
- **HP handling:** recompute `system.attributes.hp.max` with multiplier/min delta and set `system.attributes.hp.value` to the same number.
- **CR handling:** convert `system.details.cr` to the standard step scale (0, 1/8, 1/4, 1/2, 1–30) and shift ±1 step; write back the numeric value expected by D&D5e.
- **Naming:** save original Actor/Token names as flags and add/remove the `Elite ` / `Weakling ` prefix automatically.
- **Scope:** The header control and all effects apply **only to NPC actors**. PCs are never affected.

---

## 🧭 Usage

1. Open any **NPC** sheet.  
2. Click the **“Adjustment: …”** header control (slider icon).  
3. Choose **Default**, **Elite**, or **Weakling** and press **Save**.  
4. The effect, HP, CR, and name prefix update immediately.

For unlinked tokens, the token’s display name is updated alongside the actor.

---

## 📦 Installation

1. In Foundry, go to **Add-on Modules → Install Module**.  
2. Paste the manifest URL and install:

   - **Manifest (raw):** https://raw.githubusercontent.com/erickhwk/marvelous-hawke-homebrews/refs/heads/main/module.json

3. Enable **Hawke’s Marvelous Homebrews** in **Game Settings → Manage Modules**.

> When publishing updates, bump the `version` in `module.json` and ensure the `download` URL points to a versioned `.zip` (e.g., a GitHub Release).

---

## ✅ Compatibility

- **Foundry Core:** v13+  
- **Game System:** **D&D5e v5.1.x**  
- **Actors:** NPCs only  
- **Tokens:** Works with both linked and unlinked tokens (unlinked tokens keep their own name flag).

---

## ⚠️ Troubleshooting

- **“Adjustment” button doesn’t appear** → Ensure you opened an **NPC** (not a PC), you’re on **Core v13+**, and using **D&D5e v5.1.x**.  
- **After reload, header shows “Default” but effect is active** → Open the dialog and re-save once (this re-seeds flags for imported/migrated actors).  
- **On Windows, update fails with EBUSY** → Close the world/Foundry and any editors holding the module folder, remove the old folder under `Data/modules/…`, then reinstall.

---

## 🗺 Roadmap

- **Hard-Core toggle** in module settings (more aggressive modifiers and/or ±2 CR steps).  
- Optional GM-only visual cues for adjusted NPCs.  
- Additional homebrew features (e.g., Flanking, Wounded), each as separate feature modules within the same package.

---

## 🤝 Contributing

PRs are welcome! The codebase is organized by **feature folders** (service logic + small UI components) with shared **core** utilities. Please keep changes modular and documented.

---

## 📜 License & Credits

- © Hawke — Licensed under MIT (or your chosen license).  
- Built for **Foundry Virtual Tabletop** and the **D&D 5e** game system.  
- Thanks to the Foundry and D&D5e teams for their excellent APIs and tooling.
