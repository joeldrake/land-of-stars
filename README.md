# Stjärnornas land

Ett litet äventyrsspel i 8/16-bitarsstil. Man spelar en 6-årig tjej med svärd och trollstav.
Texterna är korta och visas med stora bokstäver så att ett barn kan öva på att läsa (🔊 läser upp texten).

Spelas på dator (tangentbord), mobil och iPad (styrkors + A/B på skärmen).

## Spela

**Spela här:** https://land-of-stars.joeldrak3.workers.dev

Tangenter: pilar/WASD = gå, mellanslag/J/Z = svärd (A), X/K = magi (B), Esc = meny.

På iPad/iPhone: dela → "Lägg till på hemskärmen" ger helskärm.

Utan inlogging sparas spelet bara i webbläsaren. Logga in under Inställningar för att spela på fler enheter. Den nyaste sparningen vinner.

## Utveckling

```sh
npm install
npm run dev        # http://localhost:5173 (även på nätverket, för att testa på iPad/mobil)
npm test           # kontrollerar att alla världsfiler hänger ihop
npm run build      # statiska filer i dist/ – går att lägga på valfritt webbhotell
```



## Struktur

```
src/world/        världen som textfiler (se src/world/README.md)
src/game/         spelmotor: game.ts (logik + rendering), art.ts (all grafik, ritad i kod),
                  world.ts (läser världsfilerna), input.ts, hud.ts, save.ts
src/i18n/         svenska och engelska texter
src/ui/dialog.ts  textrutan
src/main.ts       menyer, inställningar, start
src/cloud.ts      Supabase-inloggning och sparning
scripts/generate-overworld.mjs   genererade grundkartan en gång (kör inte igen utan --force)
```
