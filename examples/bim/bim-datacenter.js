import { BimModel, countBySeverity, placedSolids, toIfcValidated } from 'brepjs-bim';
import { box, unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// A data hall laid out the way one is actually designed: on the tile grid.
// Hot-aisle containment, N+1 CRAH cooling, A+B power. The console panel runs
// the capacity checks a design review would; Files saves the IFC + schedule.
const model = new BimModel();
model.init({
  name: 'Data Hall 1',
  projectId: 'dc-hall-demo',
  crs: { name: 'EPSG:25832', eastings: 691000, northings: 5335000 },
});

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Campus' }));
const buildingId = unwrap(model.addBuilding({ name: 'DC1' }));
const storeyId = unwrap(model.addStorey({ name: 'Data Hall Level', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

// Design constants. The metric 8-tile pitch closes exactly: 1200 cold aisle +
// 1200 rack + 1200 hot aisle + 1200 rack (the imperial 7-tile pitch needs
// 610 mm tiles). Cold aisle 1.2 m is TIA-942's preferable front clearance.
const TILE = 600; // raised-floor module (24 in grid)
const RF = 600; // raised-floor height: full-depth underfloor supply plenum
const RACK = { w: 600, d: 1200, h: 1991, kW: 8 }; // 42U cabinet; ~8 kW is today's modal density
const ROWS = 4;
const PER_ROW = 10;
const AISLE = 2 * TILE; // cold and hot aisles both two tiles
const BAND = 2 * TILE; // a rack row: 1200 mm deep rack fills its band exactly
const END = 3 * TILE; // service zone at each row end: CRAH + egress clearance
const ROW_LEN = (PER_ROW + 2) * TILE; // 10 racks + a remote power panel at each end
const HALL_X = END + ROW_LEN + END; // 10.8 m — 18 tiles
const HALL_Y = (2 * ROWS + 1) * BAND; // 10.8 m — 4 rack bands + 5 aisles

const ITLOAD_KW = ROWS * PER_ROW * RACK.kW;
const CRAH = { kW: 74.6, airM3h: 15000, w: 2050, d: 890, h: 1970 }; // chilled-water downflow class
const RPP_KVA = 150; // row-end panel; each feed alone carries its row (80 kW at 0.9 pf)
const BUS_A = 250; // track busway, 415 V 3-phase, A + B runs per row

// Structural slab (200 past the hall on the walled sides, so the walls bear on
// it), then the access floor 600 above it.
const base = unwrap(model.addSlab({
  length: HALL_X + 200, width: HALL_Y + 200, thickness: 250, origin: [0, 0, -250],
  axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'BASESLAB', materialName: 'Concrete',
}));
model.placeIn(base, storeyId);
const raised = unwrap(model.addSlab({
  length: HALL_X, width: HALL_Y, thickness: 35, origin: [0, 0, RF - 35],
  axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'FLOOR', materialName: 'Raised access floor',
}));
model.placeIn(raised, storeyId);

// Two of the four hall walls, so the interior stays readable in the viewer.
// Thickness extrudes along axisZ x axisX (+Y for the north wall, -X for the
// east), so both origins put the wall just OUTSIDE the hall footprint, inner
// face flush with the tile field and clear of the raised floor and CRAHs.
const WALL_H = 4400;
for (const d of [
  { origin: [0, HALL_Y, 0] , axisX: [1, 0, 0] , len: HALL_X },
  { origin: [HALL_X + 200, 0, 0] , axisX: [0, 1, 0] , len: HALL_Y },
]) {
  const wall = unwrap(model.addWall({
    length: d.len, height: WALL_H, thickness: 200,
    origin: d.origin, axisX: d.axisX, axisZ: [0, 0, 1], materialName: 'Concrete',
  }));
  model.placeIn(wall, storeyId);
}

// Y bands, 2 tiles each: cold | row | hot | row | cold | row | hot | row | cold.
// Rows alternate facing (TIA-942), so back-to-back pairs share the contained
// hot aisles and every front breathes from a cold aisle.
const bandY = (i) => i * BAND;
const rowBand = (r) => bandY(2 * r + 1);
const facesUp = (r) => r % 2 === 1; // rows A,C front -y; rows B,D front +y
const seq = (n) => Array.from({ length: n }, (_, i) => i);
const rowMidX = END + ROW_LEN / 2;

const addEquip = (
  name, solid, material,
  psets
) => {
  const id = unwrap(model.addProxy({ name, solid, materialName: material, customProperties: psets }));
  model.placeIn(id, storeyId);
  return id;
};

// Racks: row letter + position, dual-corded to the row's A and B feeds. The
// pset records the IFC class a native writer would use for each element.
const racks = seq(ROWS).flatMap((r) => seq(PER_ROW).map((j) => {
  const tag = 'ABCD'[r] + String(j + 1).padStart(2, '0');
  const cx = END + TILE * (1 + j) + TILE / 2;
  const id = addEquip(
    'Rack ' + tag,
    box(RACK.w, RACK.d, RACK.h, { at: [cx, rowBand(r) + BAND / 2, RF + RACK.h / 2] }),
    'Steel, powder coated',
    { DC_Rack: { tag, ifcClass: 'IfcFurniture/TECHNICALCABINET', uHeight: 42,
      designLoadKW: RACK.kW, feedA: 'RPP-0' + (r + 1) + 'A', feedB: 'RPP-0' + (r + 1) + 'B' } }
  );
  return { tag, id };
}));

// Cold aisles get a fully perforated floor: at 8 kW/rack the one-tile-per-rack
// rule of thumb is long broken (a 25%-open tile carries 400-600 CFM, ~3 kW).
// Tiles sit 3 mm proud of the floor plane so they read in the viewer.
const tileIds = [0, 4, 8].flatMap((band) =>
  seq(2 * (PER_ROW + 2)).map((p) => {
    const t = unwrap(model.addCovering({
      length: TILE, width: TILE, thickness: 35,
      origin: [END + TILE * (p % (PER_ROW + 2)), bandY(band) + TILE * Math.floor(p / (PER_ROW + 2)), RF - 32],
      axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'FLOORING',
      materialName: 'Perforated tile, 25% open',
    }));
    model.placeIn(t, storeyId);
    return t;
  }));

// Remote power panels close each row: one floor tile of footprint (ASHRAE
// TC9.9), A feed at the east end, B at the west, so either feed alone carries
// the row when the other is down. Front faces align with the rack fronts.
const rpps = seq(ROWS).flatMap((r) =>
  ([['B', END], ['A', END + ROW_LEN - TILE]] ).map(([feed, x0]) => {
    const tag = 'RPP-0' + (r + 1) + feed;
    const cy = rowBand(r) + (facesUp(r) ? BAND - TILE / 2 : TILE / 2);
    const id = addEquip(
      tag, box(TILE, TILE, 2000, { at: [x0 + TILE / 2, cy, RF + 1000] }),
      'Steel, light grey',
      { DC_RPP: { tag, ifcClass: 'IfcElectricDistributionBoard', ratedKVA: RPP_KVA,
        feed, sourceUPS: 'UPS-' + feed } }
    );
    return { tag, feed, id };
  }));

// Perimeter CRAHs on the row-end walls, discharging into the floor plenum.
// N+1 sizing: five 74.6 kW units carry the 320 kW load, the sixth is spare.
const crahs = [CRAH.d / 2 + 50, HALL_X - CRAH.d / 2 - 50].flatMap((cx, side) =>
  [bandY(2), bandY(4), bandY(6)].map((y0, k) => {
    const tag = 'CRAH-0' + (side * 3 + k + 1);
    const id = addEquip(
      tag, box(CRAH.d, CRAH.w, CRAH.h, { at: [cx, y0 + BAND / 2, RF + CRAH.h / 2] }),
      'Galvanized steel',
      { DC_CRAH: { tag, ifcClass: 'IfcUnitaryEquipment/AIRHANDLER',
        sensibleCoolingKW: CRAH.kW, airflowM3h: CRAH.airM3h, coil: 'Chilled water' } }
    );
    return { tag, id };
  }));

// Overhead, working up from the TIA-942 2.6 m clear-height floor: cabling
// tray at 2.7 m over each row, then the A and B busway runs at 3.2 m.
const trayIds = seq(ROWS).map((r) => addEquip(
  'CT-' + 'ABCD'[r] + '-01',
  box(ROW_LEN, 450, 100, { at: [rowMidX, rowBand(r) + BAND / 2, RF + 2750] }),
  'Galvanized steel',
  { DC_Tray: { tag: 'CT-' + 'ABCD'[r] + '-01', ifcClass: 'IfcCableCarrierSegment/CABLETRAYSEGMENT',
    widthMm: 450, service: 'Structured cabling' } }
));
const buses = seq(ROWS).flatMap((r) =>
  ([['A', 350], ['B', -350]] ).map(([feed, off]) => {
    const tag = 'BB-' + 'ABCD'[r] + '-' + feed;
    const id = addEquip(
      tag, box(ROW_LEN, 160, 150, { at: [rowMidX, rowBand(r) + BAND / 2 + off, RF + 3275] }),
      'Aluminium busway',
      { DC_Busway: { tag, ifcClass: 'IfcCableSegment/BUSBARSEGMENT',
        ratedA: BUS_A, voltageV: 415, feed } }
    );
    return { tag, feed, id };
  }));

// Hot-aisle containment: roof panels at rack-top height plus a door at each
// row end. The cold aisles stay open — the room itself is the cold plenum.
const hacIds = [bandY(2), bandY(6)].flatMap((y0, k) => {
  const tag = 'HAC-' + (k + 1);
  const roof = addEquip(
    tag + ' roof',
    box(ROW_LEN, AISLE, 40, { at: [rowMidX, y0 + AISLE / 2, RF + RACK.h + 20] }),
    'Polycarbonate panel',
    { DC_Containment: { tag, ifcClass: 'IfcPlate', scheme: 'Hot aisle' } }
  );
  const doors = [20, ROW_LEN - 20].map((dx) => addEquip(
    tag + ' door',
    box(40, AISLE, RACK.h, { at: [END + dx, y0 + AISLE / 2, RF + RACK.h / 2] }),
    'Polycarbonate panel',
    { DC_Containment: { tag, ifcClass: 'IfcDoor', scheme: 'Hot aisle', part: 'End door' } }
  ));
  return [roof, ...doors];
});

// Aisles as IfcSpaces (not displayed), named by the rows that bound them and
// grouped into zones; equipment grouped into the systems that serve it.
const aisleSpace = (name, longName, y0, h) => {
  const s = unwrap(model.addSpace({
    name, length: ROW_LEN, width: AISLE, height: h, origin: [END, y0, RF],
    axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Air',
  }));
  model.placeIn(s, storeyId);
  return s;
};
const coldSpaces = [
  aisleSpace('CA-A', 'Cold aisle, row A front', bandY(0), WALL_H - RF),
  aisleSpace('CA-BC', 'Cold aisle between rows B and C', bandY(4), WALL_H - RF),
  aisleSpace('CA-D', 'Cold aisle, row D front', bandY(8), WALL_H - RF),
];
const hotSpaces = [
  aisleSpace('HA-AB', 'Contained hot aisle between rows A and B', bandY(2), RACK.h),
  aisleSpace('HA-CD', 'Contained hot aisle between rows C and D', bandY(6), RACK.h),
];

model.assignToGroup(unwrap(model.addZone({ name: 'Cold Aisles', longName: 'Supply air zone' })), coldSpaces);
model.assignToGroup(unwrap(model.addZone({ name: 'Hot Aisles', longName: 'Return air zone' })), hotSpaces);
const feedIds = (feed) => [...rpps, ...buses].filter((e) => e.feed === feed).map((e) => e.id);
model.assignToGroup(unwrap(model.addSystem({ name: 'Critical Power A' })), feedIds('A'));
model.assignToGroup(unwrap(model.addSystem({ name: 'Critical Power B' })), feedIds('B'));
model.assignToGroup(unwrap(model.addSystem({ name: 'Air Cooling' })),
  [...crahs.map((c) => c.id), ...tileIds, ...hacIds]);
model.assignToGroup(unwrap(model.addSystem({ name: 'Structured Cabling' })), trayIds);
model.assignToGroup(unwrap(model.addSystem({ name: 'IT Equipment' })), racks.map((r) => r.id));

// The checks a design review actually runs, computed off the model. dT 15 K
// is the containment dividend: no bypass air, supply stays in the ASHRAE
// 18-27 C inlet envelope while the return runs hot.
const firmKW = (crahs.length - 1) * CRAH.kW;
const dT = 15;
const reqAirM3h = (ITLOAD_KW * 3600) / (1.2 * 1.005 * dT); // Q = P / (rho cp dT)
const firmAirM3h = (crahs.length - 1) * CRAH.airM3h;
const perTileM3h = reqAirM3h / tileIds.length;
const rowAmps = (PER_ROW * RACK.kW * 1000) / 0.9 / (415 * Math.sqrt(3));
const busContA = 0.8 * BUS_A; // 80% continuous rating
const verdict = (okQ) => (okQ ? ' — ok' : ' — SHORT');
console.log('IT load   ' + racks.length + ' racks x ' + RACK.kW + ' kW = ' + ITLOAD_KW + ' kW');
console.log('cooling   N+1: ' + (crahs.length - 1) + ' of ' + crahs.length + ' CRAH x ' + CRAH.kW +
  ' kW = ' + Math.round(firmKW) + ' kW vs ' + ITLOAD_KW + ' kW' + verdict(firmKW >= ITLOAD_KW));
console.log('airflow   N+1 ' + Math.round(firmAirM3h) + ' m3/h vs ' + Math.round(reqAirM3h) +
  ' m3/h at dT ' + dT + ' K' + verdict(firmAirM3h >= reqAirM3h));
console.log('tiles     ' + tileIds.length + ' perforated, ' + Math.round(perTileM3h) +
  ' m3/h each vs 680-1020 (400-600 CFM) band' + verdict(perTileM3h >= 680 && perTileM3h <= 1020));
console.log('power     row ' + Math.round(rowAmps) + ' A at 0.9 pf vs ' + busContA +
  ' A continuous on each ' + BUS_A + ' A feed' + verdict(rowAmps <= busContA));

const exported = await toIfcValidated(model, {
  applicationName: 'brepjs playground', applicationVersion: '1.0',
});
if (!exported.ok) throw exported.error;
const sev = countBySeverity(exported.value.report);
console.log('IFC4      ' + sev.error + ' errors, ' + sev.warning + ' warnings, ' + sev.info + ' info');

// Equipment schedule the FM team gets on handover.
const schedule = [['Tag', 'Type', 'Rating', 'Feed'].join(',')];
for (const r of racks) schedule.push(r.tag + ',Rack 42U,' + RACK.kW + ' kW,A+B');
for (const p of rpps) schedule.push(p.tag + ',Remote power panel,' + RPP_KVA + ' kVA,' + p.feed);
for (const c of crahs) schedule.push(c.tag + ',CRAH,' + CRAH.kW + ' kW sensible,N+1');
for (const b of buses) schedule.push(b.tag + ',Track busway,' + BUS_A + ' A 415 V,' + b.feed);

// Playground runtime owns the displayed geometry for this eval.
const PALETTE = {
  Concrete: '#c9c4b8', 'Raised access floor': '#c4bfb5', 'Perforated tile, 25% open': '#4f5c73',
  'Steel, powder coated': '#454c56', 'Steel, light grey': '#8b9199', 'Galvanized steel': '#9aa3ab',
  'Polycarbonate panel': '#d9a441',
};
const FEED_TINT = { A: '#b5443c', B: '#3c66b5' };
const busFeed = new Map(buses.map((b) => [b.id, b.feed]));
const shown = model.getAllElements().flatMap((el) => {
  if (el.category === 'SPACE') return []; // aisle volumes would hide the hall
  const mat = (el.spec ).materialName ?? '';
  const feed = busFeed.get(el.localId);
  const css = feed ? FEED_TINT[feed] : (PALETTE[mat] ?? '#8b8b8b');
  return unwrap(placedSolids(el)).map((s) => color(s, css));
});

// Display-only dressing the viewer needs but the model does not: a proud
// front door per rack and a tap-off drop from each busway run every third
// rack. The BIM model stays one element per asset.
const doors = seq(ROWS).flatMap((r) => seq(PER_ROW).map((j) => {
  const cx = END + TILE * (1 + j) + TILE / 2;
  const yFront = rowBand(r) + BAND / 2 + (facesUp(r) ? 1 : -1) * (RACK.d / 2 + 15);
  return color(box(RACK.w - 100, 30, RACK.h - 160, { at: [cx, yFront, RF + RACK.h / 2] }), '#5f6774');
}));
const DROP_H = 3275 - 75 - RACK.h; // busway underside down to the rack top
const drops = seq(ROWS).flatMap((r) =>
  ([['A', 350], ['B', -350]] ).flatMap(([feed, off]) =>
    [0, 3, 6, 9].map((j) => color(
      box(60, 60, DROP_H, {
        at: [END + TILE * (1 + j) + TILE / 2, rowBand(r) + BAND / 2 + off, RF + RACK.h + DROP_H / 2],
      }),
      FEED_TINT[feed]
    ))));

export default present([...shown, ...doors, ...drops], {
  bimTree: model.toTreeSummary(),
  ifc: () => exported.value.bytes,
  files: () => [{ name: 'equipment-schedule.csv', data: schedule.join(String.fromCharCode(10)), mime: 'text/csv' }],
});
