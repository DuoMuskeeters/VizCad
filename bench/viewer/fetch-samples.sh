#!/bin/sh
# Downloads the benchmark samples into public/samples (git-ignored) and copies the OCCT WASM next to the worker.
# Sources and licences: see docs/10-viewer-engine.md, section "Örnek dosyalar".
set -e
cd "$(dirname "$0")"
mkdir -p public/samples
cp node_modules/occt-import-js/dist/occt-import-js.js node_modules/occt-import-js/dist/occt-import-js.wasm public/
S=public/samples
get() { [ -f "$S/$1" ] || curl -fL --retry 3 -o "$S/$1" "$2"; }

# CAx-IF AS1 assembly with colours (0.4 MB), via the occt-import-js test files.
get as1-oc-214.stp "https://github.com/kovacsv/occt-import-js/raw/0.0.23/test/testfiles/cax-if/as1-oc-214.stp"
# NIST MBE PMI test case FTC-10, AP242 (1.9 MB). NIST, free to use with acknowledgement.
if [ ! -f "$S/nist_ftc_10_asme1_ap242-e2.stp" ]; then
	curl -fL -o /tmp/nist-pmi-step-files.zip "https://www.nist.gov/document/nist-pmi-step-files"
	unzip -j -o /tmp/nist-pmi-step-files.zip "NIST-PMI-STEP-Files/nist_ftc_10_asme1_ap242-e2.stp" -d "$S"
fi
# Voron Design (GPL-3.0): MiniSB Bowden toolhead (13.5 MB) and Stealthburner CW2.5 assembly (39.5 MB).
get MiniSB_Bowden.step "https://github.com/VoronDesign/Voron-0/raw/HEAD/CAD/Bowden%20Toolhead/MiniSB_Bowden.step"
get Stealthburner_CW2.5_Assembly.step "https://github.com/VoronDesign/Voron-Stealthburner/raw/HEAD/CAD/Stealthburner_CW2.5_Assembly.step"
# Optional stress file: Voron 0.2 master assembly (179 MB unzipped). Only with STRESS=1.
if [ "$STRESS" = 1 ] && [ ! -f "$S/V0.2R1_Master_Assembly.step" ]; then
	curl -fL -o /tmp/v0.zip "https://github.com/VoronDesign/Voron-0/raw/HEAD/CAD/V0.2R1_Master_Assembly_STEP.zip"
	unzip -p /tmp/v0.zip "V0.2R1 Master Assembly v63.step" > "$S/V0.2R1_Master_Assembly.step"
fi
# STL: the live site's demo dragon (1.9 MB) and a 20 MB STL generated from the Stealthburner STEP.
cp ../../legacy/public/dragon.stl "$S/dragon.stl"
[ -f "$S/stealthburner.stl" ] || node make-stl.cjs "$S/Stealthburner_CW2.5_Assembly.step" "$S/stealthburner.stl"
ls -la "$S"
