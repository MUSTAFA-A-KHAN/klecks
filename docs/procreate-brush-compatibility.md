# Procreate Brush Compatibility Matrix

This document tracks the level of support for Procreate brush properties within the Klecks web environment.

**Status Legend:**
- **Fully supported:** Behavior closely matches Procreate.
- **Partially supported:** Implemented, but lacks nuanced accuracy (e.g., missing specific blending equations).
- **Approximation:** Implemented using a fundamentally different approach to mimic the effect.
- **Unsupported:** Not yet implemented or impossible due to browser limitations.
- **Not yet investigated:** Has not been tested.

| Procreate Capability | Status | Notes |
| --- | --- | --- |
| **Parsing & Assets** | | |
| .brush unzipping | Fully supported | via fflate |
| .brushset unzipping | Fully supported | via fflate |
| Bplist Parsing | Fully supported | via @plist/binary.parse |
| Shape Source Extraction | Fully supported | |
| Grain Source Extraction | Fully supported | |
| **Stroke Path & Stamping** | | |
| Spacing | Fully supported | Core to the stamping engine. |
| Jitter | Partially supported | Basic coordinate offset applied. |
| **Shape Dynamics** | | |
| Scatter | Partially supported | Basic rotation/position scatter. |
| **Apple Pencil / Input Dynamics** | | |
| Pressure -> Size | Fully supported | |
| Pressure -> Opacity | Fully supported | |
