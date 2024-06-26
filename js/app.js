// Adjust Height of map
adjustHeight();
window.addEventListener("resize", adjustHeight);

// Create map
const map = L.map("map", {
  center: [38.0268, -84.5051],
  zoom: 15,
  maxZoom: 18,
  minZoom: 14,
  zoomControl: false,
});

L.control
  .zoom({
    position: "bottomright",
  })
  .addTo(map);

// Create global variables
let stmLineGeoJson;
let stmPointGeoJson;
let stmBMP;
let network;
let networkLayer;
let bufferLayer;
let aerial;
let stmPoly;
let drain;
let markerLayer = L.layerGroup();

// Create function to load all layers
function getData() {
  return Promise.all([fetch("data/STM_Line_ln.geojson"), fetch("data/STM_Structure_pt.geojson"), fetch("data/STM_Structure_py.geojson")]).then(
    (results) => {
      return Promise.all(results.map((result) => result.json()));
    }
  );
}

// Call the getData function
getData()
  .then((result) => {
    drawMap(result);
  })
  .catch(console.error);

// Create function to draw the map
function drawMap(result) {
  // Add Basemap Layers
  const basemap = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  });
  basemap.addTo(map);

  const campusBasemap = L.esri.tiledMapLayer({
    url: "https://ugisserver.uky.edu/arcgis/rest/services/UK_MAP_BASE_Campus_bluegreen1_3857_ca/MapServer",
  });
  campusBasemap.addTo(map);

  // Add Property Boundary to map
  const boundary = L.esri.featureLayer({
    url: "https://ugisserver.uky.edu/arcgis/rest/services/Support/UK_MAP_SUPPORT_StormWaterInfrastructure_dy/MapServer/14",
    style: function (feature) {
      return {
        dashArray: "4 4",
        fill: false,
        color: "#000",
        weight: 2,
      };
    },
  });
  boundary.addTo(map);

  // const buildingLabels = "https://ugisserver.uky.edu/arcgis/rest/services/UK_MAP_BASE_Campus_Overlay_3857_dy/MapServer/23"

  // Load aerial imagery
  aerial = L.esri.tiledMapLayer({
    url: "https://ugisserver.uky.edu/arcgis/rest/services/UK_MAP_BASE_Imagery_3857_ca/MapServer",
  });

  // Build control for UI Toggles
  let uiControl = L.control({
    position: "topright",
  });

  // When control is added to map...
  uiControl.onAdd = function (map) {
    // Get the HTML element to populate the control
    let controls = L.DomUtil.get("ui-control");

    // Disable scrolling and clicking of map while on the control
    L.DomEvent.disableScrollPropagation(controls);
    L.DomEvent.disableClickPropagation(controls);

    return controls;
  };

  // Add control to map
  uiControl.addTo(map);

  // Add the plain geojson to variables to be used in identifying network
  stmLineGeoJson = result[0];
  stmPointGeoJson = result[1];
  stmPolyGeoJson = result[2];

  // Add Storm Line features
  let stmLine = L.geoJSON(stmLineGeoJson, {
    style: function (feature) {
      return {
        color: "#20282e",
        weight: 2,
      };
    },
  });

  // Set bounds to the stmLine layer
  map.setMaxBounds(stmLine.getBounds());

  // Build Storm Drain features
  let stmDrains = L.geoJSON(stmPointGeoJson, {
    pointToLayer: function (feature, latlng) {
      return L.circleMarker(latlng, {
        radius: 3,
      });
    },
    filter: drainFilter,
  });
  // console.log(stmDrains);

  // Add BMP points
  stmBMP = L.geoJSON(stmPointGeoJson, {
    // Create symbology
    pointToLayer: function (geoJsonPoint, latlng) {
      return L.marker(latlng, {
        icon: chooseIcon(geoJsonPoint),
      });
    },

    // Create filter
    filter: bmpFilter,

    // Build Popup and attach to each feature
    onEachFeature: function (feature, layer) {
      let props = feature.properties;
      let popupInfo = `<h6 class="my-1 fw-bold">${props.FeatureType}</h6><hr class="my-2">
        ${props.Description}`;

      if (props.Link) {
        popupInfo += `<br><br>To learn more, click <a href="${props.Link}">here</a>`;
      }

      layer.bindPopup(popupInfo, {
        className: "leaflet-popup-own",
      });
    },
  }).addTo(map);

  // Add storm structure polygons
  stmPoly = L.geoJSON(stmPolyGeoJson, {
    style: function (feature) {
      return {
        color: "#000",
        weight: 2,
        fillColor: "#1c73eb",
        fillOpacity: 0.2,
      };
    },
    filter: function (feature) {
      if (feature.properties.FeatureType != "BCLVT") {
        return feature;
      }
    },
  }).addTo(map);

  // Create and add legend
  drawLegend();

  // When map is clicked on
  map.on("click", function (e) {
    // Clear any line markers if any
    layers = markerLayer.getLayers();

    if (layers.length > 0) {
      markerLayer.eachLayer(function (layer) {
        layer.remove();
      });
    }

    // Start Network feature
    network = {
      type: "FeatureCollection",
      features: [],
    };

    // console.log(network);

    multiCoords = [];

    // Check if networklayer is added to map or not
    if (networkLayer) {
      // Remove it if so
      map.removeLayer(networkLayer);
    }

    // Create a point from clicked location
    let clickPoint = turf.point([e.latlng.lng, e.latlng.lat]);

    // Create a buffer
    let buffer = turf.buffer(clickPoint, 0.06096, { units: "kilometers" }); // 50ft (0.01524) 150ft (0.04572) 200ft (0.06096)

    // Find the starting point of the flow
    let findPoint = selectPoints(network, clickPoint, buffer, stmDrains, multiCoords);
    let startingPoint;

    // If no point is found...
    if (findPoint.length == 0) {
      // Alert users that there are no drains in the area and to select a new point
      let modal = new bootstrap.Modal(document.getElementById("alertModal"));
      modal.show();
      return;
    } else {
      // Else, create a turf point
      startingPoint = turf.point(findPoint);
    }

    // For each feature in the GeoJSON
    stmLineGeoJson.features.forEach(function (f) {
      let propCoords = f.geometry.coordinates;

      // Create a line
      let line = turf.lineString(propCoords);

      // Check if the point is on the line
      if (turf.booleanPointOnLine(startingPoint, line)) {
        // Check coordinates and assign if flow is up or down
        if (checkCoords(startingPoint, line)) {
          // Push coordinates into multiCoords array
          multiCoords.push(propCoords);

          // Define the end point
          let endPoint = propCoords[propCoords.length - 1];

          // Follow the downstream line
          followDown(endPoint, network, multiCoords);
        }
      }
    });

    // console.log(multiCoords);

    if (multiCoords.length > 0) {
      let feature = {
        type: "Feature",
        geometry: {
          type: "MultiLineString",
          coordinates: multiCoords,
        },
        properties: {
          flow: "Down",
        },
      };

      network.features[0] = feature;
    }

    console.log("Network: ", network);

    // Add networkLayer to the map
    networkLayer = L.geoJSON(network, {
      style: function (feature) {
        return {
          color: "#3AF0C7",
          weight: 3,
        };
      },
    }).addTo(map);

    // Get coordinates and loop through each polyline
    let coords = network.features[0].geometry.coordinates;
    coords.forEach(function (coordsArray) {
      // Create a polyline
      const polyline = L.polyline(flipCoords(coordsArray));

      // Create a line decoration using polyLineDecorator
      let decorator = L.polylineDecorator(polyline, {
        patterns: [
          {
            offset: "50%",
            repeat: 0,
            symbol: L.Symbol.arrowHead({
              pixelSize: 13,
              pathOptions: {
                fillColor: "#3AF0C7",
                fillOpacity: 1,
                weight: 1,
                color: "#000",
              },
            }),
          },
        ],
      }).addTo(markerLayer);
    });

    // Add the markers to the map
    markerLayer.addTo(map);
    // console.log(markerLayer);

    // Build the info widget
    buildInfo();

    // Show the initial drain on map
    showDrain();

    console.log("Network Layer: ", networkLayer);
  });
}

