// Create map
const map = L.map("map", {
  center: [38.02, -84.5],
  zoom: 14,
});

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
  // Add Basemap
  const basemap = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20,
  });
  basemap.addTo(map);

  const stmLin = L.geoJSON(result[0], {
    style: function (feature) {
      return {
        color: "#20282e",
        weight: 2,
      };
    },
  }).addTo(map);

  const stmPoint = L.geoJSON(result[1], {
    pointToLayer: function (geoJsonPoint, latlng) {
      return L.circleMarker(latlng, {
        radius: 2,
      });
    },
  }).addTo(map);
}
