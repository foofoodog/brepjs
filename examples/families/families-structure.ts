import { csg, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';
import { family, el, resolve, tTranslate, type Element } from 'brepjs-families';
import { familiesToBim, placedSolids, toIfc } from 'brepjs-bim';

// The two-bay frame from the Steel Frame example, authored as a declarative
// tree instead of imperative addBeam/addColumn calls, with a gable roof and a
// switchback stair added. Compare the two: same kind of IFC out, but here every
// member is addressed by key path and its GlobalId survives reordering.
// Renders are the registry starter families
// (npx brepjs add column beam slab roof stair) minus their zod schemas, which
// the playground cannot import.

type Vec3 = readonly [number, number, number];
type Profile =
  | { kind: 'RECTANGULAR'; width: number; height: number }
  | { kind: 'CIRCULAR'; radius: number }
  | {
      kind: 'I_BEAM';
      overallWidth: number;
      overallDepth: number;
      flangeThickness: number;
      webThickness: number;
    };

// Profile outline centred on the member axis, shared by column and beam.
// I-beam outlines skip root fillets: IfcIShapeProfileDef carries filletRadius
// parametrically, so the viewport outline stays sharp.
const profilePoints = (p: Profile): ReadonlyArray<readonly [number, number]> => {
  if (p.kind === 'RECTANGULAR') {
    const hw = p.width / 2;
    const hh = p.height / 2;
    return [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
  }
  if (p.kind === 'CIRCULAR') return [];
  const hw = p.overallWidth / 2;
  const hd = p.overallDepth / 2;
  const hweb = p.webThickness / 2;
  const fi = hd - p.flangeThickness;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, -fi],
    [hweb, -fi],
    [hweb, fi],
    [hw, fi],
    [hw, hd],
    [-hw, hd],
    [-hw, fi],
    [-hweb, fi],
    [-hweb, -fi],
    [-hw, -fi],
  ];
};

// Column: cross-section centred on its placement point, extruded up by height.
const Column = family<{
  height: number;
  profile: Profile;
  at: Vec3;
  materialName: string;
}>('Column', (p) => {
  if (p.profile.kind === 'CIRCULAR') {
    return el('Cylinder', {
      radius: p.profile.radius,
      height: p.height,
      transform: [tTranslate(p.at)],
    });
  }
  const pts = profilePoints(p.profile).map(([px, py]): [number, number, number] => [px, py, 0]);
  return el('Geometry', {
    node: csg.extrude(csg.polygon(pts), [0, 0, p.height]),
    transform: [tTranslate(p.at)],
  });
});

// Beam: cross-section centred on the axis, extruded along axisX by length.
const Beam = family<{
  length: number;
  profile: Profile;
  at: Vec3;
  axisX: Vec3;
  materialName: string;
}>('Beam', (p) => {
  const alongY = p.axisX[1] !== 0;
  // Placement frame per axis: along +X keeps profile-x on +Y; along +Y the
  // placement's local Y is world -X (Z cross axisX), so profile-x flips.
  const toWorld = alongY
    ? ([px, py]: readonly [number, number]): [number, number, number] => [-px, 0, py]
    : ([px, py]: readonly [number, number]): [number, number, number] => [0, px, py];
  const dir: [number, number, number] = alongY ? [0, p.length, 0] : [p.length, 0, 0];
  return el('Geometry', {
    node: csg.extrude(csg.polygon(profilePoints(p.profile).map(toWorld)), dir),
    transform: [tTranslate(p.at)],
  });
});

const Slab = family<{
  length: number;
  width: number;
  thickness: number;
  at: Vec3;
  predefinedType: 'FLOOR' | 'ROOF' | 'LANDING' | 'BASESLAB';
  materialName: string;
}>('Slab', (p) =>
  el('Box', { size: [p.length, p.width, p.thickness], transform: [tTranslate(p.at)] })
);

// Roof: pitched geometry is opt-in via the pitch prop, matching the spec-solid
// rule. The registry roof@1 also builds shed, hip and dome; gable is inlined.
const Roof = family<{
  length: number;
  width: number;
  thickness: number;
  at: Vec3;
  predefinedType: 'GABLE_ROOF';
  pitch: number;
  materialName: string;
}>('Roof', (p) => {
  const ridge = (p.width / 2) * Math.tan((p.pitch * Math.PI) / 180);
  return el('Geometry', {
    node: csg.extrude(
      csg.polygon([
        [0, 0, 0],
        [0, p.width, 0],
        [0, p.width, p.thickness],
        [0, p.width / 2, p.thickness + ridge],
        [0, 0, p.thickness],
      ]),
      [p.length, 0, 0]
    ),
    transform: [tTranslate(p.at)],
  });
});

