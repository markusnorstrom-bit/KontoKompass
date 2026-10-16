# KontoKompass 3 – Windows og Android fra samme GitHub-repository

Én felles, lokal økonomiapp for **Windows 11** og **Android**. Dette er en **utviklingsversjon** av en privatøkonomiapp, ikke en finansinstitusjon, bankintegrasjon eller sertifisert regnskapsløsning.

**Kildekode for begge plattformer:** `shared/assets/` inneholder `core.js`, `finance.js`, `features.js`, `app.js`, `index.html` og `style.css`. Windows bruker .NET 8/WebView2, Android Java/WebView. Begge bruker de samme økonomireglene.

## Kom i gang med GitHub

1. Pakk ut ZIP-pakken på PC-en og åpne [GitHub Desktop](https://desktop.github.com/).
2. **File → Add local repository** → velg `KontoKompass_3_Repo`. Hvis GitHub Desktop sier at mappen ikke er et Git-repository, velg **Create repository here**.
3. Velg **Commit to main** og **Publish repository**. Privat repository anbefales mens appen testes.
4. Åpne repositoriet på GitHub og velg **Actions → Bygg KontoKompass Windows og Android → Run workflow**.
5. Vent til jobben `test-core` og plattform-jobbene er ferdige.
6. Last ned `KontoKompass-Windows-x64-med-EXE` (pakk ut hele innholdet og start `KontoKompass.exe`) og/eller `KontoKompass-Android-debug-APK` (`app-debug.apk`).
7. Android: Aktiver «Tillat fra denne kilden» for filbehandleren når du blir spurt. Windows: WebView2 Runtime trengs normalt, men er allerede installert på de fleste nyere Windows 11-maskiner.

**Ikke** last opp ekte kontoutskrifter, KID-kvitteringer eller signeringsnøkler til GitHub. `.gitignore` ignorerer mange kjente bankfiltyper som ekstra beskyttelse.

Alternativ via Git:

```bash
git init
git add .
git commit -m "KontoKompass v3: fullere privatregnskap for Windows og Android"
git branch -M main
git remote add origin https://github.com/DITT-BRUKERNAVN/DITT-REPOSITORY.git
git push -u origin main
```

Opprett et tomt repository på GitHub før `git remote add`. Bytt ut navnene, og **bruk helst SSH/GitHub Desktop eller Git credential manager** fremfor å lime inn hemmelige tilgangstoken i kommandoen.

## Funksjoner

- Lokal import av CSV, TSV og XLSX, kildekontroll, kolonnemapping, duplikatfilter, full originalrad, N/A for manglende data.
- Manuell kategorisering, notat, etiketter og splitt av kjøp, kildefil og transaksjonsreferanser.
- Interne overføringer og kredittkortbetalinger skal kategoriseres som overføring; **ikke** som forbruk. Automatisk matching kun for entydige kandidater.
- Importhistorikk, angring av hele nye importer, regler for transaksjonskategorier.
- Budsjettstatus og humoristisk feilkode **ID10T** for FUBAR 9/10 og 10/10.
- «Dette kan kuttes» med kildegrunnlag og avvisning av forslag. Ingen automatisk oppsigelse av nødvendige forsikringer og andre forpliktelser.
- Kontoregister og saldoavstemming, måned-/12-månedersrapporter, lokal CSV-rapporteksport.
- Planlagte faste trekk, kommende forfall, enkel saldo- og kontantstrømprognose.
- Lån med renteberegning/annuitetsanslag, manuelle sparemål og fremdrift.
- JSON backup/restore og sletting av lokalt innhold.

**Viktig for lån:** Bankens trekk består gjerne av **renter (kostnad)** og **avdrag (nedbetaling av gjeld)**. Kategoriser separat når banken gir informasjon. Ikke før kortregning som en ny kostnad dersom kortkjøpene allerede er importert. Full gjeldsavstemming er ikke ferdig.

## Tester

```bash
node --test tests/*.test.cjs
```

Regelmotoren har automatiserte tester; nettlesergrensesnittet er også gjennomgått med syntetiske data. **Ingen av EXE/APK-byggene er i denne leveransen verifisert kjørt som native program**; GitHub må teste bygging ved første kjøring. 

## Personvern

- Ingen kontoopplysninger eller bankfiler i GitHub Actions. De velges lokalt først etter installasjon.
- Android-manifestet ber ikke om internett-tilgang.
- WebView localStorage og JSON-backup **er ikke kryptert av KontoKompass**. Oppbevar backup på kryptert disk og ikke legg den i åpne skytjenester eller Git.
- Appen forsøker ikke å logge på banken, opprette betalinger eller sende opplysninger til tredjepart.
- Tilgjengelige kildefelt vises. Manglende referanser, KID og kontonumre vises **N/A**, aldri oppdiktede verdier.

Les [FUNKSJONSKARTLEGGING](docs/FUNKSJONSKARTLEGGING.md) for gjennomgang av regnskapsprogrammer og eksisterende/planlagt funksjonalitet. Les `ROADMAP.md` for prioritert videreutvikling.

## Android-signering

**Debug-APK** signeres automatisk med utviklingsnøkkel i GitHub Actions; neste bygg kan få en ny nøkkel og dermed ikke oppdatere direkte. For stabil release-signering generer en egen `.jks` på din maskin, og lagre Base64 av nøkkelfilen samt passord/alias kun som GitHub Actions Secrets:

- `KK_KEYSTORE_BASE64`
- `KK_STORE_PASSWORD`
- `KK_KEY_ALIAS`
- `KK_KEY_PASSWORD`

Prosjektets `.github/workflows/build.yml` forsøker deretter å produsere en release-APK. Du trenger å bevare **samme private nøkkel** for fremtidige installasjonsoppdateringer. Debug og release har ulike pakkenavn og deler ikke appdata. Ingen keystore følger med prosjektet.

**Ingen kvitteringer, faktura- eller kontoutskriftsfiler bør committes.**
