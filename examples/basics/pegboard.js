import { box, cutAll, cylinder, unwrap } from 'brepjs/quick';

// Parametric pegboard: any width × height, fixed 25 mm grid, 6 mm pegs.
function pegboard(cols, rows) {
  const pitch = 25;
  const padding = 12.5;
  const thickness = 6;
  const pegRadius = 3;

  const W = cols * pitch + padding * 2;
  const H = rows * pitch + padding * 2;

  const plate = box(W, H, thickness, { at: [0, 0, thickness / 2] });

  const pegs = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = -W / 2 + padding + i * pitch + pitch / 2;
      const y = -H / 2 + padding + j * pitch + pitch / 2;
      pegs.push(cylinder(pegRadius, thickness + 2, { at: [x, y, -1] }));
    }
  }

  return unwrap(cutAll(plate, pegs));
}

export default pegboard(6, 4);
