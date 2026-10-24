import {
  box,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  extrude,
  fillet,
  fuse,
  polygon,
  sketchPolysides,
  sphere,
  torus,
  translate,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// D-sub connector (DB9 / VGA-style): a panel-mount data connector. A thin metal
// flange with two mounting holes carries the signature trapezoidal "D" shell —
// a rounded-corner tube, wider at the bottom than the top, that shrouds two
// staggered rows of gold pins. Threaded jackscrew posts stand behind the
// flange. Defaults model the 9-way DB9; bump `ways` (and the lengths) for DA15
// / DB25-style parts. The "D" asymmetry is what keeps the plug from mating
// upside-down, and it is the recognizable silhouette here.
function dSubConnector({
  ways = 9, // number of pins (9 = DB9)
  rows = 2, // staggered pin rows
  flangeLen = 30.81, // flange length, X (mm)
  flangeWid = 12.55, // flange width, Y (mm)
  flangeThick = 1.12, // flange plate thickness (mm)
  holePitch = 24.99, // centre-to-centre of the two mounting holes (mm)
  holeR = 1.6, // mounting-hole radius (mm)
  dLen = 18, // "D" shell length at its base, X (mm)
  dWid = 9.26, // "D" shell width at its base, Y (mm)
  cornerR = 2.5, // rounded-corner radius of the D profile (mm)
  frontH = 6.693, // how far the shell shrouds forward of the flange (+Z)
  backH = 4, // rear collar depth behind the flange (-Z)
  wall = 0.7, // shell wall thickness (mm)
  pinR = 0.5, // pin radius (mm)
} = {}) {
  // The "D" cross-section is a trapezoid wider at the bottom (-Y) than the top
  // (+Y): the TOP corners step inward by `skew` (a ~10 deg lean on each slanted
  // flank), the asymmetry that stops the plug mating upside-down. We build it as
  // a sharp-cornered quad, EXTRUDE it along +Z into a prism, then FILLET the four
  // vertical arrises for genuine rounded corners — a clean swept tube, not the
  // lumpy faceted mass a convex hull of arc-sampled points produces.
  const skew = (dWid / 2 - cornerR) * Math.sin((10 * Math.PI) / 180);

  // A clean rounded-corner D-prism inset from the nominal size by `g`, spanning
  // z0..z1. The sharp trapezoid is wound CCW (bottom edge L→R, up the right
  // flank, top edge R→L, down the left flank) so the extrude faces outward.
  const dPrism = (g, z0, z1) => {
    const hl = dLen / 2 - g; // half-length at the base (widest line)
    const hw = dWid / 2 - g; // half-width
    const profile = unwrap(
      polygon([
        [-hl, -hw, z0], // bottom-left  (widest)
        [hl, -hw, z0], // bottom-right
        [hl - skew, hw, z0], // top-right   (pulled in)
        [-hl + skew, hw, z0], // top-left
      ]),
    );
    const prism = unwrap(validSolid(unwrap(extrude(profile, [0, 0, z1 - z0]))));
    // Round only the four vertical (Z-running) edges; radius shrinks with the
    // inset so the inner wall keeps a uniform thickness around the corners.
    const r = Math.max(cornerR - g, 0.25);
    const vertEdges = edgeFinder().inDirection('Z').findAll(prism);
    return vertEdges.length > 0 ? unwrap(fillet(prism, vertEdges, r)) : prism;
  };

  // Metal flange plate, centred on the origin, its front face at z = 0.
  const flange = box(flangeLen, flangeWid, flangeThick, { at: [0, 0, -flangeThick / 2] });

  // Forward shell: outer D-prism minus an inner one → a shrouding tube with an
  // OPEN top the pins stand in. It digs 1 mm back through the flange face so the
  // two weld into one body (a shell that merely kissed z = 0 would float off as a
  // separate solid). The inner cavity runs past the top so the mouth stays open.
  const shellOuter = dPrism(0, -1, frontH);
  const shellInner = dPrism(wall, -1 - 1, frontH + 1);
  const shell = unwrap(cut(shellOuter, shellInner));

  // Rear collar: a short solid D-stub behind the flange (the back of the metal
  // body), again overlapping the flange by 1 mm.
  const collar = dPrism(0, -backH, 1);

  // Weld flange + shell + collar pairwise into ONE rigid body. (fuseAll would
  // glue them into a compound of separate solids that falls apart on export.)
  let body = flange;
  body = unwrap(fuse(body, shell));
  body = unwrap(fuse(body, collar));

  // Two mounting holes through the flange, on the X axis at ±holePitch/2.
  const o = holePitch / 2;
  const mountHoles = [
    cylinder(holeR, flangeThick + 2, { at: [-o, 0, -flangeThick - 1] }),
    cylinder(holeR, flangeThick + 2, { at: [o, 0, -flangeThick - 1] }),
  ];
  body = unwrap(cutAll(body, mountHoles));

  // Pin field: `ways` pins split across `rows` staggered rows, the classic D-sub
  // zig-zag. Each pin is a post tipped with a hemisphere, rooted at the flange
  // face (z = 0) and standing UP the full depth of the shroud so the two rows
  // fill the open mouth and read clearly looking into it. Returned as separate
  // solids (real pins are discrete contacts).
  const colPitch = 2.77; // X spacing between adjacent pins in a row
  const rowGap = 2.84; // Y spacing between the two rows
  const pinH = frontH - pinR; // shaft height; tip hemisphere reaches the rim
  const perRow = Math.ceil(ways / rows);
  const pins = [];
  let placed = 0;
  for (let r = 0; r < rows && placed < ways; r++) {
    const count = Math.min(perRow, ways - placed);
    const y = (r - (rows - 1) / 2) * rowGap;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * colPitch;
      const shaft = cylinder(pinR, pinH, { at: [x, y, 0] });
      const tip = sphere(pinR, { at: [x, y, pinH] });
      pins.push(unwrap(fuse(shaft, tip)));
      placed++;
    }
  }

  // Jack posts (the real DB9 mounting hardware): female hex standoffs on the
  // FRONT face, flanking the shell at the hole centres, that the mating cable
  // hood's captive thumbscrews thread INTO — so the visible part is a hex barrel
  // with a tapped bore, not a male screw. The panel-side end is a short male
  // threaded stud that passes through and takes a nut. Returned as discrete metal.
  const hexR = 2.7; // hex across-corners radius
  const barrelH = 5; // standoff height proud of the front face
  const boreR = 1.25; // tapped bore (4-40 female)
  const studLen = 5; // panel-side male stud length
  const studR = 1.25;
  const post = (sx) => {
    const cx = sx * o;
    // Front female hex standoff: a hex prism with a tapped through-bore.
    const barrel = translate(sketchPolysides(hexR, 6, 0, 'XY').extrude(barrelH), [cx, 0, 0]);
    const front = unwrap(cut(barrel, cylinder(boreR, barrelH + 1, { at: [cx, 0, -0.5] })));
    // Panel-side male stud, threaded with toroidal ring grooves for the nut.
    const stud = cylinder(studR, studLen, { at: [cx, 0, -flangeThick - studLen] });
    const grooves = [];
    for (let z = -flangeThick - studLen + 0.5; z < -flangeThick - 0.4; z += 0.85) {
      grooves.push(torus(studR, 0.18, { at: [cx, 0, z] }));
    }
    const back = unwrap(cutAll(stud, grooves));
    return [front, back];
  };

  return [body, ...pins, ...post(-1), ...post(1)];
}

export default dSubConnector();