// Adjust Height of map
adjustHeight();
window.addEventListener("resize", adjustHeight);

// Create map
const map = L.map("map", {
  center: [38.0268, -84.5051],
  zoom: 15,
  maxZoom: 20,
  minZoom: 14,
});

// Create global variables
let stmLineGeoJSON;
let stmPointGeoJSON;
let stmBMP;
let network;
let networkLayer;
let bufferLayer;
let aerial;

// Create function to load all layers
function getData() {
  return Promise.all([fetch("data/STM_Line_ln.geojson"), fetch("data/STM_Structure_pt.geojson")]).then((results) => {
    return Promise.all(results.map((result) => result.json()));
  });
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

  // const buildingLabels = "https://ugisserver.uky.edu/arcgis/rest/services/UK_MAP_BASE_Campus_Overlay_3857_dy/MapServer/23"

  // Load aerial imagery
  aerial = L.esri.tiledMapLayer({
    url: "https://ugisserver.uky.edu/arcgis/rest/services/UK_MAP_BASE_Imagery_3857_ca/MapServer",
  });

  // Build control for UI Toggles
  let uiControl = L.control({
    position: "topright",
  });

  uiControl.onAdd = function (map) {
    let controls = L.DomUtil.get("ui-control");
    L.DomEvent.disableScrollPropagation(controls);
    L.DomEvent.disableClickPropagation(controls);
    return controls;
  };

  uiControl.addTo(map);

  // Add the plain geojson to variables to be used in identifying network
  stmLineGeoJSON = result[0];
  stmPointGeoJSON = result[1];

  // Add Storm Line features
  let stmLine = L.geoJSON(stmLineGeoJSON, {
    style: function (feature) {
      return {
        color: "#20282e",
        weight: 2,
      };
    },
  });

  // Set bounds to the stmLine layer
  map.setMaxBounds(stmLine.getBounds());

  // Add Storm Drain features
  let stmDrains = L.geoJSON(stmPointGeoJSON, {
    pointToLayer: function (geoJsonPoint, latlng) {
      return L.circleMarker(latlng, {
        radius: 3,
      });
    },
    filter: drainFilter,
    onEachFeature: function (feature, layer) {
      layer.bindTooltip(`${feature.geometry.coordinates}`);
    },
  }).addTo(map);
  // console.log(stmDrains);

  // When map is clicked on
  map.on("click", function (e) {
    // Start Network feature
    network = {
      type: "FeatureCollection",
      features: [],
    };

    console.log(network);

    multiCoords = [];

    // Check if networklayer is added to map or not
    if (networkLayer) {
      // Remove it if so
      map.removeLayer(networkLayer);
    }

    // Check if bmpLayer is added to map or not
    if (stmBMP) {
      // Remove it if so
      map.removeLayer(stmBMP);
    }

    // Create a point from clicked location
    let clickPoint = turf.point([e.latlng.lng, e.latlng.lat]);

    // Create a buffer and add to map
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
    stmLineGeoJSON.features.forEach(function (f) {
      let propCoords = f.geometry.coordinates;

      // Create a line
      let line = turf.lineString(propCoords);

      // Check if the point is on the line
      if (turf.booleanPointOnLine(startingPoint, line)) {
        // Check coordinates and assign if flow is up or down
        if (checkCoords(startingPoint, line)) {
          // f.properties.flow = "Down";
          // network.features.push(f);
          // network.features[0].properties.flow = "Down";
          multiCoords.push(propCoords);
          // for (let index in propCoords) {
          //   // Do not use the first index as it is already added to the network
          //   if (index != 0) {
          //     network.features[0].geometry.coordinates.push(propCoords[index]);
          //   }
          // }
          let endPoint = propCoords[propCoords.length - 1];

          // Follow the downstream line
          followDown(endPoint, network, multiCoords);
        }
      }
    });

    console.log(multiCoords);

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
          color: "#FF4500",
          weight: 4,
        };
      },
    }).addTo(map);

    console.log("Network Layer: ", networkLayer);

    // Add BMP points that are on the route to map
    stmBMP = L.geoJSON(stmPointGeoJSON, {
      // Create symbology
      pointToLayer: function (geoJsonPoint, latlng) {
        return L.marker(latlng, {
          icon: chooseIcon(geoJsonPoint),
        });
      },
      // Filter to only BMPs on the route
      filter: bmpFilter,
      // Building Popup and attach to each feature
      onEachFeature: function (feature, layer) {
        let props = feature.properties;
        let popupInfo = `${props.StructureType}<br>
                          ${props.FeatureType}`;

        layer.bindPopup(popupInfo);
      },
    }).addTo(map);
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
  stmLineGeoJSON.features.forEach(function (f) {
    let propCoords = f.geometry.coordinates;

    // Create line and point
    let line = turf.lineString(propCoords);
    let point = turf.point(endPoint);

    // Check if the end point is on the current line
    // && !network.features.some((feature) => feature === f)
    if (turf.booleanPointOnLine(point, line)) {
      if (checkCoords(point, line)) {
        multiCoords.push(propCoords);
        // f.properties.flow = "Down";
        // network.features.push(f);
        // for (let index in propCoords) {
        //   if (index != 0 && !network.features[0].geometry.coordinates.includes(propCoords[index])) {
        //     network.features[0].geometry.coordinates.push(propCoords[index]);
        //   }
        // }
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

// Filter function to only show BMPs on line
function bmpFilter(feature) {
  let vals = ["Water Quality BMP", "WQBMP"];
  const st = feature.properties.StructureType;
  let pt = turf.point(feature.geometry.coordinates);
  // console.log(feature.geometry.coordinates);
  // console.log(network.features[0].geometry.coordinates);
  if (vals.includes(st) && turf.booleanIntersects(feature, network.features[0])) {
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

    // Make starting line and add to Network geoJSON
    let startingLine = makeStartLine(clickPoint, indexNum, pointsInPoly, multiCoords);

    // Push the starting line to the Network
    network.features.push(startingLine);

    // Return the lat and long of the starting position on the line
    return [pointsInPoly[indexNum]._latlng.lng, pointsInPoly[indexNum]._latlng.lat];
  }
}

// *******************************************************
// End selectPoints
// *******************************************************

// Funtion to draw a line between a clicked location and a drain location
function makeStartLine(clickPoint, indexNum, pointsInPoly, multiCoords) {
  let clickCoords = clickPoint.geometry.coordinates;
  let drainCoords = [pointsInPoly[indexNum]._latlng.lng, pointsInPoly[indexNum]._latlng.lat];

  multiCoords.push([clickCoords, drainCoords]);

  // Build feature
  // let feature = {
  //   type: "Feature",
  //   geometry: {
  //     type: "MultiLineString",
  //     coordinates: [clickCoords, drainCoords],
  //   },
  //   properties: {},
  // };

  // return feature;
}

// *******************************************************
// End makeStartLine
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

// Function to choose which symbol is used for BMP points
function chooseIcon(point) {
  let iconUrl;
  const props = point.properties.FeatureType;

  if (props == "Bioretention") {
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
  }

  let myIcon = L.icon({
    iconUrl: iconUrl,
    iconSize: [15, 15],
  });

  return myIcon;
}
