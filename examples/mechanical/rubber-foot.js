import { cone, cylinder, cut, fillet, unwrap, edgeFinder } from 'brepjs/quick';

// Printed rubber foot: a tapered post with rounded rims, a washer recess in the
// underside, and a screw clearance hole. Defaults suit an M4 foot.
function rubberFoot(
  diameter = 25,        // base diameter (mm)
  height = 12,          // total height (mm)
  baseThickness = 3,    // solid material under the screw head (mm)
  slantDeg = 10,        // sidewall taper angle (deg)
  rimRadius = 2,        // rounded-edge radius (mm)
  washerRadius = 4.5,   // washer recess radius (M4)
  clearanceRadius = 2.2, // screw clearance radius (M4)
) {
  const rBottom = diameter / 2;
  const rTop = rBottom - height * Math.tan((slantDeg * Math.PI) / 180); // taper in

  // Tapered body, then soften every rim so it reads as molded, not machined.
  const body = cone(rBottom, rTop, height);
  const rounded = unwrap(fillet(body, edgeFinder().findAll(body), rimRadius));

  // Washer recess bored from the underside, leaving baseThickness of solid.
  const recessHeight = height - baseThickness + 1;
  const recess = cylinder(washerRadius, recessHeight, { at: [0, 0, -1] });
  const hollow = unwrap(cut(rounded, recess));

  // Screw clearance hole through the base.
  const drill = cylinder(clearanceRadius, height + 2, { at: [0, 0, -1] });
  return unwrap(cut(hollow, drill));
}

export default rubberFoot();