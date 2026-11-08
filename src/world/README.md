# Världen / The world

Varje skärm är en textfil med **16 tecken × 11 rader**. Ett tecken = en ruta (16×16 pixlar).

```
src/world/overworld/<x>_<y>.txt     16×8 skärmar, 0_0 uppe till vänster. Start: 7_7
src/world/caves/<namn>.txt          enskilda rum (grottor, hus)
src/world/dungeons/<id>/<x>_<y>.txt borgar, ett rum per fil, rummen ligger i ett rutnät
```

## Tecken

| Tecken | Betyder | | Tecken | Betyder |
|---|---|---|---|---|
| `.` | gräs / golv (beror på område) | | `s` | slem (fiende) |
| `,` | sand | | `b` | fladdermus |
| `F` | blommor (går att gå på) | | `g` | troll som kastar sten |
| `T` | träd | | `k` | skelett |
| `B` | buske (går att hugga ner om den inte står i skärmens kant; `@door` under = hemlig trappa) | | `c` | krabba (går i sidled) |
| `R` | sten | | `z` | spöke (bleknar bort ibland) |
| `M` | klippa | | `v` | gnista (studsar snett) |
| `W` | vatten (magi och bumerang flyger över) | | `X` | borgens boss, 2×2 rutor (se nedan) |
| `=` | bro | | `h` | hjärta (plockas upp en gång) |
| `G` | gravsten | | `$` | ädelsten |
| `C` | borgmur | | `K` | nyckel (gäller bara i sin borg) |
| `#` | vägg | | `H` | hjärtbehållare (+1 hjärta) |
| `S` | staty / block | | `1` | svärdet |
| `L` | låst dörr (öppnas med nyckel) | | `2` | trollstaven |
| `D` | dörr / grottöppning / trappa | | `3` | bombväskan |
| `A` | husvägg | | `4` | bumerangen |
| `O` | husdörr (som `D`) | | `5` | stjärnvingarna (sista skatten) |
| `Z` | gravsten med spricka: spräng med bomb, blir `D` | | `7` | stjärnnyckeln |
| `%` | vägg/berg med spricka: spräng med bomb. Blir `D` om en `@door` står där, annars golv | | `9` | kartan |
| | | | `6` | skölden |
| | | | `8` | stjärnkronan (på den hemliga ön) |
| `P` | sten att knuffa (gravsten ute, block i borgar) | | `0` | 2 bomber (kommer tillbaka varje gång) |
| `+` | platta: ställ en `P` på den | | `*` | stjärna (avslutar borgen) |
| `\|` | galler: öppnas när rummet är löst | | | |
| `I` | fackla: tänd med magi | | | |
| `Q` | kristall: träffa med magi/bumerang, då blir alla `_` broar | | | |
| `_` | gömd bro (ser ut som vatten tills kristallen träffas) | | | |
| `V` | guldport: öppnas med stjärnnyckeln | | | |

Bossar: `X` blir Slemkungen i `d1`, Krabbkungen i `d2`, Spökkungen i `d3` och Stjärnslukaren i `d4`
(som bara kan skadas av sitt eget stjärnklot när man studsar tillbaka det med skölden).

### Pussel

Ett rum är **löst** när alla fiender är borta, varje platta `+` har en sten `P` och varje fackla `I` brinner.
Då öppnas gallren `|` och `@reward`-sakerna dyker upp. Stenar som står på en platta sitter fast.
Knuffade stenar hoppar tillbaka när man lämnar rummet, men lösta rum förblir lösta.
Står en `P` på en `@door`-ruta finns en hemlig trappa under den.

## Metarader (börjar med `@`), kommentarer med `//`

```
@door 11,2 -> cave:sword 7,9       D-rutan på 11,2 leder till grottan "sword", ruta 7,9
@exit down -> ow:7:7 11,3          gå ut nedåt → överjorden skärm 7,7, ruta 11,3
@npc 7,3 granny granny_sword granny_bye   person + textnyckel (+ text när allt är upplockat)
@npc 7,3 digger digger bombs=digger_bombs  annan text om man har saken (bombs, boomerang, ...)
@npc 7,1 sign sign_blocks                  skylt: pratar bara när man trycker A
@npc 9,4 slimey castle_d1 star:d1          finns bara när borgens stjärna är tagen (ute pratar man med A)
@reward K 7,5                      dyker upp när alla fiender i rummet är besegrade
```

Platser skrivs `ow:x:y`, `cave:namn` eller `<borg>:x:y` (t.ex. `d1:2:3`).
Texter (nycklarna ovan) finns i `src/i18n/sv.ts` och `en.ts`.

## Regler (kontrolleras av `npm test`)

- Öppna rutor längs en kant måste vara öppna på samma ställe hos grannskärmen.
- En öppen kant utan granne måste ha en `@exit`.
- Dörrar och utgångar måste landa på en ruta man kan stå på.
- Varje borg har en boss och en stjärna (eller vingarna), och minst lika många nycklar som låsta dörrar.
- Plattor har tillräckligt många stenar, gömda broar har en kristall och galler kan öppnas.
- Alla texter som personer och skyltar säger finns i `sv.ts`.

Hus har namn som börjar på `house-` (t.ex. `caves/house-digger.txt`) och får trägolv.
