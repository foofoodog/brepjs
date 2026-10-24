import { BimModel, countBySeverity, placedSolids, toIfcValidated } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// toIfcValidated exports the model and runs the whole checker suite in one
// call: referential integrity before serializing, then schema, round-trip,
// geometry validity, and the buildingSMART gherkin rules that touch this
// writer's vocabulary. Findings are severity-tagged, never thrown.
//
// Open the console panel below to read the report. web-ifc chatters
// "Attempt to Access Invalid ExpressID" while saving a model that has
// openings; that is its own logging during SaveModel, not a finding.
const model = new BimModel();
model.init({ name: 'Validated building', projectId: 'validation-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const L = 4000;
const W = 3000;
const H = 2700;
const T = 200;

const slab = model.addSlab({
  length: L,
  width: W,
  thickness: 250,
  origin: [0, 0, -250],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'FLOOR',
  materialName: 'Concrete',
});
if (!slab.ok) throw slab.error;
model.placeIn(slab.value, storeyId);

const wall = model.addWall({
  length: L,
  height: H,
  thickness: T,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Concrete',
});
if (!wall.ok) throw wall.error;
model.placeIn(wall.value, storeyId);

const win = model.addWindow({
  wallLocalId: wall.value,
  width: 1200,
  height: 1000,
  offsetAlongWall: 1400,
  offsetFromFloor: 900,
  materialName: 'Aluminium',
});
if (!win.ok) throw win.error;
model.placeIn(win.value, storeyId);

// A severity summary is the useful read. Note what actually blocks: only a
// referential-integrity failure makes toIfcValidated return Err. Schema,
// round-trip, geometry and gherkin findings come back in the report alongside
// usable bytes, so the caller decides whether they are shippable.
// This model deliberately omits a coordinate reference system, so the gherkin
// layer raises GRF003. Passing crs: { name: 'EPSG:25832', eastings: ..., northings: ... }
// to model.init() clears it. A checker that only ever prints zeroes teaches
// nothing about what it checks.
const report = (label, issues) => {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity ] += 1;
  console.log(
    label + ': ' + counts.error + ' errors, ' + counts.warning + ' warnings, ' + counts.info + ' info'
  );
  for (const i of issues.slice(0, 4)) console.log('   [' + i.severity + '] ' + i.code + ' ' + i.message);
};

const ifc4 = await toIfcValidated(model, {
  applicationName: 'brepjs playground',
  applicationVersion: '1.0',
});
if (!ifc4.ok) throw ifc4.error;
report('IFC4', ifc4.value.report.issues);

// The same model against the newer schema: ifcSchema is the only change, and
// the suite runs identically. countBySeverity is the one-line version of the
// tally above.
const ifc4x3 = await toIfcValidated(model, {
  applicationName: 'brepjs playground',
  applicationVersion: '1.0',
  ifcSchema: 'IFC4X3',
});
if (!ifc4x3.ok) throw ifc4x3.error;
const x3 = countBySeverity(ifc4x3.value.report);
console.log('IFC4X3: ' + x3.error + ' errors, ' + x3.warning + ' warnings, ' + x3.info + ' info');

// Playground runtime owns the displayed geometry for this eval.
const walls = model
  .getWalls()
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#d9d3c7'));
const slabs = model
  .getSlabs()
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#9a948a'));

export default present([...walls, ...slabs], {
  bimTree: model.toTreeSummary(),
  ifc: () => ifc4.value.bytes,
  // The Files button saves the full report; the console shows the summary.
  files: () => [
    {
      name: 'validation-report.json',
      data: JSON.stringify({ ifc4: ifc4.value.report.issues, ifc4x3: ifc4x3.value.report.issues }, null, 2),
      mime: 'application/json',
    },
  ],
});
