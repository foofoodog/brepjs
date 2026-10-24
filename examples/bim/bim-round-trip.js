import { BimModel, disposeImportedModel, fromIfc, toIfc } from 'brepjs-bim';
import { clone, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Export to IFC, then read the file straight back with fromIfc and render what
// came back. Open the console panel below for the element and fidelity counts.
// Nothing on screen is the original geometry: every solid here was
// reconstructed from the exported file's IfcExtrudedAreaSolid definitions, so
// if the writer and importer disagreed you would see it immediately.
const model = new BimModel();
model.init({ name: 'Round trip', projectId: 'round-trip-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const L = 5000;
const W = 3600;
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

// Two walls meeting at a corner, so a placement error in either direction
// shows up as a gap or an overlap rather than hiding at the origin.
const defs = [
  { origin: [0, 0, 0], axisX: [1, 0, 0], len: L },
  { origin: [L, 0, 0], axisX: [0, 1, 0], len: W },
];
const walls = defs.map((d) => {
  const wall = model.addWall({
    length: d.len,
    height: H,
    thickness: T,
    origin: d.origin,
    axisX: d.axisX,
    axisZ: [0, 0, 1],
    materialName: 'Concrete',
  });
  if (!wall.ok) throw wall.error;
  model.placeIn(wall.value, storeyId);
  return wall.value;
});

const door = model.addDoor({
  wallLocalId: walls[0],
  width: 1000,
  height: 2100,
  offsetAlongWall: 1600,
  offsetFromFloor: 0,
  materialName: 'Timber',
});
if (!door.ok) throw door.error;
model.placeIn(door.value, storeyId);

const exported = await toIfc(model, {
  applicationName: 'brepjs playground',
  applicationVersion: '1.0',
});
if (!exported.ok) throw exported.error;
const bytes = exported.value;

const imported = await fromIfc(bytes);
if (!imported.ok) throw imported.error;
const back = imported.value;

console.log('exported ' + bytes.length + ' bytes, schema ' + back.schema);
console.log('read back ' + back.elements.length + ' elements');

// Geometry fidelity is reported per element. PARAMETRIC means the importer
// rebuilt a real B-Rep solid from the profile and extrusion in the file, not a
// mesh; TESSELLATED_LOSSY would mean triangles only, with no solid to show.
const byFidelity = new Map();
for (const e of back.elements) {
  byFidelity.set(e.geometry.fidelity, (byFidelity.get(e.geometry.fidelity) ?? 0) + 1);
}
for (const [f, n] of byFidelity) console.log('  ' + f + ': ' + n);

// GlobalIds are the identity contract across the boundary: every id the writer
// minted must come back naming the same element.
const original = new Set(model.getAllElements().map((e) => e.guid));
const survived = back.elements.filter((e) => original.has(e.guid)).length;
console.log(survived + ' of ' + back.elements.length + ' imported GlobalIds match the source model');

// The imported solids, not the originals. An ImportedModel pins kernel memory
// for every element it read, including the openings filtered out above, and
// those have no other release path. So clone what gets displayed, hand the
// clones to the runtime, and release the imported model here the way a real
// app would.
const PALETTE = {
  WALL: '#d9d3c7',
  SLAB: '#9a948a',
  DOOR: '#8b5a2b',
};
// Openings come back as elements with their own solid (the void box). They are
// holes, not things to draw, so they are filtered out here exactly as the
// direct-API examples never display them.
const shown = back.elements.flatMap((e) =>
  e.category !== 'OPENING' && e.geometry.solid
    ? [color(unwrap(clone(e.geometry.solid)), PALETTE[e.category] ?? '#8a99ad')]
    : []
);
disposeImportedModel(back);

export default present(shown, {
  bimTree: model.toTreeSummary(),
  ifc: () => bytes,
});
