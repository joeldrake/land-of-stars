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
| `B` | buske | | `X` | boss (Slemkungen, 2×2 rutor) |
| `R` | sten | | `h` | hjärta (plockas upp en gång) |
| `M` | klippa | | `$` | ädelsten |
| `W` | vatten (magi flyger över) | | `K` | nyckel |
| `=` | bro | | `H` | hjärtbehållare (+1 hjärta) |
| `G` | gravsten | | `1` | svärdet |
| `C` | borgmur | | `2` | trollstaven |
| `#` | vägg | | `*` | stjärna (avslutar borgen) |
| `S` | staty / block | | | |
| `L` | låst dörr (öppnas med nyckel) | | | |
| `D` | dörr / grottöppning / trappa | | | |

## Metarader (börjar med `@`), kommentarer med `//`

```
@door 11,2 -> cave:sword 7,9       D-rutan på 11,2 leder till grottan "sword", ruta 7,9
@exit down -> ow:7:7 11,3          gå ut nedåt → överjorden skärm 7,7, ruta 11,3
@npc 7,3 granny granny_sword granny_bye   person + textnyckel (+ text när allt är upplockat)
@reward K 7,5                      dyker upp när alla fiender i rummet är besegrade
```

Platser skrivs `ow:x:y`, `cave:namn` eller `<borg>:x:y` (t.ex. `d1:2:3`).
Texter (nycklarna ovan) finns i `src/i18n/sv.ts` och `en.ts`.

## Regler (kontrolleras av `npm test`)

- Öppna rutor längs en kant måste vara öppna på samma ställe hos grannskärmen.
- En öppen kant utan granne måste ha en `@exit`.
- Dörrar och utgångar måste landa på en ruta man kan stå på.
