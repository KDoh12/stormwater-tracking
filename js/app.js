// Create map
const map = L.map("map", {
  center: [38.02, -84.5],
  zoom: 14,
});

// Create global variables
let point;
let line;
let stmLine;
let stmPoint;
let stmLineGeoJSON;
let stmPointGeoJSON;

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

  stmPoint.on("click", function (e) {
    // Create empty Network feature
    let network = {
      type: "FeatureCollection",
      features: [],
    };
    let networkLayer;
    // Check for if networklayer is added to map or not
    if (networkLayer) {
      map.removeLayer(networkLayer);
    }

    point = turf.point([e.latlng.lng, e.latlng.lat]);
    // console.log(point);

    stmLineGeoJSON.features.forEach(function (f) {
      // console.log(f);
      line = turf.lineString(f.geometry.coordinates);
      // console.log("Line: ", line);
      // console.log("Point: ", point);
      // let isPointOnLine = turf.booleanPointOnLine(point, line);
      // console.log(isPointOnLine);
      if (turf.booleanPointOnLine(point, line)) {
        network.features.push(f);
        console.log(f);
        console.log(line);
      }
    });

    console.log("Network: ", network);

    networkLayer = L.geoJSON(network, {
      style: function (feature) {
        return {
          color: "#FF4500",
          weight: 2,
        };
      },
    }).addTo(map);
  });
}