// *******************************************************
// End drawMap
// *******************************************************

// Function to resize map
function adjustHeight() {
  const mapSize = document.querySelector("#map"),
    removeHeight = document.querySelector("#header").offsetHeight,
    resize = window.innerHeight - removeHeight;
  mapSize.style.height = `${resize}px`;
}

// *******************************************************
// End adjustHeight
// *******************************************************

// Function to check if the line's starting coordinates match the point
function checkCoords(point, line) {
  ptLon = point.geometry.coordinates[0];
  ptLat = point.geometry.coordinates[1];
  lnLon = line.geometry.coordinates[0][0];
  lnLat = line.geometry.coordinates[0][1];

  if (ptLon === lnLon && ptLat === lnLat) {
    return true;
  }
}

// *******************************************************
// End checkCoords
// *******************************************************

// Function to continue down the flow path
function followDown(endPoint, network, multiCoords) {
  stmLineGeoJson.features.forEach(function (f) {
    let propCoords = f.geometry.coordinates;

    // Create line and point
    let line = turf.lineString(propCoords);
    let point = turf.point(endPoint);

    // Check if the end point is on the current line
    if (turf.booleanPointOnLine(point, line)) {
      // Check the coordinates to determin flow
      if (checkCoords(point, line)) {
        // Push the coordinates to the multiCoords array
        multiCoords.push(propCoords);

        // Call the followDown function
        followDown(propCoords[propCoords.length - 1], network, multiCoords);
      }
    }
  });
}

