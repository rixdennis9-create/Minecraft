# Minecraft Bedrock Add-ons

## Holzgolem
Bau aus Holz einen Golem, der 50 Blöcke um seinen Beschwörungsort beschützt.

**Installieren (Handy):** Diesen Link im Browser (Chrome/Safari) öffnen, dann „Öffnen mit Minecraft“:

https://rixdennis9-create.github.io/minecraft/Holzgolem.mcaddon

Oder die Download-Seite: https://rixdennis9-create.github.io/minecraft/

### Bauplan (ab Version 1.2.0)
Eine senkrechte Säule, 5 Blöcke hoch – im Überlebensmodus einfach Block für Block setzen:
```
[X]   X = Stein oder Bruchstein (1x) – als Letztes draufsetzen
[B]   B = Holzbretter (4x) – jede Holzart, auch gemischt
[B]
[B]
[B]   <- hier erscheint der Golem
```
- Genau 4 Bretter – ein 5. Brett darunter macht den Bau ungültig. Stämme, Holz, Steinziegel o. Ä. zählen nicht.
- Rund um die **unteren 3 Blöcke** der Säule (je 8 Nachbarn) muss Platz sein (Luft, Gras, Blumen, Schnee, Fackeln …). Sonst bleibt das Bauwerk stehen und es kommt eine Meldung.
- Der Bau wird erst verbraucht, wenn der Golem wirklich erschienen ist.

### Limit & Live-Card
- **Max. 2 aktive Holzgolems pro Spieler.** Beim dritten Versuch: „Golem-Limit erreicht: 2/2“, das Bauwerk bleibt stehen.
- Beim **ersten** Golem gibt es die **Holzgolem-Live-Card** (einmalig). Inventar voll → sie fällt vor die Füße (verschwindet nicht).
- Die Karte zeigt den Bestand im Namen und Tooltip, z. B. `Holzgolem-Live-Card (1/2)` / „Status: 1 Platz verfügbar“.
  In der Hand halten → Bestand live in der Actionbar. Benutzen (Touch: Knopf „Golems anzeigen“) → Liste mit Koordinaten im Chat.
- Die Karte bleibt beim Tod erhalten und kann nicht weggeworfen oder in Kisten gelegt werden. Fehlt sie beim Beitreten, gibt es eine neue; Duplikate werden entfernt.

**Grenzen (Bedrock-API):**
- Ein Item-Icon kann nicht live neu gezeichnet werden – deshalb Name/Tooltip/Actionbar.
- Golems aus dem **Spawnei oder per /summon** haben keinen Besitzer und zählen nicht zum Limit.
- Ein Golem, der **ohne Tod** verschwindet (z. B. per Befehl entfernt), wird erst ausgetragen, wenn sein letzter Ort geladen ist und er dort ~15 s lang fehlt. Golems in entladenen Chunks zählen weiter.
- Zuordnung über die Spieler-ID der Welt (`player.id`), gespeichert in World-Dynamic-Properties (`wg:p:<id>`) und am Golem (`owner_id`).

### Entwicklung
```
node --import ./tests/register.mjs --test tests/holzgolem.test.mjs   # Script-Logik gegen eine API-Attrappe
python3 tools/check_addon.py holzgolem/src/Holzgolem_BP holzgolem/src/Holzgolem_RP   # Pack-Konsistenz
```
Neue Version bauen – zählt die Version hoch, schreibt sie in die Pack-Namen (z. B. „Holzgolem v1.1.1“),
hält die RP-Abhängigkeit im BP synchron und baut `.mcaddon` + `.mcpack` neu:
```
python3 tools/build_addon.py patch   # oder minor / major; ohne Argument nur neu bauen
```

### In-Game-Checkliste (nur im echten Spiel prüfbar)
1. Survival: 4 Bretter + Stein → genau ein Golem, Säule verschwindet
2. 3 oder 5 Bretter → nichts passiert
3. Stämme statt Brettern / Steinziegel statt Stein → nichts passiert
4. Stein direkt neben der Säule → Meldung „Zu wenig Platz“, Säule bleibt
5. Erster Golem → genau eine Live-Card
6. Zweiter Golem klappt, Karte zeigt 2/2
7. Dritter → „Golem-Limit erreicht: 2/2“, Säule bleibt
8. Golem töten → Karte zeigt 1/2
9. Weit weglaufen (Chunks entladen), zurückkommen → weiterhin 1/2
10. Welt verlassen und neu betreten → Bestand und Karte stimmen
11. Alles auf Android mit Touch-Steuerung
