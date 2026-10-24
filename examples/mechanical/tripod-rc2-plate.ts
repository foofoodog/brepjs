import {
  box,
  chamfer,
  cutAll,
  cylinder,
  edgeFinder,
  extrude,
  polygon,
  translate,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// Manfrotto RC2 quick-release tripod plate: a dovetail prism the camera bolts to
// and the tripod head's spring jaws clamp under. The cross-section is a trapezoid
// wider at the base (42.4 mm) than the top (37.4 mm) with angled dovetail flanks
// the clamp grips; it sweeps 52.5 mm along the plate. Every long edge is lightly
// chamfered, the base corners are relieved at each end for clamp clearance, and a
// central 1/4"-20 camera screw passes through a counterbore. Centred on the origin.
function rc2Plate({
  length = 52.5, // plate length along the slide axis (mm)
  botWidth = 42.4, // width at the base — the dovetail's widest line (mm)
  topWidth = 37.4, // width across the top face (mm)
  thickness = 10.5, // overall plate thickness (mm)
  flat = 3, // straight wall height at top and bottom of each flank (mm)
  relief = 25, // relieved span length along each base corner (mm)
  reliefDepth = 4.5, // how far up the relief notch reaches from the base (mm)
  reliefInset = 6, // how far in from each base corner the notch reaches (mm)
  screwClear = 3.4, // 1/4"-20 clearance hole radius (~6.8 mm dia) (mm)
  cboreRad = 6, // counterbore radius for the captive screw head (mm)
  cboreDepth = 4, // counterbore depth from the underside (mm)
  edgeChamfer = 0.6, // chamfer on the long (Y-running) dovetail edges (mm)
} = {}) {
  const xb = botWidth / 2;
  const xt = topWidth / 2;
  // Top of the angled flank; guarded so the flank never inverts if thickness is
  // thinner than the two straight walls combined.
  const zMid = flat + Math.max(thickness - 2 * flat, 0.5);

  // Dovetail cross-section in the X-Z plane (y = 0), wound CCW: a trapezoid whose
  // sides step straight up `flat`, angle inward to the narrower top, then run
  // straight up to the top face. Extruding it along +Y makes the whole body in
  // one solid, so the part is rigid by construction. Then centre it on the origin.
  const profile = unwrap(
    polygon([
      [-xb, 0, 0],
      [xb, 0, 0],
      [xb, 0, flat],
      [xt, 0, zMid],
      [xt, 0, thickness],
      [-xt, 0, thickness],
      [-xt, 0, zMid],
      [-xb, 0, flat],
    ]),
  );
  const prism = translate(unwrap(extrude(profile, [0, length, 0])), [0, -length / 2, 0]);

  // Chamfer every long (Y-running) edge of the bare prism — the eight dovetail
  // arrises — before any holes are cut, so the finder selects an unambiguous,
  // unbroken edge set. (The real plate bevels essentially all of these.)
  const longEdges = edgeFinder().inDirection('Y').findAll(prism);
  const body =
    longEdges.length > 0
      ? unwrap(chamfer(unwrap(validSolid(prism)), longEdges, edgeChamfer))
      : prism;

  // End relief: notches knocked out of both base corners at each end so the plate
  // drops cleanly into the spring clamp. Each is an over-long box cut biting the
  // lower outer corner over the relief span.
  const notchLen = relief + 1;
  const notchY = length / 2 - notchLen / 2 + 0.5; // centre near each end, poking 0.5 past
  const notches = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      notches.push(
        box(reliefInset + 1, notchLen, reliefDepth + 0.5, {
          at: [sx * (xb - reliefInset / 2 + 0.5), sy * notchY, reliefDepth / 2 - 0.25],
        }),
      );
    }
  }

  // Central 1/4"-20 camera screw: a through clearance hole with a counterbore in
  // the underside for the captive bolt head. Both run over-length to punch clean
  // through their faces.
  const screw = cylinder(screwClear, thickness + 2, { at: [0, 0, -1] });
  const cbore = cylinder(cboreRad, cboreDepth + 1, { at: [0, 0, -1] });

  return unwrap(cutAll(body, [...notches, screw, cbore]));
}

export default rc2Plate();