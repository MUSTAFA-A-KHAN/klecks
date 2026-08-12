# Procreate Brush Feature Development Guide

This guide outlines how developers should approach implementing, expanding, and testing the Procreate compatibility subsystem.

## 1. Development Process

1. **Investigate:** Analyze the `.bplist` properties for the specific Procreate feature you want to support.
2. **Model:** Add the property to `procreate-brush-model.ts`. Ensure it handles defaults and malformed data gracefully.
3. **Engine Implementation:** Integrate the logic into `procreate-brush.ts`.
4. **Testing:**
    - Parse a real `.brush` file that relies heavily on this feature.
    - Test it manually on the canvas.
    - Validate behavior against Procreate visually.
5. **Documentation:** Update the `procreate-brush-compatibility.md` matrix with the new status.

## 2. Directory Structure
All Procreate-specific logic is located in `src/app/script/klecks/procreate/`.
- `parser/`: Parsing logic for ZIP and BPLIST.
- `model/`: The normalized intermediate representation of brush settings.
- `engine/`: The rendering logic conforming to Klecks's native brush interface.
- `ui/`: The dynamic UI wrapper injecting into Klecks Brushes UI.
