# Funksjonskartlegging – privatøkonomi og regnskapsprogrammer

Gjennomgått 16. oktober 2026. Hensikten er å hente relevante prinsipper fra økonomi- og regnskapsprogrammer, ikke å bygge bedriftsregnskap for enkeltpersonforetak.

## Inspirasjon og kilder

- [GnuCash – Features](https://code.gnucash.org/website/features.phtml): kontoregister, saldoavstemming, splittede transaksjoner, planlagte posteringer, resultat- og balanseregnskap og dobbelt bokholderi.
- [Firefly III – Importing CSV/CAMT.053](https://docs.firefly-iii.org/how-to/data-importer/import/csv/): semantisk kolonnemapping, kildekonto, duplikater og regelbruk.
- [Firefly III – Budgets](https://docs.firefly-iii.org/how-to/firefly-iii/finances/budgets/): månedlige budsjetter, rullering, planlegging og perioder.
- [Actual Budget – Starting Fresh](https://actualbudget.org/docs/getting-started/starting-fresh/): nullbasert budsjett, regler, tidsplaner, avstemming og rapporter.
- [YNAB – Credit Card Payments](https://support.ynab.com/en_us/credit-card-payments-a-guide-r1_506Q1j): kortkjøp versus betaling av kredittkortfaktura.

## Faktisk implementert i v3

| Område | Implementasjon | Begrensning |
|---|---|---|
| CSV/TSV/XLSX-import | Eksisterende per-plattform-parser, kontonavn, kolonnemapping, forhåndsvisning | Ikke PDF/OCR, QIF, OFX eller CAMT.053 |
| Bevaring av kildedata | Hele originalraden + kildefil + radnummer, ID og KID når faktisk tilgjengelig | Kildedata kan mangle hos banken, vises da N/A |
| Overføringsmatching | Unike motbeløp på annen konto + dato og troverdig referanse/tekst | Ingen automatisk matching basert på KID alene |
| Manuell kontroll | Velg kategori, noter, etiketter, behold originalsalg og mulige motparter | Begrenset antall felttyper utover originale felt |
| Duplikatkontroll | Fingeravtrykk og opptelling av like rader | Like transaksjoner med endret banktekst kan kreve manuell kontroll |
| Importhistorikk | Egne import-ID-er, kildefiler og sletting av import | Tidligere v2-importer mangler import-ID og kan ikke angres i ettertid |
| Budsjett | Kategorigrenser, utgiftsfordeling, månedlig prosent og ID10T | Ikke nullbasert budsjettering eller automatiske overførte budsjettrester |
| Resultatrapport | Inntekt, refusjon, kostnader, forbruk per kategori og 12 måneder | Ikke juridisk fullt regnskap eller periodiserte regnskapsposter |
| Splitt/transaksjon | Del kjøp på flere kategorier med eksakt beløpskontroll | Ingen avansert moms- eller valutafordeling |
| Kontoavstemming | Åpningssaldo/-dato, beregnet saldo, mot bankens oppgitte sluttsaldo | Kontofullstendighet kan ikke automatisk bekreftes |
| Lån og renter | Registrering og forenklet annuitetsestimat | Ikke synkronisert mot banksaldo eller renteregulering/terminavgift |
| Sparemål | Mål, allerede spart, manuelle bidrag og fremdrift | Ingen automatisk avstemming mot konto, manuell ansvar |
| Forfall | Manuelle faste planlagte poster, frekvenser og fremtidsliste | Ingen push-varsler eller automatisk faktura-innlesning |
| Fremtidsprognose | 30-dagers saldo fra manuelt oppgitt faktisk startbeløp og forfallsregistrering | Vet ikke om planlagte beløp kommer til å bli endret |
| Kategoriregler | Egne tekst-/konto-/retning-regler, engangsbruk på uavklart | Ikke maskinlæring, ikke regex |
| Dette kan kuttes | Kategorisert valgfritt forbruk, abonnement med kildetransaksjoner og konservative estimater | Ikke kanseller tjenester, ikke påviste prisbesparelser |
| Personvern | Ingen banktjenestekobling, Android uten internett-tillatelse, lokal WebView-lagring | Lagrede data og eksportfiler er IKKE app-kryptert |
| Windows og Android | Samme HTML, CSS og JS-kjerne på begge | Native bygg må verifiseres av GitHub Actions |

## Forsvarlig ikke implementert

- Direkte bankkobling/BankID – ville kreve ekstern leverandør, samtykke, PSD2/open banking og vedvarende sikring.
- Skanning av kvitteringer eller OCR uten testet parser og dokumentkvalitet.
- Automatiske fakturabetalinger, inkasso- eller oppsigelsesbrev, bankoverføringer.
- Signerte skatte- og MVA-oppgaver for foretak, lønnskjøring, offentlig SAF-T-regnskapseksport og aksjeregnskap. Ikke relevant for en privat økonomiapp uten eget næringsregnskap.
- App-kryptering og ende-til-ende synkronisering. Må prioriteres særskilt før tilkobling av flere enheter.
- Fullt dobbelt bokholderi med kontoplan, bilagskrav og balansekontroller. Private kontoutskrifter er ikke automatisk et komplett regnskap.

## Kritiske neste skritt

1. Kryptert lokal lagring og krypterte backupfiler på begge plattformer.
2. Kredittkortfordeling av renter/gebyrer/avdrag og oppgjør per fakturaperiode, uten dobbelttelling.
3. Import av CAMT.053, OFX og QIF med kilde-ID og tilpasningsbare profiler.
4. Ekte bankavstemming med per-post avhaking og importkontroll av åpnings- og sluttsaldo.
5. Budsjettrullering/sinking funds (årlig service, forsikring, kommunale avgifter, ferie).
6. Kvitteringsvedlegg og manuell dokumentasjonsliste, med kryptert lagring.
7. Fakturaoversikt med betalt/ubetalt, KID, forfallsdato og lokal varsling.
8. Automatisk test med GitHub Actions for Native bygg, plattform-installasjon og regresjon.
