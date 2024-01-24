# Stormwater Flow Tracking

## Overview

This project aims to create an interactive map that would allow users to place a raindrop anywhere on the University of Kentucky Main Campus, and track that raindrops flow through campus, the storm line, and eventually away from campus.

## Project Description

The interactive map will ideally be a 3D map with satellite/aeiral imagery of campus with various campus features overlaid. Users will place a raindrop via clicking a point on the map. Once a user has placed a point, the flow will be calculated and shown on the map exposing the user to the "route" the raindrop would take through campus. I would also like to have animation that "flies" the user through the path that was calculated.

## Why

This project was heavily inspired by Sam Learner's [River Runner](https://river-runner.samlearner.com/). Sam's interactive map is a great tool to visualize the path a raindrop would take on a national scale. However, it somewhat lacks valuable info at a more local scale. Recreating this application to work at a more localized scale specifically for the University of Kentucky would allow for the "tracking" of stormwater flows around campus. In addition to visualizing flows, it would provide the capability to track the potential impact of spills on campus from illicit discharges that might occur. This application would be an invaluable resource for the University's Environmental Quality Management (EQM) Office.

## Data

There are several datasets that will be involved in this project. Below is a list of potential datasets that I will use.
_Note: Some datasets might not get used depending on final functionality_

- Contour Lines from [LFUCG Data Hub](https://data.lexingtonky.gov/datasets/4152bb646b9c44d58e13e24125cb2e3a/about) clipped to around Main Campus
- Elevation Data obtained from [KyFromAbove](https://kyfromabove.ky.gov/)
- UK Stormwater Infrastructure from [UK Infrastrucure Operations](https://ukgis.uky.edu/portal/apps/sites/#/ukgis)
- UK Main Campus Boundary from [UK FIS](https://ugisserver.uky.edu/arcgis/rest/services/UK_MAP_BASE_Campus_Overlay_3857_dy/MapServer/85)
- Aerial Imagery from [UK FIS](https://ugisserver.uky.edu/arcgis/rest/services/UK_MAP_BASE_Imagery_3857_ca/MapServer)
