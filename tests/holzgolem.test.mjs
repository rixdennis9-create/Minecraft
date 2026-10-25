// Automatische Tests der Holzgolem-Scripts gegen eine @minecraft/server-Attrappe.
//   node --import ./tests/register.mjs --test tests/
// Sie prüfen die Script-Logik – NICHT das echte Spiel (siehe In-Game-Checkliste in der README).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, advance, resetWorld, placeBlock, addPlayer } from "@minecraft/server";
import { findColumn, isPlank, isTopBlock } from "../holzgolem/src/Holzgolem_BP/scripts/structure.js";
import "../holzgolem/src/Holzgolem_BP/scripts/main.js";

const GOLEM = "dr:wood_golem";
const CARD = "dr:golem_card";
const ow = () => world.getDimension("overworld");

/** Baut eine Säule von unten nach oben, Block für Block wie ein Spieler. */
function build(player, dim, base, plank = "minecraft:oak_planks", top = "minecraft:stone", plankCount = 4, topCount = 1) {
  let y = base.y;
  for (let i = 0; i < plankCount; i++) placeBlock(player, dim, { x: base.x, y: y++, z: base.z }, plank);
  for (let i = 0; i < topCount; i++) placeBlock(player, dim, { x: base.x, y: y++, z: base.z }, top);
}

const golems = () => world.entities.filter((e) => e.typeId === GOLEM && e.alive && !e.removed);
const blockAt = (dim, x, y, z) => dim.getBlock({ x, y, z }).typeId;
const cards = (p) => p.inventory.slots.filter((s) => s?.typeId === CARD);
const columnIntact = (dim, base, n = 5) =>
  Array.from({ length: n }, (_, i) => blockAt(dim, base.x, base.y + i, base.z)).every((t) => t !== "minecraft:air");
const seconds = (s) => advance(20 * s);

beforeEach(() => resetWorld());

test("Blockerkennung: Bretter, Stein", () => {
  assert.ok(isPlank("minecraft:oak_planks"));
  assert.ok(isPlank("minecraft:crimson_planks"));
  assert.ok(isPlank("minecraft:bamboo_planks"));
  assert.ok(!isPlank("minecraft:oak_log"));
  assert.ok(!isPlank("minecraft:oak_wood"));
  assert.ok(!isPlank("minecraft:oak_slab"));
  assert.ok(isTopBlock("minecraft:stone"));
  assert.ok(isTopBlock("minecraft:cobblestone"));
  assert.ok(!isTopBlock("minecraft:stone_bricks"));
  assert.ok(!isTopBlock("minecraft:oak_planks"));
});

test("1) gültige Säule (4 Bretter + Stein) beschwört genau einen Golem", () => {
  const p = addPlayer("Dennis");
  const base = { x: 10, y: 64, z: 10 };
  build(p, ow(), base, "minecraft:oak_planks", "minecraft:stone", 4, 0);
  assert.equal(golems().length, 0, "vor dem Stein darf nichts passieren");
  placeBlock(p, ow(), { x: 10, y: 68, z: 10 }, "minecraft:stone");
  assert.equal(golems().length, 1);
  const g = golems()[0];
  assert.deepEqual(g.location, { x: 10.5, y: 64, z: 10.5 });
  assert.equal(g.getDynamicProperty("owner_id"), p.id);
  for (let y = 64; y <= 68; y++) assert.equal(blockAt(ow(), 10, y, 10), "minecraft:air");
  // weitere Events / Ticks erzeugen keinen zweiten Golem
  seconds(10);
  assert.equal(golems().length, 1);
});

test("1b) gemischte Bretter, Bruchstein und Bauen von oben nach unten funktionieren", () => {
  const p = addPlayer("Dennis");
  const d = ow();
  const ids = ["minecraft:birch_planks", "minecraft:spruce_planks", "minecraft:crimson_planks", "minecraft:cherry_planks", "minecraft:cobblestone"];
  // erst Stein und obere Bretter (in der Luft gesetzt), das unterste Brett zuletzt
  for (let i = 4; i >= 1; i--) placeBlock(p, d, { x: 0, y: 70 + i, z: 0 }, ids[i]);
  assert.equal(golems().length, 0);
  placeBlock(p, d, { x: 0, y: 70, z: 0 }, ids[0]);
  assert.equal(golems().length, 1);
});

test("2) falsche Anzahl Bretter verhindert das Spawnen", () => {
  const p = addPlayer("Dennis");
  build(p, ow(), { x: 0, y: 64, z: 0 }, undefined, undefined, 3, 1);
  assert.equal(golems().length, 0, "3 Bretter sind zu wenig");
  assert.ok(columnIntact(ow(), { x: 0, y: 64, z: 0 }, 4));
  build(p, ow(), { x: 5, y: 64, z: 5 }, undefined, undefined, 5, 1);
  assert.equal(golems().length, 0, "5 Bretter sind zu viele");
  assert.ok(columnIntact(ow(), { x: 5, y: 64, z: 5 }, 6));
});

