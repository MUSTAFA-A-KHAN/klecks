import { BB } from "../../bb/bb";
import { createPenPressureToggle } from "../ui/components/create-pen-pressure-toggle";
import { EVENT_RES_MS } from "./brushes-consts";
import { Checkbox } from "../ui/components/checkbox";
import { BRUSHES } from "../brushes/brushes";
import { KlSlider } from "../ui/components/kl-slider";
// Using the smudge icon for now, as it's the closest to watercolor
import brushIconImg from "url:/src/app/img/ui/brush-smudge.svg";
import { TBrushUi } from "../kl-types";
import { LANG, LANGUAGE_STRINGS } from "../../language/language";
import { WatercolorBrush } from "../brushes/watercolor-brush";

export const watercolorBrushUi = (function () {
  const brushInterface = {
    image: brushIconImg,
    tooltip: LANG("brush-watercolor"),
    sizeSlider: {
      min: 0.5,
      max: 1000,
      curve: BB.powerSplineInput(0.5, 1000, 0.1),
    },
    opacitySlider: {
      min: 1 / 100,
      max: 1,
    },
  } as TBrushUi<WatercolorBrush>;

  LANGUAGE_STRINGS.subscribe(() => {
    brushInterface.tooltip = "Watercolor";
  });

  brushInterface.Ui = function (p) {
    const div = document.createElement("div"); // the gui
    const brush = new BRUSHES.WatercolorBrush();
    brush.setHistory(p.klHistory);
    p.onSizeChange(brush.getSize());

    let sizeSlider: KlSlider;
    let opacitySlider: KlSlider;
    let wetnessSlider: KlSlider;
    let edgeConcentrationSlider: KlSlider;
    let bleedingSlider: KlSlider;
    let edgeWidthSlider: KlSlider;
    let edgeWobbleSlider: KlSlider;

    function setSize(size: number): void {
      brush.setSize(size);
    }

    function init(): void {
      sizeSlider = new KlSlider({
        label: LANG("brush-size"),
        width: 250,
        height: 30,
        min: brushInterface.sizeSlider.min,
        max: brushInterface.sizeSlider.max,
        value: brush.getSize(),
        curve: brushInterface.sizeSlider.curve,
        eventResMs: EVENT_RES_MS,
        onChange: (val) => {
          setSize(val);
          p.onSizeChange(val);
        },
        formatFunc: (v) => Math.round(v).toString(),
      });

      opacitySlider = new KlSlider({
        label: LANG("opacity"),
        width: 250,
        height: 30,
        min: brushInterface.opacitySlider.min,
        max: brushInterface.opacitySlider.max,
        value: brush.getOpacity(),
        eventResMs: EVENT_RES_MS,
        onChange: (val) => {
          brush.setOpacity(val);
          p.onOpacityChange(val);
        },
        formatFunc: (v) => Math.round(v * 100) + "%",
      });

      wetnessSlider = new KlSlider({
        label: "Wetness",
        width: 250,
        height: 30,
        min: 0,
        max: 1,
        value: brush.getWetness(),
        eventResMs: EVENT_RES_MS,
        onChange: (val) => {
          brush.setWetness(val);
          p.onConfigChange();
        },
        formatFunc: (v) => Math.round(v * 100) + "%",
      });

      edgeConcentrationSlider = new KlSlider({
        label: "Edge Concentration",
        width: 250,
        height: 30,
        min: 0,
        max: 1,
        value: brush.getEdgeConcentration(),
        eventResMs: EVENT_RES_MS,
        onChange: (val) => {
          brush.setEdgeConcentration(val);
          p.onConfigChange();
        },
        formatFunc: (v) => Math.round(v * 100) + "%",
      });

      bleedingSlider = new KlSlider({
        label: "Bleeding",
        width: 250,
        height: 30,
        min: 0,
        max: 1,
        value: brush.getBleeding(),
        eventResMs: EVENT_RES_MS,
        onChange: (val) => {
          brush.setBleeding(val);
          p.onConfigChange();
        },
        formatFunc: (v) => Math.round(v * 100) + "%",
      });

      edgeWidthSlider = new KlSlider({
        label: "Edge Width",
        width: 250,
        height: 30,
        min: 0,
        max: 4,
        value: brush.getEdgeWidth(),
        eventResMs: EVENT_RES_MS,
        onChange: (val) => {
          brush.setEdgeWidth(val);
          p.onConfigChange();
        },
        formatFunc: (v) => Math.round(v * 100) + "%",
      });

      edgeWobbleSlider = new KlSlider({
        label: "Edge Wobble",
        width: 250,
        height: 30,
        min: 0,
        max: 1,
        value: brush.getEdgeWobble(),
        eventResMs: EVENT_RES_MS,
        onChange: (val) => {
          brush.setEdgeWobble(val);
          p.onConfigChange();
        },
        formatFunc: (v) => Math.round(v * 100) + "%",
      });

      const lockAlphaToggle = new Checkbox({
        init: brush.getLockAlpha(),
        label: LANG("lock-alpha"),
        name: "lock-alpha",
        callback: (b) => {
          brush.setLockAlpha(b);
        },
        css: {
          marginTop: "10px",
          display: "inline-block",
        },
      });

      div.append(
        BB.el({
          css: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          },
          content: [sizeSlider.getElement()],
        }),
        BB.el({
          css: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          },
          content: [opacitySlider.getElement()],
        }),
        BB.el({
          css: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          },
          content: [wetnessSlider.getElement()],
        }),
        BB.el({
          css: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          },
          content: [edgeConcentrationSlider.getElement()],
        }),
        BB.el({
          css: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          },
          content: [bleedingSlider.getElement()],
        }),
        BB.el({
          css: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          },
          content: [edgeWidthSlider.getElement()],
        }),
        BB.el({
          css: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          },
          content: [edgeWobbleSlider.getElement()],
        }),
        lockAlphaToggle.getElement(),
      );
    }

    init();

    this.increaseSize = function (f) {
      if (!brush.getIsDrawing()) {
        sizeSlider.changeSliderValue(f);
      }
    };
    this.decreaseSize = function (f) {
      if (!brush.getIsDrawing()) {
        sizeSlider.changeSliderValue(-f);
      }
    };

    this.getSize = function () {
      return brush.getSize();
    };
    this.setSize = function (size) {
      setSize(size);
      sizeSlider.setValue(size);
    };
    this.getOpacity = function () {
      return brush.getOpacity();
    };
    this.setOpacity = function (opacity) {
      brush.setOpacity(opacity);
      opacitySlider.setValue(opacity);
    };

    this.setColor = function (c) {
      brush.setColor(c);
    };
    this.setLayer = function (layer) {
      brush.setContext(layer.context, layer.id);
    };
    this.startLine = function (x, y, p) {
      brush.startLine(x, y, p);
    };
    this.goLine = function (x, y, p, isCoalesced) {
      brush.goLine(x, y, p, !!isCoalesced);
    };
    this.endLine = function () {
      brush.endLine();
    };
    this.getBrush = function () {
      return brush;
    };
    this.isDrawing = function () {
      return brush.getIsDrawing();
    };
    this.getElement = function () {
      return div;
    };
  } as TBrushUi<WatercolorBrush>["Ui"];

  return brushInterface;
})();
