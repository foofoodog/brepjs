import {
  box,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// Two-bolt P-clamp (pipe / conduit saddle clamp): a formed-metal strap that
// arches over a round pipe and bolts down through a flat foot on each side.
// The pipe runs along X; the saddle is the top half of a band-thickness tube
// hugging the bore, and the two feet flare out in +/-Y at the base, each with a
// vertical bolt hole. Defaults suit ~20 mm conduit on M6 bolts.
function pClamp({
  pipeDia = 20, // pipe / conduit outer diameter the saddle grips (mm)
  band = 3, // strap thickness, radial (mm)
  width = 14, // strap width along the pipe axis (mm)
  footLength = 16, // how far each bolt foot reaches out past the saddle (mm)
  footThick = 4, // foot slab thickness (mm)
  boltDia = 6.5, // bolt clearance hole diameter, M6 (mm)
  filletR = 2, // radius of the formed bend where saddle meets foot (mm)
} = {}) {
  const pipeR = pipeDia / 2;
  const outerR = pipeR + band; // saddle outer radius

  // Saddle: the top half of a band-thick tube. Build a full tube (outer minus
  // bore cylinder, both along X), then shear off everything below the pipe
  // centreline so only the arching dome remains.
  const tube = unwrap(
    cutAll(cylinder(outerR, width, { axis: [1, 0, 0], at: [-width / 2, 0, 0] }), [
      cylinder(pipeR, width + 2, { axis: [1, 0, 0], at: [-width / 2 - 1, 0, 0] }),
    ]),
  );
  // Remove the lower half (z < 0): a big block sitting just under the centreline.
  const lowerHalf = box(width + 4, (outerR + footLength) * 2 + 4, outerR + 4, {
    at: [0, 0, -(outerR + 4) / 2],
  });
  const saddle = unwrap(cutAll(tube, [lowerHalf]));

  // Two flat bolt feet, one per side, lying at the base (centred on z = 0 so
  // they bite into the saddle wall for a real fused overlap, not a kissed face).
  // Each foot spans from inside the saddle wall outward by footLength.
  const footY0 = pipeR - 1; // start 1 mm inside the wall -> guaranteed overlap
  const footOuter = outerR + footLength;
  const footW = footOuter - footY0;
  const foot = (sign) =>
    box(width, footW, footThick, { at: [0, sign * (footY0 + footW / 2), 0] });

  // Weld the saddle and both feet pairwise (never fuseAll: that would leave
  // three separate solids glued in a compound that falls apart on export).
  let body = unwrap(fuse(saddle, foot(1)));
  body = unwrap(fuse(body, foot(-1)));

  // Soften the inside bends where each foot rolls off the saddle dome, the
  // hallmark of a formed-metal strap. Pick the X-running edges out near the
  // saddle's outer radius at the base.
  const valid = unwrap(validSolid(body));
  const bendEdges = edgeFinder().inDirection('X').atDistance(outerR, [0, 0, 0]).findAll(valid);
  const formed = bendEdges.length > 0 ? unwrap(fillet(valid, bendEdges, filletR)) : valid;

  // Vertical bolt hole through the middle of each foot.
  const boltAt = (outerR + footOuter) / 2; // mid-length of the foot reach
  const bolts = [1, -1].map((s) =>
    cylinder(boltDia / 2, footThick + 2, { at: [0, s * boltAt, -footThick / 2 - 1] }),
  );

  return unwrap(cutAll(formed, bolts));
}

export default pClamp();
