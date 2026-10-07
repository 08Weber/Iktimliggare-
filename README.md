# Industriklättrarna – Tidrapportering

En enkel tidrapporteringsapp i ren HTML, CSS och JavaScript. Ingen byggprocess, inga beroenden att installera.

## Funktioner

- Stämpla in/ut med live-timer
- Lägg till pass manuellt i efterhand
- Redigera datum, tider och anteckningar direkt i historiken
- Löneberäkning per löneperiod (26:e–25:e) med valfri semesterersättning (12 %)
- Export till CSV (semikolonseparerad, öppnas direkt i Excel)

All data sparas lokalt i webbläsaren (`localStorage`), så den finns bara på den enhet du använder.

## Filer

| Fil | Innehåll |
| --- | --- |
| `index.html` | Sidans struktur (Tailwind via CDN, Phosphor-ikoner) |
| `style.css` | Typsnitt, animationer och aurora-bakgrunden |
| `script.js` | All logik: stämpling, historik, statistik och export |
| `apple-touch-icon.jpg` | Ikon när appen läggs till på hemskärmen i iOS |

## Köra appen

**Lokalt:** öppna `index.html` i webbläsaren.

**Vercel:** importera repot och tryck **Deploy** utan att ändra några inställningar. Vercel känner igen det som en statisk sida.
