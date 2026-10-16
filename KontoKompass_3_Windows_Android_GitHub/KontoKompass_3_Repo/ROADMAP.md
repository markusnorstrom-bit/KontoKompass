# KontoKompass – status og realistisk utviklingsplan

## Nå implementert (v3)

- CSV/TSV/XLSX import med mappekontroll og originale metadata, N/A ved mangel.
- Entydig interntransfermatching, manuell matching/kategori.
- Kategoriregler, etiketter og transaksjonssplitt med sumkontroll.
- Batch-ID, importhistorikk og angre nye importer.
- Kontoregister, åpningssaldo og dokumentert sluttsaldoavstemming.
- Månedsresultat, månedlig kategorioversikt, 12-månedersgraf, CSV-eksport.
- Gjentakende planlagte betalinger, oppdagede betalingstrender og betinget 30-dagers-prognose.
- Gjeld og annuitetssimulering; manuelle sparemål.
- Nøkkelbaserte, begrunnede «Dette kan kuttes»-forslag, med avvisning.
- Budsjettalarm ID10T ved 9/10 eller 10/10.
- Felles kjerne og GitHub Actions for Android og Windows.

## P0 før ordinær bruk med alle kontoer

1. App-kryptering og krypterte backups.
2. Kreditkortfaktura/kortkjøp og løpende gjeld korrekt med hovedstol/renter/gebyrer.
3. Saldokontroll per bankkonto med avkrysset avstemming av hver post.
4. Brukerstyrt importprofil per bank og maskinlesbare formater OFX / CAMT.053 / QIF.
5. Installasjon-/oppgraderingstest for APK og EXE på ekte enhet, inkludert stabil release-signatur.

## P1

6. Gjeldsovervåkning med ujevn rente og termin-/fakturagebyrer.
7. Årlige kostnader og periodisering («sinking funds»), rullering av budsjetter og nullbasert budsjettering.
8. Full regnskapsjournal og dobbel bokføring om behov, ikke automatisk fra banktekst.
9. Kategoriregler med forhåndsvisning av hvilke poster som vil endres, og angremulighet for regelkjøring.
10. Fakturaoversikt med betalt/ubetalt og KID som **egen** referanse, ikke transaksjons-ID.
11. Kvitteringsvedlegg, lokalt søk og trygg dokumentlagring.
12. Personlige rapporter med perioder, kontofilter, nettosaldo, grafer og hendelseslogger.

## P2 / krever ekstra infrastruktur

13. E2E kryptert synkronisering mellom PC/mobil, konfliktløsning, backup før synk.
14. Betalingspåminnelser og varsler i appen; OS-tillatelser for mobilnotifikasjoner.
15. Bankintegrasjon med uttrykkelig samtykke og tredjepartsbanktilgang.
16. Bil-/hjemmevedlikehold og forutsigbare årsutgifter som planlagte poster.

## Ikke i privatøkonomiappen uten særskilt mål

Foretaksfakturaer, MVA-meldinger, lønnsutbetaling, SAF-T eller bokføringslovsrapportering. De krever egen lov- og domenemodell, personvernkontroll og langt mer testing.
