import json,sys
keys=sys.argv[2].split(',') if len(sys.argv)>2 else ['engine','mode','file','ok','error','gpu','workerTotalMs','wasmHeapMB','ttffMs','buildMs','firstRenderMs','tbtMs','maxLongTaskMs','orbitMsPerFrame','rafFps','pickMs','fastPickPrepareMs','fastPickMs','sectionMsPerFrame','thumbnailMs','thumbnailKB','drawables','triangles','treeNodes','heapAfterLoadMB']
for r in json.load(open(sys.argv[1])): print({k:r.get(k) for k in keys if k in r})
