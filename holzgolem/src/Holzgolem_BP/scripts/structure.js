// ============================================================
//  Bauplan des Holzgolems (reine Logik, ohne Minecraft-Import –
//  dadurch auch außerhalb des Spiels testbar)
//
//   y+8  [S]   S = unverarbeiteter Holzstamm (4x, z. B. Eichenstamm)
//   y+7  [S]
//   y+6  [S]
//   y+5  [S]
//   y+4  [H]   H = Holz (voller Holzblock, 5x, z. B. Eichenholz)
//   y+3  [H]
//   y+2  [H]
//   y+1  [H]
//   y+0  [H]   <- hier erscheint der Golem
// ============================================================

export const WOOD_COUNT = 5;
export const LOG_COUNT = 4;
export const HEIGHT = WOOD_COUNT + LOG_COUNT;
// Der Golem ist ~1,4 Blöcke breit und ~2,9 hoch: um die unteren
// 3 Ebenen der Säule muss es frei sein.
export const CLEARANCE_HEIGHT = 3;

/** Voller Holzblock: Eichenholz, Fichtenholz, … (auch entrindet) und Nether-Hyphen. */
export function isWoodBlock(typeId) {
  return typeof typeId === "string" && (typeId.endsWith("_wood") || typeId.endsWith("_hyphae"));
}

/** Unverarbeiteter Holzstamm: Eichenstamm, …, Karmesin-/Wirrstiel – nicht entrindet. */
export function isRawLog(typeId) {
  return (
    typeof typeId === "string" &&
    (typeId.endsWith("_log") || typeId.endsWith("_stem")) &&
    !typeId.includes("stripped_")
  );
}

/** Kann der zuletzt gesetzte Block überhaupt Teil des Bauplans sein? */
export function isStructureBlock(typeId) {
  return isWoodBlock(typeId) || isRawLog(typeId);
}

/**
 * Sucht eine vollständige Säule, zu der der Block an `pos` gehört.
 * typeAt(x, y, z) liefert die Block-ID oder undefined (z. B. nicht geladen).
 * Gibt die unterste Position zurück oder undefined.
 *
 * Exakt 5 + 4: Ein sechster Holzblock darunter oder ein fünfter Stamm
 * darüber macht den Bau ungültig.
 */
export function findColumn(typeAt, pos) {
  for (let k = 0; k < HEIGHT; k++) {
    const baseY = pos.y - k;
    let ok = true;
    for (let i = 0; i < HEIGHT && ok; i++) {
      const id = typeAt(pos.x, baseY + i, pos.z);
      ok = i < WOOD_COUNT ? isWoodBlock(id) : isRawLog(id);
    }
    if (!ok) continue;
    if (isWoodBlock(typeAt(pos.x, baseY - 1, pos.z))) continue;
    if (isRawLog(typeAt(pos.x, baseY + HEIGHT, pos.z))) continue;
    return { x: pos.x, y: baseY, z: pos.z };
  }
  return undefined;
}

/** Alle 9 Positionen der Säule (von unten nach oben). */
export function columnPositions(base) {
  const out = [];
  for (let i = 0; i < HEIGHT; i++) out.push({ x: base.x, y: base.y + i, z: base.z });
  return out;
}

/**
 * Prüft den Platz rund um die unteren 3 Ebenen (8 Nachbarn je Ebene).
 * isFreeAt(x, y, z) -> true, wenn dort nichts Festes steht.
 * Gibt die blockierten Positionen zurück (leer = genug Platz).
 */
export function blockedAround(isFreeAt, base) {
  const blocked = [];
  for (let dy = 0; dy < CLEARANCE_HEIGHT; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        const p = { x: base.x + dx, y: base.y + dy, z: base.z + dz };
        if (!isFreeAt(p.x, p.y, p.z)) blocked.push(p);
      }
    }
  }
  return blocked;
}

// Blöcke ohne Kollision, die den Golem nicht behindern
const PASSABLE = new Set([
  "minecraft:air",
  "minecraft:short_grass",
  "minecraft:tall_grass",
  "minecraft:fern",
  "minecraft:large_fern",
  "minecraft:deadbush",
  "minecraft:snow_layer",
  "minecraft:torch",
  "minecraft:soul_torch",
  "minecraft:redstone_torch",
  "minecraft:vine",
  "minecraft:dandelion",
  "minecraft:poppy",
  "minecraft:blue_orchid",
  "minecraft:allium",
  "minecraft:azure_bluet",
  "minecraft:oxeye_daisy",
  "minecraft:cornflower",
  "minecraft:lily_of_the_valley",
  "minecraft:red_tulip",
  "minecraft:orange_tulip",
  "minecraft:white_tulip",
  "minecraft:pink_tulip",
  "minecraft:sunflower",
  "minecraft:lilac",
  "minecraft:rose_bush",
  "minecraft:peony",
]);

export function isPassable(typeId) {
  return PASSABLE.has(typeId);
}
