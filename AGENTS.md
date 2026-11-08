# AGENTS.md – Stjärnornas land

Äventyrsspel i 8/16-bitarsstil, inspirerat av Zelda på NES, för ett barn på cirka 6 år som övar på att läsa.
Hjältinnan är en 6-årig tjej med svärd (A) och trollstav (B). Spelet ska gå att spela på dator, mobil och iPad.

## Kommandon

```sh
npm run dev        # Vite med --host (går att testa på iPad/mobil i samma nätverk)
npm test           # vitest: validerar alla världsfiler (måste vara grönt)
npm run typecheck
npm run build
npm run icons      # ritar om app-ikoner, favicon och splash-bilder
```

## Stack och arkitektur

- Vanilla TypeScript, Vite och en `<canvas>`. Inget ramverk.
- **All grafik ritas i kod** i `src/game/art.ts`: pixel-sprites som ASCII-kartor och rutor med enkla primitiver. Inga bildfiler.
- Undantag: app-ikoner, favicon och iPhone-splash (`public/*.png`, `public/splash/`) genereras av `npm run icons` (`scripts/generate-icons.mjs`) från samma pixeldata (`src/game/sprites.ts`). Redigera inte PNG-filerna för hand, och kör skriptet igen om hjältinnan eller stjärnan ändras.
- Intern upplösning är 256×224 (16×11 rutor à 16 px plus 48 px HUD), ritad med `RENDER_SCALE` 3 så att den blir skarp. CSS skalar sedan bilden.
- `src/game/game.ts` innehåller spellogik och rendering. `world.ts` läser världsfilerna via `import.meta.glob`. Övriga filer: `input.ts` (tangentbord och touch), `hud.ts`, `save.ts`, `sfx.ts` (ljudeffekter med Web Audio, inga ljudfiler).
- `src/main.ts` sköter menyer och inställningar som HTML-overlay. `src/ui/dialog.ts` är textrutan.
- **Styrning** (`src/game/touch.ts`): inget styrkors eller knappar på skärmen. Touch och mus fungerar likadant direkt på spelskärmen: håll för att gå mot fingret/musen, tryck för att gå dit eller prata med en person, dra snabbt för att hugga (åt det håll fingret skar, bred båge; studsar skott i bågen), rita en ring för snurrattacken (360°, studsar skott runt om) och dubbeltryck/dubbelklick för B-saken mot den punkten. Tangentbordet finns kvar: pilar, mellanslag (hugg), `Q` (snurra), `X` (B), `I` (väska), `M` (karta). Texter som nämner knappar har en touchversion med nyckeln `<key>_touch` (`game.txt()` väljer).
- `src/cloud.ts` hanterar Supabase-inloggning (e-post med OTP-kod) och tabellen `saves`. `src/storage.ts` har `SaveManager` (localStorage plus synk).

## Världen

