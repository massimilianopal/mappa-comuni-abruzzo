(function () {
  "use strict";

  var DATA_FILES = {
    region: "data/abruzzo-regione.geojson",
    provinces: "data/abruzzo-province.geojson",
    municipalities: "data/abruzzo-comuni.geojson"
  };

  var REGION_FIT_PADDING = [56, 56];
  var REGION_VIEW_PADDING_RATIO = 0.08;

  // I dataset istituzionali possono usare nomi di campi diversi.
  var MUNICIPALITY_NAME_FIELDS = ["COMUNE", "DEN_COM", "DEN_COMUNE", "NOME", "NAME", "name"];
  var PROVINCE_NAME_FIELDS = ["DEN_PROV", "DEN_UTS", "PROVINCIA", "NOME", "NAME", "name"];
  var LABEL_NOTICE_THRESHOLD = 12;

  // Alias manuali per casi frequenti o nomi abbreviati.
  var ALIASES = new Map([
    ["aquila", "L'Aquila"],
    ["laquila", "L'Aquila"],
    ["l aquila", "L'Aquila"],
    ["l'aquila", "L'Aquila"],
    ["sanvalentino", "San Valentino in Abruzzo Citeriore"],
    ["san valentino", "San Valentino in Abruzzo Citeriore"],
    ["san valentino in abruzzo", "San Valentino in Abruzzo Citeriore"],
    ["san valentino in abruzzo citeriore", "San Valentino in Abruzzo Citeriore"]
  ]);

  var dom = {
    input: document.getElementById("municipalityInput"),
    highlightButton: document.getElementById("highlightButton"),
    clearButton: document.getElementById("clearButton"),
    toggleMunicipalitiesButton: document.getElementById("toggleMunicipalitiesButton"),
    toggleProvincesButton: document.getElementById("toggleProvincesButton"),
    toggleHighlightedListButton: document.getElementById("toggleHighlightedListButton"),
    toggleLabelsButton: document.getElementById("toggleLabelsButton"),
    printButton: document.getElementById("printButton"),
    dataStatus: document.getElementById("dataStatus"),
    foundCount: document.getElementById("foundCount"),
    foundList: document.getElementById("foundList"),
    missingList: document.getElementById("missingList"),
    mapNotice: document.getElementById("mapNotice"),
    highlightedMunicipalityBox: document.getElementById("highlightedMunicipalityBox"),
    highlightedMunicipalityList: document.getElementById("highlightedMunicipalityList"),
    labelsNotice: document.getElementById("labelsNotice")
  };

  // Leaflet viene usato solo per renderizzare GeoJSON: nessun tile stradale.
  var vectorRenderer = L.svg({ padding: 0.35 });
  var map = L.map("map", {
    attributionControl: false,
    maxBoundsViscosity: 0.85,
    maxZoom: 13,
    minZoom: 6,
    renderer: vectorRenderer,
    zoomDelta: 0.5,
    zoomSnap: 0.1
  }).setView([42.25, 13.8], 8);

  L.control.scale({ imperial: false }).addTo(map);
  map.createPane("regionPane").style.zIndex = 200;
  map.createPane("municipalityPane").style.zIndex = 300;
  map.createPane("provincePane").style.zIndex = 400;
  map.createPane("municipalityLabelPane").style.zIndex = 650;
  map.getPane("municipalityLabelPane").style.pointerEvents = "none";

  var regionLayer = null;
  var provinceLayer = null;
  var municipalityLayer = null;
  var provinceBordersVisible = true;
  var municipalityBordersVisible = true;
  var highlightedListVisible = true;
  var labelsVisible = false;
  var selectedKeys = new Set();
  var municipalityIndex = new Map();
  var municipalityLabelLayer = L.layerGroup().addTo(map);
  var dataStatuses = [];
  var viewBeforePrint = null;
  var printRefreshTimeout = null;

  // Normalizza i nomi per rendere il matching tollerante ad accenti e punteggiatura.
  function normalizeName(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘`´]/g, "'")
      .replace(/&/g, " e ")
      .replace(/[^a-z0-9' ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compactName(value) {
    return normalizeName(value).replace(/[\s']/g, "");
  }

  function parseMunicipalityInput(value) {
    var seen = new Set();
    return value
      .split(/[\n,;]+/)
      .map(function (item) {
        return item.trim();
      })
      .filter(function (item) {
        var key = normalizeName(item);
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  function firstAvailableProperty(feature, fields) {
    var properties = feature && feature.properties ? feature.properties : {};
    for (var i = 0; i < fields.length; i += 1) {
      var value = properties[fields[i]];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
    return "";
  }

  function regionStyle() {
    return {
      pane: "regionPane",
      color: "#7f9388",
      weight: 1.4,
      opacity: 0.9,
      fillColor: "#edf4ee",
      fillOpacity: 0.82
    };
  }

  function provinceStyle() {
    return {
      pane: "provincePane",
      color: "#2f526f",
      weight: 2.4,
      opacity: provinceBordersVisible ? 0.95 : 0,
      dashArray: "8 6",
      fillOpacity: 0,
      interactive: false
    };
  }

  function municipalityStyle(feature) {
    var name = firstAvailableProperty(feature, MUNICIPALITY_NAME_FIELDS);
    var key = normalizeName(name);
    var selected = selectedKeys.has(key);

    return {
      pane: "municipalityPane",
      color: selected ? "#9c3218" : "#8c9890",
      weight: selected ? 2.2 : 0.7,
      opacity: municipalityBordersVisible || selected ? 0.95 : 0,
      fillColor: selected ? "#f0782d" : "#ffffff",
      fillOpacity: selected ? 0.78 : 0.12
    };
  }

  function setStatus(label, state, message) {
    var existing = dataStatuses.find(function (item) {
      return item.label === label;
    });
    var status = {
      label: label,
      state: state,
      message: message
    };

    if (existing) {
      Object.assign(existing, status);
    } else {
      dataStatuses.push(status);
    }
    renderDataStatus();
  }

  function renderDataStatus() {
    if (!dataStatuses.length) {
      dom.dataStatus.innerHTML = '<p class="status-item">Caricamento dati geografici...</p>';
      return;
    }

    dom.dataStatus.innerHTML = dataStatuses
      .map(function (item) {
        return (
          '<p class="status-item ' +
          item.state +
          '"><strong>' +
          escapeHtml(item.label) +
          ":</strong> " +
          escapeHtml(item.message) +
          "</p>"
        );
      })
      .join("");

    var blockingMessages = dataStatuses.filter(function (item) {
      return item.state === "warn" || item.state === "error";
    });

    if (blockingMessages.length) {
      dom.mapNotice.hidden = false;
      dom.mapNotice.textContent =
        "Alcuni file GeoJSON non sono disponibili. La pagina resta utilizzabile e mostrerà i layer appena i file saranno inseriti nella cartella data.";
    } else {
      dom.mapNotice.hidden = true;
      dom.mapNotice.textContent = "";
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderList(element, values, emptyText) {
    if (!values.length) {
      element.classList.add("empty-list");
      element.innerHTML = "<li>" + escapeHtml(emptyText) + "</li>";
      return;
    }

    element.classList.remove("empty-list");
    element.innerHTML = values
      .map(function (value) {
        return "<li>" + escapeHtml(value) + "</li>";
      })
      .join("");
  }

  function updateSummary(foundNames, missingNames) {
    dom.foundCount.textContent = String(foundNames.length);
    renderList(dom.foundList, foundNames, "Nessun comune selezionato.");
    renderList(dom.missingList, missingNames, "Nessun comune da mostrare.");
  }

  function renderHighlightedMunicipalityList(foundNames) {
    renderList(dom.highlightedMunicipalityList, foundNames, "Nessun comune evidenziato.");
  }

  function sortMunicipalityNames(a, b) {
    return a.localeCompare(b, "it", { sensitivity: "base" });
  }

  function getSelectedMunicipalityRecords() {
    var records = [];
    var seen = new Set();

    selectedKeys.forEach(function (key) {
      var record = municipalityIndex.get(key);
      if (!record || seen.has(record.key)) {
        return;
      }
      seen.add(record.key);
      records.push(record);
    });

    records.sort(function (a, b) {
      return sortMunicipalityNames(a.name, b.name);
    });
    return records;
  }

  function getSelectedMunicipalityNames() {
    return getSelectedMunicipalityRecords().map(function (record) {
      return record.name;
    });
  }

  function updateSelectionOutputs(missingNames) {
    var foundNames = getSelectedMunicipalityNames();
    updateSummary(foundNames, missingNames || []);
    renderHighlightedMunicipalityList(foundNames);
    renderMunicipalityLabels();
  }

  async function fetchGeoJson(url) {
    var response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("File non trovato: " + url);
      }
      throw new Error("Errore HTTP " + response.status + " durante il caricamento di " + url);
    }
    return response.json();
  }

  function featureCount(geojson) {
    if (!geojson) {
      return 0;
    }
    if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
      return geojson.features.length;
    }
    if (geojson.type === "Feature") {
      return 1;
    }
    return 0;
  }

  function getRegionBounds() {
    if (!regionLayer) {
      return null;
    }

    var bounds = regionLayer.getBounds();
    return bounds && bounds.isValid() ? bounds : null;
  }

  function applyRegionMapLimits() {
    var bounds = getRegionBounds();
    if (!bounds) {
      return;
    }

    map.setMaxBounds(bounds.pad(0.25));
  }

  function fitRegionBounds() {
    var bounds = getRegionBounds();
    if (bounds) {
      map.fitBounds(bounds.pad(REGION_VIEW_PADDING_RATIO), {
        animate: false,
        padding: REGION_FIT_PADDING
      });
      return true;
    }

    return false;
  }

  function refreshMapSize() {
    map.invalidateSize({ pan: false });
  }

  function queuePrintRefresh(callback) {
    if (printRefreshTimeout) {
      window.clearTimeout(printRefreshTimeout);
    }

    printRefreshTimeout = window.setTimeout(function () {
      printRefreshTimeout = null;
      callback();
    }, 0);
  }

  function redrawLayer(layer) {
    if (!layer) {
      return;
    }

    if (typeof layer.redraw === "function") {
      layer.redraw();
    }

    if (typeof layer.eachLayer === "function") {
      layer.eachLayer(redrawLayer);
    }
  }

  function refreshMapLayers() {
    if (regionLayer) {
      regionLayer.setStyle(regionStyle);
    }
    if (municipalityLayer) {
      municipalityLayer.setStyle(municipalityStyle);
    }
    if (provinceLayer && map.hasLayer(provinceLayer)) {
      provinceLayer.setStyle(provinceStyle);
    }

    redrawLayer(regionLayer);
    redrawLayer(municipalityLayer);
    redrawLayer(provinceLayer);
  }

  function prepareMapForPrint() {
    if (!viewBeforePrint) {
      viewBeforePrint = {
        center: map.getCenter(),
        zoom: map.getZoom()
      };
    }

    refreshMapSize();
    refreshMapLayers();
    fitRegionBounds();
    refreshMapLayers();
    renderMunicipalityLabels();

    queuePrintRefresh(function () {
      refreshMapSize();
      refreshMapLayers();
      fitRegionBounds();
      refreshMapLayers();
      renderMunicipalityLabels();
    });
  }

  function restoreMapAfterPrint() {
    refreshMapSize();

    if (viewBeforePrint) {
      map.setView(viewBeforePrint.center, viewBeforePrint.zoom, {
        animate: false
      });
      viewBeforePrint = null;
    }

    refreshMapLayers();
    renderMunicipalityLabels();

    queuePrintRefresh(function () {
      refreshMapSize();
      refreshMapLayers();
      renderMunicipalityLabels();
    });
  }

  function handlePrintMediaChange(event) {
    if (event.matches) {
      prepareMapForPrint();
    } else {
      restoreMapAfterPrint();
    }
  }

  async function loadRegion() {
    try {
      var geojson = await fetchGeoJson(DATA_FILES.region);
      regionLayer = L.geoJSON(geojson, {
        pane: "regionPane",
        renderer: vectorRenderer,
        style: regionStyle
      }).addTo(map);
      applyRegionMapLimits();
      refreshMapSize();
      fitRegionBounds();
      setStatus("Regione", "ok", featureCount(geojson) + " geometrie caricate.");
    } catch (error) {
      setStatus("Regione", "warn", error.message);
    }
  }

  async function loadProvinces() {
    try {
      var geojson = await fetchGeoJson(DATA_FILES.provinces);
      provinceLayer = L.geoJSON(geojson, {
        pane: "provincePane",
        renderer: vectorRenderer,
        style: provinceStyle,
        onEachFeature: function (feature, layer) {
          var name = firstAvailableProperty(feature, PROVINCE_NAME_FIELDS);
          if (name) {
            layer.bindTooltip(name, { sticky: true });
          }
        }
      }).addTo(map);
      setStatus("Province", "ok", featureCount(geojson) + " geometrie caricate.");
    } catch (error) {
      setStatus("Province", "warn", error.message);
    }
  }

  async function loadMunicipalities() {
    try {
      var geojson = await fetchGeoJson(DATA_FILES.municipalities);
      var namedMunicipalityCount = 0;
      municipalityIndex.clear();

      municipalityLayer = L.geoJSON(geojson, {
        pane: "municipalityPane",
        renderer: vectorRenderer,
        style: municipalityStyle,
        onEachFeature: function (feature, layer) {
          var name = firstAvailableProperty(feature, MUNICIPALITY_NAME_FIELDS);
          if (!name) {
            return;
          }

          namedMunicipalityCount += 1;
          var key = normalizeName(name);
          var record = {
            key: key,
            name: name,
            feature: feature,
            layer: layer
          };

          municipalityIndex.set(key, record);
          municipalityIndex.set(compactName(name), record);

          layer.bindTooltip(name, { sticky: true });
        }
      }).addTo(map);

      setStatus("Comuni", "ok", namedMunicipalityCount + " comuni indicizzati.");
    } catch (error) {
      setStatus("Comuni", "warn", error.message);
    }
  }

  // Prova prima alias e forma compatta, poi il nome normalizzato originale.
  function findMunicipality(inputName) {
    var normalized = normalizeName(inputName);
    var compact = compactName(inputName);
    var aliasTarget = ALIASES.get(normalized) || ALIASES.get(compact);
    var lookupValues = [normalized, compact];

    if (aliasTarget) {
      lookupValues.unshift(normalizeName(aliasTarget), compactName(aliasTarget));
    }

    for (var i = 0; i < lookupValues.length; i += 1) {
      var record = municipalityIndex.get(lookupValues[i]);
      if (record) {
        return record;
      }
    }

    return null;
  }

  function refreshMunicipalityStyles() {
    if (municipalityLayer) {
      municipalityLayer.setStyle(municipalityStyle);
    }
  }

  function getLayerCenter(layer) {
    if (layer && typeof layer.getCenter === "function") {
      try {
        return layer.getCenter();
      } catch (error) {
        // Alcuni layer complessi possono non avere un centro calcolabile da Leaflet.
      }
    }

    if (layer && typeof layer.getBounds === "function") {
      var bounds = layer.getBounds();
      if (bounds && bounds.isValid()) {
        return bounds.getCenter();
      }
    }

    if (layer && typeof layer.getLatLng === "function") {
      return layer.getLatLng();
    }

    return null;
  }

  function ringArea(ring) {
    var crossSum = 0;
    if (!Array.isArray(ring) || ring.length < 3) {
      return 0;
    }

    for (var i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      var previous = ring[j];
      var current = ring[i];
      if (!previous || !current) {
        continue;
      }
      crossSum += previous[0] * current[1] - current[0] * previous[1];
    }

    return Math.abs(crossSum / 2);
  }

  function ringBoundsCenter(ring) {
    var minLng = Infinity;
    var maxLng = -Infinity;
    var minLat = Infinity;
    var maxLat = -Infinity;

    if (!Array.isArray(ring) || !ring.length) {
      return null;
    }

    ring.forEach(function (point) {
      if (!point || point.length < 2) {
        return;
      }
      minLng = Math.min(minLng, point[0]);
      maxLng = Math.max(maxLng, point[0]);
      minLat = Math.min(minLat, point[1]);
      maxLat = Math.max(maxLat, point[1]);
    });

    if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) {
      return null;
    }

    return L.latLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);
  }

  function ringCentroid(ring) {
    var crossSum = 0;
    var centroidLng = 0;
    var centroidLat = 0;

    if (!Array.isArray(ring) || ring.length < 3) {
      return null;
    }

    for (var i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      var previous = ring[j];
      var current = ring[i];
      if (!previous || !current) {
        continue;
      }
      var cross = previous[0] * current[1] - current[0] * previous[1];
      crossSum += cross;
      centroidLng += (previous[0] + current[0]) * cross;
      centroidLat += (previous[1] + current[1]) * cross;
    }

    if (Math.abs(crossSum) < 1e-12) {
      return null;
    }

    return L.latLng(centroidLat / (3 * crossSum), centroidLng / (3 * crossSum));
  }

  function largestPolygonFromGeometry(geometry) {
    if (!geometry) {
      return null;
    }

    if (geometry.type === "Polygon") {
      return geometry.coordinates;
    }

    if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
      var largestMultiPolygon = geometry.coordinates.reduce(function (largest, polygon) {
        var area = ringArea(polygon && polygon[0]);
        if (!largest || area > largest.area) {
          return {
            area: area,
            polygon: polygon
          };
        }
        return largest;
      }, null);

      return largestMultiPolygon ? largestMultiPolygon.polygon : null;
    }

    if (geometry.type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
      var largestGeometryCollectionPolygon = geometry.geometries.reduce(function (largest, item) {
        var polygon = largestPolygonFromGeometry(item);
        var area = ringArea(polygon && polygon[0]);
        if (!largest || area > largest.area) {
          return {
            area: area,
            polygon: polygon
          };
        }
        return largest;
      }, null);

      return largestGeometryCollectionPolygon ? largestGeometryCollectionPolygon.polygon : null;
    }

    return null;
  }

  function getFeatureLabelLatLng(feature, layer) {
    var polygon = largestPolygonFromGeometry(feature && feature.geometry);
    var outerRing = polygon && polygon[0];
    return ringCentroid(outerRing) || ringBoundsCenter(outerRing) || getLayerCenter(layer);
  }

  function updateLabelsNotice(selectedCount) {
    dom.labelsNotice.hidden = !(labelsVisible && selectedCount > LABEL_NOTICE_THRESHOLD);
  }

  function renderMunicipalityLabels() {
    var records = getSelectedMunicipalityRecords();

    if (municipalityLabelLayer && map.hasLayer(municipalityLabelLayer)) {
      map.removeLayer(municipalityLabelLayer);
    }
    municipalityLabelLayer = L.layerGroup().addTo(map);

    updateLabelsNotice(records.length);

    if (!labelsVisible || !records.length) {
      return;
    }

    records.forEach(function (record) {
      var center = getFeatureLabelLatLng(record.feature, record.layer);
      if (!center) {
        return;
      }

      municipalityLabelLayer.addLayer(
        L.marker(center, {
          pane: "municipalityLabelPane",
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: "municipality-name-label",
            html: "<span>" + escapeHtml(record.name) + "</span>",
            iconAnchor: [0, 0],
            iconSize: [0, 0]
          })
        })
      );
    });
  }

  function highlightMunicipalities() {
    var requestedNames = parseMunicipalityInput(dom.input.value);
    var missingNames = [];

    selectedKeys.clear();

    requestedNames.forEach(function (name) {
      var record = findMunicipality(name);
      if (record) {
        selectedKeys.add(record.key);
      } else {
        missingNames.push(name);
      }
    });

    refreshMunicipalityStyles();
    updateSelectionOutputs(missingNames);
    zoomToSelectedMunicipalities();

    if (requestedNames.length && !municipalityLayer) {
      setStatus(
        "Comuni",
        "warn",
        "Il file " + DATA_FILES.municipalities + " non è ancora disponibile: il riconoscimento dei nomi richiede quel GeoJSON."
      );
    }
  }

  function clearSelection() {
    selectedKeys.clear();
    refreshMunicipalityStyles();
    updateSelectionOutputs([]);
  }

  function zoomToSelectedMunicipalities() {
    if (!municipalityLayer || !selectedKeys.size) {
      fitAvailableBounds();
      return;
    }

    var bounds = null;
    municipalityLayer.eachLayer(function (layer) {
      var name = firstAvailableProperty(layer.feature, MUNICIPALITY_NAME_FIELDS);
      if (!selectedKeys.has(normalizeName(name))) {
        return;
      }

      var layerBounds = layer.getBounds();
      bounds = bounds ? bounds.extend(layerBounds) : layerBounds;
    });

    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.18));
    }
  }

  function fitAvailableBounds() {
    if (fitRegionBounds()) {
      return;
    }

    var bounds = null;
    [municipalityLayer, provinceLayer].forEach(function (layer) {
      if (!layer || !map.hasLayer(layer)) {
        return;
      }

      var layerBounds = layer.getBounds();
      if (layerBounds.isValid()) {
        bounds = bounds ? bounds.extend(layerBounds) : layerBounds;
      }
    });

    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.06));
    } else {
      map.setView([42.25, 13.8], 8);
    }
  }

  function toggleMunicipalityBorders() {
    municipalityBordersVisible = !municipalityBordersVisible;
    dom.toggleMunicipalitiesButton.setAttribute("aria-pressed", String(municipalityBordersVisible));
    refreshMunicipalityStyles();
  }

  function toggleProvinceBorders() {
    provinceBordersVisible = !provinceBordersVisible;
    dom.toggleProvincesButton.setAttribute("aria-pressed", String(provinceBordersVisible));

    if (!provinceLayer) {
      return;
    }

    if (provinceBordersVisible) {
      provinceLayer.addTo(map);
      provinceLayer.setStyle(provinceStyle);
    } else {
      map.removeLayer(provinceLayer);
    }
  }

  function toggleHighlightedList() {
    highlightedListVisible = !highlightedListVisible;
    dom.highlightedMunicipalityBox.hidden = !highlightedListVisible;
    dom.toggleHighlightedListButton.setAttribute("aria-pressed", String(highlightedListVisible));
    document.body.classList.toggle("highlighted-list-hidden", !highlightedListVisible);
    refreshMapSize();
    renderMunicipalityLabels();
  }

  function toggleMunicipalityLabels() {
    labelsVisible = !labelsVisible;
    dom.toggleLabelsButton.setAttribute("aria-pressed", String(labelsVisible));
    renderMunicipalityLabels();
  }

  async function init() {
    renderDataStatus();
    updateSelectionOutputs([]);

    await Promise.all([loadRegion(), loadProvinces(), loadMunicipalities()]);
    refreshMapSize();
    fitAvailableBounds();
    window.setTimeout(function () {
      refreshMapSize();
      fitAvailableBounds();
    }, 0);

    dom.highlightButton.addEventListener("click", highlightMunicipalities);
    dom.clearButton.addEventListener("click", clearSelection);
    dom.toggleMunicipalitiesButton.addEventListener("click", toggleMunicipalityBorders);
    dom.toggleProvincesButton.addEventListener("click", toggleProvinceBorders);
    dom.toggleHighlightedListButton.addEventListener("click", toggleHighlightedList);
    dom.toggleLabelsButton.addEventListener("click", toggleMunicipalityLabels);
    dom.printButton.addEventListener("click", function () {
      window.print();
    });
    window.addEventListener("resize", function () {
      refreshMapSize();
      if (!selectedKeys.size) {
        fitAvailableBounds();
      }
      if (labelsVisible) {
        renderMunicipalityLabels();
      }
    });
    window.addEventListener("beforeprint", prepareMapForPrint);
    window.addEventListener("afterprint", restoreMapAfterPrint);
    if (window.matchMedia) {
      var printMediaQuery = window.matchMedia("print");
      if (typeof printMediaQuery.addEventListener === "function") {
        printMediaQuery.addEventListener("change", handlePrintMediaChange);
      } else if (typeof printMediaQuery.addListener === "function") {
        printMediaQuery.addListener(handlePrintMediaChange);
      }
    }
  }

  init();
})();
