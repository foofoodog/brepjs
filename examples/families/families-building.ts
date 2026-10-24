import { csg, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';
import { family, el, resolve, evaluateModel, tTranslate, type Element } from 'brepjs-families';

// Families are typed constructors returning elements; rendering happens inside
// resolve(). Keys become order-independent key paths: reorder siblings and
// every element keeps its identity (the property IFC GlobalIds derive from).
const Wall = family<{
  length: number;
  height: number;
  thickness: number;
  at: readonly [number, number, number];
  alongY?: boolean;
  voids?: readonly Element[];
}>('Wall', (p) =>
  el('Box', {
    size: p.alongY ? [p.thickness, p.length, p.height] : [p.length, p.thickness, p.height],
    voids: p.voids ?? [],
    transform: [tTranslate(p.at)],
  })
);

// role:'fill' makes an element placed in a wall's voids a synthesized Opening
// with a Fills relationship, not just a cut. Position is wall-local.
type FillProps = {
  width: number;
  height: number;
  at: readonly [number, number]; // [along-wall, sill]
  depth: number;
  alongY?: boolean;
};
const fillBox = (p: FillProps): Element =>
  el('Box', {
    size: p.alongY ? [p.depth, p.width, p.height] : [p.width, p.depth, p.height],
    transform: [tTranslate(p.alongY ? [0, p.at[0], p.at[1]] : [p.at[0], 0, p.at[1]])],
  });
const Door = family<FillProps>('Door', fillBox, { role: 'fill' });
const Window = family<FillProps>('Window', fillBox, { role: 'fill' });

const Slab = family<{
  length: number;
  width: number;
  thickness: number;
  at: readonly [number, number, number];
}>('Slab', (p) => el('Box', { size: [p.length, p.width, p.thickness], transform: [tTranslate(p.at)] }));

const Storey = family<{ items: readonly Element[] }>('Storey', (p) => el('Group', {}, p.items));

const L = 6000; // room length
const W = 4000; // room width
const H = 3000; // wall height
const T = 200; // wall thickness

const tree = resolve(
  Storey({
    key: 'ground',
    items: [
      Wall({
        key: 'south',
        length: L,
        height: H,
        thickness: T,
        at: [0, 0, 0],
        voids: [
          Door({ key: 'entry', width: 1000, height: 2100, at: [1200, 0], depth: T }),
          Window({ key: 'win', width: 1500, height: 1200, at: [3600, 900], depth: T }),
        ],
      }),
      Wall({ key: 'north', length: L, height: H, thickness: T, at: [0, W - T, 0] }),
      Wall({ key: 'east', length: W, height: H, thickness: T, at: [L - T, 0, 0], alongY: true }),
      Wall({ key: 'west', length: W, height: H, thickness: T, at: [0, 0, 0], alongY: true }),
      Slab({ key: 'floor', length: L, width: W, thickness: 250, at: [0, 0, -250] }),
    ],
  })
);

// Materialize against the content-addressed evaluator; shapes are opt-in.
const ev = new csg.Evaluator();
const model = evaluateModel(tree, ev, {}, { shapes: true });

// byKeyPath is the identity axis: stable addresses instead of array indices.
// Void slots path as host/voids:slot; the filling element is its /fill child.
if (!model.byKeyPath.has('ground/south/voids:entry/fill')) throw new Error('door missing');

// Render by iterating that same axis and coloring by element type — add a
// wall above and it shows up here untouched. Opening nodes are skipped:
// their geometry is the fill's cut body, already rendered as Door/Window.
const COLORS: Record<string, string> = {
  Wall: '#cfc4b0',
  Slab: '#8f8f8f',
  Door: '#8b5a2b',
  Window: '#7ec8e3',
};

export default [...model.byKeyPath.values()].flatMap((n) => {
  const css = COLORS[n.type];
  return css && n.shape ? [color(unwrap(n.shape), css)] : [];
});
