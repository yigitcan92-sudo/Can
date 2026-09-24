# Fiberklaar Waasland

Webapp voor het opvolgen van site surveys (SSV) en syndicus-onderhandelingen (TSA). Ze vervangt het lokale
HTML-dashboard: iedereen werkt in één centrale database en ziet wijzigingen meteen.

**Stack:** React + Vite, Supabase (Postgres, Auth, Realtime, Storage), hosting op Netlify of Vercel.

## Functionaliteit

| Onderdeel | Wat het doet |
|---|---|
| **SSV / TSA** | Adressen gegroepeerd per gemeente en POP, filters (status, groep, verantwoordelijke, gemeente, POP, zoekterm), KPI's, donut-, staaf- en trendgrafiek, heatmap POP × status (klik om te filteren), CSV-export |
| **Klantendossier** (TSA) | Contactgegevens, status, AV-, afspraak- en constructiedatum, gespreksgeschiedenis (wie belde wanneer, met resultaat; telt automatisch pogingen), documenten op- en afladen (Supabase Storage) |
| **Toewijzing** | Stelt een verdeling voor op basis van POP + straat-clustering: een straat wordt nooit gesplitst, elke surveyor krijgt een aaneengesloten gebied met routevolgorde. Met kaartweergave, CSV-export van routes en toepassen in één klik |
| **Beheer** | Verantwoordelijken (surveyors, onderaannemers, wachtrijen) toevoegen/hernoemen, gebruikers een rol geven en koppelen, Excel-scopelist importeren |
| **Surveyor-gids** | Afdrukbaar/downloadbaar |
| **Live** | Wijzigingen van anderen verschijnen meteen (Supabase Realtime) |

### Rollen

| Rol | Rechten |
|---|---|
| `coordinator` | Alles: alle adressen zien en bewerken, toewijzen, beheer, import |
| `surveyor` | Ziet en bewerkt **enkel** adressen waarvoor die persoon verantwoordelijke is (status, opmerkingen, dossier). Kan niet herverdelen |
| `management` | Ziet alles, kan niets wijzigen |

De rechten worden afgedwongen in de database zelf (Row Level Security + triggers), niet enkel in de interface.

## Snel proberen (demo-modus)

```bash
npm install
npm run dev
```

Zonder Supabase-configuratie start de app in **demo-modus** met voorbeelddata in de browser. Kies op het
aanmeldscherm een coördinator, surveyor of management-gebruiker. Open twee tabbladen met verschillende gebruikers
om het live bijwerken te zien.

## Echte installatie

### 1. Supabase-project

