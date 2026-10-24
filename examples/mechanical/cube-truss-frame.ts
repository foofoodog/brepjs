import { cylinder, sphere } from 'brepjs/quick';

// Square-section tubular space frame (like real stage rigging): round chord
// tubes, a Warren zig-zag of web braces, and spherical gusset nodes at each joint.
function cubeTrussFrame({
  segments = 4,
  cube = 30,
  rod = 1.8, // chord + ring tube radius (mm)
  brace = 1.3, // diagonal web-brace radius (mm)
  node = 3, // spherical gusset-node radius (mm)
  bracing = true,
} = {}) {
  const h = cube / 2;
  const y0 = -(segments * cube) / 2; // centre the run about the origin
  const yAt = (j: number) => y0 + j * cube;

  // The four chord corners [x, z] of the cross-section and the edges joining them.
  const c00: [number, number] = [-h, -h];
  const c10: [number, number] = [h, -h];
  const c11: [number, number] = [h, h];
  const c01: [number, number] = [-h, h];
  const corners: [number, number][] = [c00, c10, c11, c01];
  const edges: [[number, number], [number, number]][] = [
    [c00, c10],
    [c10, c11],
    [c11, c01],
    [c01, c00],
  ];
  const at = (xz: [number, number], j: number): [number, number, number] => [xz[0], yAt(j), xz[1]];

  // A round member from a to b: a cylinder oriented along a→b (axis option, no rotate).
  const strut = (a: [number, number, number], b: [number, number, number], r: number) => {
    const d: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    return cylinder(r, len, { at: a, axis: [d[0] / len, d[1] / len, d[2] / len] });
  };

  const members = [];

  // Chords along each corner line, then a ring of transverse tubes at every station.
  for (let j = 0; j < segments; j++) {
    for (const c of corners) members.push(strut(at(c, j), at(c, j + 1), rod));
  }
  for (let j = 0; j <= segments; j++) {
    for (const [a, b] of edges) members.push(strut(at(a, j), at(b, j), rod));
  }

  // One web brace per side face per bay, flipped each bay so they zig-zag (Warren).
  if (bracing) {
    for (let j = 0; j < segments; j++) {
      const up = j % 2 === 0;
      for (const [a, b] of edges) {
        const p1 = up ? at(a, j) : at(a, j + 1);
        const p2 = up ? at(b, j + 1) : at(b, j);
        members.push(strut(p1, p2, brace));
      }
    }
  }

  // Gusset nodes at every joint.
  const nodes = [];
  for (let j = 0; j <= segments; j++) {
    for (const c of corners) nodes.push(sphere(node, { at: at(c, j) }));
  }

  return [...members, ...nodes];
}

export default cubeTrussFrame();