// *******************************************************
// End followDown
// *******************************************************

// Filter function to only show storm drains
function drainFilter(feature) {
  let vals = ["Catchbasin", "Inlet", "Manhole-CB", "Detention Basin", "Headwall", "Detention Pond", "Spring"];
  const st = feature.properties.StructureType;
  const ft = feature.properties.FeatureType;
  if (vals.includes(st) || vals.includes(ft)) {
    return feature;
  }
}

// *******************************************************
// End drainFilter
// *******************************************************

// Filter function to only show BMPs
function bmpFilter(feature) {
  let vals = ["Water Quality BMP"];
  const st = feature.properties.StructureType;
  const ft = feature.properties.FeatureType;
  if (vals.includes(st) && ft != "Spring") {
    return feature;
  }
}

// *******************************************************
// End bmpFilter
// *******************************************************

// Function to select points inside the buffer and find the nearest
function selectPoints(network, clickPoint, buffer, stmDrains, multiCoords) {
  pointsInPoly = [];
  pointDist = [];

  // Go through each drain feature and check if inside buffer
  stmDrains.eachLayer(function (layer) {
    let pt = turf.getCoord(layer.feature);
    if (turf.booleanPointInPolygon(pt, buffer)) {
      pointsInPoly.push(layer);
    }
  });

  if (pointsInPoly.length == 0) {
    return [];
  } else {
    // Go through each point inside the buffer and calculate distance from clicked point
    pointsInPoly.forEach(function (point) {
      let distance = turf.distance(clickPoint.geometry.coordinates, [point._latlng.lng, point._latlng.lat], { units: "kilometers" });
      pointDist.push(distance);
    });
    // Find the index position of the lowest distance
    let indexNum = pointDist.indexOf(Math.min(...pointDist));

    // Get the clicked and nearest drain coordinates
    let clickCoords = clickPoint.geometry.coordinates;
    let drainCoords = [pointsInPoly[indexNum]._latlng.lng, pointsInPoly[indexNum]._latlng.lat];

    // Push those coordinates into multiCoords as the starting line
    multiCoords.push([clickCoords, drainCoords]);

    // Return the lat and long of the starting position on the line
    return [pointsInPoly[indexNum]._latlng.lng, pointsInPoly[indexNum]._latlng.lat];
  }
}

// *******************************************************
// End selectPoints
// *******************************************************

// Function to handle imagery toggle switch
function imageryToggle() {
  if (map.hasLayer(aerial)) {
    map.removeLayer(aerial);
  } else {
    map.addLayer(aerial);
  }
}

// *******************************************************
// End imageryToggle
// *******************************************************

// Function to handle bmp toggle switch
function bmpToggle() {
  if (map.hasLayer(stmBMP)) {
    map.removeLayer(stmBMP);
  } else {
    map.addLayer(stmBMP);
  }
}

// *******************************************************
// End bmpToggle
// *******************************************************

// Function to handle polygon toggle switch
function polyToggle() {
  if (map.hasLayer(stmPoly)) {
    map.removeLayer(stmPoly);
  } else {
    map.addLayer(stmPoly);
  }
}

// *******************************************************
// End polyToggle
// *******************************************************

