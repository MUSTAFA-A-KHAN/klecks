# Procreate compatibility

The importer is not fully compatible with Procreate. Loading a brush successfully
does not establish that its strokes match Procreate. The normalized controls and
Canvas renderer approximate the behavior described in the
[Procreate brush handbook](https://help.procreate.com/procreate/handbook/5.4/brushes/brush-studio-settings).
The handbook describes behavior, not archive encodings or rendering equations.

| Area | Implemented | Remaining differences |
| --- | --- | --- |
| Archives | Binary/XML keyed metadata, embedded shape/grain, nested brushes, set order | Missing built-in Procreate assets cannot be recovered from file references |
| Shapes | Inversion, direction rotation, random start angle, angular scatter, count/jitter, roundness, flips | Tilt/azimuth/barrel roll, pressure roundness, exact filtering |
| Grain | Tiling, movement, scale/zoom, rotation, inversion, depth, brightness/contrast | Special grain blend modes, depth jitter/pressure, exact scale/movement equations |
| Dynamics | Size/opacity pressure amounts, minimums, control-point interpolation, jitter, flow, falloff | Exact pressure splines/response smoothing, speed and color dynamics |
| Rendering | Colored stamps, maximum coverage within a stroke, selection clipping, alpha lock, raster undo/redo | Exact Procreate glaze/modulated transfer, wet mixing, edge effects, taper, dual compositing |
| Storage | Images, normalized controls, reports and original asset bytes in IndexedDB | Previously imported tip-only records require reimport |

Unsupported metadata remains in the original archive. The per-brush report lists
unhandled nonzero settings; some are dormant controls, so this is a diagnostic
list, not a count of visible differences. Imported absolute/canvas-relative brush
size is not reproduced: use Klecks' Size slider. Numeric archive encodings are
version-dependent. In particular, the supplied pencil set uses normalized shape
counts, `grainDepth`, `dynamicsGlazedFlow`, and archived pressure point arrays.

## Reference set

The supplied `Pencil_Brushes.brushset` contains 17 top-level pencils, one embedded
grain image, and one secondary brush under `Sub01` belonging to Pencil 4. The
secondary is preserved and reported as unsupported, rather than exposed as an
eighteenth brush. The XML set manifest supplies Pencil 1–17 ordering.

`PROCREATE_TEST_FILE` enables an optional browser test that imports this file,
checks all names/order, paints a visible stroke with every pencil, checks the
dual-brush warning, and reloads the saved library. This is functional testing,
not a Procreate visual-equivalence test. Reference strokes from Procreate with
matching size, color, pressure, tilt, canvas scale and color space are still
needed for fidelity comparisons.

## Toward full compatibility

Full compatibility remains an open goal. It requires documenting versioned
archive fields and enum values, implementing the remaining rendering/input
features, obtaining referenced assets, and validating against Procreate output.
Do not mark unknown blend enums as supported by guessing a Canvas blend mode.
Do not claim fidelity based only on synthetic fixtures or successful imports.
