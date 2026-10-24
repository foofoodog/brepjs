import {
  box,
  chamfer,
  cut,
  cylinder,
  edgeFinder,
  extrude,
  intersect,
  polygon,
  translate,
  unwrap,
} from 'brepjs/quick';

// Interlocking finger-tab split joint: one rigid bar sawn in two across a
// square-wave seam so a too-long print can be split, then snapped back
// together. The mating line is a comb of square fingers (tab width `tab`,
// projection `reach` past the cut plane) that key the halves against sliding;
// a small `slop` on the front half's slots gives a printable press fit. Bar
// runs along X, the seam along the Y = 0 plane; the two halves are returned
// spread apart in Y so you can read the joint.
function fingerSplitJoint({
  length = 90, // bar length along the cut axis (X)
  depth = 34, // total bar depth across the seam (Y)
  height = 16, // bar height (Z)
  tab = 11, // finger / slot width along X
  reach = 7, // how far each finger projects past the seam plane (Y)
  bore = 5, // through-bore radius for a dowel / cable (mm)
  edgeR = 1.4, // chamfer on the long top edges (mm)
  slop = 0.25, // clearance added to the front half's slots (mm)
  spread = 14, // gap the two halves are pulled apart for display (mm)
} = {}) {
  const halfL = length / 2;
  const halfD = depth / 2;

  // --- The full bar, before splitting: a plain block with chamfered top
  //     edges and a bore running the length, so each half shows the cut
  //     surface against a recognizable part rather than a bare cuboid.
  const blank = box(length, depth, height, { at: [0, 0, height / 2] });
  const topEdges = edgeFinder().inDirection('X').findAll(blank);
  const chamfered = unwrap(chamfer(blank, topEdges, edgeR));
  const dowel = cylinder(bore, length + 2, { axis: [1, 0, 0], at: [-halfL - 1, 0, height / 2] });
  const bar = unwrap(cut(chamfered, dowel));

  // --- Seam mask: a closed polygon in XY whose front edge is the square-wave
  //     finger line and whose back edge runs well behind the bar. Extruded up
  //     Z it becomes the prism that owns the BACK half (every finger pokes to
  //     +Y across the seam). `g` (gap, 0 for the back, `slop` for the front)
  //     shifts the wave so the front slots open up for a press fit.
  //
  //     Walk +X across the seam, alternating a tab that reaches +reach into
  //     the back region and a notch that sits flush on the cut plane. An even
  //     finger count keeps the pattern symmetric about the centre.
  const span = length; // pattern covers the whole length
  const fingers = Math.max(2, 2 * Math.round(span / tab / 2));
  const step = span / fingers;

  // The masking prism is built from a polygon laid 1 mm BELOW the bar's base
  // and extruded 1 mm past its top, so its flat top and bottom never sit
  // coplanar with the bar's faces — coincident caps make the seam boolean
  // degenerate and the half come back empty. It straddles the bar in Z and
  // trims cleanly.
  const z0 = -1;
  const prismH = height + 2;
  const seamPrism = (g: number) => {
    const pts: [number, number, number][] = [];
    const back = halfD + 4; // safely past the bar's back face
    // start at the left edge, on the cut plane
    pts.push([-halfL, -g, z0]);
    for (let i = 0; i < fingers; i++) {
      const x0 = -halfL + i * step;
      const x1 = x0 + step;
      if (i % 2 === 0) {
        // a tab: rise to +reach, run across, drop back to the plane
        pts.push([x0, reach - g, z0]);
        pts.push([x1, reach - g, z0]);
      } else {
        // a notch: stay on the cut plane (front half fills this)
        pts.push([x0, -g, z0]);
        pts.push([x1, -g, z0]);
      }
    }
    // close out along the back, well clear of the bar
    pts.push([halfL, back, z0]);
    pts.push([-halfL, back, z0]);
    return unwrap(extrude(unwrap(polygon(pts)), [0, 0, prismH]));
  };

  // Back half: keep only the fingered back side by intersecting with the prism.
  const backHalf = unwrap(intersect(bar, seamPrism(0)));

  // Front half: cut the same wave grown by `slop` (so its slots clear the
  // fingers for a press fit) from the bar, leaving the complementary side.
  const frontHalf = unwrap(cut(bar, seamPrism(slop)));

  // Spread the two mating halves apart in Y for display.
  return [translate(backHalf, [0, spread / 2, 0]), translate(frontHalf, [0, -spread / 2, 0])];
}

export default fingerSplitJoint();