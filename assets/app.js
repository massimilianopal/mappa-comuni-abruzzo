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
    printButton: document.getElementById("printButton"),
    dataStatus: document.getElementById("dataStatus"),
    foundCount: document.getElementById("foundCount"),
    foundList: document.getElementById("foundList"),
    missingList: document.getElementById("missingList"),
    mapNotice: document.getElementById("mapNotice")
  };

  // Leaflet viene usato solo per renderizzare GeoJSON: nessun tile stradale.
  var map = L.map("map", {
    attributionControl: false,
    maxBoundsViscosity: 0.85,
    maxZoom: 13,
    minZoom: 6,
    preferCanvas: true,
    zoomDelta: 0.5,
    zoomSnap: 0.1
  }).setView([42.25, 13.8], 8);

  L.control.scale({ imperial: false }).addTo(map);
  map.createPane("regionPane").style.zIndex = 200;
  map.createPane("municipalityPane").style.zIndex = 300;
  map.createPane("provincePane").style.zIndex = 400;

  var regionLayer = null;
  var provinceLayer = null;
  var municipalityLayer = null;
  var provinceBordersVisible = true;
  var municipalityBordersVisible = true;
  var selectedKeys = new Set();
  var municipalityIndex = new Map();
  var dataStatuses = [];

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

  async function loadRegion() {
    try {
      var geojson = await fetchGeoJson(DATA_FILES.region);
      regionLayer = L.geoJSON(geojson, {
        pane: "regionPane",
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
            layer: layer
          };

          municipalityIndex.set(key, record);
          municipalityIndex.set(compactName(name), record);

          layer.bindTooltip(name, { sticky: true });
          layer.on("click", function () {
            toggleMunicipalitySelection(record);
          });
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

  function highlightMunicipalities() {
    var requestedNames = parseMunicipalityInput(dom.input.value);
    var foundByKey = new Map();
    var missingNames = [];

    selectedKeys.clear();

    requestedNames.forEach(function (name) {
      var record = findMunicipality(name);
      if (record) {
        selectedKeys.add(record.key);
        foundByKey.set(record.key, record.name);
      } else {
        missingNames.push(name);
      }
    });

    refreshMunicipalityStyles();
    updateSummary(Array.from(foundByKey.values()), missingNames);
    zoomToSelectedMunicipalities();

    if (requestedNames.length && !municipalityLayer) {
      setStatus(
        "Comuni",
        "warn",
        "Il file " + DATA_FILES.municipalities + " non è ancora disponibile: il riconoscimento dei nomi richiede quel GeoJSON."
      );
    }
  }

  function toggleMunicipalitySelection(record) {
    if (selectedKeys.has(record.key)) {
      selectedKeys.delete(record.key);
    } else {
      selectedKeys.add(record.key);
    }

    refreshMunicipalityStyles();

    var foundNames = [];
    selectedKeys.forEach(function (key) {
      var item = municipalityIndex.get(key);
      if (item) {
        foundNames.push(item.name);
      }
    });
    foundNames.sort(function (a, b) {
      return a.localeCompare(b, "it");
    });
    updateSummary(foundNames, []);
  }

  function clearSelection() {
    selectedKeys.clear();
    refreshMunicipalityStyles();
    updateSummary([], []);
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

  async function init() {
    renderDataStatus();
    updateSummary([], []);

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
    dom.printButton.addEventListener("click", function () {
      window.print();
    });
    window.addEventListener("resize", function () {
      refreshMapSize();
      if (!selectedKeys.size) {
        fitAvailableBounds();
      }
    });
  }

  init();
})();
