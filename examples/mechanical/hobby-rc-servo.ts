import {
  box,
  chamfer,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  unwrap,
} from 'brepjs/quick';

// Hobby RC servo motor (standard-size body, ~40 x 20 x 37 mm): the geared
// servo that swings control surfaces and pan/tilt rigs. A rectangular case with
// two flat mounting ears jutting from the upper long sides (a screw hole near
// each ear corner), a raised gearbox deck, a round gear boss offset to one end
// carrying the splined output shaft, and a smaller free-wheeling pivot post at
// the other end. Defaults model a common 40.5 mm "standard" servo.
function hobbyServo({
  bodyL = 40.5, // case length along X (mm)
  bodyW = 20, // case width along Y (mm)
  bodyH = 37, // case height to the deck, mounting face at z=0 (mm)
  edgeRound = 1.5, // softening on the four vertical body edges (mm)
  earSpan = 54.5, // flange tip-to-tip across the ears, along X (mm)
  earThick = 2.6, // mounting-ear thickness (mm)
  earDrop = 5, // ears sit this far below the top deck (mm)
  deckH = 3.5, // raised gearbox deck above the body top (mm)
  deckInset = 1.2, // deck is inset from the body footprint (mm)
  bossDia = 13, // output gear boss diameter (mm)
  bossH = 4, // gear boss height above the deck (mm)
  bossOffset = 9.5, // boss centre offset from body centre toward +X (mm)
  shaftDia = 5.6, // splined output shaft diameter (mm)
  shaftH = 4.5, // shaft length above the boss (mm)
  pivotDia = 6, // free-wheel pivot post diameter (mm)
  pivotH = 2.5, // pivot post height above the deck (mm)
  screwDia = 4, // mounting-hole diameter through the ears (mm)
  screwInset = 2.6, // hole centre inset from each ear corner (mm)
} = {}) {
  // Case body: mounting face on z=0, case rising to the deck at z=bodyH.
  const blank = box(bodyL, bodyW, bodyH, { at: [0, 0, bodyH / 2] });
  const vEdges = edgeFinder().inDirection('Z').findAll(blank);
  const bodyShape = unwrap(fillet(blank, vEdges, edgeRound));

  // Mounting ears: one flat flange slab spanning the full ear span and body
  // width, parked just below the deck. It overlaps the case in the middle so it
  // welds into one solid; the case sides poke ~earThick through it.
  const earZ = bodyH - earDrop - earThick / 2;
  const ears = box(earSpan, bodyW, earThick, { at: [0, 0, earZ] });

  // Raised gearbox deck: a slimmer slab capping the body, dug 1 mm into the
  // case so it fuses rather than floats.
  const deck = box(bodyL - 2 * deckInset, bodyW - 2 * deckInset, deckH + 1, {
    at: [0, 0, bodyH - 0.5 + deckH / 2],
  });

  // Gear boss + splined output shaft, offset toward +X. Both sink 1 mm into the
  // deck for real overlap.
  const deckTop = bodyH + deckH;
  const boss = cylinder(bossDia / 2, bossH + 1, { at: [bossOffset, 0, deckTop - 1] });
  const shaft = cylinder(shaftDia / 2, shaftH + 1, {
    at: [bossOffset, 0, deckTop + bossH - 1],
  });

  // Free-wheel pivot post at the opposite end.
  const pivot = cylinder(pivotDia / 2, pivotH + 1, { at: [-bossOffset, 0, deckTop - 1] });

  // Pairwise fuse (never fuseAll): each overlapping part is welded into the one
  // rigid case in turn, so the result is a single solid.
  let servo = bodyShape;
  servo = unwrap(fuse(servo, ears));
  servo = unwrap(fuse(servo, deck));
  servo = unwrap(fuse(servo, boss));
  servo = unwrap(fuse(servo, shaft));
  servo = unwrap(fuse(servo, pivot));

  // Soften the upper rim of the gear boss so the cap reads as molded.
  const bossTopRim = edgeFinder().atDistance(bossDia / 2, [bossOffset, 0, deckTop + bossH]).findAll(servo);
  if (bossTopRim.length > 0) {
    servo = unwrap(chamfer(servo, bossTopRim, 0.8));
  }

  // Four mounting holes near the ear corners, drilled down through the flange.
  const holeX = earSpan / 2 - screwInset;
  const holeY = bodyW / 2 - screwInset;
  const holes = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      holes.push(
        cylinder(screwDia / 2, earThick + 2, {
          at: [sx * holeX, sy * holeY, earZ - earThick / 2 - 1],
        }),
      );
    }
  }

  return unwrap(cutAll(servo, holes));
}

export default hobbyServo();