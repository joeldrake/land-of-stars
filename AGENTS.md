# AGENTS.md – Stjärnornas land

Äventyrsspel i 8/16-bitarsstil, inspirerat av Zelda på NES, för ett barn på cirka 6 år som övar på att läsa.
Hjältinnan är en 6-årig tjej med svärd (A) och trollstav (B). Spelet ska gå att spela på dator, mobil och iPad.

## Kommandon

```sh
npm run dev        # Vite med --host (går att testa på iPad/mobil i samma nätverk)
npm test           # vitest: validerar alla världsfiler (måste vara grönt)
npm run typecheck
npm run build
```

## Stack och arkitektur

- Vanilla TypeScript, Vite och en `<canvas>`. Inget ramverk.
- **All grafik ritas i kod** i `src/game/art.ts`: pixel-sprites som ASCII-kartor och rutor med enkla primitiver. Inga bildfiler.
- Intern upplösning är 256×224 (16×11 rutor à 16 px plus 48 px HUD), ritad med `RENDER_SCALE` 3 så att den blir skarp. CSS skalar sedan bilden.
- `src/game/game.ts` innehåller spellogik och rendering. `world.ts` läser världsfilerna via `import.meta.glob`. Övriga filer: `input.ts` (tangentbord och touch), `hud.ts`, `save.ts`.
- `src/main.ts` sköter menyer och inställningar som HTML-overlay. `src/ui/dialog.ts` är textrutan.
- `src/cloud.ts` hanterar Supabase-inloggning (e-post med OTP-kod) och tabellen `saves`. `src/storage.ts` har `SaveManager` (localStorage plus synk).

## Världen

- En textfil per skärm, 16 tecken × 11 rader. Teckenförklaring och metarader (`@door`, `@exit`, `@npc`, `@reward`) finns i `src/world/README.md`.
- Överjorden ligger i `src/world/overworld/<x>_<y>.txt` (16×8, start `7_7`). Grottor ligger i `src/world/caves/` och borgar i `src/world/dungeons/<id>/<x>_<y>.txt`.
- Överjorden skapades **en gång** av `scripts/generate-overworld.mjs`. Txt-filerna är nu källan och redigeras för hand. Kör **inte** generatorn igen (`--force` skriver över handredigeringar) utan att fråga.
- Öppna kanter måste matcha grannskärmen, och dörrar och utgångar måste landa på gångbara rutor. `npm test` kontrollerar detta.
- Kartan, figurerna och grafiken är **egna**. Skalan och upplägget liknar NES-Zelda, men kopiera inte Nintendos karta, figurer, namn eller musik.

## Texter (viktigt)

- Alla texter i spelet finns i `src/i18n/sv.ts` och `src/i18n/en.ts`. `en.ts` är typad mot `sv.ts`, så varje nyckel måste finnas i båda.
- Texterna ska vara **mycket korta och enkla**, med ord som en sexåring kan läsa. `t()` gör om allt till VERSALER.
- `|` delar upp en text i flera rutor. `{name}` ersätts med hjältinnans namn, som går att ändra i inställningarna.

## Sparning

- `SaveData` finns i `src/game/save.ts`. Nya fält ska få standardvärden i `normalizeSave`, så att gamla sparningar fortfarande går att läsa.
- Flaggor är strängnycklar: `got:<loc>:<x>,<y>`, `open:<loc>:<x>,<y>`, `boss:<loc>` och `intro`.
- Den nyaste `updatedAt` vinner. En trigger i databasen (`supabase/migrations/0001_saves.sql`) stoppar äldre skrivningar.
- Utan `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) sparar spelet bara lokalt.

## Testa i webbläsare

I dev-läge finns spelet som `window.game`. Det är bra för att placera spelaren eller läsa av tillståndet i automatiska tester (till exempel Playwright).

## Status och nästa steg

Klart: överjord, 3 grottor, borg 1 (8 rum, nycklar, trollstav, bossen Slemkungen, stjärna), döden med återstart, HUD, sv/en, touchkontroller och sparning.
Inte gjort än: ljud, fler borgar, butik för ädelstenarna. Supabase-inloggningen är inte testad mot ett riktigt projekt.
