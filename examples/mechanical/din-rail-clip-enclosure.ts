import {
  box,
  cut,
  cutAll,
  edgeFinder,
  fillet,
  fuse,
  translate,
  unwrap,
} from 'brepjs/quick';

// DIN-rail clip enclosure (base + lid): a compact rounded-corner module box
// that snaps onto a standard 35 mm TS35 top-hat rail. The base is an upward
// tray; its back wall carries an integral DIN-rail clip — a recessed rail
// channel whose mouth is pinched by two overhang lips that hook the rail
// flanges, with a screwdriver pry tab hanging off the lower lip. The lid is an
// inverted tray laid beside the base, the way the two sit on a print plate.
function dinRailClipEnclosure({
  innerLength = 70, // cavity extent along X (mm)
  innerWidth = 45, // cavity extent along Y (mm)
  wall = 2.2, // side-wall thickness (mm)
  floor = 1.8, // base / lid plane thickness (mm)
  baseWall = 28, // base side-wall height above the floor (mm)
  lidWall = 8, // lid skirt height (mm)
  cornerR = 4, // outer vertical corner radius (mm)
  railWidth = 35, // TS35 DIN-rail nominal width (mm)
  railDepth = 7.5, // TS35 top-hat profile depth (mm)
  railLip = 1, // rail flange thickness the jaws hook over (mm)
} = {}) {
  // Outer footprint = cavity + two walls; inner corners shrink with the wall.
  const outerL = innerLength + 2 * wall;
  const outerW = innerWidth + 2 * wall;
  const innerR = Math.max(cornerR - wall, 0.6);

  // A rounded-corner rectangular prism: a centred box with only its four
  // vertical (Z-running) edges filleted — the building block for every wall,
  // cavity and clip jaw so the box keeps soft vertical corners. (A direct
  // shell() is fragile here: inDirection('Z') on a cavity also catches the flat
  // faces; cutting an inner cavity keeps the floor intact.)
  const roundedPrism = (w: number, d: number, h: number, z: number, r: number) => {
    const blk = box(w, d, h, { at: [0, 0, z + h / 2] });
    if (r <= 0) return blk;
    return unwrap(fillet(blk, edgeFinder().inDirection('Z').findAll(blk), r));
  };

  // --- BASE: a rounded tray, floor on z = 0, opening upward. ---
  const baseHeight = floor + baseWall;
  const baseOuter = roundedPrism(outerL, outerW, baseHeight, 0, cornerR);
  const baseCavity = roundedPrism(innerLength, innerWidth, baseWall + 1, floor, innerR);
  let base = unwrap(cut(baseOuter, baseCavity));

  // --- DIN-rail clip, welded onto the back (+Y) wall of the base. ---------
  // Geometry intent: a top-hat (TS35) rail seats horizontally (axis along X) in
  // a channel that opens out the back (+Y). The channel mouth is pinched in Z by
  // a fixed upper lip and a fixed lower lip that hook over the rail's two
  // flanges; its throat behind the lips is full rail height, so the rail snaps
  // past the lips and is trapped. A solid back wall ties the whole clip — both
  // lips, the side pillars and the channel floor — into the body as one piece.
  // A pry-tab tongue hangs off the lower lip for screwdriver release.
  const wallY = outerW / 2; // outer face of the +Y back wall
  const lip = wall + railLip + 0.4; // lip band thickness in Z
  const channelH = railWidth + 0.6; // channel throat height (rail + slack)
  const bite = wall; // how far the block sinks into the wall to weld
  const clipCenterZ = baseHeight / 2; // clip centred on the wall height

  const clipW = railWidth + 12; // clip width across X (wider than the rail)
  const clipH = channelH + 2 * lip; // full clip height in Z
  const backWall = wall; // solid back wall behind the channel floor
  const clipBlockD = railDepth + backWall; // clip stand-off depth past the wall
  const clipBackY = wallY + clipBlockD; // back plane of the clip block

  // Clip backing block: a rounded slab standing off the back wall, sunk `bite`
  // into the wall so it welds (a block merely kissing the wall face would stay
  // a separate, floating solid). Spans the channel throat + both lips in Z.
  const slabD = clipBlockD + bite;
  const clip = roundedPrism(clipW, slabD, clipH, 0, Math.min(cornerR, 3));
  // roundedPrism centres in X/Y and sits base at z = 0; move it onto the
  // back-wall line and up so it straddles the wall mid-height.
  const clipBlock = translate(clip, [
    0,
    wallY - bite + slabD / 2,
    clipCenterZ - clipH / 2,
  ]);
  base = unwrap(fuse(base, clipBlock));

  // Carve the rail channel out of that block as a T-pocket open toward +Y:
  // a full-height throat that stops short of the mouth, plus a shorter narrow
  // slot punched out the back. What's left at the mouth is the pair of overhang
  // lips; behind the throat a `backWall`-thick floor stays solid and connected.
  const lipReachZ = railLip + 0.8; // how far each lip overhangs the flange in Z
  const mouthH = channelH - 2 * lipReachZ; // open gap between the two lips
  const floorY = wallY + 0.2; // channel floor, just proud of the wall
  const throatDepth = railDepth - lipReachZ; // throat stops short of the mouth
  const cutters = [];
  // Full-height throat (does NOT reach the back face — leaves the floor).
  cutters.push(
    box(railWidth, throatDepth, channelH, {
      at: [0, floorY + throatDepth / 2, clipCenterZ],
    }),
  );
  // Narrow mouth slot, out the back between the lips (the rail's entry gap).
  cutters.push(
    box(railWidth, clipBlockD + 2, mouthH, {
      at: [0, floorY + (clipBlockD + 2) / 2, clipCenterZ],
    }),
  );

  // Lip-back relief: undercut the inner face of each lip so it overhangs the
  // rail flange (the lip is thinner in Y than the throat is deep). A shallow
  // pocket behind each lip, cut from the throat side, stopping short of the back.
  const reliefDepth = throatDepth + lipReachZ - railLip; // up to the lip's back
  for (const sz of [-1, 1]) {
    const zc = clipCenterZ + sz * (mouthH / 2 + lipReachZ / 2);
    cutters.push(
      box(railWidth + 2, reliefDepth, lipReachZ + 0.1, {
        at: [0, floorY + reliefDepth / 2, zc],
      }),
    );
  }

  base = unwrap(cutAll(base, cutters));

  // Pry tab: a tongue hanging off the bottom lip that you lever with a
  // screwdriver to spring the box off the rail. A thin slab fused to the lower
  // lip's back-bottom, overlapping it so it welds into one rigid body.
  const tabW = 12; // tab width across X
  const tabThk = 2.6; // tab thickness in Y
  const tabDrop = 9; // how far the tab hangs below the lower lip
  const tabZTop = clipCenterZ - clipH / 2 + 1.5; // overlap the lip bottom
  const tab = box(tabW, tabThk, tabDrop, {
    at: [0, clipBackY - tabThk / 2, tabZTop - tabDrop / 2],
  });
  base = unwrap(fuse(base, tab));

  // --- LID: a shallow inverted tray — cap on top, skirt hanging down. ------
  // Built cap-up directly (cavity open at the bottom) so it needs no flip; the
  // downward skirt drops over the base rim on assembly.
  const lidH = floor + lidWall;
  const lidOuter = roundedPrism(outerL, outerW, lidH, 0, cornerR);
  const lidCavity = roundedPrism(innerLength, innerWidth, lidWall + 1, -1, innerR);
  const lidTray = unwrap(cut(lidOuter, lidCavity));

  // Lay the lid beside the base along Y (clear of the clip), open faces both up,
  // exactly how the two would sit on a print plate.
  const gap = clipBlockD + 14;
  const placedLid = translate(lidTray, [0, outerW + gap, 0]);

  return [base, placedLid];
}

export default dinRailClipEnclosure();
