import { BB } from '../../bb/bb';
import { TelegramBrush, BrushConfig } from '../brushes/TelegramBrush';
import { TBrushUi } from '../kl-types';
import { KlSlider } from '../ui/components/kl-slider';

export function createTelegramBrushUi(name: string, config: BrushConfig, langKey: string): TBrushUi<TelegramBrush> {
    const brushInterface = {
        image: 'assets/brush-icon-placeholder.svg', // Update with actual icon if available
        tooltip: langKey,
        sizeSlider: {
            min: 0.5,
            max: 100,
            curve: BB.powerSplineInput(0.5, 100, 0.1),
        },
        opacitySlider: {
            min: 1 / 100,
            max: 1,
            curve: [
                [0, 1 / 100],
                [0.5, 30 / 100],
                [1, 1],
            ],
        },
    } as TBrushUi<TelegramBrush>;

    brushInterface.Ui = function (p) {
        const div = document.createElement('div');
        const brush = new TelegramBrush(config);

        let sizeSlider: KlSlider;
        let opacitySlider: KlSlider;

        function init() {
            sizeSlider = new KlSlider({
                label: 'Size',
                width: 225,
                height: 30,
                min: brushInterface.sizeSlider.min,
                max: brushInterface.sizeSlider.max,
                value: brush.getSize(),
                curve: brushInterface.sizeSlider.curve,
                onChange: (val) => {
                    brush.setSize(val);
                    p.onSizeChange(val);
                }
            });

            opacitySlider = new KlSlider({
                label: 'Opacity',
                width: 225,
                height: 30,
                min: brushInterface.opacitySlider.min,
                max: brushInterface.opacitySlider.max,
                value: brush.getOpacity(),
                curve: brushInterface.opacitySlider.curve,
                onChange: (val) => {
                    brush.setOpacity(val);
                    p.onOpacityChange(val);
                }
            });

            div.append(sizeSlider.getElement(), opacitySlider.getElement());
        }

        init();

        this.increaseSize = (f) => { sizeSlider.changeSliderValue(f); };
        this.decreaseSize = (f) => { sizeSlider.changeSliderValue(-f); };
        this.getSize = () => brush.getSize();
        this.setSize = (s) => { brush.setSize(s); sizeSlider.setValue(s); };
        this.getOpacity = () => brush.getOpacity();
        this.setOpacity = (o) => { brush.setOpacity(o); opacitySlider.setValue(o); };
        this.getScatter = () => brush.getScatter();
        this.setScatter = (s) => { brush.setScatter(s); };
        this.setColor = (c) => brush.setColor(c);
        this.setLayer = (l) => brush.setContext(l.context);
        this.startLine = (x, y, p) => brush.startLine(x, y, p);
        this.goLine = (x, y, p) => brush.goLine(x, y, p);
        this.endLine = () => brush.endLine();
        this.getBrush = () => brush;
        this.isDrawing = () => brush.isDrawingActive();
        this.getElement = () => div;
    } as TBrushUi<TelegramBrush>['Ui'];

    return brushInterface;
}
