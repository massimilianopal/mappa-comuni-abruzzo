# Note sui dati geografici

I confini amministrativi devono provenire da una fonte ufficiale, per esempio ISTAT, oppure da una fonte istituzionale equivalente.

I GeoJSON da usare nella webapp devono essere limitati alla sola Regione Abruzzo:

- confine regionale dell'Abruzzo;
- confini provinciali dell'Abruzzo;
- confini comunali dell'Abruzzo.

Non usare geometrie inventate o ricostruite manualmente. Prima della pubblicazione verificare licenza, aggiornamento amministrativo, sistema di riferimento e coerenza dei campi attributo.

File attesi nella cartella `data`:

- `abruzzo-regione.geojson`
- `abruzzo-province.geojson`
- `abruzzo-comuni.geojson`
