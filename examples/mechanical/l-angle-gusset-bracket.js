import {
  box,
  cut,
  cutAll,
  cylinder,
  extrude,
  fuse,
  polygon,
  rotate,
  translate,
  unwrap,
} from 'brepjs/quick';

// L-angle gusset bracket (right-angle shelf / corner brace): two flat legs
// meeting at 90 deg, stiffened by a triangular gusset web across the inside
// corner, with clearance mounting holes down each leg and a chamfered outer
// heel. The back faces share the y = 0 plane and the legs overlap in a
// width x t x t corner cube, so the whole brace fuses into one rigid solid.
// Defaults model a ~60 mm steel angle bracket with 3 holes per leg.
function lBracket({
  width = 40, // bracket width across X (mm)
  legLen = 60, // reach of each leg from the corner (mm)
  thick = 4, // plate / wall thickness (mm)
  gusset = 38, // how far the triangular web runs out along each leg (mm)
  ribThick = 4, // gusset web thickness across X (mm)
  holeDia = 5.2, // clearance hole diameter, ~M5 (mm)
  holesPerLeg = 3, // mounting holes down each leg
  heelChamfer = 6, // 45 deg flat on the outer heel (mm)
} = {}) {
  // Horizontal leg: flat on z in [0, thick], extends out in +Y to legLen.
  const flatLeg = box(width, legLen, thick, { at: [0, legLen / 2, thick / 2] });

  // Vertical leg: stands at y in [0, thick], rises in +Z to legLen. It shares
  // the corner cube (width x thick x thick) with the flat leg, so the two
  // overlap volumetrically and fuse into one body rather than just kissing.
  const upLeg = box(width, thick, legLen, { at: [0, thick / 2, legLen / 2] });
  let body = unwrap(fuse(flatLeg, upLeg));

  // Triangular gusset web bridging the inside corner. Built as a right triangle
  // in the Y-Z plane (right angle at the inner corner y=thick, z=thick), then
  // extruded a thin slab across X and centred. It digs ~0.5 mm into both inner
  // faces so it welds to the legs instead of floating on the corner seam.
  const bite = 0.5;
  const tri = unwrap(
    polygon([
      [0, thick - bite, thick - bite],
      [0, thick + gusset, thick - bite],
      [0, thick - bite, thick + gusset],
    ]),
  );
  const web = translate(unwrap(extrude(tri, [ribThick, 0, 0])), [-ribThick / 2, 0, 0]);
  body = unwrap(fuse(body, web));

  // Chamfer the outer heel: subtract a 45 deg slab hinged along the outer back
  // edge (y = 0, z = 0), running the full width. Reads as a bevelled corner and
  // keeps the build fully constructive (no finder needed on the fused solid).
  const slab = box(width + 4, heelChamfer * 2, heelChamfer * 2, {
    at: [0, -heelChamfer, -heelChamfer],
  });
  const heelCut = rotate(slab, 45, { axis: [1, 0, 0], at: [0, 0, 0] });
  body = unwrap(cut(body, heelCut));

  // Mounting holes down each leg, evenly spaced from the corner toward the free
  // end. The holes are offset sideways in X so they sit on solid plate beside
  // the central gusset rib (rib spans x in [-ribThick/2, ribThick/2]) instead of
  // being drilled through the fused web. Flat-leg holes drill down through z;
  // vertical-leg holes drill back through y.
  const holes = [];
  const xOff = width * 0.28; // lateral offset to clear the central gusset rib
  const first = thick + (legLen - thick) * 0.22; // first hole clears the corner
  const last = legLen - (legLen - thick) * 0.12; // last hole near the tip
  for (let i = 0; i < holesPerLeg; i++) {
    const t = holesPerLeg === 1 ? 0.5 : i / (holesPerLeg - 1);
    const d = first + (last - first) * t;
    // Flat leg: vertical hole at y = d, drilled down through z. The bore base
    // sits at z = -1 and runs +Z through the thick plate.
    holes.push(cylinder(holeDia / 2, thick + 2, { at: [xOff, d, -1] }));
    // Vertical leg: horizontal hole at z = d, drilled back through -Y. After the
    // -90 deg X rotation the bore points along +Y spanning y in [-1, 5], so it
    // straddles the vertical-leg material (y in [0, thick]) and removes a clean
    // through-hole rather than floating past the outer face.
    const back = rotate(cylinder(holeDia / 2, thick + 2, { at: [0, 0, -1] }), -90, {
      axis: [1, 0, 0],
    });
    holes.push(translate(back, [xOff, 0, d]));
  }

  return unwrap(cutAll(body, holes));
}

export default lBracket();