// Stair: one stepped sawtooth solid per flight, each with its own placement,
// so return and switchback stairs compose from flights facing different ways.
type Flight = {
  width: number;
  riserHeight: number;
  treadLength: number;
  numberOfRisers: number;
  origin: Vec3;
  axisX: Vec3;
  axisZ: Vec3;
  materialName: string;
};
const Stair = family<{ flights: readonly Flight[]; at: Vec3; materialName: string }>(
  'Stair',
  (p) => {
    const flightNode = (f: Flight): csg.IRNode => {
      const ax = f.axisX[0];
      const ay = f.axisX[1];
      // Local +Y (the sweep across the width) = axisZ x axisX.
      const yx = -ay;
      const yy = ax;
      const pts: Array<[number, number, number]> = [[f.origin[0], f.origin[1], f.origin[2]]];
      let x = 0;
      let z = 0;
      for (let i = 0; i < f.numberOfRisers; i++) {
        z += f.riserHeight;
        pts.push([f.origin[0] + x * ax, f.origin[1] + x * ay, f.origin[2] + z]);
        x += f.treadLength;
        pts.push([f.origin[0] + x * ax, f.origin[1] + x * ay, f.origin[2] + z]);
      }
      pts.push([f.origin[0] + x * ax, f.origin[1] + x * ay, f.origin[2]]);
      return csg.extrude(csg.polygon(pts), [yx * f.width, yy * f.width, 0]);
    };
    const nodes = p.flights.map(flightNode);
    const node = nodes.length === 1 && nodes[0] ? nodes[0] : csg.compound(nodes);
    return el('Geometry', { node, transform: [tTranslate(p.at)] });
  }
);

const Storey = family<{ elevation: number; items: readonly Element[] }>('Storey', (p) =>
  el('Group', {}, p.items)
);

const COLS = [0, 3500, 7000];
const ROWS = [0, 3000];
const SPAN_X = 7000;
const SPAN_Y = 3000;
const COL_H = 3200;
const I: Profile = {
  kind: 'I_BEAM',
  overallWidth: 150,
  overallDepth: 200,
  flangeThickness: 12,
  webThickness: 8,
};

const columns = COLS.flatMap((x) =>
  ROWS.map((y) =>
    Column({
      key: 'col-' + x + '-' + y,
      height: COL_H,
      profile: I,
      at: [x, y, 0],
      materialName: 'Steel',
    })
  )
);
// Beams centre on z=COL_H, so the section straddles the column heads.
const beamsX = ROWS.map((y) =>
  Beam({
    key: 'bx-' + y,
    length: SPAN_X,
    profile: I,
    at: [0, y, COL_H],
    axisX: [1, 0, 0],
    materialName: 'Steel',
  })
);
const beamsY = COLS.map((x) =>
  Beam({
    key: 'by-' + x,
    length: SPAN_Y,
    profile: I,
    at: [x, 0, COL_H],
    axisX: [0, 1, 0],
    materialName: 'Steel',
  })
);

const DECK_Z = COL_H + 70;
const DECK_TOP = DECK_Z + 150;
// Nine risers per flight, twice, lands exactly on the deck top.
const RISERS = 9;
const TREAD = 260;
const RISER = DECK_TOP / (2 * RISERS);
const RUN = RISERS * TREAD;
const HALF_Z = RISERS * RISER;

const tree = resolve(
  Storey({
    key: 'level-1',
    elevation: 0,
    items: [
      ...columns,
      ...beamsX,
      ...beamsY,
      // The deck stops short of the west bay, leaving that bay open as the
      // stairwell rather than burying the flights under a solid floor.
      Slab({
        key: 'deck',
        length: SPAN_X - RUN,
        width: SPAN_Y,
        thickness: 150,
        at: [RUN, 0, DECK_Z],
        predefinedType: 'FLOOR',
        materialName: 'Concrete',
      }),
      Roof({
        key: 'roof',
        length: SPAN_X,
        width: SPAN_Y,
        thickness: 150,
        at: [0, 0, DECK_TOP],
        predefinedType: 'GABLE_ROOF',
        pitch: 30,
        materialName: 'Tile',
      }),
      // A switchback in the west bay: flight 1 climbs -X to the half level,
      // flight 2 turns 180 degrees and climbs +X to the deck edge. Per-flight
      // placement is the whole point of the stair mapping. A flight's width
      // sweeps along axisZ x axisX, so a -X flight lays its width on -Y.
      Stair({
        key: 'stair',
        at: [0, 0, 0],
        materialName: 'Concrete',
        flights: [
          // axisZ and materialName are spelled out per flight: registry
          // stair@1 fills them from a zod default and a schema transform, and
          // schema output IS the props the adapter reads. No schema here, so
          // each flight has to arrive spec-complete.
          {
            width: 1100,
            riserHeight: RISER,
            treadLength: TREAD,
            numberOfRisers: RISERS,
            origin: [RUN, 1100, 0],
            axisX: [-1, 0, 0],
            axisZ: [0, 0, 1],
            materialName: 'Concrete',
          },
          {
            width: 1100,
            riserHeight: RISER,
            treadLength: TREAD,
            numberOfRisers: RISERS,
            origin: [0, 1400, HALF_Z],
            axisX: [1, 0, 0],
            axisZ: [0, 0, 1],
            materialName: 'Concrete',
          },
        ],
      }),
    ],
  })
);

// Project onto a BimModel: storey, columns, beams, slab, roof, stair, each
// with a GlobalId derived from its key path.
const projected = familiesToBim(tree, {
  project: { name: 'Declarative steel frame', projectId: 'families-structure' },
  siteName: 'Site',
  buildingName: 'Block A',
});
if (!projected.ok) throw projected.error;
const model = projected.value.model;

const steel = [...model.getColumns(), ...model.getBeams()]
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#8a99ad'));
const concrete = [...model.getSlabs(), ...model.getStairs()]
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#cfcabb'));
const tile = model
  .getRoofs()
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#9c6b52'));

export default present([...steel, ...concrete, ...tile], {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, {
      applicationName: 'brepjs playground',
      applicationVersion: '1.0',
    });
    if (!r.ok) throw r.error;
    return r.value;
  },
});
