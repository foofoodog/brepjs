import {
  box,
  cone,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// Conduit / cable snap-clip: an open C-ring that snaps over a round cable or
// conduit, standing on a flat screw foot. The ring axis runs along X (the cable
// threads through it); the C opens at the top with two in-turned lips whose gap
// is narrower than the bore, so the cable pushes past them and is captured. A
// rectangular foot carries one countersunk screw hole. Whole part is one solid.
// Defaults suit ~16 mm corrugated conduit (a 16 mm bore, M4 mount).
function conduitClip(
  bore = 16, // captured cable / conduit diameter (mm)
  wall = 2.4, // ring wall thickness (mm)
  width = 12, // axial length of the clip along the cable (mm)
  mouthFrac = 0.62, // opening width as a fraction of bore (< 1 grips the cable)
  footLen = 30, // mounting-foot length across the cable (mm)
  footThick = 3, // mounting-foot slab thickness (mm)
  screwClear = 2.3, // screw clearance-hole radius — M4 (mm)
  screwHead = 4.2, // countersink top radius (mm)
) {
  const rBore = bore / 2;
  const rOuter = rBore + wall;
  const x0 = -width / 2; // ring spans [-width/2, +width/2] along its X axis

  // Ring barrel: an outer cylinder minus the bore, both along X. The ring centre
  // sits one outer-radius above the foot so the foot tucks under it.
  const ringZ = footThick + rOuter; // ring-axis height above the foot underside
  const barrel = cylinder(rOuter, width, { axis: [1, 0, 0], at: [x0, 0, ringZ] });
  const bored = unwrap(
    cut(barrel, cylinder(rBore, width + 2, { axis: [1, 0, 0], at: [x0 - 1, 0, ringZ] })),
  );

  // Open the C at the top: a vertical slot, narrower than the bore, cut from
  // above the ring down to the bore centre. Because the slot is narrower than
  // the bore, two crescent lips are left flanking the mouth — the in-turned
  // catches that snap over and retain the cable.
  const mouthW = bore * mouthFrac;
  const slot = box(width + 2, mouthW, rOuter * 2, {
    at: [0, 0, ringZ + rOuter], // base at the bore centre, rising clear of the top
  });
  const cRing = unwrap(cut(bored, slot));

  // Round the two mouth lips so they read as smooth snap catches, not sharp
  // corners. The X-running edges sitting one bore-radius from the ring axis are
  // the lip tips at the slot walls.
  const ringSolid = unwrap(validSolid(cRing));
  const lipEdges = edgeFinder()
    .inDirection('X')
    .atDistance(rBore, [0, 0, ringZ])
    .findAll(ringSolid);
  const ring =
    lipEdges.length > 0
      ? unwrap(fillet(ringSolid, lipEdges, Math.min(wall * 0.6, mouthW / 4)))
      : ringSolid;

  // Mounting foot: a flat slab under the ring, its top rising 1 mm into the ring
  // wall so the two weld into one solid (a face-tangent foot would float off).
  const foot = box(footLen, width, footThick + 1, {
    at: [0, 0, (footThick + 1) / 2 - 0.5],
  });

  // Pairwise fuse (never fuseAll): the overlapping ring + foot become one body.
  const body = unwrap(fuse(ring, foot));

  // Countersunk screw hole through the foot, parked on the free end so it clears
  // the ring: a straight shank capped by a flaring head cone at the top face.
  const holeX = -(rOuter + (footLen / 2 - rOuter) / 2);
  const footTopZ = footThick + 0.5; // the foot box overlaps 0.5 mm up into the ring
  const shank = cylinder(screwClear, footTopZ + 2, { at: [holeX, 0, -1] });
  const csDepth = Math.min(screwHead - screwClear, footThick - 0.6);
  // Countersink flaring to the head radius right at the real top face, poking
  // 0.4 mm proud so it opens the surface cleanly instead of burying the funnel
  // below it (referencing footThick left a 0.5 mm lip and an internal undercut).
  const csink = cone(screwClear, screwHead, csDepth + 0.4, {
    at: [holeX, 0, footTopZ - csDepth],
  });

  return unwrap(cutAll(body, [shank, csink]));
}

export default conduitClip();