- En textfil per skärm, 16 tecken × 11 rader. Teckenförklaring och metarader (`@door`, `@exit`, `@npc`, `@reward`) finns i `src/world/README.md`.
- Överjorden ligger i `src/world/overworld/<x>_<y>.txt` (16×8, start `7_7`). Grottor och hus ligger i `src/world/caves/` och borgar i `src/world/dungeons/<id>/<x>_<y>.txt`.
- Ordningen i spelet: svärd (`7_7`) → Borg 1 `d1` (`13_4`, trollstav) → Vattenborgen `d2` (ön på `13_2`, skjut magi på kristallen, bomber) → Spökborgen `d3` (spräng gravstenen med spricka på `2_4`, bumerang) → hämta stjärnnyckeln i dammen på `7_1` med bumerangen → Stjärnborgen `d4` (Stjärnslukaren, stjärnvingar).
- **Vägvisning** (`src/game/guide.ts`): `currentGoal()` räknar ut nästa mål från sparningen (svärd → d1 → kristallen/d2 → gravstenen/d3 → skölden → stjärnnyckeln → d4 → hemliga ön). En pil i världen visar den riktiga vägen dit (kan stängas av i inställningarna), målet blinkar på kartan och minikartan, och **Ugglan Ulla** (`@npc x,y owl owl`, på `7_7`, `12_4`, `3_4`) säger `goal_<id>`. Lägger du till ett steg i spelet: uppdatera `currentGoal()` och lägg till en `goal_<id>`-text.
- Sandvägar (`,`) i gräset visar huvudvägarna, och vägskyltar (`sign`) står vid korsningar. Buskar inne på skärmen kan huggas ner (ibland ett hjärta/en ädelsten; en `@door` under en busk blir en hemlig trappa).
- Landmärken: blomsterstjärnan `7_6`, stencirkeln `6_5`, buskvirrvarret `9_4`, grodpölen `10_5`, ruinen `4_6`, önskebrunnen `8_4` (ädelstenar bara bumerangen når), blomsterängen `11_6`.
- Tips finns hos fiskaren (`12_3`), dödgrävaren (`2_4`) och stjärnkikaren (`7_2`). Kartan får man av mormor tillsammans med svärdet. En knuffbar gravsten på `1_5` döljer ett hemligt rum. En spricka i bergväggen på `9_1` (spräng den) leder till skölden, som studsar tillbaka skott framifrån. Skölden behövs mot Stjärnslukaren: bara hans stjärnklot, studsat tillbaka, skadar honom, och klotet kan bara studsas med skölden (inte svärdet). Stjärnkikaren och en skylt före bossen tipsar om det. Efter slutet: den hemliga ön på `15_7` går bara att nå med vingarna. Där bor Stjärnfén, som ger Stjärnkronan (syns på hjältinnan).
- Överjorden skapades **en gång** av `scripts/generate-overworld.mjs`. Txt-filerna är nu källan och redigeras för hand. Kör **inte** generatorn igen (`--force` skriver över handredigeringar) utan att fråga.
- Öppna kanter måste matcha grannskärmen, och dörrar och utgångar måste landa på gångbara rutor. `npm test` kontrollerar detta.
- Kartan, figurerna och grafiken är **egna**. Skalan och upplägget liknar NES-Zelda, men kopiera inte Nintendos karta, figurer, namn eller musik.

## Texter (viktigt)

- Alla texter i spelet finns i `src/i18n/sv.ts` och `src/i18n/en.ts`. `en.ts` är typad mot `sv.ts`, så varje nyckel måste finnas i båda.
- Texterna ska vara **mycket korta och enkla**, med ord som en sexåring kan läsa. `t()` gör om allt till VERSALER.
- `|` delar upp en text i flera rutor. `{name}` ersätts med hjältinnans namn, som går att ändra i inställningarna.

## Sparning

- `SaveData` finns i `src/game/save.ts`. Nya fält ska få standardvärden i `normalizeSave`, så att gamla sparningar fortfarande går att läsa.
- Flaggor är strängnycklar: `got:<loc>:<x>,<y>`, `open:<loc>:<x>,<y>` (lås, sprickor, guldport), `solved:<loc>` (galler/facklor), `switch:<loc>` (kristall/bro), `boss:<loc>`, `intro` och `ending`.
- Nycklar räknas per borg (`keys: { d1: 1, ... }`). Gamla sparningar med ett tal flyttas till `d1`.
- Den nyaste `updatedAt` vinner. En trigger i databasen (`supabase/migrations/0001_saves.sql`) stoppar äldre skrivningar.
- Utan `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) sparar spelet bara lokalt.

## Testa i webbläsare

I dev-läge finns spelet som `window.game`. Det är bra för att placera spelaren eller läsa av tillståndet i automatiska tester (till exempel Playwright).

## Status och nästa steg

Klart: överjord, grottor och hus med personer, fyra borgar (Slemkungen, Krabbkungen, Spökkungen, Stjärnslukaren), pussel (knuffa stenar, plattor, galler, facklor, kristaller och broar, sprickor att spränga), bomber, bumerang, sköld, karta, stjärnvingar som slut, väska (inventarie, `I`) och världskarta (`M`, eller tryck på minikartan), flaggor och en snäll figur vid varje avklarad borg (slemmet, krabban, spöket, stjärnbarnet), döden med återstart, HUD, sv/en, touchkontroller, sparning och ljudeffekter.
Inte gjort än: musik, butik för ädelstenarna. Supabase-inloggningen är inte testad mot ett riktigt projekt.