test("3) Stämme statt Brettern oder falscher Stein verhindern das Spawnen", () => {
  const p = addPlayer("Dennis");
  build(p, ow(), { x: 0, y: 64, z: 0 }, "minecraft:oak_log", "minecraft:stone");
  build(p, ow(), { x: 4, y: 64, z: 0 }, "minecraft:oak_wood", "minecraft:stone");
  build(p, ow(), { x: 8, y: 64, z: 0 }, "minecraft:oak_planks", "minecraft:stone_bricks");
  build(p, ow(), { x: 12, y: 64, z: 0 }, "minecraft:oak_planks", "minecraft:dirt");
  assert.equal(golems().length, 0);
  assert.equal(p.messages.length, 0);
});

test("4) zu wenig Platz verhindert das Spawnen, Bauwerk bleibt stehen", () => {
  const p = addPlayer("Dennis");
  const base = { x: 0, y: 64, z: 0 };
  ow().getBlock({ x: 1, y: 65, z: 0 }).setType("minecraft:stone"); // Wand direkt daneben
  build(p, ow(), base);
  assert.equal(golems().length, 0);
  assert.ok(columnIntact(ow(), base));
  assert.match(p.messages.at(-1), /Zu wenig Platz/);
  // Gras daneben stört nicht
  ow().getBlock({ x: 11, y: 64, z: 0 }).setType("minecraft:short_grass");
  build(p, ow(), { x: 10, y: 64, z: 0 });
  assert.equal(golems().length, 1);
});

test("4b) Spawn schlägt fehl -> nichts wird verbraucht", () => {
  const p = addPlayer("Dennis");
  world.failNextSpawn = true;
  build(p, ow(), { x: 0, y: 64, z: 0 });
  assert.equal(golems().length, 0);
  assert.ok(columnIntact(ow(), { x: 0, y: 64, z: 0 }));
  assert.equal(cards(p).length, 0);
});

test("5–7) erster Spawn gibt genau eine Karte, zweiter geht, dritter wird blockiert", () => {
  const p = addPlayer("Dennis");
  build(p, ow(), { x: 0, y: 64, z: 0 });
  assert.equal(cards(p).length, 1);
  const c = cards(p)[0];
  assert.equal(c.nameTag, "§6Holzgolem-Live-Card §7(1/2)");
  assert.deepEqual(c.getLore().slice(0, 2), ["§eAktive Golems: §f1/2", "§eStatus: §a1 Platz verfügbar"]);
  assert.equal(c.keepOnDeath, true);
  assert.equal(c.lockMode, "inventory");

  build(p, ow(), { x: 10, y: 64, z: 0 });
  assert.equal(golems().length, 2);
  assert.equal(cards(p).length, 1, "keine zweite Karte");
  assert.match(cards(p)[0].getLore()[1], /Limit erreicht/);

  build(p, ow(), { x: 20, y: 64, z: 0 });
  assert.equal(golems().length, 2, "dritter Golem blockiert");
  assert.ok(columnIntact(ow(), { x: 20, y: 64, z: 0 }), "Bauwerk bleibt erhalten");
  assert.match(p.messages.at(-1), /Golem-Limit erreicht: 2\/2/);
});

test("Limit gilt pro Spieler", () => {
  const a = addPlayer("Dennis");
  const b = addPlayer("Freund");
  build(a, ow(), { x: 0, y: 64, z: 0 });
  build(a, ow(), { x: 10, y: 64, z: 0 });
  build(b, ow(), { x: 20, y: 64, z: 0 });
  assert.equal(golems().length, 3);
  assert.equal(cards(b)[0].nameTag, "§6Holzgolem-Live-Card §7(1/2)");
});

test("volles Inventar: Karte fällt vor die Füße, nur einmal", () => {
  const p = addPlayer("Dennis");
  for (let i = 0; i < 36; i++) p.inventory.slots[i] = { typeId: "minecraft:dirt", clone() { return this; } };
  build(p, ow(), { x: 0, y: 64, z: 0 });
  assert.equal(ow().drops.length, 1);
  assert.equal(ow().drops[0].item.typeId, CARD);
  build(p, ow(), { x: 10, y: 64, z: 0 });
  assert.equal(ow().drops.length, 1, "kein zweiter Drop");
});

