import { box, cut, extrude, fuse, polygon, rotate, translate, unwrap } from 'brepjs/quick';
// Sliding dovetail joint: a male tenon and its female socket, the woodworking
// joint that locks two boards together. The tail is a trapezoid WIDER at its
// base than its mouth (slope ~ run:rise, std woodworking 6:1), so it can only
// slide in along Y, never pull straight out. A slight taper narrows the back
// end so the joint slips together loosely then wedges tight at home. The
// socket is the same flare grown by a printing clearance on all three sides.
// Tenon (left) and socket plate (right) are laid out side by side to read as a
// mating pair, exactly how you'd preview the two halves before assembly.
type Dovetail = { width: number; height: number; slide: number; slope: number; taper: number };

// One dovetail prism, base on z=0, mouth at z=height, running along +Y.
// `grow` inflates the flare uniformly (0 for the male tail, the clearance gap
// for the female cavity). Returns an oriented solid centred on the origin in X.
function dovetailPrism({ width, height, slide, slope, taper }: Dovetail, grow: number) {
  const halfTop = width / 2 + grow; // half-width at the mouth (z = height)
  const flare = height / slope; // horizontal run of the flared side over the full height
  const halfBase = halfTop + flare; // half-width at the base — the dovetail's widest line
  const y0 = -slide / 2;

  // Trapezoid cross-section in the X-Z plane (y held at the front face).
  // Base corners sit outboard, mouth corners inboard: the swallowtail flare.
  const profile = unwrap(
    polygon([
      [-halfBase, y0, 0],
      [halfBase, y0, 0],
      [halfTop, y0, height],
      [-halfTop, y0, height],
    ]),
  );
  const prism = unwrap(extrude(profile, [0, slide, 0]));

  if (taper <= 0) return prism;

  // Taper: shave both side walls so the back end (+Y) is narrower than the
  // front, turning the straight tail into a self-wedging one. Cut with two
  // wide slabs rotated about a hinge on each front base corner, so each wall
  // pivots inward toward the back.
  const slabLen = slide * 1.4;
  const wedge = (sign: number) => {
    const slab = box(width, slabLen, height * 3, { at: [sign * width, slide / 2, height / 2] });
    return rotate(slab, -sign * taper, { axis: [0, 0, 1], at: [sign * halfBase, y0, 0] });
  };
  return unwrap(cut(unwrap(cut(prism, wedge(1))), wedge(-1)));
}

function dovetailJoint(
  params: Dovetail = { width: 16, height: 8, slide: 30, slope: 6, taper: 3 },
  plateThickness = 6,
  clearance = 0.2,
) {
  const { width, height, slide } = params;
  const plateW = width + height * 2 + 14; // board wide enough to host the widest base + margin

  // --- Male half: tenon standing proud of its board ---
  const tenon = dovetailPrism(params, 0);
  const malePlate = box(plateW, slide, plateThickness, { at: [0, 0, -plateThickness / 2] });
  const male = unwrap(fuse(malePlate, tenon));

  // --- Female half: socket carved into its board ---
  // Grow the flare by the clearance gap and subtract it from the top of a
  // thicker board, leaving a BLIND dovetail pocket the male tail slides into.
  const cavity = dovetailPrism(params, clearance);
  // The socket board must be thicker than the tail is deep, so a floor remains
  // beneath the pocket. If the cavity reached the underside it would slot
  // clean through and split the board into two loose rails — not a socket.
  const socketThickness = height + 4; // tail depth (height) + a 4 mm floor
  const socketPlate = box(plateW, slide, socketThickness, { at: [0, 0, -socketThickness / 2] });
  // Sink the cavity so its mouth (the narrow z = height end) lands exactly at
  // the board top (z = 0): the opening is flush with the surface and the flare
  // widens downward into the floor, the undercut that traps the tail. Its base
  // (z = -height) stops above the underside (z = -socketThickness), keeping the
  // pocket blind so the board stays a single solid.
  const cavityInPlate = translate(cavity, [0, 0, -height]);
  const female = unwrap(cut(socketPlate, cavityInPlate));

  // Lay the two boards side by side with a gap, like a fit-up preview.
  const offset = plateW / 2 + 6;
  return [
    translate(male, [-offset, 0, 0]),
    translate(female, [offset, 0, 0]),
  ];
}

export default dovetailJoint();