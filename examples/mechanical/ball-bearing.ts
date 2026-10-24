import { cut, cylinder, rotate, sphere, torus, unwrap } from 'brepjs/quick';
// Deep-groove ball bearing (608 cartridge): bore 8, OD 22, width 7 mm.
// Two steel races each carry a toroidal raceway groove; a ring of chrome balls
// rides on the pitch circle between them. Defaults model a 608; change
// id/od/width for any deep-groove size (629, 6000, 6200, ...).
function ballBearing(
  id: number = 8, // shaft bore diameter (mm)
  od: number = 22, // outer (housing) diameter (mm)
  width: number = 7, // axial width of the cartridge (mm)
) {
  const ri = id / 2; // bore radius
  const ro = od / 2; // outer radius
  const rPitch = (ri + ro) / 2; // ball-track pitch radius
  const ballR = (ro - ri) / 3.5; // ball radius (~2 mm on a 608): big enough to show
  const halfW = width / 2; // races straddle the origin in Z

  // Each race is a flat ring (annulus): inner race fills bore->land, outer race
  // fills land->OD. The two lands stop short of the pitch circle from opposite
  // sides so a gap opens between the rings for the ball track (set just below).
  const ring = (rInner: number, rOuter: number) =>
    unwrap(
      cut(
        cylinder(rOuter, width, { at: [0, 0, -halfW] }),
        cylinder(rInner, width + 2, { at: [0, 0, -halfW - 1] }),
      ),
    );

  // The shared raceway groove: one torus on the pitch circle, slightly proud of
  // the ball so the balls spin with running clearance instead of binding.
  const groove = () => torus(rPitch, ballR * 1.05);

  // The two races stop short of the pitch circle from opposite sides, leaving an
  // annular gap centred on it. The groove (cut from both) hollows a raceway into
  // each gap-facing edge; the balls, parked on the pitch circle, bulge a little
  // past both lands so the ring of balls reads clearly between the two rings.
  const innerLand = rPitch - ballR * 0.5; // inner race's outer edge, below pitch
  const outerLand = rPitch + ballR * 0.5; // outer race's inner edge, above pitch
  const innerRace = unwrap(cut(ring(ri, innerLand), groove()));
  const outerRace = unwrap(cut(ring(outerLand, ro), groove()));

  // Ball complement, spaced ~95% of the way around so neighbours never touch
  // (the real cage holds them apart). Lay one ball out on +X, then swing copies
  // to their azimuths.
  const ballCount = Math.max(6, Math.floor((Math.PI * 2 * rPitch * 0.95) / (ballR * 2)));
  const balls = [];
  for (let i = 0; i < ballCount; i++) {
    const ball = sphere(ballR, { at: [rPitch, 0, 0] });
    balls.push(rotate(ball, (i * 360) / ballCount, { axis: [0, 0, 1] }));
  }

  // Two steel races with a ring of chrome balls riding the pitch circle between them.
  return [innerRace, outerRace, ...balls];
}

export default ballBearing();