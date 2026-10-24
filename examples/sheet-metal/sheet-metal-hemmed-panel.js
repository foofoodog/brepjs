import { author, hem, unfold, toDXF, flatPatternToPolylines } from 'brepjs-sheetmetal';
import { present } from 'brepjs/playground';

// A panel with a closed hem: the edge is folded back ~180° onto itself, giving a
// rounded "safe edge" that removes the sharp burr and stiffens the part. Switch
// the hem type to 'open' / 'teardrop' / 'rolled' for other edge treatments.
const rule = { innerRadius: 1, kFactor: 0.44 };

const panel = author({
  thickness: 1.2,
  base: { length: 90, width: 55 },
  flanges: [],
});
if (!panel.ok) throw panel.error;

const hemmed = hem(panel.value, {
  region: 'base',
  side: 'xmax',
  type: 'closed',
  length: 12,
  rule,
});
if (!hemmed.ok) throw hemmed.error;

const solid = hemmed.value.solid;
if (!solid) throw new Error('panel produced no solid');

// Unfold to the flat blank: the hem develops as an exact 180° fold-back. DXF for
// download, polylines for the overlay.
const unfolded = unfold(hemmed.value);
if (!unfolded.ok) throw unfolded.error;
const dxf = toDXF(unfolded.value.pattern);
if (!dxf.ok) throw dxf.error;

export default present(solid, {
  dxf: dxf.value,
  overlay2d: flatPatternToPolylines(unfolded.value.pattern),
});
