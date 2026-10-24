import {
  box,
  cone,
  cut,
  cutAll,
  cylinder,
  fuse,
  rotate,
  translate,
  unwrap,
} from 'brepjs/quick';
// Knuckle (butt) hinge, shown open and flat: two rectangular leaves meeting on
// the centreline, each curling into interleaved barrel knuckles that a single
// steel pin threads through. Pin axis runs along X; leaves lie in the XY plane.
// Defaults model a ~50 mm utility hinge: 2 mm leaves, 6 mm knuckle, 5 knuckles.
function knuckleHinge({
  length = 50, // barrel length along the pin axis (mm)
  leafWidth = 22, // each leaf's reach out from the pin centreline (mm)
  leafThick = 2, // leaf plate thickness (mm)
  knuckleDia = 6, // outer diameter of the barrel knuckles (mm)
  pinDia = 2.6, // hinge-pin diameter (mm)
  knuckles = 5, // total knuckle segments shared across both leaves
  gap = 0.4, // axial clearance between adjacent knuckles (mm)
  screwsPerLeaf = 2, // countersunk screw holes down each leaf
  screwDia = 3.6, // screw shank clearance diameter (mm)
} = {}) {
  const knuckleR = knuckleDia / 2;
  // Pin centreline sits at mid-thickness of the leaves so the hinge folds flat.
  const axisZ = leafThick / 2;
  // Width of one knuckle band; gaps are shared between neighbours.
  const band = (length - (knuckles - 1) * gap) / knuckles;

  // A cylinder of length `len` lying along +X, centred at [cx, 0, axisZ].
  // (Primitive cylinders grow along +Z, so build base-centred then swing to X.)
  const xRod = (r, len, cx) =>
    translate(
      rotate(cylinder(r, len, { at: [0, 0, -len / 2], centered: false }), 90, { axis: [0, 1, 0] }),
      [cx, 0, axisZ],
    );

  // One leaf, built about the origin then mirrored/cloned for the other side.
  // ownsKnuckle(i) decides which knuckle indices this leaf curls around.
  const makeLeaf = (sign, ownsKnuckle) => {
    const parts = [];

    // Flat plate: spans the pin length in X, reaches out leafWidth in +Y*sign,
    // its inner edge stopping at the knuckle wall so the curl blends cleanly.
    const plateInner = knuckleR - leafThick; // tuck the plate under the barrel
    const plateLen = leafWidth - plateInner;
    const plateCy = sign * (plateInner + plateLen / 2);
    parts.push(box(length, plateLen, leafThick, { at: [0, plateCy, axisZ] }));

    // Knuckles this leaf owns, plus a short web tying each one back to the plate
    // edge (the web is the curled "arm" of a real hinge, flattened here).
    for (let i = 0; i < knuckles; i++) {
      if (!ownsKnuckle(i)) continue;
      const cx = -length / 2 + band / 2 + i * (band + gap);
      parts.push(xRod(knuckleR, band, cx));
      // Web bridging barrel to plate inner edge (the curled "arm", flattened).
      const webLen = plateInner + leafThick;
      parts.push(box(band, webLen, leafThick, { at: [cx, (sign * webLen) / 2, axisZ] }));
    }

    // Pairwise fuse, not fuseAll: BuilderAlgo leaves the plate, knuckles and webs
    // as separate solids in a compound even though they overlap; folding with the
    // 2-way fuse unifies them into one rigid leaf.
    return parts.reduce((a, b) => unwrap(fuse(a, b)));
  };

  // Even knuckles belong to leaf A (+Y), odd ones to leaf B (-Y): they mesh.
  const leafA = makeLeaf(1, (i) => i % 2 === 0);
  const leafB = makeLeaf(-1, (i) => i % 2 === 1);

  // Countersunk screw holes: a straight shank capped by a flaring head cone,
  // punched through each leaf. Laid out evenly down the leaf at mid-reach.
  const drillLeaf = (solid, sign) => {
    const cutters = [];
    const yRow = sign * (knuckleR + (leafWidth - knuckleR) * 0.55);
    for (let s = 0; s < screwsPerLeaf; s++) {
      const t = screwsPerLeaf === 1 ? 0.5 : s / (screwsPerLeaf - 1);
      const x = -length / 2 + length * (0.18 + 0.64 * t);
      cutters.push(cylinder(screwDia / 2, leafThick + 2, { at: [x, yRow, -1] }));
      // Countersink: cone widening up to the top face (head dia ≈ 2× shank), so
      // the base is the narrow shank radius and the mouth flares to headR.
      const headR = screwDia;
      const csDepth = Math.min(headR - screwDia / 2, leafThick - 0.4);
      cutters.push(cone(screwDia / 2, headR, csDepth + 0.2, { at: [x, yRow, leafThick - csDepth] }));
    }
    return unwrap(cutAll(solid, cutters));
  };

  const drilledA = drillLeaf(leafA, 1);
  const drilledB = drillLeaf(leafB, -1);

  // Hinge pin: a steel rod through the full barrel, proud a touch at each end.
  const pin = xRod(pinDia / 2, length + 2, 0);

  // Bore the pin clearance through both leaves' knuckles so the rod seats.
  const pinHole = xRod(pinDia / 2 + 0.15, length + 4, 0);

  const boredA = unwrap(cut(drilledA, pinHole));
  const boredB = unwrap(cut(drilledB, pinHole));

  return [boredA, boredB, pin];
}

export default knuckleHinge();