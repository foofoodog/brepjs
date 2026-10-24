import { csg, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';
import { family, el, resolve, evaluateModel, tTranslate, type Element } from 'brepjs-families';

// The starter families, as the registry ships them (npx brepjs add room) with
// one difference: the real files wrap each render in a zod schema that supplies
// defaults and rejects bad dimensions. The playground cannot import zod, so
// every prop a schema would default is spelled out at the call site instead.

const Wall = family<{
  length: number;
  height: number;
  thickness: number;
  at: readonly [number, number, number];
  axisX?: readonly [number, number, number];
  voids?: readonly Element[];
  materialName: string;
}>('Wall', (p) => {
  const alongY = (p.axisX ?? [1, 0, 0])[1] !== 0;
  return el('Box', {
    size: alongY ? [p.thickness, p.length, p.height] : [p.length, p.thickness, p.height],
    voids: p.voids ?? [],
    // A +Y wall's thickness spans world -X (axisY = axisZ x axisX), so the box
    // shifts to coincide with the IFC spec solid.
    transform: [tTranslate(alongY ? [p.at[0] - p.thickness, p.at[1], p.at[2]] : p.at)],
  });
});

const Door = family<{
  width: number;
  height: number;
  at: readonly [number, number];
  depth: number;
  alongY?: boolean;
  materialName: string;
}>(
  'Door',
  (p) =>
    el('Box', {
      size: p.alongY ? [p.depth, p.width, p.height] : [p.width, p.depth, p.height],
      transform: [tTranslate(p.alongY ? [0, p.at[0], p.at[1]] : [p.at[0], 0, p.at[1]])],
    }),
  { role: 'fill' }
);

// A composed family depends on Wall and Door the way a component depends on its
// children, and threads its own placement down to them: element trees carry no
// hierarchical transform, so a Group transform would move the group's geometry
// and leave every wall behind at the origin.
const Room = family<{
  width: number;
  depth: number;
  height: number;
  thickness: number;
  at: readonly [number, number];
  doorWidth: number;
  doorHeight: number;
  materialName: string;
}>('Room', (p) => {
  const w = p.width;
  const d = p.depth;
  const t = p.thickness;
  const x = p.at[0];
  const y = p.at[1];
  const doorAlong = (w - p.doorWidth) / 2; // centered in the south wall
  const shared = { height: p.height, thickness: t, materialName: p.materialName };
  return el('Group', {}, [
    Wall({
      key: 'south',
      ...shared,
      length: w,
      at: [x, y, 0],
      voids: [
        Door({
          key: 'door',
          width: p.doorWidth,
          height: p.doorHeight,
          at: [doorAlong, 0],
          depth: t,
          materialName: 'Timber',
        }),
      ],
    }),
    Wall({ key: 'north', ...shared, length: w, at: [x, y + d - t, 0] }),
    Wall({ key: 'west', ...shared, length: d, at: [x + t, y, 0], axisX: [0, 1, 0] }),
    Wall({ key: 'east', ...shared, length: d, at: [x + w, y, 0], axisX: [0, 1, 0] }),
  ]);
});

const Suite = family<{ items: readonly Element[] }>('Suite', (p) => el('Group', {}, p.items));

const room = {
  depth: 3000,
  height: 2700,
  thickness: 200,
  doorWidth: 900,
  doorHeight: 2100,
  materialName: 'Concrete',
};

const tree = resolve(
  Suite({
    key: 'suite',
    items: [
      Room({ key: 'a', ...room, width: 4000, at: [0, 0] }),
      Room({ key: 'b', ...room, width: 4000, at: [4200, 0] }),
    ],
  })
);

const ev = new csg.Evaluator();
const model = evaluateModel(tree, ev, {}, { shapes: true });

// Key paths compose through the tree: suite/a/south, suite/b/south/voids:door.
const walls = [...model.byKeyPath.values()].flatMap((n) =>
  n.type === 'Wall' && n.shape ? [color(unwrap(n.shape), '#d9d2c4')] : []
);
const doors = [...model.byKeyPath.values()].flatMap((n) =>
  n.type === 'Door' && n.shape ? [color(unwrap(n.shape), '#8b5a2b')] : []
);

export default [...walls, ...doors];
