// Adjust Height of map
adjustHeight();
window.addEventListener("resize", adjustHeight);

// Create map
const map = L.map("map", {
  center: [38.0268, -84.5051],
  zoom: 15,
  maxZoom: 18,
  minZoom: 14,
});

// Create global variables
let stmLineGeoJSON;
let stmPointGeoJSON;
let networkLayer;
let bufferLayer;

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

  // Add the plain geojson to variables to be used in identifying network
  stmLineGeoJSON = result[0];
  stmPointGeoJSON = result[1];
  // console.log(stmLineGeoJSON);
  // console.log(stmPointGeoJSON);

  // Add Storm Line features
  let stmLine = L.geoJSON(result[0], {
    style: function (feature) {
      return {
        color: "#20282e",
        weight: 2,
      };
    },
  }).addTo(map);

  // Set bounds to the stmLine layer
  map.setMaxBounds(stmLine.getBounds());

  // Add Storm Drain features
  let stmDrains = L.geoJSON(result[1], {
    pointToLayer: function (geoJsonPoint, latlng) {
      return L.circleMarker(latlng, {
        radius: 2,
      });
    },
    filter: drainFilter,
  }).addTo(map);
  // console.log(stmDrains);

  // When map is clicked on
  map.on("click", function (e) {
    // Create empty Network feature
    let network = {
      type: "FeatureCollection",
      features: [],
    };

    // Check if networklayer is added to map or not
    if (networkLayer) {
      // Remove it if so
      map.removeLayer(networkLayer);
    }

    // Check if bufferLayer is added to map or not
    if (bufferLayer) {
      // Remove it if so
      map.removeLayer(bufferLayer);
    }

    // Create a point from clicked location
    let clickPoint = turf.point([e.latlng.lng, e.latlng.lat]);

    // Create a buffer and add to map
    let buffer = turf.buffer(clickPoint, 0.06096, { units: "kilometers" }); // 50ft (0.01524) 150ft (0.04572) 200ft (0.06096)
    bufferLayer = L.geoJson(buffer);
    bufferLayer.addTo(map);

    // Find the starting point of the flow
    let startingPoint = turf.point(selectpoints(network, clickPoint, buffer, stmDrains));
    // console.log(startingPoint)

    // For each feature in the GeoJSON
    stmLineGeoJSON.features.forEach(function (f) {
      // Create a line
      let line = turf.lineString(f.geometry.coordinates);

      // Check if the point is on the line
      if (turf.booleanPointOnLine(startingPoint, line)) {
        // Check coordinates and assign if flow is up or down
        if (checkCoords(startingPoint, line)) {
          f.properties.flow = "Down";
          network.features.push(f); // Push the feature to the network
          let endPoint = f.geometry.coordinates[f.geometry.coordinates.length - 1];

          // Follow the downstream line
          followDown(endPoint, network);
        }
      }
    });

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
  });
}

// Function to resize map
function adjustHeight() {
  const mapSize = document.querySelector("#map"),
    removeHeight = document.querySelector("#header").offsetHeight,
    resize = window.innerHeight - removeHeight;
  mapSize.style.height = `${resize}px`;
}

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

// Function to continue down the flow path
function followDown(endPoint, network) {
  stmLineGeoJSON.features.forEach(function (f) {
    // Create line and point
    let line = turf.lineString(f.geometry.coordinates);
    let point = turf.point(endPoint);

    // Check if the end point is on the current line and that the current feature is not already in the network
    if (turf.booleanPointOnLine(point, line) && !network.features.some((feature) => feature === f)) {
      if (checkCoords(point, line)) {
        f.properties.flow = "Down";
        network.features.push(f);
        followDown(f.geometry.coordinates[f.geometry.coordinates.length - 1], network);
      }
    }
  });
}

// Filter function to only show storm drains
function drainFilter(feature) {
  let vals = ["Catchbasin", "Inlet", "Manhole-CB", "Detention Basin", "Headwall", "Detention Pond", "Spring"];
  const st = feature.properties.StructureType;
  const ft = feature.properties.FeatureType;
  if (vals.includes(st) || vals.includes(ft)) {
    return feature;
  }
}

// Function to select points inside the buffer and find the nearest
function selectpoints(network, clickPoint, buffer, stmDrains) {
  pointsInPoly = [];
  pointDist = [];

  // Go through each drain feature and check if inside buffer
  stmDrains.eachLayer(function (layer) {
    let pt = turf.getCoord(layer.feature);
    if (turf.booleanPointInPolygon(pt, buffer)) {
      pointsInPoly.push(layer);
    }
  });

  // Go through each point inside the buffer and calculate distance from clicked point
  pointsInPoly.forEach(function (point) {
    // console.log("Starting: ", clickPoint);
    // console.log("Ending: ", point._latlng);
    let distance = turf.distance(clickPoint.geometry.coordinates, [point._latlng.lng, point._latlng.lat], { units: "kilometers" });
    pointDist.push(distance);
  });
  // Find the index position of the lowest distance
  let indexNum = pointDist.indexOf(Math.min(...pointDist));

  // Make starting line and add to Network geoJSON
  let startingLine = makeStartLine(clickPoint, indexNum, pointsInPoly);

  // Push the starting line to the Network
  network.features.push(startingLine);

  // Return the lat and long of the starting position on the line
  return [pointsInPoly[indexNum]._latlng.lng, pointsInPoly[indexNum]._latlng.lat];
}

// Funtion to draw a line between a clicked location and a drain location
function makeStartLine(clickPoint, indexNum, pointsInPoly) {
  let clickCoords = clickPoint.geometry.coordinates;
  let drainCoords = [pointsInPoly[indexNum]._latlng.lng, pointsInPoly[indexNum]._latlng.lat];

  // Build feature
  let feature = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [clickCoords, drainCoords],
    },
    properties: {},
  };

  return feature;
}
