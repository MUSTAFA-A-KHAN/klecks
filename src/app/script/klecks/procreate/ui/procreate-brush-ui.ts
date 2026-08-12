import { BB } from '../../../bb/bb';
import { LANG } from '../../../language/language';
import { KlSlider } from '../../ui/components/kl-slider';
import { TBrushUi } from '../../kl-types';
import { EVENT_RES_MS } from '../../brushes-ui/brushes-consts';
import { ProcreateBrush } from '../engine/procreate-brush';
import { importedProcreateBrushes } from '../engine/procreate-brush-manager';

export function createProcreateBrushUi(brushIndex: number): TBrushUi<ProcreateBrush> {
    const data = importedProcreateBrushes[brushIndex];
    if (!data) throw new Error("Invalid brush index");
    const model = data.model;

    return {
        image: 'url(/klecks/dist/brush-pen.svg)', // Fallback image for now
        tooltip: model.name || 'Procreate Brush',
        sizeSlider: {
            min: 0.5,
            max: 500,
            curve: BB.powerSplineInput(0.5, 500, 0.1),
        },
        opacitySlider: {
            min: 0.01,
            max: 1,
            curve: [[0, 0.01], [1, 1]],
        },
        scatterSlider: {
            min: 0,
            max: 100,
            curve: BB.powerSplineInput(0, 100, 0.1, 2.5),
        },
        Ui: function(p) {
            const div = document.createElement('div');

            const brush = new ProcreateBrush(model, data.shapeImage, data.grainImage);
            brush.setHistory(p.klHistory);

            let sizeSlider: KlSlider;
            let opacitySlider: KlSlider;
            let scatterSlider: KlSlider;

            function init() {
                sizeSlider = new KlSlider({
                    label: LANG('brush-size'),
                    width: 225,
                    height: 30,
                    min: 0.5,
                    max: 500,
                    value: model.size,
                    curve: BB.powerSplineInput(0.5, 500, 0.1),
                    eventResMs: EVENT_RES_MS,
                    toDisplayValue: (val) => val * 2,
                    toValue: (displayValue) => displayValue / 2,
                    onChange: (val) => {
                        model.size = val;
                        p.onSizeChange(val);
                    },
                });

                opacitySlider = new KlSlider({
                    label: LANG('opacity'),
                    width: 225,
                    height: 30,
                    min: 0.01,
                    max: 1,
                    value: model.opacity,
                    curve: [[0, 0.01], [1, 1]],
                    eventResMs: EVENT_RES_MS,
                    toDisplayValue: (val) => val * 100,
                    toValue: (displayValue) => displayValue / 100,
                    onChange: (val) => {
                        model.opacity = val;
                        p.onOpacityChange(val);
                    },
                });

                scatterSlider = new KlSlider({
                    label: LANG('scatter'),
                    width: 225,
                    height: 30,
                    min: 0,
                    max: 100,
                    value: model.scatter,
                    curve: BB.powerSplineInput(0, 100, 0.1, 2.5),
                    eventResMs: EVENT_RES_MS,
                    onChange: (val) => {
                        model.scatter = val;
                        p.onScatterChange(val);
                    }
                });

                div.append(
                    BB.el({ content: [sizeSlider.getElement()], css: { display: 'flex', marginBottom: '10px' } }),
                    BB.el({ content: [opacitySlider.getElement()], css: { display: 'flex', marginBottom: '10px' } }),
                    BB.el({ content: [scatterSlider.getElement()], css: { display: 'flex' } })
                );
            }
            init();

            this.increaseSize = (f) => sizeSlider.changeSliderValue(f);
            this.decreaseSize = (f) => sizeSlider.changeSliderValue(-f);

            this.getSize = () => model.size;
            this.setSize = (size) => { model.size = size; sizeSlider.setValue(size); };

            this.getOpacity = () => model.opacity;
            this.setOpacity = (opacity) => { model.opacity = opacity; opacitySlider.setValue(opacity); };

            this.getScatter = () => model.scatter;
            this.setScatter = (scatter) => { model.scatter = scatter; scatterSlider.setValue(scatter); };

            this.setColor = (c) => {};
            this.setLayer = (layer) => brush.setContext(layer.context);

            this.startLine = (x, y, p) => brush.startLine(x, y, p);
            this.goLine = (x, y, p) => brush.goLine(x, y, p);
            this.endLine = () => brush.endLine();

            this.getBrush = () => brush;
            this.isDrawing = () => brush.getIsDrawing();

            this.getElement = () => div;
            return this;
        } as TBrushUi<ProcreateBrush>['Ui']
    } as TBrushUi<ProcreateBrush>;
}
