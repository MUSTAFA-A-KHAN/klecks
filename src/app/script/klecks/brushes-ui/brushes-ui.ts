import { createTelegramBrushUi } from './telegram-brush-ui';
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
    tg_pixels: createTelegramBrushUi('pixels', {"pixelSize":20,"borderWidth":0,"borderColor":"#000000","outsideBorders":false,"showPixelGrid":true,"pressureOn":false,"pressureAvailable":true}, 'Telegram pixels'),
    tg_liner: createTelegramBrushUi('liner', {"pressureAvailable":false}, 'Telegram liner'),
    tg_plain: createTelegramBrushUi('plain', {"pressureAvailable":true}, 'Telegram plain'),
    tg_stylus: createTelegramBrushUi('stylus', {"pressureAvailable":true}, 'Telegram stylus'),
    tg_shape: createTelegramBrushUi('shape', {"figure":"line","brush":"plain","shape":true}, 'Telegram shape'),
    tg_outlined: createTelegramBrushUi('outlined', {"outlineSize":5,"outlineColor":"#000000FF","outlineOpacity":1,"pressureAvailable":true}, 'Telegram outlined'),
    tg_dashed: createTelegramBrushUi('dashed', {"dashSize":3,"gapSize":5}, 'Telegram dashed'),
    tg_spray: createTelegramBrushUi('spray', {"softness":0.3,"pressureAvailable":true,"pressureOn":false}, 'Telegram spray'),
    tg_bristle: createTelegramBrushUi('bristle', {"wobble":0.05,"ragged":0,"opacity":0.3,"pressureAvailable":true,"pressureOn":true}, 'Telegram bristle'),
    tg_wet: createTelegramBrushUi('wet', {"wobble":0,"density":0.5,"dryEdges":1,"flatEdges":false,"flatness":3,"autoRotation":true,"angle":0,"taperWidth":0,"taperLength":2,"opacity":0.8,"pressureAvailable":true,"pressureOn":true,"textureStrength":0.2}, 'Telegram wet'),
    tg_smudge: createTelegramBrushUi('smudge', {"opacity":0.28,"flow":0.6,"blending":0.72,"softness":0.58,"density":0.65,"intensity":0.5,"dragLength":1,"pressureAvailable":true,"pressureOn":true}, 'Telegram smudge'),
    tg_blur: createTelegramBrushUi('blur', {"blurStrength":0.55,"pressureAvailable":true,"pressureOn":false}, 'Telegram blur'),
    tg_blender: createTelegramBrushUi('blender', {"opacity":0.28,"flow":0.6,"blending":0.72,"softness":0.58,"density":0.65,"intensity":0.5,"dragLength":1,"pressureAvailable":true,"pressureOn":true}, 'Telegram blender'),
    tg_flat: createTelegramBrushUi('flat', {"opacity":1,"wobble":0,"weight":0.75,"density":0.6,"dryEdges":1,"baseScaleFactor":30,"flatness":3,"autoRotation":true,"angle":0,"pressureAvailable":true,"pressureOn":true,"textureStrength":0.2,"tailLength":0,"bristleBreakup":0.5}, 'Telegram flat'),
    tg_velvetPastel: createTelegramBrushUi('velvetPastel', {"opacity":1,"weight":1,"density":1,"granuleSkipping":0.5,"granuleSize":-0.3,"baseScaleFactor":60,"jitter":0,"proportionalTail":false,"tailLength":2,"tailRelativeLength":0.5,"softCore":0.4,"centerSoftness":0.8,"centerAlphaCut":0.16,"coreRadiusGrow":0.9,"smear":0.16,"corePack":0.7,"ovality":1.25,"maxOffsetsBase":900,"powder":0.9,"splinterRate":0.45,"splinterLenMax":0.14,"splinterAngleJitter":0.18,"speedDownsample":0.6,"pressureDownsample":0.5,"pressureAvailable":true,"pressureOn":true}, 'Telegram velvetPastel'),
    tg_waterSpread: createTelegramBrushUi('waterSpread', {"opacity":0.5,"wetness":0,"edgeConcentration":0.33,"bleeding":0.3,"edgeWidth":0.7,"edgeWobbleScale":0.2,"edgeWobbleAmount":0.3,"taperStart":0.2,"taperEnd":0.2,"taperPressure":0.6,"capWidth":0.5,"taperStartEnabled":false,"capDetail":10,"edgeStep":3,"pressureAvailable":true,"pressureOn":false}, 'Telegram waterSpread'),
    tg_waterSoft: createTelegramBrushUi('waterSoft', {"opacity":0.5,"bleeding":0.3,"layerSpread":0.5,"layerCount":20,"substrateSize":1,"taperStart":0.2,"taperEnd":0.2,"capWidth":0.7,"taperStartEnabled":false,"edgeWidth":0.7,"edgeOffset":0.8,"edgeOpacity":0.15,"edgeStep":3,"pressureAvailable":true,"pressureOn":true}, 'Telegram waterSoft'),
    tg_feather: createTelegramBrushUi('feather', {"speedDependence":false,"centralWidth":0.4,"minWidthStart":0.01,"taperStartPoint":0.5,"minWidthEnd":0.01,"taperEndPoint":0.5,"transparentEdges":false,"opacityOnStart":0,"fadeStartPoint":0.3,"opacityOnEnd":0,"fadeEndPoint":0.7}, 'Telegram feather'),
    tg_ink: createTelegramBrushUi('ink', {"speedDependence":false,"edgeWidening":true,"centralWidth":0.4,"minWidthStart":1,"taperStartPoint":0.5,"minWidthEnd":1,"taperEndPoint":0.5,"transparentEdges":false,"opacityOnStart":0,"fadeStartPoint":0.3,"opacityOnEnd":0,"fadeEndPoint":0.7}, 'Telegram ink'),
    tg_watercolor: createTelegramBrushUi('watercolor', {"textureOn":true,"texture":"waterAi","opacity":0.7,"spreading":true,"textureScale":1,"waterBlurSize":15,"waterBlurAlpha":0.8,"outline":true,"outlineSize":2,"outlineOpacity":0.7,"pressureAvailable":true,"pressureOn":false}, 'Telegram watercolor'),
    tg_pencil: createTelegramBrushUi('pencil', {"textureOn":true,"texture":"basic","opacity":0.8,"outline":true,"textureScale":1,"tapering":false,"minWidthStart":0.6,"taperStartPoint":0.5,"minWidthEnd":0.6,"taperEndPoint":0.5,"transparentEdges":false,"opacityOnStart":0,"fadeStartPoint":0.5,"opacityOnEnd":0,"fadeEndPoint":0.5,"pressureAvailable":true,"pressureOn":false}, 'Telegram pencil'),
    tg_oil: createTelegramBrushUi('oil', {"textureOn":true,"texture":"fabric","speedDependence":true,"minWidthStart":0.3,"taperStartPoint":0.5,"minWidthEnd":0.3,"taperEndPoint":0.5,"opacity":1,"textureScale":1,"pressureAvailable":true,"pressureOn":false}, 'Telegram oil'),
    tg_rembrandt: createTelegramBrushUi('rembrandt', {"cutEdges":true,"density":0.5,"tapering":0.5,"wobble":0,"opacity":1,"ragged":1,"shadowStrength":0.5,"ropeEffect":false,"pressureAvailable":true,"pressureOn":true}, 'Telegram rembrandt'),
    tg_neon: createTelegramBrushUi('neon', {"neonSize":25,"opacity":0.75}, 'Telegram neon'),
    tg_sparkle: createTelegramBrushUi('sparkle', {"highDensity":false,"bigSizes":false,"sparkleDensity":0.5,"sparkleSize":1,"sparkleDistributionPower":0.8,"sparkleShape":"square","opacity":1,"pressureAvailable":true}, 'Telegram sparkle'),
    tg_glyph: createTelegramBrushUi('glyph', {"pressureAvailable":true,"pressureOn":true,"pressureOpacity":false,"glyphRotation":false,"opacity":1,"enhance":true,"stepSize":1,"highTransparency":false,"shadowStrength":0,"shadowColor":"#000000FF"}, 'Telegram glyph'),
    tg_filler: createTelegramBrushUi('filler', {"tolerance":5,"antialiasing":5,"eatEdges":false}, 'Telegram filler'),
    tg_pixelate: createTelegramBrushUi('pixelate', {"size":20,"sizeX":20,"sizeY":20}, 'Telegram pixelate'),
    tg_texture: createTelegramBrushUi('texture', {"textureOn":true,"texture":"waterAi","textureScale":1,"opacity":0.2,"blending":0.2,"composition":"luminosity"}, 'Telegram texture'),

};
