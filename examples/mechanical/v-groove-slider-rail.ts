import { box, cut, cutAll, fuse, polygon, extrude, rotate, translate, unwrap } from 'brepjs/quick';

// V-groove linear slider: a rail and the carriage that rides it. The rail is a
// long bar with a 90-degree V-groove notched the full length of each side; the
// carriage is an inverted-U channel straddling it, with matching inward V-ribs
// that drop into those grooves so it can only slide along the rail (Y axis).
// Both ends of the rail are chamfered into a lead-in so the carriage can enter.
// Defaults model a ~20 mm rail on an 80 mm length. Returned as two parts.
function vGrooveSlider({
  length = 80, // rail length along the slide axis Y (mm)
  railWidth = 20, // rail cross-section width across X (mm)
  railHeight = 16, // rail cross-section height in Z (mm)
  grooveDepth = 4, // how deep each side V-groove bites inward (mm)
  carriageLen = 34, // carriage length along Y (mm)
  wall = 4, // carriage wall / top-plate thickness (mm)
  slop = 0.4, // running clearance between carriage and rail (mm)
} = {}) {
  const halfW = railWidth / 2;
  const grooveZ = railHeight / 2; // grooves centred on the rail mid-height
  // A 90-degree V cutter: half-height equals depth, so the notch apex is square.
  const vHalf = grooveDepth;

  // --- RAIL: a bar running along Y with a V-groove down each side. ---
  // Build the bar centred on the origin, base at z = 0.
  const railBlank = box(railWidth, length, railHeight, { at: [0, 0, railHeight / 2] });

  // One side V-groove cutter: a triangular prism running the full length along Y.
  // Profile drawn in the XZ plane (y held at the front face), pointing inward.
  // sign = +1 cuts the +X face, sign = -1 cuts the -X face.
  const grooveCutter = (sign: number) => {
    const xFace = sign * halfW; // the side face the groove opens on
    const xApex = sign * (halfW - grooveDepth); // notch apex, pushed inward
    const y0 = -length / 2 - 1; // overshoot both ends
    const profile = unwrap(
      polygon([
        [xFace, y0, grooveZ - vHalf],
        [xFace, y0, grooveZ + vHalf],
        [xApex, y0, grooveZ],
      ]),
    );
    return unwrap(extrude(profile, [0, length + 2, 0]));
  };

  let rail = unwrap(cutAll(railBlank, [grooveCutter(1), grooveCutter(-1)]));

  // Lead-in chamfers at both ends: shave the top corners back so the carriage
  // ribs find the grooves. Two wide angled slabs, one pivoting down at each end.
  const leadLen = railHeight; // 45-degree lead-in roughly one rail-height long
  const endChamfer = (endSign: number) => {
    const slab = box(railWidth + 2, leadLen * 2, railHeight, {
      at: [0, endSign * (length / 2 + leadLen), railHeight],
    });
    // Pivot the slab about the rail's top end edge so it slices off a wedge.
    return rotate(slab, endSign * 35, { axis: [1, 0, 0], at: [0, endSign * (length / 2), railHeight] });
  };
  rail = unwrap(cutAll(rail, [endChamfer(1), endChamfer(-1)]));

  // --- CARRIAGE: an inverted-U channel that straddles the rail. ---
  // Outer block sits over the rail with wall-thick top and sides; the channel is
  // cut out below it, sized rail + slop so the carriage slides freely.
  const chanW = railWidth + 2 * slop; // channel width (rail + clearance)
  const chanH = railHeight + slop; // channel depth (leaves slop under the top)
  const outerW = chanW + 2 * wall;
  const outerH = chanH + wall;
  // Base of the carriage walls sits slop above the bench so it clears the rail base.
  const baseZ = slop;
  const outer = box(outerW, carriageLen, outerH, { at: [0, 0, baseZ + outerH / 2] });
  // Channel: open at the bottom (extends below baseZ so it cuts clean through).
  const channel = box(chanW, carriageLen + 2, chanH + baseZ + 1, {
    at: [0, 0, baseZ + chanH - (chanH + baseZ + 1) / 2 + 0.5],
  });
  let carriage = unwrap(cut(outer, channel));

  // Inward V-ribs: matching triangular prisms on the inner wall faces that drop
  // into the rail grooves. They sit slop proud of the groove so they ride loose.
  const ribDepth = grooveDepth - slop; // rib a touch smaller than the groove
  const ribHalf = ribDepth;
  const ribZ = baseZ + slop / 2 + grooveZ; // align rib centre with groove centre
  const ribRoot = 1; // rib base buried this far into the wall for a real overlap
  const rib = (sign: number) => {
    const xBase = sign * (chanW / 2 + ribRoot); // start inside the wall material
    const xTip = sign * (chanW / 2 - ribDepth); // rib tip, pointing inward
    const y0 = -carriageLen / 2 - 1;
    const profile = unwrap(
      polygon([
        [xBase, y0, ribZ - ribHalf - ribRoot],
        [xBase, y0, ribZ + ribHalf + ribRoot],
        [xTip, y0, ribZ],
      ]),
    );
    return unwrap(extrude(profile, [0, carriageLen + 2, 0]));
  };
  // Pairwise fuse the ribs onto the channel walls (real overlap at the wall face).
  carriage = unwrap(fuse(carriage, rib(1)));
  carriage = unwrap(fuse(carriage, rib(-1)));

  // Lift the carriage onto the rail and slide it toward one end, ready to ride.
  const placedCarriage = translate(carriage, [0, length / 4, 0]);

  return [rail, placedCarriage];
}

export default vGrooveSlider();
