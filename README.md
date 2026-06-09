# Mappa comuni Abruzzo

Webapp statica per visualizzare la mappa amministrativa della Regione Abruzzo ed evidenziare una lista di comuni inserita dall'utente.

Il progetto usa solo HTML, CSS e JavaScript vanilla. Leaflet viene caricato tramite CDN e serve esclusivamente a disegnare geometrie GeoJSON: non sono usati tile OpenStreetMap, mappe stradali, backend, build tool o dipendenze npm.

## File principali

- `index.html`: pagina dell'applicazione.
- `assets/style.css`: stile dell'interfaccia e della mappa.
- `assets/app.js`: caricamento GeoJSON, normalizzazione dei nomi e interazioni.
- `data/`: cartella in cui inserire i file geografici.
- `docs/note-dati.md`: note sulle fonti dati.

## Dati geografici

Inserire nella cartella `data` questi file GeoJSON:

- `data/abruzzo-regione.geojson`
- `data/abruzzo-province.geojson`
- `data/abruzzo-comuni.geojson`

I dati non sono inclusi nel repository e non devono essere sostituiti con geometrie fittizie. Usare confini amministrativi provenienti da ISTAT o da una fonte istituzionale equivalente, limitati alla sola Regione Abruzzo.

Se i file GeoJSON non sono ancora presenti, la pagina resta caricabile e mostra un messaggio nell'interfaccia.

## Avvio in locale

Dal terminale, nella cartella del progetto:

```bash
python3 -m http.server 8000
```

Poi aprire:

```text
http://localhost:8000
```

Usare un piccolo server locale e non l'apertura diretta del file HTML permette al browser di caricare correttamente i GeoJSON con `fetch`.

## Pubblicazione su GitHub Pages

1. Caricare il repository su GitHub.
2. Inserire i GeoJSON nella cartella `data`.
3. Aprire le impostazioni del repository.
4. Andare in **Pages**.
5. Scegliere la pubblicazione dal branch principale, cartella root (`/`).
6. Salvare e attendere la generazione dell'URL GitHub Pages.
