import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';
import { family, el, resolve, tTranslate, type Element } from 'brepjs-families';
import { familiesToBim, placedSolids, toIfc } from 'brepjs-bim';

// Spec-shaped families: prop names feed the IFC element specs 1:1, so the
// adapter can mint real building elements (walls, slabs, doors, windows).
// These renders match the starter registry (npx brepjs add wall slab door
// window); the registry files additionally wrap each one in a zod schema that
// applies defaults before render. Schema output becomes the element's props,
// which is what the adapter reads, so without zod every spec field has to be
// passed explicitly here.
type Vec3 = readonly [number, number, number];

const Wall = family<{
  length: number;
  height: number;
  thickness: number;
  at: Vec3;
  axisX?: Vec3; // along-wall direction for the IFC spec
  voids?: readonly Element[];
  materialName: string;
  isExternal?: boolean;
  loadBearing?: boolean;
}>('Wall', (p) => {
  const alongY = (p.axisX ?? [1, 0, 0])[1] !== 0;
  return el('Box', {
    size: alongY ? [p.thickness, p.length, p.height] : [p.length, p.thickness, p.height],
    voids: p.voids ?? [],
    // A +Y wall's thickness spans world -X, so the box shifts to coincide
    // with the IFC spec solid.
    transform: [tTranslate(alongY ? [p.at[0] - p.thickness, p.at[1], p.at[2]] : p.at)],
  });
});

type FillProps = {
  width: number;
  height: number;
  at: readonly [number, number]; // [along-wall, sill]
  depth: number;
  alongY?: boolean;
  materialName: string;
  isExternal?: boolean;
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
  at: Vec3;
  predefinedType: 'FLOOR' | 'ROOF' | 'LANDING' | 'BASESLAB';
  materialName: string;
  loadBearing?: boolean;
}>('Slab', (p) => el('Box', { size: [p.length, p.width, p.thickness], transform: [tTranslate(p.at)] }));

const Storey = family<{ elevation: number; items: readonly Element[] }>('Storey', (p) =>
  el('Group', {}, p.items)
);
const Building = family<{ storeys: readonly Element[] }>('Building', (p) =>
  el('Group', {}, p.storeys)
);

const L = 6000;
const W = 4000;
const H = 3000;
const T = 200;
const concrete = { thickness: T, height: H, materialName: 'Concrete', isExternal: true, loadBearing: true };

const tree = resolve(
  Building({
    key: 'demo',
    storeys: [
      Storey({
        key: 'ground',
        elevation: 0,
        items: [
          Wall({
            key: 'south',
            ...concrete,
            length: L,
            at: [0, 0, 0],
            voids: [
              Window({
                key: 'win',
                width: 1500,
                height: 1200,
                at: [2250, 900],
                depth: T,
                materialName: 'Aluminium + Glazing',
                isExternal: true,
              }),
            ],
          }),
          Wall({
            key: 'east',
            ...concrete,
            length: W,
            at: [L, 0, 0],
            axisX: [0, 1, 0],
            voids: [
              Door({
                key: 'entry',
                width: 1000,
                height: 2100,
                at: [1500, 0],
                depth: T,
                alongY: true,
                materialName: 'Timber',
                isExternal: true,
              }),
            ],
          }),
          Slab({
            key: 'floor',
            length: L,
            width: W,
            thickness: 250,
            at: [0, 0, -250],
            predefinedType: 'FLOOR',
            materialName: 'Concrete',
            loadBearing: true,
          }),
        ],
      }),
    ],
  })
);

// Project the tree into an eager BimModel: storeys, walls, slabs, openings,
// psets, materials, and reorder-stable GlobalIds from the key paths.
const projected = familiesToBim(tree, {
  project: { name: 'Families playground demo', projectId: 'families-playground-demo' },
  siteName: 'Site',
  buildingName: 'Block A',
});
if (!projected.ok) throw projected.error;
const model = projected.value.model;

// Walls carry their openings as real holes; door/window elements exist in the
// model as opening fillers (see the BIM panel), without display solids here.
// placedSolids() is what puts each wall where its IFC placement says: the
// adapter folded the family's translate into IfcLocalPlacement, so .geometry
// is the unplaced local solid and reading it would stack the east wall on top
// of the south one.
const walls = model
  .getWalls()
  .flatMap((w) => unwrap(placedSolids(w)))
  .map((s) => color(s, '#cfc4b0'));
const slabs = model
  .getSlabs()
  .flatMap((s) => unwrap(placedSolids(s)))
  .map((s) => color(s, '#8f8f8f'));

// The ifc thunk runs only when you click the IFC download button.
export default present([...walls, ...slabs], {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const result = await toIfc(model, {
      applicationName: 'brepjs playground',
      applicationVersion: '1.0',
    });
    if (!result.ok) throw result.error;
    return result.value;
  },
});
