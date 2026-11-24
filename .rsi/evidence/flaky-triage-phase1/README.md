repro: LOAD=12 N=10 ./.tmp/repro.sh  (12 bash spinners + TMPDIR=$PWD/.tmp npx vitest run test/phase1-dialogue.spec.ts test/triage.spec.ts)
RED 10/10 ; loadavg during runs 19-28 on 6 cores
run1-6,8-10: phase1-dialogue > P0-2 ... > consumes a pending question once ... (1 failed / 78 passed)
run7: 5 failed -> that phase1-dialogue case + triage.spec.ts x4 (steering receipt instead of tier answer)