test("8) Tod eines Golems aktualisiert Bestand und Karte, danach ist wieder Platz", () => {
  const p = addPlayer("Dennis");
  build(p, ow(), { x: 0, y: 64, z: 0 });
  build(p, ow(), { x: 10, y: 64, z: 0 });
  golems()[0].kill();
  assert.equal(cards(p)[0].nameTag, "§6Holzgolem-Live-Card §7(1/2)");
  golems()[0].kill();
  assert.match(cards(p)[0].getLore()[1], /Bereit zum Beschwören/);
  build(p, ow(), { x: 20, y: 64, z: 0 });
  assert.equal(golems().length, 1);
});

test("9) entladener Golem zählt weiter und wird nicht entfernt", () => {
  const p = addPlayer("Dennis");
  build(p, ow(), { x: 500, y: 64, z: 500 });
  ow().unloaded.push({ x1: 400, z1: 400, x2: 600, z2: 600 });
  seconds(120);
  assert.match(cards(p)[0].nameTag, /\(1\/2\)/);
  ow().unloaded = [];
  seconds(10);
  assert.match(cards(p)[0].nameTag, /\(1\/2\)/);
  assert.equal(world.getDynamicPropertyIds().length, 1, "genau ein Spieler-Eintrag");
});

test("9b) ohne Tod entfernter Golem (geladenes Gebiet) wird nach kurzer Zeit ausgetragen", () => {
  const p = addPlayer("Dennis");
  build(p, ow(), { x: 0, y: 64, z: 0 });
  golems()[0].remove();
  seconds(5);
  assert.match(cards(p)[0].nameTag, /\(1\/2\)/, "nicht sofort");
  seconds(15);
  assert.match(cards(p)[0].nameTag, /\(0\/2\)/);
});

test("10) nach Neuladen: kein Doppelzählen, verlorene Daten werden wiederhergestellt, Karte korrekt", () => {
  const p = addPlayer("Dennis");
  build(p, ow(), { x: 0, y: 64, z: 0 });
  const key = world.getDynamicPropertyIds()[0];
  const before = world.getDynamicProperty(key);
  seconds(30); // viele Abgleiche
  assert.equal(JSON.parse(world.getDynamicProperty(key)).g && Object.keys(JSON.parse(world.getDynamicProperty(key)).g).length, 1);
  // Bestand kaputt/verloren -> Golem meldet sich über owner_id selbst zurück
  world.setDynamicProperty(key, "{kaputt");
  seconds(2);
  assert.equal(Object.keys(JSON.parse(world.getDynamicProperty(key)).g).length, 1);
  assert.ok(before);

  // Beitreten ohne Karte (z. B. per /clear gelöscht) -> genau eine neue Karte
  world.setDynamicProperty(key, JSON.stringify({ ...JSON.parse(world.getDynamicProperty(key)), card: true }));
  p.inventory.slots.fill(undefined);
  world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });
  seconds(2);
  assert.equal(cards(p).length, 1);
  assert.match(cards(p)[0].nameTag, /\(1\/2\)/);
  // Duplikat (z. B. aufgehobener Drop) wird entfernt
  p.inventory.addItem(p.inventory.getItem(p.inventory.slots.findIndex((s) => s?.typeId === CARD)));
  assert.equal(cards(p).length, 2);
  seconds(5);
  assert.equal(cards(p).length, 1);
});

test("11-teilweise) Nether: Bau funktioniert auch dort", () => {
  const p = addPlayer("Dennis", "nether");
  const nether = world.getDimension("nether");
  build(p, nether, { x: 3, y: 40, z: 3 }, "minecraft:crimson_planks", "minecraft:cobblestone");
  assert.equal(golems().length, 1);
  assert.equal(golems()[0].getDynamicProperty("home_dim"), "minecraft:nether");
});

test("Karte in der Hand zeigt den Bestand live in der Actionbar", () => {
  const p = addPlayer("Dennis");
  build(p, ow(), { x: 0, y: 64, z: 0 });
  p.selectedSlotIndex = p.inventory.slots.findIndex((s) => s?.typeId === CARD);
  p.actionbar.length = 0;
  seconds(1);
  assert.match(p.actionbar.at(-1), /Holzgolems: §f1\/2/);
});

test("findColumn findet die Säule von jeder Position aus", () => {
  const blocks = new Map();
  for (let i = 0; i < 4; i++) blocks.set(64 + i, "minecraft:oak_planks");
  blocks.set(68, "minecraft:stone");
  const typeAt = (x, y) => (x === 0 ? blocks.get(y) : undefined);
  for (let y = 64; y <= 68; y++) assert.deepEqual(findColumn(typeAt, { x: 0, y, z: 0 }), { x: 0, y: 64, z: 0 });
});
