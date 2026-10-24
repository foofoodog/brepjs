import { author, louver, unfold, toDXF, flatPatternToPolylines } from 'brepjs-sheetmetal';
import { present } from 'brepjs/playground';

// A ventilation panel: a flat blank stamped with a grid of louvers. Each louver
// is a three-sided cut with the flap formed up along the uncut hinge — a real
// sheet-metal form feature. Tune the grid, louver size, and formed height.
const panel = author({
  thickness: 1,
  base: { length: 140, width: 90 },
  flanges: [],
});
if (!panel.ok) throw panel.error;

let part = panel.value;
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 2; col++) {
    const vented = louver(part, {
      region: 'base',
      x: 38 + col * 64,
      y: 20 + row * 25,
      length: 50,
      width: 8,
      height: 5,
    });
    if (!vented.ok) throw vented.error;
    part = vented.value;
  }
}

const solid = part.solid;
if (!solid) throw new Error('panel produced no solid');

// Unfold to the flat blank: the louver three-sided cuts + form hinges develop
// onto the flat pattern. DXF for download, polylines for the overlay.
const unfolded = unfold(part);
if (!unfolded.ok) throw unfolded.error;
const dxf = toDXF(unfolded.value.pattern);
if (!dxf.ok) throw dxf.error;

export default present(solid, {
  dxf: dxf.value,
  overlay2d: flatPatternToPolylines(unfolded.value.pattern),
});
