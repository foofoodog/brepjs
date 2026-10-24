import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { measureVolume, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// The room programme, not the walls around it. An IfcSpace is a first-class
// element with a name, an area and a volume, and zones group spaces across the
// plan the way a department or a fire compartment does. This is the layer a
// space schedule, an area take, and an energy model all read from.
const model = new BimModel();
model.init({ name: 'Space programme', projectId: 'spaces-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Block A' }));
const storeyId = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const H = 3000;
const T = 150;

// name, x, y, length, depth, department
const PROGRAMME = [
  ['Studio 01', 0, 0, 5200, 4800, 'Workplace'],
  ['Studio 02', 5350, 0, 5200, 4800, 'Workplace'],
  ['Meeting', 0, 4950, 3400, 3200, 'Workplace'],
  ['Kitchen', 3550, 4950, 2600, 3200, 'Amenity'],
  ['WC', 6300, 4950, 1800, 3200, 'Amenity'],
  ['Plant', 8250, 4950, 2300, 3200, 'Service'],
];

const spaceIds = PROGRAMME.map(([name, x, y, len, depth]) => {
  const space = model.addSpace({
    name,
    length: len,
    width: depth,
    height: H,
    origin: [x, y, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Air',
  });
  if (!space.ok) throw space.error;
  model.placeIn(space.value, storeyId);
  return space.value;
});

// Zones cut across the plan: a space belongs to a department regardless of
// where it sits. assignToGroup is the IfcRelAssignsToGroup relationship.
const departments = [...new Set(PROGRAMME.map((p) => p[5]))];
for (const dept of departments) {
  const zone = model.addZone({ name: dept, longName: dept + ' zone' });
  if (!zone.ok) throw zone.error;
  const members = spaceIds.filter((_, i) => PROGRAMME[i][5] === dept);
  model.assignToGroup(zone.value, members);
}

// Dividing walls between the studios and along the back, so the spaces read as
// rooms rather than floating blocks. Wall thickness extrudes along local +Y
// (= axisZ x axisX, which is -X for the Y-running divider), so its origin sits
// on the east edge of the 150 mm gap between the studios.
for (const d of [
  { origin: [5350, 0, 0] , axisX: [0, 1, 0] , len: 4800 },
  { origin: [0, 4800, 0] , axisX: [1, 0, 0] , len: 10550 },
]) {
  const wall = model.addWall({
    length: d.len,
    height: H,
    thickness: T,
    origin: d.origin,
    axisX: d.axisX,
    axisZ: [0, 0, 1],
    materialName: 'Plasterboard',
  });
  if (!wall.ok) throw wall.error;
  model.placeIn(wall.value, storeyId);
}

// The schedule a space plan is actually judged on: area per room, totals per
// department, and the ratio of usable to serviced area.
// Look the programme entry up by the space's own name rather than by position:
// a schedule that depends on insertion order silently mislabels every row the
// day someone reorders the model.
const byName = new Map(PROGRAMME.map((p) => [p[0], p]));
console.log('room          department     area m2   volume m3');
const byDept = new Map();
let totalArea = 0;
const DEPT_TINT = {
  Workplace: '#4fd1c5',
  Amenity: '#f6c177',
  Service: '#c4a7e7',
};
// One pass again: placedSolids allocates on every call, so the solids measured
// for the schedule are the same ones handed to the viewer.
const spaces = [];
for (const el of model.getSpaces()) {
  const name = (el.spec ).name ?? '(unnamed)';
  const entry = byName.get(name);
  if (!entry) continue;
  const area = (entry[3] * entry[4]) / 1e6;
  let vol = 0;
  for (const s of unwrap(placedSolids(el))) {
    vol += unwrap(measureVolume(s)) / 1e9;
    spaces.push(color(s, DEPT_TINT[entry[5]] ?? '#4fd1c5'));
  }
  totalArea += area;
  byDept.set(entry[5], (byDept.get(entry[5]) ?? 0) + area);
  console.log(name.padEnd(14) + entry[5].padEnd(15) + area.toFixed(1).padStart(7) + vol.toFixed(1).padStart(11));
}
console.log('total area ' + totalArea.toFixed(1) + ' m2 across ' + model.getSpaces().length + ' rooms');
for (const [dept, area] of byDept) {
  console.log('  ' + dept.padEnd(12) + area.toFixed(1).padStart(7) + ' m2  (' + ((area / totalArea) * 100).toFixed(0) + '%)');
}

// Playground runtime owns the displayed geometry for this eval.
const walls = model
  .getWalls()
  .flatMap((el) => unwrap(placedSolids(el)))
  .map((s) => color(s, '#d9d3c7'));

export default present([...spaces, ...walls], {
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
