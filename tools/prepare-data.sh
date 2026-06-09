#!/usr/bin/env bash
set -euo pipefail

RAW_DIR="data/raw"
WORK_DIR="$RAW_DIR/istat-2026"
ZIP_FILE="$RAW_DIR/Limiti01012026_g.zip"

mkdir -p "$RAW_DIR" "$WORK_DIR"

echo "Scarico i confini amministrativi ISTAT 2026 - versione generalizzata..."
curl -L "https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/2026/Limiti01012026_g.zip" -o "$ZIP_FILE"

echo "Estraggo lo ZIP..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
unzip -q "$ZIP_FILE" -d "$WORK_DIR"

echo "Cerco gli shapefile..."
COMUNI_SHP=$(find "$WORK_DIR" -name "Com*.shp" | head -n 1)
PROVINCE_SHP=$(find "$WORK_DIR" -name "Prov*.shp" | head -n 1)
REGIONE_SHP=$(find "$WORK_DIR" -name "Reg*.shp" | head -n 1)

if [ -z "$COMUNI_SHP" ] || [ -z "$PROVINCE_SHP" ] || [ -z "$REGIONE_SHP" ]; then
  echo "Errore: non ho trovato tutti gli shapefile attesi."
  echo "Shapefile trovati:"
  find "$WORK_DIR" -name "*.shp"
  exit 1
fi

echo "Comuni:   $COMUNI_SHP"
echo "Province: $PROVINCE_SHP"
echo "Regione:  $REGIONE_SHP"

echo "Genero GeoJSON Abruzzo..."

npx -y mapshaper "$REGIONE_SHP" \
  -filter 'COD_REG == 13' \
  -proj wgs84 \
  -o format=geojson precision=0.000001 data/abruzzo-regione.geojson

npx -y mapshaper "$PROVINCE_SHP" \
  -filter 'COD_REG == 13' \
  -proj wgs84 \
  -o format=geojson precision=0.000001 data/abruzzo-province.geojson

npx -y mapshaper "$COMUNI_SHP" \
  -filter 'COD_REG == 13' \
  -proj wgs84 \
  -o format=geojson precision=0.000001 data/abruzzo-comuni.geojson

echo "Verifico i file generati..."
ls -lh data/abruzzo-*.geojson

echo "Conteggio feature:"
python3 - <<'PY'
import json
from pathlib import Path

for file in [
    "data/abruzzo-regione.geojson",
    "data/abruzzo-province.geojson",
    "data/abruzzo-comuni.geojson",
]:
    path = Path(file)
    data = json.loads(path.read_text(encoding="utf-8"))
    print(f"{file}: {len(data.get('features', []))} feature")
PY

echo "Preparazione dati completata."
