# Stjärnornas land

Ett litet äventyrsspel i 8/16-bitarsstil. Man spelar en 6-årig tjej med svärd och trollstav.
Texterna är korta och visas med stora bokstäver så att ett barn kan öva på att läsa (🔊 läser upp texten).

Spelas på dator (tangentbord), mobil och iPad (styrkors + A/B på skärmen).

## Kom igång

```sh
npm install
npm run dev        # http://localhost:5173 (även på nätverket, för att testa på iPad/mobil)
npm test           # kontrollerar att alla världsfiler hänger ihop
npm run build      # statiska filer i dist/ – går att lägga på valfritt webbhotell
```

Tangenter: pilar/WASD = gå, mellanslag/J/Z = svärd (A), X/K = magi (B), Esc = meny.

På iPad/iPhone: dela → "Lägg till på hemskärmen" ger helskärm.

## Spara på flera enheter (Supabase)

Utan inställning sparas spelet bara i webbläsaren. För att fortsätta på en annan enhet:

1. Skapa ett projekt på supabase.com.
2. Kör `supabase/migrations/0001_saves.sql` i SQL-editorn.
3. Kopiera `.env.example` till `.env` och fyll i URL och publishable key (Project Settings → API).
4. **Authentication → Email Templates → Magic Link**: lägg till `{{ .Token }}` i mejlet, så får man en
   6-siffrig kod (fungerar bättre på iPad än en länk). Länken fungerar också.
5. **Authentication → URL Configuration**: lägg till adressen där spelet ligger som Redirect URL.

Logga in under Inställningar. Den nyaste sparningen vinner; databasen vägrar skriva över en nyare
sparning med en äldre.

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
