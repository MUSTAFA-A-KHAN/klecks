# Procreate Brush Compatibility Architecture for Klecks

This document outlines the architecture for supporting the import and execution of Procreate `.brush` and `.brushset` files in the Klecks web painting application. The implementation focuses on providing a production-grade, high-fidelity experience without breaking existing Klecks capabilities.

## 1. File Formats and Parser Architecture

### 1.1 Procreate `.brush` and `.brushset` formats
- A **`.brush`** file is a zip archive. It contains:
  - `Node.plist`: A binary property list (`bplist`) defining the brush properties, dynamics, and rendering settings.
  - Image resources, usually `shape.png` and `grain.png`, which are alpha textures.
- A **`.brushset`** file is also a zip archive containing multiple `.brush` files and metadata regarding the set structure.

### 1.2 Parsing Pipeline
We utilize lightweight dependencies to handle these formats in the browser:
- `fflate`: For unzipping archives synchronously/asynchronously.
- `@plist/binary.parse`: For parsing the binary plist files.

The parsers will extract the shape and grain images as `HTMLImageElement`s and normalize the `.bplist` properties into an internal `ProcreateBrushModel`.

## 2. Normalized Brush Representation (`ProcreateBrushModel`)

Instead of trying to map hundreds of Procreate settings directly to Klecks's simpler settings, we define an expansive intermediate representation that covers:
- **Base Attributes:** Size, spacing, opacity, flow.
- **Shape & Grain:** Render buffers for the shape source and grain source.
- **Dynamics:** Pressure curves for size and opacity, tilt responses, velocity dynamics.
- **Jitter & Scatter:** Random variance applied per stamp.

## 3. Rendering Pipeline (`ProcreateBrushEngine`)

The engine resides in `src/app/script/klecks/procreate/engine/procreate-brush.ts`. It acts as an independent brush engine conforming to Klecks's brush interface (`startLine`, `goLine`, `endLine`).

## 4. Integration with Klecks

### 4.1 Brush Library
Imported Procreate brushes will be added dynamically to `BRUSHES_UI` inside Klecks. They will behave as first-class citizens in the brush UI.

### 4.2 UI/UX
- Users can import via `File > Import`, or a dedicated button in the Brush Tools UI.
- Drag-and-drop of `.brush` and `.brushset` will be intercepted by the UI and routed to the parser.
