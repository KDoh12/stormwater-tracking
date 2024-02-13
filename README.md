# Stormwater Flow Tracking

## Overview

This project aims to create an interactive map that would allow users to place a raindrop anywhere on the University of Kentucky Main Campus, and track that raindrops flow through campus, the storm line, and eventually away from campus.

## Project Description

The interactive map will be a 2D map with a basemap possibly from the UK Basemap and satellite/aeiral imagery of campus as a toggle overlay. Users will place a raindrop via clicking a point on the map. Once a user has placed a point, the flow will be calculated and shown on the map exposing the user to the "route" the raindrop would take through campus. I would also like the path the raindrop takes to be animated. Various points would be displayed along the path such as Storm Drains, BMPs, Detention Basins, etc. These points would have popups with various info related to the point such as pictures or descriptive info.

## Why

This project was heavily inspired by Sam Learner's [River Runner](https://river-runner.samlearner.com/) and by the Mississippi Watershed Management Organization's (MWMO) [Path to the River Main](https://www.mwmo.org/path-to-the-river-main/) tool. Sam's interactive map is a great tool to visualize the path a raindrop would take on a national scale. However, it somewhat lacks valuable info at a more local scale which is where the MWMO tool comes in which shows additional data about the flow of water. Recreating this application to work at a more localized scale specifically for the University of Kentucky would allow for the "tracking" of stormwater flows around campus. In addition to visualizing flows, it would provide the capability to track the potential impact of spills on campus from illicit discharges that might occur. This application would be an invaluable resource for the University's Environmental Quality Management (EQM) Office.

## Data

There are several datasets that will be involved in this project. Below is a list of datasets that I will use.
_Note: Some datasets might not get used depending on final functionality_

- UK Stormwater Infrastructure
  - Source: [UK Infrastrucure Operations](https://ukgis.uky.edu/portal/apps/sites/#/ukgis)
  - This data is a collection of points, lines, and polygons representing Manholes, BMPs, Storm Sewers, Retention Basins, etc.
- UK Basemap
  - Source: [UK FIS](https://ugisserver.uky.edu/arcgis/rest/services/UK_MAP_BASE_Campus_bluegreen1_3857_ca/MapServer)
  - This is a map service layer to be used as a reference layer in the map.
- UK Basemap Labels
  - Source [UK FIS](https://ugisserver.uky.edu/arcgis/rest/services/UK_MAP_BASE_Campus_Overlay_3857_dy/MapServer/20)
  - This is a map service layer that accompanies the basemap by overlaying labels.
- Aerial Imagery
  - Source: [UK FIS](https://ugisserver.uky.edu/arcgis/rest/services/UK_MAP_BASE_Imagery_3857_ca/MapServer)
  - This is a map service layer of the most current campus imagery.

## Methods

The UK Stormwater Infrastructure dataset is available as a feature service from an ArcGIS Server however, I anticipated some potential issues with the data so I opted to export that data as a geoJSON files. This was to disconnect the data from it's source so I can perform any neccessary changes without breaking the source data.

I opened the data in ArcGIS Pro and exported as a geoJSON file. I found ArcGIS Pro's export to JSON tool lacking some fine tuning options so I opened the files in QGIS and rexported them with the appropriate coordinate system and reduced the decimal places to 6 places (more on why I did this in the challenges section). Once I had them in geoJSON format, I combed through the attribute tables and got rid of any fields that were not going to be needed or had sensitive info in them.

To obtain the UK basemap, I opted to use the [ESRI Leaflet](https://github.com/Esri/esri-leaflet) plugin. This was because the basemap service was already setup in our ArcGIS Server, and is a collection of layers, therefore I believe using the plugin was the easiest and most efficient way of loading that service into the map.

Next, I needed to determine how I was going to create a "flow path". First thought was to somehow make use of ESRI's ability to trace utility networks but alas, the data I am working with is not a true ESRI utility network. After doing some research, it seemed that I could perhaps make use of the [Turf.js](https://turfjs.org/) framework. Specifically a method called "booleanPointOnLine". Essentially this method takes a given point and a line, and returns true if the point intersects the line. Using this method, I can find one point (a manhole, BMP, or storm drain), check if it is on a line, if so, push it to a new geoJSON object which I then dispay on the map. This initially only returns the immediate intersecting lines, to find the rest of the path, I tuned the function so that I am only looking for lines that have a starting vertex that is the same as the point. This translates to a "down" path as the line starts at the point and goes somewhere else. Looping through this function by taking the end points of those lines and checking for more points and lines will add up to a full "path" that is displayed on the map.

## Challenges

My biggest challenge starting this project was simply trying to figure out how to even "trace" a path. I had never done this programatically before and had no clue where to even begin. I tried digging deeper on the two projects I am using for inspiration. The River Runner is utilizing a dataset that was purposfully built as a network to work with a specific API, so that wasn't very helpful as I didn't have access to that kind of dataset. The Path to the River Main I noticed was using Leaflet and brought in Turf.js upon inspecting their source. That seemed more up my alley so I started researching how I could "trace" using Turf.js.

Now that I have figured out the framework of how this map will function and tested it out in various places, I have discovered various points that should share a vertex with a line, but do not. This was part of the reason why I reduced the coordinates to 6 decimal places, I figured leaving it as 15 would leave a lot of room for error. This new challenge means I will need to identify these points, look through some utility documents in our Facility Library for accuracy, and fix them. Until they are fixed, there are various paths that end before they should because it reaches the end of one line, looks for a point, finds that none exists and stops.

Another challenge will be how to incorporate the retention basins and other polygons into this flow. Several storm sewer lines end in a retention basin around campus which breaks the path of the lines. My immediate thought is that I will need to manually attach lines to run through those polygons so that the path continues on, however I want to keep thinking on this as I feel like there is a better way to go about this.

One challenge I have put off for now is getting my label service to load on the map and have the labels turned on. The map service they are apart of already has the labels turned on so theorhetically I should be able to just load it in and they show up. I spent some time trying to get this to work but decided that trying to find my network path was more important.

## Next Steps

My next steps are to clean up my point and line features so that the network will work no matter where you click. Once I have that cleaned up, I will integrate my polygons into the map. Once I have all my features working together, I will start working on being able to click anywhere on the map, not just on a point. I am also wanting to add some attributes to my point and line data. Some info I would like the end user to see once a path has been generated, is whether the water has been treated or not and if it has been, what type of treatment. I would like for the points along the path to show up with popups describing what is happening at that point and include maybe an image or a link to get more in-depth info. I am also wanting similar info for the polygons.
