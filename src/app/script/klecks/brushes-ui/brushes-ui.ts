import { penBrushUi } from './pen-brush-ui';
import { blendBrushUi } from './blend-brush-ui';
import { sketchyBrushUi } from './sketchy-brush-ui';
import { pixelBrushUi } from './pixel-brush-ui';
import { eraserBrushUi } from './eraser-brush-ui';
import { smudgeBrushUi } from './smudge-brush-ui';
import { chemyBrushUi } from './chemy-brush-ui';
import { glitterBrushUi } from './glitter-brush-ui';
import { TBrushUi } from '../kl-types';

/**
 * UI for brushes.
 * Each brush ui carries the brush with it.
 * So if you want to draw, you do it through the UI. should be changed sometime.
 */

import { onProcreateBrushImported, importedProcreateBrushes } from '../procreate/engine/procreate-brush-manager';
import { createProcreateBrushUi } from '../procreate/ui/procreate-brush-ui';

export const BRUSHES_UI: {
    [key: string]: TBrushUi<any>;
} = {
    penBrush: penBrushUi,
    blendBrush: blendBrushUi,
    sketchyBrush: sketchyBrushUi,
    pixelBrush: pixelBrushUi,
    chemyBrush: chemyBrushUi,
    smudgeBrush: smudgeBrushUi,
    eraserBrush: eraserBrushUi,
    glitterBrush: glitterBrushUi,
};

// Bind to Procreate brush import events to dynamically add them to the UI registry
onProcreateBrushImported(() => {
    const index = importedProcreateBrushes.length - 1;
    const importedBrushData = importedProcreateBrushes[index];

    // Use the stable model ID as the key
    const key = importedBrushData.model.id;
    BRUSHES_UI[key] = createProcreateBrushUi(index);

    // In Klecks, the BrushSettingService (or similar UI refreshers) usually iterate BRUSHES_UI or are notified.
    // If the user imports a brush, we need the tool row to update. This might require dispatching an event.
});
