// ============================================================
//  Bauplan des Holzgolems (reine Logik, ohne Minecraft-Import –
//  dadurch auch außerhalb des Spiels testbar)
//
//   y+4  [X]   X = Stein (oder Bruchstein) – zuletzt draufsetzen
//   y+3  [B]   B = Holzbretter (4x, jede Holzart, auch gemischt)
//   y+2  [B]
//   y+1  [B]
//   y+0  [B]   <- hier erscheint der Golem
// ============================================================

export const PLANK_COUNT = 4;
export const TOP_COUNT = 1;
export const HEIGHT = PLANK_COUNT + TOP_COUNT;
// Der Golem ist ~1,4 Blöcke breit und ~2,9 hoch: um die unteren
// 3 Ebenen der Säule muss es frei sein.
export const CLEARANCE_HEIGHT = 3;

const TOP_BLOCKS = new Set(["minecraft:stone", "minecraft:cobblestone"]);

/** Holzbretter: Eichenbretter, Fichtenbretter, …, Karmesin-/Wirrbretter, Bambusbretter. */
export function isPlank(typeId) {
  return typeof typeId === "string" && typeId.endsWith("_planks");
}

/** Abschluss oben: Stein oder Bruchstein. */
export function isTopBlock(typeId) {
  return TOP_BLOCKS.has(typeId);
}

/** Kann der zuletzt gesetzte Block überhaupt Teil des Bauplans sein? */
export function isStructureBlock(typeId) {
  return isPlank(typeId) || isTopBlock(typeId);
}

/**
 * Sucht eine vollständige Säule, zu der der Block an `pos` gehört.
 * typeAt(x, y, z) liefert die Block-ID oder undefined (z. B. nicht geladen).
 * Gibt die unterste Position zurück oder undefined.
 *
 * Exakt 4 + 1: Ein fünftes Brett darunter macht den Bau ungültig.
 */
export function findColumn(typeAt, pos) {
  for (let k = 0; k < HEIGHT; k++) {
    const baseY = pos.y - k;
    let ok = true;
    for (let i = 0; i < HEIGHT && ok; i++) {
      const id = typeAt(pos.x, baseY + i, pos.z);
      ok = i < PLANK_COUNT ? isPlank(id) : isTopBlock(id);
    }
    if (!ok) continue;
    if (isPlank(typeAt(pos.x, baseY - 1, pos.z))) continue;
    return { x: pos.x, y: baseY, z: pos.z };
  }
  return undefined;
}

/** Alle Positionen der Säule (von unten nach oben). */
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
