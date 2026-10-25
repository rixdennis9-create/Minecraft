import { ItemStack, ItemLockMode } from "@minecraft/server";
import { cardText } from "./registry.js";

// ============================================================
//  Holzgolem-Live-Card
//  Bedrock kann ein Item-Icon nicht live neu zeichnen. Die Karte zeigt
//  den Bestand deshalb im Item-Namen (sichtbar beim Auswählen in der
//  Hotbar) und im Tooltip (Lore). Solange man sie in der Hand hält,
//  steht der Bestand zusätzlich live in der Actionbar.
// ============================================================

export const CARD_ID = "dr:golem_card";

function inventoryOf(player) {
  try {
    return player.getComponent("minecraft:inventory")?.container;
  } catch {
    return undefined;
  }
}

function applyText(item, count, limit) {
  const t = cardText(count, limit);
  item.nameTag = t.name;
  item.setLore(t.lore);
  item.keepOnDeath = true; // bleibt beim Tod erhalten
  item.lockMode = ItemLockMode.inventory; // kann nicht weggeworfen oder in Kisten gelegt werden
}

function isUpToDate(item, count, limit) {
  const t = cardText(count, limit);
  const lore = item.getLore();
  return (
    item.nameTag === t.name &&
    lore.length === t.lore.length &&
    lore.every((l, i) => l === t.lore[i]) &&
    item.keepOnDeath === true &&
    item.lockMode === ItemLockMode.inventory
  );
}

/** Gibt dem Spieler eine Karte. Volles Inventar -> Karte fällt vor seine Füße. */
export function giveCard(player, count, limit) {
  const item = new ItemStack(CARD_ID, 1);
  applyText(item, count, limit);
  const inv = inventoryOf(player);
  const leftover = inv ? inv.addItem(item) : item;
  if (!leftover) return "inventory";
  player.dimension.spawnItem(leftover, player.location);
  return "dropped";
}

/**
 * Bringt die Karte(n) im Inventar auf den aktuellen Stand und entfernt Duplikate.
 * redeliver: Fehlt die Karte, wird sie neu gegeben (beim Beitreten / Respawn).
 * Rückgabe: "updated" | "ok" | "missing" | Ergebnis von giveCard
 */
export function refreshCard(player, count, limit, redeliver = false) {
  const inv = inventoryOf(player);
  if (!inv) return "missing";
  const slots = [];
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it?.typeId === CARD_ID) slots.push({ i, it });
  }
  if (slots.length === 0) return redeliver ? giveCard(player, count, limit) : "missing";

  for (const extra of slots.slice(1)) inv.setItem(extra.i, undefined);
  const { i, it } = slots[0];
  if (isUpToDate(it, count, limit)) return slots.length > 1 ? "updated" : "ok";
  applyText(it, count, limit);
  inv.setItem(i, it);
  return "updated";
}

/** Hält der Spieler gerade die Karte in der Hand? */
export function isHoldingCard(player) {
  const inv = inventoryOf(player);
  return inv?.getItem(player.selectedSlotIndex)?.typeId === CARD_ID;
}
