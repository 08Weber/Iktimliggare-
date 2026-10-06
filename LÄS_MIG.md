# Tidrapportering V2 - Industriklättrarna

Här är den uppgraderade versionen av din app! Den har nu en modernare design, en live-timer när du jobbar, statistik för månaden och bättre mobilanpassning.

## Steg för steg för att uppdatera

Om du redan har projektet uppsatt, behöver du bara byta ut filen `page.tsx`.

1. Öppna din terminal och gå till din projektmapp:
   `cd industriklattrarna-time`

2. Se till att du har de senaste paketen installerade. Denna version använder `date-fns` för att hantera datum och tid på ett säkert sätt:
   `npm install lucide-react date-fns`

3. Byt ut filen `app/page.tsx` mot den nya `page.tsx` som ligger i denna ZIP-mapp.

4. Loggan (`logo.png`) ska fortfarande ligga i `public`-mappen.

5. Starta appen och njut av den nya designen:
   `npm run dev`

### Skicka till Vercel
När du har sparat filen och testat lokalt, skicka upp det till GitHub:
```bash
git add .
git commit -m "Uppgraderad design, live-timer och statistik"
git push
```
Vercel kommer automatiskt att uppdatera din live-länk inom någon minut!
