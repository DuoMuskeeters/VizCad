# Median per (engine, mode, file) from a results JSON, printed as a Markdown table. Usage: python3 summarize.py results/results-desktop.json
import json, sys, statistics
rows = json.load(open(sys.argv[1]))
cols = sys.argv[2].split(',') if len(sys.argv) > 2 else ['workerTotalMs','wasmHeapMB','ttffMs','buildMs','firstRenderMs','tbtMs','orbitMsPerFrame','pickMs','fastPickMs','sectionMsPerFrame','thumbnailMs','heapAfterLoadMB','drawables','triangles']
groups = {}
for r in rows:
    if r.get('ok'): groups.setdefault((r['file'], r['engine'], r['mode']), []).append(r)
print('| dosya | motor | mod | ' + ' | '.join(cols) + ' |')
print('|' + '---|' * (3 + len(cols)))
for (f, e, m), rs in groups.items():
    vals = []
    for c in cols:
        xs = [r[c] for r in rs if isinstance(r.get(c), (int, float))]
        vals.append('' if not xs else (f'{statistics.median(xs):g}'))
    print(f'| {f} | {e} | {m} | ' + ' | '.join(vals) + ' |')
