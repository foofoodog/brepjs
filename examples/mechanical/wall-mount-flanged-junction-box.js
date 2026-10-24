import {
  box,
  convexHull,
  cut,
  cutAll,
  edgeFinder,
  fillet,
  fuse,
  translate,
  unwrap,
} from 'brepjs/quick';

// Wall-mount flanged junction box (base + lid). A rounded-corner enclosure
// whose side walls carry external mounting ears: low rounded-rect flanges, each
// pierced by an elongated (obround) screw slot so the box can be hung and slid
// on a wall, with a fillet gusset rooting every ear back into the wall. The base
// is an upward tray with a registration ridge on its top rim; the lid is an
// inverted tray with a matching groove, laid beside the base like a print plate.
function wallMountBox({
  innerLength = 100, // cavity extent along X (the PCB footprint) (mm)
  innerWidth = 70, // cavity extent along Y (mm)
  wall = 2.4, // side-wall thickness (mm)
  floor = 1.8, // base / lid plane thickness (mm)
  baseWall = 22, // base side-wall height above the floor (mm)
  lidWall = 8, // lid skirt height (mm)
  cornerR = 8, // outer vertical corner radius (mm)
  ridge = 3, // base/lid registration ridge height (mm)
  slack = 0.25, // ridge-to-groove radial clearance (mm)
  earReach = 11, // how far each ear sticks out past the wall (mm)
  earThick = 4, // ear flange thickness (mm)
  screwDia = 4, // mounting-screw clearance diameter (mm)
  slotTravel = 8, // length the screw can slide along the slot (mm)
} = {}) {
  // Outer footprint = cavity + two walls. Inner corners shrink with the wall.
  const outerL = innerLength + 2 * wall;
  const outerW = innerWidth + 2 * wall;
  const innerR = Math.max(cornerR - wall, 0.6);

  // A rounded-corner rectangular prism: a centred box with only its four
  // vertical (Z-running) edges filleted. The building block for every wall,
  // cavity, ridge and groove so the whole box keeps soft vertical corners.
  // (A direct shell() is fragile here — inDirection('Z') on the cavity would
  // also catch the flat faces; cutting an inner cavity keeps the floor intact.)
  const roundedPrism = (w, d, h, z, r) => {
    const blk = box(w, d, h, { at: [0, 0, z + h / 2] });
    if (r <= 0) return blk;
    return unwrap(fillet(blk, edgeFinder().inDirection('Z'), r));
  };

  // --- BASE: a rounded tray, floor on z = 0, opening upward. ---
  const baseHeight = floor + baseWall;
  const baseOuter = roundedPrism(outerL, outerW, baseHeight, 0, cornerR);
  const baseCavity = roundedPrism(innerLength, innerWidth, baseWall + 1, floor, innerR);
  let base = unwrap(cut(baseOuter, baseCavity));

  // Registration ridge: a thin perimeter wall rising from the base's top rim,
  // pulled in by `slack` so the lid groove clears it on assembly. Built as a
  // rounded band minus its own inner cavity so it traces the wall outline.
  const ridgeOuterL = outerL - 2 * slack;
  const ridgeOuterW = outerW - 2 * slack;
  const ridgeBand = unwrap(
    cut(
      roundedPrism(ridgeOuterL, ridgeOuterW, ridge, baseHeight, Math.max(cornerR - slack, 0.6)),
      roundedPrism(innerLength, innerWidth, ridge + 1, baseHeight - 0.5, innerR),
    ),
  );
  base = unwrap(fuse(base, ridgeBand));

  // --- Mounting ears welded onto the long (front/back, ±Y) walls. ---
  // Each ear is a low rounded-rect flange sitting flush with the floor underside
  // (z from 0 to earThick) and reaching `earReach` past the wall. It overlaps
  // the wall by `bite` mm so the fuse takes — an ear merely touching the wall
  // face would stay a separate, floating solid. The ear carries an obround screw
  // slot (a convex hull of two bores) and a fillet gusset back to the wall.
  const bite = 1.5; // how far the ear penetrates into the wall
  const earWidth = screwDia + 6; // flange width across X
  const earLen = earReach + bite; // depth in Y, including the buried overlap
  const wallY = outerW / 2; // outer face of the +Y wall

  // Build one ear about its own local frame centred on the wall face at the
  // origin (the ear grows out along +Y), then translate/mirror it to each post.
  const makeEar = (xPos, sign) => {
    // Flange body: a rounded slab, its inner edge buried `bite` into the wall.
    // Corner radius stays well under half the slab so opposite fillets never
    // meet (a degenerate fillet that meets in the middle fails the kernel).
    const earR = Math.min(earWidth * 0.3, earLen * 0.3, earThick);
    const yCentre = sign * (wallY - bite + earLen / 2);
    let ear = roundedPrism(earWidth, earLen, earThick, 0, earR);
    ear = translate(ear, [xPos, yCentre, 0]);

    // Fillet gusset: a triangular brace thickening the ear root where it meets
    // the wall, so the join reads as a moulded flange instead of a flat tab.
    // Built deterministically as a convex hull (no fragile edge finder): a
    // right-triangle prism rising up the wall and tapering out over the flange,
    // buried `bite` into the wall on its tall side. A `slab` of triangular
    // section spanning the ear width in X.
    const gRise = earThick + ridge; // tall side, climbing the wall
    const gRun = earThick + 3; // how far it tapers out over the flange
    const yWall = sign * (wallY - bite); // the buried root plane
    const yOut = yWall + sign * gRun; // where the taper meets the flange top
    const gx = earWidth / 2;
    const gusset = unwrap(
      convexHull([
        // tall buried face against the wall (rectangle z 0..gRise)
        [xPos - gx, yWall, 0],
        [xPos + gx, yWall, 0],
        [xPos - gx, yWall, gRise],
        [xPos + gx, yWall, gRise],
        // toe out on the flange (a line at flange top)
        [xPos - gx, yOut, earThick],
        [xPos + gx, yOut, earThick],
      ]),
    );

    // Weld the gusset and ear into a single ear assembly (pairwise fuse).
    return unwrap(fuse(ear, gusset));
  };

  // Obround screw slot through an ear at xPos on the ±Y side: two clearance
  // bores `slotTravel` apart, hulled into a stadium, punched top-to-bottom.
  const makeSlot = (xPos, sign) => {
    const yMid = sign * (wallY + earReach * 0.55); // slot sits out near the tip
    const ends = [];
    for (const t of [-1, 1]) {
      const y = yMid + (t * slotTravel) / 2;
      // Two rings (top + bottom face) per bore feed the hull a proper cylinder.
      ends.push([xPos, y, -1]);
      ends.push([xPos, y, earThick + 1]);
      ends.push([xPos + screwDia / 2, y, earThick + 1]);
      ends.push([xPos - screwDia / 2, y, earThick + 1]);
      ends.push([xPos, y + screwDia / 2, earThick + 1]);
      ends.push([xPos, y - screwDia / 2, earThick + 1]);
      ends.push([xPos + screwDia / 2, y, -1]);
      ends.push([xPos - screwDia / 2, y, -1]);
      ends.push([xPos, y + screwDia / 2, -1]);
      ends.push([xPos, y - screwDia / 2, -1]);
    }
    return unwrap(convexHull(ends));
  };

  // Two ears per long wall, near the corners; mirror to both walls (4 total).
  const earX = innerLength / 2 - earWidth / 2 + wall - 4;
  const earSpecs = [
    [-earX, 1],
    [earX, 1],
    [-earX, -1],
    [earX, -1],
  ];
  // Weld each ear onto the tray with the 2-way fuse (the N-way fuseAll glues via
  // BuilderAlgo and leaves every ear a separate solid in a compound). Then punch
  // the obround slots through the welded body in one cutAll.
  const slots = [];
  for (const [x, s] of earSpecs) {
    base = unwrap(fuse(base, makeEar(x, s)));
    slots.push(makeSlot(x, s));
  }
  base = unwrap(cutAll(base, slots));

  // --- LID: a shallow inverted tray — cap on top, skirt hanging down. ---
  // Built cap-up directly (cavity open at the bottom) so it needs no flip. A
  // groove rebated into the skirt's inner rim swallows the base ridge.
  const lidH = floor + lidWall;
  const lidOuter = roundedPrism(outerL, outerW, lidH, 0, cornerR);
  const lidCavity = roundedPrism(innerLength, innerWidth, lidWall + 1, -1, innerR);
  let lid = unwrap(cut(lidOuter, lidCavity));
  // Groove: widen the cavity over the bottom `ridge` mm to clear the ridge band.
  const groove = roundedPrism(
    ridgeOuterL + 2 * slack,
    ridgeOuterW + 2 * slack,
    ridge + 0.5,
    -0.25,
    Math.max(cornerR - slack, 0.6),
  );
  lid = unwrap(cut(lid, groove));

  // Lay the lid alongside the base (both open faces up) with a print gap.
  const placedLid = translate(lid, [0, outerW + 16, 0]);

  return [base, placedLid];
}

export default wallMountBox();
