# Industriklättrarna – Tidrapportering

En enkel tidrapporteringsapp i ren HTML, CSS och JavaScript. Ingen byggprocess, inga beroenden att installera.

## Funktioner

- Stämpla in/ut med live-timer
- Lägg till pass manuellt i efterhand
- Redigera datum, tider och anteckningar direkt i historiken
- Löneberäkning per löneperiod (26:e–25:e) med valfri semesterersättning (12 %)
- Export till CSV (semikolonseparerad, öppnas direkt i Excel)

All data sparas lokalt i webbläsaren (`localStorage`), så den finns bara på den enhet du använder.

## 3D

Appen har ett 3D-lager byggt med [three.js](https://threejs.org) och [GSAP](https://gsap.com), båda från CDN:

- **Startskärm** en gång per dag, riggad som i verkligheten (IRATA): klättraren står säkrad med kortlinan i förankringen, sätter säkerhetsenheten på säkerhetsrepet, lägger arbetsrepet i nedfiraren och skruvar igen karbinen. Sedan kopplar han loss kortlinan, går ut över kanten och hänger i båda repen. Därefter zoomar kameran ut och namnet visas. Håll inne loggan för att se den igen.
- **Bakgrund:** en jack-up-rigg till havs om natten med brinnande fackla, fler riggar i fjärran och klättrare som hänger i rep runt riggen. Den skiftar från amber till grönt när ett pass pågår, och scrollar du sänks kameran längs riggen.
- **Klockan:** klättraren från app-ikonen firar sig ned längs en fasad, en våning per timme.
- **Periodens skyline:** ett torn per dag i löneperioden. Höjden är timmarna, dra för att snurra och tryck för detaljer.

3D-effekterna kan stängas av under Inställningar. Om enheten inte klarar WebGL, eller om "Reducera rörelse" är påslaget, används en enklare version. Själva appen fungerar likadant utan 3D.

## Filer

| Fil | Innehåll |
| --- | --- |
| `index.html` | Sidans struktur (Tailwind via CDN, Phosphor-ikoner) och val av 3D-läge vid start |
| `style.css` | Typsnitt, animationer, bottenpaneler och aurora-bakgrunden (när 3D är av) |
| `script.js` | All logik: stämpling, historik, statistik och export |
| `fx/main.js` | Startar 3D-lagret och lyssnar på ändringar från `script.js` |
| `fx/background.js` | Bakgrundsvärlden: riggen, havet, klättrarna och kameran |
| `fx/rig.js` | Oljeriggen, facklan och havet |
| `fx/figure.js` | Den detaljerade klättraren med IK för armar och ben |
| `fx/climber.js` | Introts klättrare med rep, nedfirare och säkerhetsenhet, plus klättrarna runt riggen |
| `fx/hero.js` | Klättraren i klockkortet |
| `fx/skyline.js` | 3D-diagrammet över löneperioden |
| `fx/intro.js` | Startskärmen |
| `fx/models.js`, `fx/common.js` | Fackverk, rep, skruvlåskarbin, nedfirare, säkerhetsenhet, klättraren i klockan och delade hjälpare |
| `assets/climber.svg` | Klättraren från ikonen som vektor (används i loggan och i 3D) |
| `apple-touch-icon.jpg` | Ikon när appen läggs till på hemskärmen i iOS |

## Köra appen

**Lokalt:** öppna `index.html` i webbläsaren.

**Vercel:** importera repot och tryck **Deploy** utan att ändra några inställningar. Vercel känner igen det som en statisk sida.
