import { author, miterCorner, unfold, toDXF, flatPatternToPolylines } from 'brepjs-sheetmetal';
import { present } from 'brepjs/playground';

// A folded sheet-metal L-bracket. Two 90° flanges come off adjacent edges of a
// base plate; the shared corner is auto-mitered with a small gap so the whole
// part develops from one flat blank. Tune thickness / flange length / bend radius.
const rule = { innerRadius: 2, kFactor: 0.44 };

const bracket = author({
  thickness: 1.5,
  base: { length: 60, width: 40 },
  flanges: [
    { id: 'side', length: 25, angleDeg: 90, side: 'xmax', rule },
    { id: 'front', length: 25, angleDeg: 90, side: 'ymax', rule },
  ],
});
if (!bracket.ok) throw bracket.error;

// Miter the shared corner (2.5 mm gap) so the two flanges meet in a clean 45°
// seam — a wide-enough gap that the miter actually reads in the flat pattern.
const mitered = miterCorner(bracket.value, 'side', 'front', 2.5);
if (!mitered.ok) throw mitered.error;

const solid = mitered.value.solid;
if (!solid) throw new Error('bracket produced no solid');

// Unfold to a flat pattern and export it as a fabrication-ready DXF — attached
// via present() so the toolbar's DXF button downloads it.
const unfolded = unfold(mitered.value);
if (!unfolded.ok) throw unfolded.error;
const dxf = toDXF(unfolded.value.pattern);
if (!dxf.ok) throw dxf.error;

// Attach the DXF for download and the 2D polylines for the flat-pattern overlay.
export default present(solid, {
  dxf: dxf.value,
  overlay2d: flatPatternToPolylines(unfolded.value.pattern),
});
