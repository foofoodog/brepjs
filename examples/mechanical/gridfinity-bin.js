import { drawRoundedRectangle, cut, fuse, fuseAll, translate, unwrap } from 'brepjs/quick';

// Gridfinity bin — the part this whole library grew out of
// (gridfinitylayouttool.com). A cols x rows grid of 42 mm cells: walls, one
// socket foot per cell that mates with a baseplate, and a stacking lip so
// bins nest when stacked. Bump cols/rows/heightUnits to resize it.
function gridfinityBin({ cols = 1, rows = 1, heightUnits = 3 } = {}) {
  const PITCH = 42; // Gridfinity grid pitch
  const GAP = 0.5; // total footprint clearance — 0.25 mm per outer edge
  const WALL = 1.2; // wall thickness
  const H = heightUnits * 7; // heights come in 7 mm units
  const Wx = cols * PITCH - GAP; // outer footprint
  const Wy = rows * PITCH - GAP;
  const cell = PITCH - GAP; // one cell's footprint (41.5 mm)

  // Rounded rectangle on plane XY at height z, inset on every edge (the inset
  // shrinks the corner radius with it, so the chamfers stay concentric).
  const rect = (w, h, inset, z) =>
    drawRoundedRectangle(w - 2 * inset, h - 2 * inset, 3.75 - inset).sketchOnPlane('XY', z);

  // One socket foot per grid cell — the chamfered pad that clicks onto a baseplate.
  const cellFoot = () =>
    rect(cell, cell, 0, 0).loftWith([rect(cell, cell, 2.15, -2.4), rect(cell, cell, 2.95, -5)], {
      ruled: true,
    });
  const feet = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = (i - (cols - 1) / 2) * PITCH;
      const cy = (j - (rows - 1) / 2) * PITCH;
      feet.push(translate(cellFoot(), [cx, cy, 0]));
    }
  }

  // Hollow body over the whole footprint — outer block minus an inner pocket,
  // then fused onto every foot.
  const shell = unwrap(cut(rect(Wx, Wy, 0, 0).extrude(H), rect(Wx, Wy, WALL, 1).extrude(H)));
  const body = unwrap(fuseAll([shell, ...feet]));

  // Stacking lip around the outer perimeter — nesting rim, inner profile subtracted.
  const lipOuter = rect(Wx, Wy, 0, H - 2.6).loftWith([rect(Wx, Wy, 0, H + 4.4)], { ruled: true });
  const lipInner = rect(Wx, Wy, 1.2, H - 2.6).loftWith(
    [
      rect(Wx, Wy, 2.6, H - 1.2),
      rect(Wx, Wy, 2.6, H),
      rect(Wx, Wy, 1.9, H + 0.7),
      rect(Wx, Wy, 1.9, H + 2.5),
      rect(Wx, Wy, 0.05, H + 4.4),
    ],
    { ruled: true },
  );
  const lip = unwrap(cut(lipOuter, lipInner));

  return unwrap(fuse(body, lip));
}

export default gridfinityBin();
