import { csg, unwrap } from 'brepjs/quick';
import { family, el, resolve, evaluateModel, tTranslate } from 'brepjs-families';

// Each pier is Translate(Box). The Box subtree hashes identically for all
// twelve, so it materializes once; only the twelve translates are distinct.
const Pier = family<{ at: readonly [number, number, number] }>('Pier', (p) =>
  el('Box', { size: [400, 400, 2800], transform: [tTranslate(p.at)] })
);

const Colonnade = family<{ count: number; spacing: number }>('Colonnade', (p) =>
  el(
    'Group',
    {},
    Array.from({ length: p.count }, (_, i) => Pier({ key: 'p' + i, at: [i * p.spacing, 0, 0] }))
  )
);

const ev = new csg.Evaluator();
const row = evaluateModel(resolve(Colonnade({ key: 'row', count: 12, spacing: 900 })), ev, {}, { shapes: true });
const s1 = ev.cacheStats();
console.log('first eval: ' + s1.misses + ' misses, ' + s1.hits + ' hits, ' + s1.entries + ' cache entries');

// Respace the row: every Translate re-evaluates, the shared box never does.
evaluateModel(resolve(Colonnade({ key: 'row', count: 12, spacing: 1100 })), ev);
const s2 = ev.cacheStats();
console.log('respaced: +' + (s2.misses - s1.misses) + ' misses, +' + (s2.hits - s1.hits) + ' hits (the 400x400x2800 box is a pure hit)');

export default [...row.byKeyPath.values()].flatMap((n) =>
  n.type === 'Pier' && n.shape ? [unwrap(n.shape)] : []
);
