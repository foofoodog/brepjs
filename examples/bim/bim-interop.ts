import {
  BimModel,
  checkIds,
  deriveCobieModel,
  newIfcGuid,
  parseIdsXml,
  placedSolids,
  serializeBcfFiles,
  serializeCobieToCsv,
  toIfc,
} from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// IFC carries the model; three sibling formats carry the workflows around it.
// COBie is the handover spreadsheet, IDS is machine-readable requirements, BCF
// is issue exchange. All three key off the same model, and off GlobalIds.
// Console panel shows the results; the Files button saves them.
const model = new BimModel();
model.init({ name: 'Interop demo', projectId: 'interop-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Riverside Block' }));
const storeyId = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const L = 6000;
const W = 4000;
const H = 2700;
const T = 200;

// Two rooms behind one external wall. Spaces are what COBie's Space sheet is
// built from, so a handover export needs them to be real elements.
const rooms = [
  { key: 'Office 01', x: 0, len: 3400 },
  { key: 'Office 02', x: 3600, len: 2400 },
];
for (const r of rooms) {
  const space = model.addSpace({
    name: r.key,
    length: r.len,
    width: W - 2 * T,
    height: H,
    origin: [r.x + T, T, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Air',
  });
  if (!space.ok) throw space.error;
  model.placeIn(space.value, storeyId);
}

const wall = model.addWall({
  length: L,
  height: H,
  thickness: T,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Concrete',
  isExternal: true,
});
if (!wall.ok) throw wall.error;
model.placeIn(wall.value, storeyId);

const bytesResult = await toIfc(model, {
  applicationName: 'brepjs playground',
  applicationVersion: '1.0',
});
if (!bytesResult.ok) throw bytesResult.error;
const bytes = bytesResult.value;

// COBie 2.4: the facility-management view, derived from the spatial structure
// and property sets rather than from geometry.
const cobie = deriveCobieModel(model, {
  contact: { email: 'fm@example.com', givenName: 'Facilities', familyName: 'Team' },
});
const sheets = serializeCobieToCsv(cobie);
console.log('COBie sheets: ' + [...sheets.keys()].join(', '));
console.log(
  '  ' + cobie.space.length + ' spaces, ' + cobie.floor.length + ' floors, ' + cobie.component.length + ' components'
);

// IDS 1.0: a requirement written the way a client would issue it. Applicability
// picks the entities to test, requirements say what they must carry.
// Joined with a space, not a newline: this whole example is itself a template
// literal, so a backslash escape here would be consumed before the example ever
// runs. XML does not care about the whitespace.
const IDS_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<ids xmlns="http://standards.buildingsmart.org/IDS">',
  '  <info><title>External walls declare IsExternal</title></info>',
  '  <specifications>',
  '    <specification name="External walls declare IsExternal" ifcVersion="IFC4">',
  '      <applicability minOccurs="1" maxOccurs="unbounded">',
  '        <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>',
  '      </applicability>',
  '      <requirements>',
  '        <property>',
  '          <propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet>',
  '          <baseName><simpleValue>IsExternal</simpleValue></baseName>',
  '        </property>',
  '      </requirements>',
  '    </specification>',
  '  </specifications>',
  '</ids>',
].join(' ');

const ids = parseIdsXml(IDS_XML);
if (!ids.ok) throw ids.error;
const idsReport = await checkIds(bytes, ids.value);
if (!idsReport.ok) throw idsReport.error;
console.log('IDS: ' + (idsReport.value.pass ? 'PASS' : 'FAIL'));
for (const r of idsReport.value.results) {
  console.log(
    '  ' + r.specificationName + ': ' + r.passedCount + '/' + r.applicableCount + ' applicable entities pass'
  );
}

// BCF 3.0: an issue filed against a specific element by its GlobalId, which is
// why stable ids matter. Zip packaging is the caller's job, so this is the
// unzipped container as a name to contents map.
const wallGuid = model.getWalls()[0].guid;
const bcf = serializeBcfFiles({
  version: { versionId: '3.0' },
  project: { projectId: 'interop-demo', name: 'Riverside Block' },
  topics: [
    {
      guid: newIfcGuid(),
      title: 'Confirm external wall U-value',
      topicType: 'Issue',
      topicStatus: 'Open',
      creationAuthor: 'fm@example.com',
      creationDate: '2026-01-05T09:00:00Z',
      description: 'Pset_WallCommon carries IsExternal but no ThermalTransmittance.',
      comments: [],
      viewpoints: [
        {
          guid: newIfcGuid(),
          components: { selection: [{ ifcGuid: wallGuid }] },
        },
      ],
    },
  ],
});
console.log('BCF container: ' + [...bcf.keys()].join(', '));

// Topic files are nested under the topic guid, so select by suffix rather than
// by position: the container also holds bcf.version and project.bcfp.
const markupKey = [...bcf.keys()].find((k) => k.endsWith('/markup.bcf')) ?? '';

// Playground runtime owns the displayed geometry for this eval.
const walls = model
  .getWalls()
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#d9d3c7'));
const spaces = model
  .getSpaces()
  .flatMap((e) => unwrap(placedSolids(e)))
  .map((s) => color(s, '#4fd1c5'));

export default present([...walls, ...spaces], {
  bimTree: model.toTreeSummary(),
  ifc: () => bytes,
  // A curated few rather than all nine COBie sheets: the Files button saves one
  // file per entry and nobody wants nine clicks' worth of empty sheets.
  files: () => [
    { name: 'cobie-Facility.csv', data: sheets.get('Facility') ?? '', mime: 'text/csv' },
    { name: 'cobie-Space.csv', data: sheets.get('Space') ?? '', mime: 'text/csv' },
    { name: 'markup.bcf', data: bcf.get(markupKey) ?? '', mime: 'application/xml' },
  ],
});
