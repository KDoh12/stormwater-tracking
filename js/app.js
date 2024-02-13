// Create map
const map = L.map("map", {
  center: [38.0268, -84.5051],
  zoom: 15,
});

// Create global variables
let stmLine;
let stmPoint;
let stmLineGeoJSON;
let stmPointGeoJSON;
let networkLayer;

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

  // Add Map Layers
  stmLine = L.geoJSON(result[0], {
    style: function (feature) {
      return {
        color: "#20282e",
        weight: 2,
      };
    },
  }).addTo(map);

  stmPoint = L.geoJSON(result[1], {
    pointToLayer: function (geoJsonPoint, latlng) {
      return L.circleMarker(latlng, {
        radius: 2,
      });
    },
  }).addTo(map);

  // When a Storm point is clicked on
  stmPoint.on("click", function (e) {
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

    // Create a point
    let startingPoint = turf.point([e.latlng.lng, e.latlng.lat]);
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
        // console.log(line);
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
  });
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

  // console.log(`[${ptLon}, ${ptLat}]`);
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