// Function to choose which symbol is used for BMP points
function chooseIcon(point) {
  let iconUrl;
  const props = point.properties.FeatureType;

  if (props == "Bioretention" || props == "Vegatative Swale") {
    iconUrl = "img/symbols/Bioretention.svg";
  } else if (props == "Class V Injection Well") {
    iconUrl = "img/symbols/ClassVInjectionWell.svg";
  } else if (props == "Detention Pond") {
    iconUrl = "img/symbols/AbovegroundDetention.svg";
  } else if (props == "Green Roof") {
    iconUrl = "img/symbols/GreenRoof.svg";
  } else if (props == "Inlet Control") {
    iconUrl = "img/symbols/InletControl.svg";
  } else if (props == "Permeable Pavement") {
    iconUrl = "img/symbols/PermeablePavement.svg";
  } else if (props == "Pretreatment Device") {
    iconUrl = "img/symbols/PretreatmentDevice.svg";
  } else if (props == "Rain Garden") {
    iconUrl = "img/symbols/RainGarden.svg";
  } else if (props == "Underground Detention") {
    iconUrl = "img/symbols/UndergroundDetention.svg";
  } else if (props == "Water Harvesting System") {
    iconUrl = "img/symbols/WaterHarvesting.svg";
  } else {
    iconUrl = L.Icon.Default;
  }

  let myIcon = L.icon({
    iconUrl: iconUrl,
    iconSize: [15, 15],
  });

  return myIcon;
}

// *******************************************************
// End chooseIcon
// *******************************************************

// Function to build the info widget
function buildInfo() {
  const feature = network.features[0];
  let length;

  // Measure distance of line
  const lengthMi = turf.length(feature, {
    units: "miles",
  });

  if (lengthMi <= 1) {
    // Convert the distance into feet
    const lengthFt = Math.round(lengthMi * 5280);
    length = `${lengthFt.toLocaleString()} Ft`;
  } else {
    length = `${lengthMi.toFixed(2)} Mi`;
  }

  // Build control for info
  let infoControl = L.control({
    position: "topleft",
  });

  // Build the content for the control
  let infoEle = document.getElementById("info-control");
  infoEle.innerHTML = `From your chosen location, stormwater will travel ~${length} through UK's storm sewer system`;

  // When control is added to map...
  infoControl.onAdd = function (map) {
    // Get the HTML element to populate the control
    let controls = L.DomUtil.get("info-control");

    // Disable scrolling and clicking events
    L.DomEvent.disableScrollPropagation(controls);
    L.DomEvent.disableClickPropagation(controls);

    return controls;
  };

  // Add control to map
  infoControl.addTo(map);
}

// *******************************************************
// End buildInfo
// *******************************************************

// Function to draw legend
function drawLegend() {
  const legendControl = L.control({
    position: "bottomleft",
  });

  // When legend gets added...
  legendControl.onAdd = function () {
    const legend = L.DomUtil.get("legend");

    // Disable scrolling and clicking events
    L.DomEvent.disableScrollPropagation(legend);
    L.DomEvent.disableClickPropagation(legend);
    return legend;
  };

  // Add legend to the map
  legendControl.addTo(map);
}

// *******************************************************
// End drawLegend
// *******************************************************

// Function to show the initial drain on the map
function showDrain() {
  if (drain) {
    map.removeLayer(drain);
  }

  drain = L.geoJSON(stmPointGeoJson, {
    filter: function (feature) {
      let coords = network.features[0].geometry.coordinates[0][1];
      let featCoords = feature.geometry.coordinates;
      let vals = ["Catchbasin", "Inlet", "Manhole-CB", "Headwall", "Spring"];

      if (featCoords[0] === coords[0] && featCoords[1] === coords[1] && vals.includes(feature.properties.StructureType)) {
        return feature;
      }
    },
    pointToLayer: function (geoJsonPoint, latlng) {
      return L.marker(latlng, {
        icon: L.icon({
          iconUrl: "img/symbols/Drain.svg",
          iconSize: [20, 20],
        }),
      });
    },
    onEachFeature: function (feature, layer) {
      let props = feature.properties;
      let popupInfo = `The stormwater starts the journey here by draining into a ${props.StructureType}.`;

      layer.bindPopup(popupInfo, {
        className: "leaflet-popup-own",
      });
    },
  });
  drain.addTo(map);

  // console.log(coords);
}

// *******************************************************
// End showDrain
// *******************************************************

// Function that takes array of coordinates and flips them
function flipCoords(coordsArray) {
  // Construct array to hold coordinates
  let newCoords = [];

  // Loop through each pair of coordinates
  coordsArray.forEach(function (coords) {
    // Push the flipped coordinates to the array
    newCoords.push([coords[1], coords[0]]);
  });

  // Return the new coordinates
  return newCoords;
}

// *******************************************************
// End flipCoords
// *******************************************************
