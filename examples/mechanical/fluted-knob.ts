import { cone, cylinder, cutAll, cut, rotate, translate, unwrap } from 'brepjs/quick';

// A fluted potentiometer knob: a tapered drum with vertical flutes carved into
// the rim, concave scallops your fingers grip. The cutters are tilted to follow
// the cone slant, so the flutes run the full height instead of fading out near
// the narrow top. A central socket presses onto a shaft.
function flutedKnob(
  height = 18,
  topDiameter = 24,
  bottomDiameter = 30,
  fluteCount = 16,
  fluteDepth = 1.4,
  boreDiameter = 6,
  boreDepth = 12,
) {
  const topR = topDiameter / 2;
  const botR = bottomDiameter / 2;
  const cutterR = 2.2;

  // Tapered drum.
  const core = cone(botR, topR, height, { at: [0, 0, 0] });

  // Surface slant in the (radial, z) plane: direction up the wall and the
  // outward normal. The cutter is laid parallel to the wall, offset out along
  // the normal so it bites the same depth uniformly from base to top.
  const dr = topR - botR; // negative, wall leans inward going up
  const slantLen = Math.hypot(dr, height);
  const nR = height / slantLen; // outward-normal radial component
  const nZ = -dr / slantLen; // outward-normal z component
  const tiltDeg = -Math.atan2(-dr, height) * (180 / Math.PI); // lean top inward
  const offset = cutterR - fluteDepth;
  const cR = (botR + topR) / 2 + nR * offset; // cutter centre radius
  const cZ = height / 2 + nZ * offset; // cutter centre height
  const len = slantLen + 4; // overshoot both ends

  const flutes = [];
  for (let i = 0; i < fluteCount; i++) {
    // Build the cutter centred on the origin, tilt it to the wall slant, push
    // it out to the cutter centre, then swing it round to its azimuth.
    let cutter = cylinder(cutterR, len, { at: [0, 0, -len / 2] });
    cutter = rotate(cutter, tiltDeg, { axis: [0, 1, 0], at: [0, 0, 0] });
    cutter = translate(cutter, [cR, 0, cZ]);
    flutes.push(rotate(cutter, (i * 360) / fluteCount, { axis: [0, 0, 1], at: [0, 0, 0] }));
  }
  const fluted = unwrap(cutAll(core, flutes));

  // Shaft socket: a blind bore rising from the base.
  const socket = cylinder(boreDiameter / 2, boreDepth + 1, { at: [0, 0, -1] });
  return unwrap(cut(fluted, socket));
}

export default flutedKnob();