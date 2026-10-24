import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { measureVolume, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// A quantity schedule, computed from the model rather than counted by hand.
// Every element carries a spec and a solid, so net volume comes straight off
// the geometry after openings are cut. Open the console panel for the
// schedule; the Files button saves it as CSV for a takeoff sheet.
const model = new BimModel();
model.init({ name: 'Takeoff demo', projectId: 'takeoff-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Block A' }));
const storeyId = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const L = 8000;
const W = 5000;
const H = 3000;
const T = 250;

const slab = model.addSlab({
  length: L,
  width: W,
  thickness: 300,
  origin: [0, 0, -300],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'FLOOR',
  materialName: 'Concrete C30/37',
});
if (!slab.ok) throw slab.error;
model.placeIn(slab.value, storeyId);

// Four perimeter walls. Front and back run the full length; the sides fit
// between them so the corners meet without doubling up, which would otherwise
// inflate the concrete quantity by two corner volumes.
const wallDefs: {
  origin: [number, number, number];
  axisX: [number, number, number];
  len: number;
}[] = [
  { origin: [0, 0, 0], axisX: [1, 0, 0], len: L },
  { origin: [0, W - T, 0], axisX: [1, 0, 0], len: L },
  { origin: [T, T, 0], axisX: [0, 1, 0], len: W - 2 * T },
  { origin: [L, T, 0], axisX: [0, 1, 0], len: W - 2 * T },
];
const wallIds = wallDefs.map((d) => {
  const wall = model.addWall({
    length: d.len,
    height: H,
    thickness: T,
    origin: d.origin,
    axisX: d.axisX,
    axisZ: [0, 0, 1],
    materialName: 'Concrete C30/37',
    isExternal: true,
  });
  if (!wall.ok) throw wall.error;
  model.placeIn(wall.value, storeyId);
  return wall.value;
});

const door = model.addDoor({
  wallLocalId: wallIds[0],
  width: 1200,
  height: 2400,
  offsetAlongWall: 900,
  offsetFromFloor: 0,
  materialName: 'Timber',
});
if (!door.ok) throw door.error;
model.placeIn(door.value, storeyId);

for (const at of [3200, 5600]) {
  const win = model.addWindow({
    wallLocalId: wallIds[0],
    width: 1600,
    height: 1400,
    offsetAlongWall: at,
    offsetFromFloor: 900,
    materialName: 'Aluminium + Glazing',
  });
  if (!win.ok) throw win.error;
  model.placeIn(win.value, storeyId);
}

const steel = { kind: 'I_BEAM', overallWidth: 180, overallDepth: 360, flangeThickness: 14, webThickness: 9 } as const;
for (const x of [2000, 6000]) {
  const beam = model.addBeam({
    length: W,
    profile: steel,
    origin: [x, 0, H],
    axisX: [0, 1, 0],
    axisZ: [0, 0, 1],
    materialName: 'Steel S355',
  });
  if (!beam.ok) throw beam.error;
  model.placeIn(beam.value, storeyId);
}

// Volume comes from the placed solid, so the openings cut into the front wall
// are already subtracted: this is net quantity, not gross. Group by category
// and material the way a takeoff sheet does.
// placedSolids mints fresh caller-owned solids on every call, so measure and
// display from ONE pass rather than building a throwaway set to measure and a
// second set to show.
const TINT: Record<string, string> = {
  WALL: '#d9d3c7',
  SLAB: '#9a948a',
  BEAM: '#8a99ad',
};
type Row = { category: string; material: string; count: number; m3: number };
const rows = new Map<string, Row>();
const shown = [];
for (const el of model.getAllElements()) {
  // Fillers and spatial containers legitimately have no solid; placedSolids
  // returns an empty list for them rather than an error.
  const solids = unwrap(placedSolids(el));
  if (solids.length === 0) continue;
  const material = (el.spec as { materialName?: string }).materialName ?? '(none)';
  const key = el.category + '|' + material;
  const row = rows.get(key) ?? { category: el.category, material, count: 0, m3: 0 };
  row.count += 1;
  for (const s of solids) {
    // Millimetres in, cubic metres out: 1 m3 is 1e9 mm3.
    row.m3 += unwrap(measureVolume(s)) / 1e9;
    shown.push(color(s, TINT[el.category] ?? '#8b5a2b'));
  }
  rows.set(key, row);
}

const ordered = [...rows.values()].sort((a, b) => b.m3 - a.m3);
console.log('category         material                count      m3');
let total = 0;
for (const r of ordered) {
  total += r.m3;
  console.log(
    r.category.padEnd(17) + r.material.padEnd(24) + String(r.count).padStart(5) + r.m3.toFixed(2).padStart(8)
  );
}
console.log('total concrete + steel volume: ' + total.toFixed(2) + ' m3');

const csv = ['Category,Material,Count,NetVolume_m3']
  .concat(ordered.map((r) => r.category + ',' + r.material + ',' + r.count + ',' + r.m3.toFixed(3)))
  .join(String.fromCharCode(10));

// Playground runtime owns the displayed geometry for this eval.
export default present(shown, {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, {
      applicationName: 'brepjs playground',
      applicationVersion: '1.0',
    });
    if (!r.ok) throw r.error;
    return r.value;
  },
  files: () => [{ name: 'takeoff.csv', data: csv, mime: 'text/csv' }],
});