1. Maak een project aan op [supabase.com](https://supabase.com) (de gratis tier volstaat).
2. Voer het schema uit: plak `supabase/migrations/20260924000000_init.sql` in de **SQL Editor** en klik op *Run*
   (of `supabase db push` met de Supabase CLI).
3. **Authentication → Providers**: e-mail aan laten. Zet onder *Authentication → Settings* "Allow new users to sign
   up" uit, zodat enkel uitgenodigde mensen binnen kunnen.
4. **Authentication → URL Configuration**: zet de *Site URL* op het adres van je app (bv. `https://fiberklaar.netlify.app`).

### 2. Eerste coördinator

Nodig jezelf uit via **Authentication → Users → Invite user**, meld je aan, en maak jezelf coördinator in de SQL Editor:

```sql
update public.profiles
set role = 'coordinator', responsible_name = 'Mehmet Can Yigit'
where email = 'jouw@email.be';
```

Daarna beheer je alle andere gebruikers vanuit de app (**Beheer → Gebruikers & rollen**). Nieuwe accounts zijn
standaard `surveyor` zonder koppeling en zien dus niets tot je ze koppelt aan een verantwoordelijke.

### 3. Frontend configureren

```bash
cp .env.example .env
# vul VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in (Project Settings → API)
npm run dev
```

### 4. Scopelist importeren

**Via de app** (Beheer → Import): kies het Excel-bestand, bekijk de voorvertoning en kies:
- *Enkel nieuwe adressen toevoegen*: bestaande adressen (en wat er in de app aan gewijzigd is) blijven ongemoeid.
  Gebruik dit na de eerste import.
- *Alles overschrijven*: alle velden krijgen de waarde uit Excel.

**Via de command line** (handig voor een grote eerste import, met geocoding):

```bash
# vul SUPABASE_SERVICE_ROLE_KEY in .env in (nooit in de frontend of in git!)
node scripts/import-excel.mjs scopelist.xlsx --dry-run         # enkel controleren
node scripts/import-excel.mjs scopelist.xlsx --mode=new --geocode
```

De import zoekt de tabbladen `SSV` en `TSA` en de kolommen:

- **SSV:** ADDRESS, UNIT NUMBER, POP, SSV-RESPONSIBLE, SSV STATUS, A-NET REMARKS
- **TSA:** Address, POP, TSA STATUS, AV DATE, Aantal Pogingen, Stop Onderhandelen, NAME, PHONE NUMBER, MAIL, TSA REMARKS, TSA responsible

Hoofdletters, spaties en een titelrij boven de koppen maken niet uit. Onbekende verantwoordelijken worden automatisch
aangemaakt. Een testbestand maken: `node scripts/make-sample-scopelist.mjs`.

### 5. Geocoding (voor de routevolgorde)

Coördinaten worden eenmalig opgehaald en gecachet in de tabel `geocode_cache`.

```bash
supabase functions deploy geocode
supabase secrets set GOOGLE_MAPS_API_KEY=...   # optioneel; zonder sleutel wordt OpenStreetMap gebruikt
```

Daarna kan de coördinator op de pagina **Toewijzing** op *Coördinaten ophalen* klikken. Zonder coördinaten werkt
de toewijzing ook, maar dan wordt op straatnaam gesorteerd in plaats van op afstand.

### 6. Online zetten

**Netlify** of **Vercel**: koppel de GitHub-repository, stel de omgevingsvariabelen `VITE_SUPABASE_URL` en
`VITE_SUPABASE_ANON_KEY` in, en deploy. Build-instellingen staan al in `netlify.toml` / `vercel.json`.

## Aanpassen

- **Statuswaarden en indeling open/afgerond/geblokkeerd:** `src/lib/statuses.js`
- **Surveyor-gids:** `src/content/surveyorGuide.js` — de BEON-symbolenlegende en quadrantentabel moeten nog uit de
  bestaande gids worden overgenomen (de coördinator ziet een melding tot `isTemplate` op `false` staat)
- **Verantwoordelijken:** in de app via Beheer (niet hardcoded)

## Structuur

```
src/
  lib/            statussen, adres-parser, Excel-parser, toewijzingsalgoritme, geocoding (ook gebruikt door scripts)
  data/           Supabase-backend, demo-backend, React-context met realtime
  pages/          SSV/TSA-dashboard, toewijzing, beheer, gids, login
  components/     filters, KPI's, grafieken, tabel, klantendossier
supabase/
  migrations/     databaseschema, RLS-regels, storage-bucket, realtime
  functions/      geocode (Edge Function)
scripts/          Excel-import en voorbeeldbestand
tests/            unit tests (npm test)
```

## Datamodel

- `ssv_addresses`, `tsa_addresses` — de adressen (met `responsible`, `route_order`, `lat`/`lon`)
- `responsibles` — configureerbare lijst verantwoordelijken
- `profiles` — gebruiker → rol + gekoppelde verantwoordelijke
- `dossier_entries`, `dossier_documents` — klantendossier (bestanden zelf in Storage-bucket `dossiers`)
- `assignments` — historiek van toewijzingen (automatisch via trigger)
- `status_history` — historiek van statuswijzigingen (voedt de trendgrafiek)
- `geocode_cache` — gecachte coördinaten
