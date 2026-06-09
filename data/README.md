# Dati GeoJSON

Inserire in questa cartella i file GeoJSON usati dalla webapp:

- `abruzzo-regione.geojson`
- `abruzzo-province.geojson`
- `abruzzo-comuni.geojson`

I file non sono inclusi in questo repository per evitare di distribuire geometrie non verificate o dati geografici fittizi.

La pagina prova a caricarli all'avvio. Se uno o piu file mancano, l'interfaccia mostra un messaggio chiaro e continua a funzionare.

Campi nome supportati per i comuni:

- `COMUNE`
- `DEN_COM`
- `DEN_COMUNE`
- `NOME`
- `NAME`
- `name`

Campi nome supportati per le province:

- `DEN_PROV`
- `DEN_UTS`
- `PROVINCIA`
- `NOME`
- `NAME`
- `name`
