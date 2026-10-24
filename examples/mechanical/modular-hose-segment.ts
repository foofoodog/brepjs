import {
  cone,
  cut,
  cutAll,
  cylinder,
  fuse,
  intersect,
  rotate,
  sphere,
  translate,
  unwrap,
} from 'brepjs/quick';

// Loc-Line style modular coolant-hose segment: a ball end (bottom) snapping
// into the socket cup (top) of the next link, joined by a slim waist. One
// rigid, hollow body — coolant flows straight up the central bore. Defaults
// model the common 1/4" line: 4.9 mm ball radius, 3.0 mm through-bore.
function modularHoseSegment(
  ballRadius = 4.9,
  boreRadius = 1.5,
  waistRadius = 2.65,
  segmentLength = 14,
  slotCount = 4,
) {
  const wall = 1.4; // socket shell thickness around the captured ball
  const socketR = ballRadius + wall; // outer radius of the cup
  const ballCenterZ = ballRadius * 0.7; // sphere pulled down so its base truncates flat
  const waistTop = ballRadius * 1.35; // where the waist blends into the socket body
  const socketBaseZ = waistTop - 1; // socket cylinder swallows the waist top
  const seatBottomZ = socketBaseZ + 1.2; // solid floor under the seat keeps the ball attached
  const seatR = ballRadius + 0.25; // cavity a hair larger than a mating ball
  const socketSeatZ = seatBottomZ + seatR; // seat centre, so the cavity bottoms out on the floor

  // --- Ball end: a sphere truncated to a flat neck on the bottom -----------
  // Intersect with a tall cylinder so the south pole becomes a clean disc the
  // bore can break through, leaving the recognizable spherical knuckle.
  const ballSphere = sphere(ballRadius, { at: [0, 0, ballCenterZ] });
  const ballClip = cylinder(ballRadius + 0.2, ballRadius * 1.7, {
    at: [0, 0, 0],
  });
  let body = unwrap(intersect(ballSphere, ballClip));

  // --- Waist: slim neck rising off the ball toward the socket --------------
  const waist = cylinder(waistRadius, waistTop + 1.5, {
    at: [0, 0, ballRadius - 0.5],
  });
  body = unwrap(fuse(body, waist));

  // --- Socket housing: the cup that grabs the next link's ball -------------
  // A cylinder whose base overlaps the waist so the part stays one solid; its
  // cavity is hollowed out above a solid floor.
  const socket = cylinder(socketR, segmentLength - socketBaseZ, {
    at: [0, 0, socketBaseZ],
  });
  body = unwrap(fuse(body, socket));

  // --- Hollow the socket: spherical seat + flared mouth --------------------
  // The seat is a sphere a hair larger than the mating ball; the mouth is a
  // cone opening upward so a ball can snap in and pivot. The seat bottoms out
  // on a solid floor, leaving the ball+waist connected to the cup walls.
  const seat = sphere(seatR, { at: [0, 0, socketSeatZ] });
  const mouth = cone(ballRadius - 0.6, socketR + 0.5, ballRadius * 1.1, {
    at: [0, 0, socketSeatZ],
  });
  body = unwrap(cut(body, seat));
  body = unwrap(cut(body, mouth));

  // --- Coolant through-bore: straight up the spine -------------------------
  const bore = cylinder(boreRadius, segmentLength + 4, { at: [0, 0, -2] });
  body = unwrap(cut(body, bore));

  // --- Flex slots in the socket wall ---------------------------------------
  // Radial slabs cut through the cup walls give the segment its springy grip
  // and the unmistakable Loc-Line silhouette.
  const slotZ = (socketSeatZ + segmentLength) / 2;
  const slots = [];
  for (let i = 0; i < slotCount; i++) {
    const angle = (360 / slotCount) * i;
    const slab = cylinder(0.7, socketR * 2.4, {
      at: [0, 0, slotZ],
      axis: [1, 0, 0],
    });
    slots.push(rotate(translate(slab, [-socketR * 1.2, 0, 0]), angle, { axis: [0, 0, 1] }));
  }
  body = unwrap(cutAll(body, slots));

  return body;
}

export default modularHoseSegment();