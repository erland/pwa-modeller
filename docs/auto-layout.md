# Auto layout

EA Modeller provides auto layout presets to quickly arrange a diagram.

## Presets

### Flow (Layered)
Best for directed flows such as BPMN processes and many UML activity/interaction-style diagrams.

### Flow + Layer Bands (ArchiMate)
Like Flow, but organizes ArchiMate elements into horizontal bands:

- Business
- Application
- Technology
- Other

Use this when you want the classic “stacked layers” feel in ArchiMate views.

### Tree
Best when the diagram is primarily a hierarchy/decomposition.

Examples:
- capability breakdowns
- application/module decomposition
- package-style UML overviews

### Network
Best for dense “landscape” diagrams where a layered flow becomes spaghetti.

Examples:
- integration landscapes
- dependency maps
- platform ecosystems

### Radial
Best for hub-and-spoke structures.

Examples:
- a platform in the center with consumers/providers around it
- “around a capability/service” views

## Remembered settings

The auto layout dialog remembers your last-used settings per notation (ArchiMate/BPMN/UML) in local storage.

## Notes

- Auto layout controls **node placement**. Edge routing is still handled by the interactive router in the diagram engine.
- Locked nodes can be respected depending on the chosen options.
