import {
  cylinder,
  cone,
  sphere,
  fuse,
  cut,
  intersect,
  chamfer,
  edgeFinder,
  torus,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// Button-top dry cell (AA / 18650 style): a steel can with a crimped-in top
// shoulder, a small rounded positive nub, and a flat negative base. Total length
// includes the terminal. Origin is the cell's centre; everything is one body.
// Defaults model an AA cell: 14.5 mm dia x 50.5 mm overall, 5.5 mm nub, 1 mm proud.
function batteryCell(
  diameter = 14.5, // can outer diameter (mm)
  length = 50.5, // overall length incl. positive terminal (mm)
  posDia = 5.5, // positive nub diameter (mm)
  posHeight = 1, // nub height proud of the can top (mm)
  negDia = 7, // raised negative contact diameter on the base (mm)
) {
  const rCan = diameter / 2;
  const rNub = posDia / 2;
  const half = length / 2;
  const canLen = length - posHeight; // can body spans everything below the nub
  const neckH = Math.min(1.6, canLen * 0.06); // height of the crimped-in top step
  const shoulderR = rNub + 1.2; // flat shoulder radius around the nub

  // Main can: a cylinder whose centre sits posHeight/2 below the origin so its
  // top face lands where the nub begins.
  const canTopZ = half - posHeight;
  const can = cylinder(rCan, canLen, { at: [0, 0, canTopZ - canLen] });

  // Crimped top: a short cone necking the can wall in toward the flat shoulder,
  // overlapped 1 mm into the can so the two read as one rolled rim.
  const neck = cone(rCan, shoulderR, neckH + 1, {
    at: [0, 0, canTopZ - neckH],
  });
  let body = unwrap(fuse(can, neck));

  // Positive nub: a short post sunk 1 mm into the shoulder, then rolled at the
  // top edge by clipping with a sphere whose pole rests on the nub's top face.
  const nubH = posHeight + 1;
  const nubBaseZ = half - posHeight - 1;
  const nub = cylinder(rNub, nubH, { at: [0, 0, nubBaseZ] });
  const r2 = 0.5; // top round-over radius
  const sphereR = (rNub * rNub + r2 * r2) / (2 * r2);
  const roller = sphere(sphereR, { at: [0, 0, half - sphereR] });
  const roundedNub = unwrap(intersect(nub, roller));
  body = unwrap(fuse(body, roundedNub));

  // Negative base: the whole flat can bottom IS the negative terminal — a raised
  // button belongs only on the positive end. Score a shallow concentric insulator
  // ring at the contact-disc edge, the way a real cell's negative end reads.
  const insulatorRing = torus(negDia / 2, 0.4, { at: [0, 0, -half] });
  body = unwrap(cut(body, insulatorRing));

  // Roll the bottom rim of the can: chamfer the circular edge at radius rCan in
  // the z = -half plane (the can-wall-to-base edge). It is a CIRCLE, not a
  // Z-running edge, so select it by its distance from the base-centre point.
  const bottomEdges = edgeFinder().atDistance(rCan, [0, 0, -half]).findAll(body);
  if (bottomEdges.length > 0) {
    const valid = unwrap(validSolid(body));
    body = unwrap(chamfer(valid, bottomEdges, 0.6));
  }

  return body;
}

export default batteryCell();