import { cone, cylinder, cut, fuse, rotate, torus, translate, unwrap } from 'brepjs/quick';

// Kitchen / lab funnel: a wide conical bowl that necks down into a long thin
// pour spout, hollowed to a thin wall so liquid runs from the mouth straight
// out the tube. A rolled rim stiffens the top lip and a side hang-loop lets it
// dangle off a rail. Mouth points up (+Z); spout hangs below. Defaults model a
// ~75 mm bench funnel.
function funnel({
  mouthDia = 75, // outer diameter of the top rim (mm)
  bowlHeight = 48, // height of the conical bowl section (mm)
  spoutDia = 12, // outer diameter of the pour spout (mm)
  spoutLength = 40, // length of the straight spout below the bowl (mm)
  wall = 1.6, // vessel wall thickness (mm)
  rimRoll = 2.4, // radius of the rolled top-rim bead (mm)
  loop = true, // add a side hang-loop on the rim
} = {}) {
  const rMouth = mouthDia / 2;
  const rSpout = spoutDia / 2;
  const rBore = rSpout - wall; // inner spout (pour) radius
  // Spout occupies z = 0..zNeck; bowl flares up from there to the mouth.
  const zNeck = spoutLength; // bowl/spout junction
  const zTop = spoutLength + bowlHeight; // mouth rim height

  // --- Outer shell: spout tube fused to the conical bowl above it ---
  // Cone base (narrow, rSpout) sits at the neck and widens UP to rMouth — the
  // mouth points up. The spout overshoots 1 mm INTO the bowl base so the two
  // bodies truly interpenetrate (a coincident face alone would leave a floating
  // solid that survives meshing but falls apart on export).
  const bowlOuter = cone(rSpout, rMouth, bowlHeight, { at: [0, 0, zNeck] });
  const spoutOuter = cylinder(rSpout, zNeck + 1, { at: [0, 0, 0] });
  let body = unwrap(fuse(spoutOuter, bowlOuter));

  // --- Rolled rim bead around the mouth ---
  // A torus riding the mouth edge. Its tube centre is pulled inboard by the full
  // roll and dropped half a roll below the rim, so a fat slice of the bead is
  // buried in the cone wall — real shared volume, so it welds into one body
  // rather than gluing on as a separate lump.
  const rimCentre = rMouth - rimRoll;
  const rim = torus(rimCentre, rimRoll, { at: [0, 0, zTop - rimRoll * 0.5] });
  body = unwrap(fuse(body, rim));

  // --- Side hang-loop ---
  // A small upright ring sunk into the rim bead so the two solids share volume.
  if (loop) {
    const loopR = 7; // loop ring centreline radius
    const loopTube = 1.9; // loop wire radius
    // Bead outer edge sits at rimCentre + rimRoll; seat the ring so its inner
    // edge laps ~2 mm inside that, guaranteeing overlap with the bead.
    const ringX = rimCentre + rimRoll + loopR - 2;
    // torus is built in XY (axis +Z); tip it 90° about X so the ring stands up,
    // then carry it out to the mouth-rim height on +X.
    const ring = translate(rotate(torus(loopR, loopTube), 90, { axis: [1, 0, 0] }), [
      ringX,
      0,
      zTop - rimRoll * 0.5,
    ]);
    body = unwrap(fuse(body, ring));
  }

  // --- Hollow it out: inner cone + inner spout bore, one connected cavity ---
  // Inner cone is narrow (spout bore) at the neck and wide (mouth bore) at the
  // top, run proud of the rim so the mouth opens fully. The bore cylinder
  // overshoots both ends and shares the neck region with the inner cone, so the
  // conical cavity and the tube bore merge into a single through-passage with no
  // plug left behind.
  const innerCone = cone(rBore, rMouth - wall, bowlHeight + rimRoll + 2, {
    at: [0, 0, zNeck],
  });
  const bore = cylinder(rBore, zTop + 4, { at: [0, 0, -2] });
  return unwrap(cut(unwrap(cut(body, innerCone)), bore));
}

export default funnel();