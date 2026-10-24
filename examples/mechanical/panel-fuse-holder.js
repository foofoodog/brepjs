import {
  box,
  chamfer,
  cone,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fuse,

  torus,
  translate,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// 20 mm panel-mount fuse holder: the cylindrical cartridge holder that clamps
// into a chassis hole and grabs a 20 mm glass fuse. A slotted Ø18.8 flange cap
// presses against the panel front, a flatted Ø12 threaded neck passes through
// the hole, the bakelite body tapers down behind the panel with two contact
// slots, and a spade terminal exits the base. The knurled clamping nut (a
// genuinely separate part) is returned alongside. Built standing on its spade.
function fuseHolder({
  flangeDia = 18.8, // outer diameter of the front flange cap (mm)
  flangeThick = 2, // flange cap thickness (mm)
  neckDia = 12, // threaded mounting-neck nominal diameter (mm)
  neckFlat = 10.8, // across-flats of the neck (anti-rotation flats) (mm)
  neckLen = 15, // threaded neck length (mm)
  bodyTopDia = 10.4, // body diameter where it meets the neck (mm)
  bodyBotDia = 8.7, // body diameter at the far (spade) end (mm)
  totalLen = 33.2, // flange face to body base, the cartridge length (mm)
  boreDia = 6.2, // axial bore the fuse cap seats into (mm)
  nutDia = 18.8, // clamping-nut across-flats / outer diameter (mm)
  nutThick = 6, // nut height (mm)
  spadeWidth = 6.4, // blade width of the bottom spade terminal (mm)
  spadeLen = 8, // spade blade length below the body (mm)
} = {}) {
  const bodyLen = totalLen - flangeThick - neckLen; // tapered section length
  const spadeThick = 0.8; // spade blade thickness (mm)

  // Z=0 sits at the body base (the deepest point behind the panel). Stack
  // upward: tapered body, threaded neck, flange cap — flange ends up on top.
  const bodyZ0 = 0;
  const neckZ0 = bodyZ0 + bodyLen;
  const flangeZ0 = neckZ0 + neckLen;

  // Tapered bakelite body: a frustum, narrow at the base, wide under the neck.
  const body = cone(bodyBotDia / 2, bodyTopDia / 2, bodyLen, { at: [0, 0, bodyZ0] });

  // Threaded mounting neck: a Ø12 cylinder milled down to two parallel flats so
  // the nut can't spin it. Overlap 1 mm into the body below so they weld solid.
  let neck = cylinder(neckDia / 2, neckLen + 1, { at: [0, 0, neckZ0 - 1] });
  const flatCut = (neckDia - neckFlat) / 2 + 0.1; // depth shaved off each side
  for (const side of [-1, 1]) {
    const slab = box(neckDia + 2, flatCut, neckLen + 4, {
      at: [0, side * (neckFlat / 2 + flatCut / 2), neckZ0 + neckLen / 2],
    });
    neck = unwrap(cut(neck, slab));
  }
  // Thread the neck with toroidal ring grooves — a cheap stand-in for the M12
  // helix the nut runs on. Grooves sit at the full Ø12 radius, so they bite only
  // the round flanks and leave the milled flats clean, exactly like a real neck.
  const neckGrooves = [];
  for (let z = neckZ0 + 1; z < neckZ0 + neckLen - 1; z += 1.2) {
    neckGrooves.push(torus(neckDia / 2, 0.32, { at: [0, 0, z] }));
  }
  neck = unwrap(cutAll(neck, neckGrooves));

  // Front flange cap: a wide disc that bears on the panel face. Overlaps 1 mm
  // down into the neck so the cap, neck and body fuse into one rigid solid.
  const flange = cylinder(flangeDia / 2, flangeThick + 1, { at: [0, 0, flangeZ0 - 1] });

  // Spade terminal: a thin flat blade projecting from the base (rolled-corner
  // tab simplified to a rectangle). Reaches 1 mm up into the body to weld on.
  const spade = box(spadeThick, spadeWidth, spadeLen + 1, {
    at: [0, 0, bodyZ0 - spadeLen / 2 + 0.5],
  });

  // Weld pairwise into ONE solid (never fuseAll — that glues separate bodies
  // into a compound that falls apart on export). Each adjacent pair overlaps.
  let holder = body;
  holder = unwrap(fuse(holder, neck));
  holder = unwrap(fuse(holder, flange));
  holder = unwrap(fuse(holder, spade));

  // Axial fuse bore down from the flange face — where the screw-on fuse cap
  // seats. Blind: stops short of the base so the holder stays closed.
  const bore = cylinder(boreDia / 2, neckLen + flangeThick + 2, {
    at: [0, 0, flangeZ0 + flangeThick + 1],
    axis: [0, 0, -1],
  });
  holder = unwrap(cut(holder, bore));

  // Slot across the flange cap face (screwdriver detail to tighten/seat the cap).
  const slot = box(flangeDia + 2, 1.6, 1, { at: [0, 0, flangeZ0 + flangeThick - 0.5] });
  holder = unwrap(cut(holder, slot));

  // Two contact slots milled into opposite sides of the tapered body — where the
  // internal fuse clips are accessed. Thin radial windows near the base.
  const slotCutters = [];
  for (const side of [-1, 1]) {
    slotCutters.push(
      box(bodyTopDia + 2, 3.2, 7, {
        at: [side * (bodyBotDia / 2 + 0.5), 0, bodyZ0 + bodyLen * 0.45],
      }),
    );
  }
  holder = unwrap(cutAll(holder, slotCutters));

  // Soften the front rim of the flange cap with a small chamfer so it reads as a
  // molded bezel, not a raw disc. Wrap the fused solid so chamfer accepts it.
  const valid = validSolid(holder);
  if (valid.ok) {
    const topRim = edgeFinder().atDistance(flangeDia / 2, [0, 0, flangeZ0 + flangeThick]).findAll(valid.value);
    if (topRim.length > 0) {
      holder = unwrap(chamfer(valid.value, topRim, 0.6));
    }
  }

  // Clamping nut: a separate round nut with a thin seating flange, threaded onto
  // the neck behind the panel. Modeled as two concentric discs with a clearance
  // bore; returned as its own solid (it really is a separate part).
  const nutFlangeT = 1.5;
  const nutBody = cylinder(nutDia / 2, nutThick, { at: [0, 0, 0] });
  const nutFlange = cylinder(nutDia / 2 + 0.6, nutFlangeT, { at: [0, 0, nutThick] });
  let nut = unwrap(fuse(nutBody, nutFlange));
  const nutBore = cylinder(neckDia / 2 + 0.2, nutThick + nutFlangeT + 2, { at: [0, 0, -1] });
  nut = unwrap(cut(nut, nutBore));
  // Park the nut on the neck, snug under the flange cap.
  nut = translate(nut, [0, 0, neckZ0 + 1]);

  return [holder, nut];
}

export default fuseHolder();