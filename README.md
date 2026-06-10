# Mappa comuni Abruzzo

Webapp statica per visualizzare la mappa amministrativa dell’Abruzzo ed evidenziare una lista di comuni.

Il progetto usa HTML, CSS, JavaScript vanilla e Leaflet. Non usa backend, database, npm o build tool.

## Funzionalità principali

- Visualizzazione della Regione Abruzzo tramite geometrie GeoJSON.
- Visualizzazione dei confini provinciali e comunali.
- Evidenziazione di comuni a partire da una lista inserita dall’utente.
- Riepilogo dei comuni riconosciuti e di quelli non riconosciuti.
- Box stampabile con l’elenco alfabetico dei comuni evidenziati.
- Etichette opzionali sulla mappa per i soli comuni evidenziati.
- Possibilità di mostrare o nascondere i layer dei confini.
- Stampa / Salva PDF tramite browser, con un riferimento essenziale al progetto.

Leaflet è caricato da CDN e viene usato per disegnare i GeoJSON. La webapp non aggiunge tile OpenStreetMap o altre mappe esterne.

## Utilizzo locale

Dal terminale, nella cartella del progetto:

```bash
python3 -m http.server 8000
```

Poi aprire nel browser:

```text
http://localhost:8000
```

L’uso di un piccolo server locale consente al browser di caricare correttamente i file GeoJSON tramite `fetch`.

## Pubblicazione su GitHub Pages

Il progetto può essere pubblicato tramite GitHub Pages usando il branch `main` e la cartella root (`/`).

Procedura sintetica:

1. Caricare il repository su GitHub.
2. Verificare che i file GeoJSON siano presenti nella cartella `data`.
3. Aprire le impostazioni del repository.
4. Entrare nella sezione **Pages**.
5. Selezionare il branch `main` e la cartella root (`/`).
6. Salvare la configurazione e attendere la pubblicazione.

## Dati geografici

I dati geografici sono GeoJSON derivati da confini amministrativi ISTAT o da fonte istituzionale equivalente.

La cartella `data` contiene i GeoJSON della Regione Abruzzo, delle province e dei comuni:

- `data/abruzzo-regione.geojson`
- `data/abruzzo-province.geojson`
- `data/abruzzo-comuni.geojson`

I file sono caricati direttamente dal browser. La struttura resta compatibile con GitHub Pages perché non richiede passaggi di build o servizi applicativi.

## Struttura del progetto

- `index.html`: pagina principale dell’applicazione.
- `assets/style.css`: stili dell’interfaccia, della mappa e della stampa.
- `assets/app.js`: caricamento dei GeoJSON, normalizzazione dei nomi e interazioni utente.
- `data/`: GeoJSON della regione, delle province e dei comuni.
- `docs/note-dati.md`: note sulle fonti e sulla preparazione dei dati.
- `tools/prepare-data.sh`: script di supporto per la preparazione dei dati, se necessario.

## Note sul riconoscimento dei comuni

Il riconoscimento dei comuni include una normalizzazione dei nomi per ridurre differenze dovute a maiuscole, accenti, apostrofi, punteggiatura e spaziature.

Sono presenti anche alcuni alias manuali per casi frequenti o abbreviazioni. Gli alias sono gestiti nel file `assets/app.js` e servono a migliorare il riconoscimento senza modificare i dati geografici.

## Autore e realizzazione

Progetto dimostrativo per la Regione Abruzzo.

Il progetto è stato sviluppato da Massimiliano Palizzi con l’ausilio di ChatGPT/Codex per la generazione e revisione del codice.
