import { author, unfold, toDXF, flatPatternToPolylines } from 'brepjs-sheetmetal';
import { present } from 'brepjs/playground';

// A U-channel: two 90° flanges fold up from opposite long edges of a base strip.
// Opposite flanges share no corner, so no miter or relief is needed. Tune the
// base size, flange height, and bend radius to fit your rail or bracket.
const rule = { innerRadius: 2, kFactor: 0.44 };

const channel = author({
  thickness: 1.5,
  base: { length: 120, width: 40 },
  flanges: [
    { id: 'left', length: 25, angleDeg: 90, side: 'ymin', rule },
    { id: 'right', length: 25, angleDeg: 90, side: 'ymax', rule },
  ],
});
if (!channel.ok) throw channel.error;

const solid = channel.value.solid;
if (!solid) throw new Error('channel produced no solid');

// Unfold to a flat pattern: DXF for the toolbar download, polylines for the overlay.
const unfolded = unfold(channel.value);
if (!unfolded.ok) throw unfolded.error;
const dxf = toDXF(unfolded.value.pattern);
if (!dxf.ok) throw dxf.error;

export default present(solid, {
  dxf: dxf.value,
  overlay2d: flatPatternToPolylines(unfolded.value.pattern),
});
