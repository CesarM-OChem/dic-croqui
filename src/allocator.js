// allocator.js
// Fornece: makeCombinations(factorDefs), allocateTreatments(options)
// options: { treatments, reps, plateSize, seed }
// retorna: { numPlates, plates: [ { plateId, rows, cols, wells:[{index,label,treatment}] } ], mapping:[{treatmentId, factors...}] }

function seededRng(seed) {
  let s = seed >>> 0;
  return function() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function makeCombinations(factors, controls=[]) {
  // factors: [{name, levels: ['a','b',...']}, ...]
  // returns array of objects {id: '001', levels: {...}, label: '...'}
  const lists = factors.map(f => f.levels.slice());
  const names = factors.map(f => f.name);
  if (lists.length === 0) {
    // only controls
    return controls.map((c, i) => ({ id: String(i+1).padStart(3,'0'), label: c, levels:{} }));
  }
  const combos = [];

  function recurse(idx, current) {
    if (idx === lists.length) {
      combos.push(Object.assign({}, current));
      return;
    }
    const levelList = lists[idx];
    const fname = names[idx];
    for (let v of levelList) {
      current[fname] = v;
      recurse(idx+1, current);
    }
    delete current[names[idx]];
  }
  recurse(0, {});
  // map to objects with ids and label
  return combos.map((c, i) => {
    return {
      id: String(i+1).padStart(3,'0'),
      label: Object.values(c).join("|") || "CTRL",
      levels: c
    };
  }).concat(controls.map((c, i) => ({
    id: String(combos.length + i + 1).padStart(3,'0'),
    label: c,
    levels: {}
  })));
}

function plateDims(plateSize) {
  if (plateSize === 24) return { rows:4, cols:6 };
  if (plateSize === 48) return { rows:6, cols:8 };
  if (plateSize === 384) return { rows:16, cols:24 };
  return { rows:8, cols:12 }; // default 96
}

// Helper: produce all well positions across required number of plates
function makePositions(nPlates, rows, cols) {
  const arr = [];
  for (let p = 0; p < nPlates; p++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        arr.push({ plate: p, row: r, col: c, idx: (p*(rows*cols) + r*cols + c) });
      }
    }
  }
  return arr;
}

// adjacency check within same plate (4-neighbors)
function neighbors(rows, cols, pos) {
  const n = [];
  const { row, col } = pos;
  if (row > 0) n.push({ row: row-1, col });
  if (row < rows-1) n.push({ row: row+1, col });
  if (col > 0) n.push({ row, col: col-1 });
  if (col < cols-1) n.push({ row, col: col+1 });
  return n;
}

export function allocateTreatments({ treatments, reps=1, plateSize=96, seed=Date.now() }) {
  // treatments: array of {id,label,levels}
  // returns structure with plates and mapping

  const { rows, cols } = plateDims(plateSize);
  const wellsPerPlate = rows * cols;
  const totalUnits = treatments.length * reps;
  const nPlates = Math.ceil(totalUnits / wellsPerPlate);
  const rng = seededRng(seed >>> 0);

  // build positions list
  const positions = makePositions(nPlates, rows, cols);

  // initial empty assignment
  const assignment = new Array(positions.length).fill(null);

  // build list of treatment instances (each treatment repeated reps times)
  let instances = [];
  treatments.forEach(t => {
    for (let k=0;k<reps;k++) {
      instances.push({ tid: t.id, label: t.label, levels: t.levels });
    }
  });

  // shuffle instances
  for (let i = instances.length -1; i>0; i--) {
    const j = Math.floor(rng() * (i+1));
    [instances[i], instances[j]] = [instances[j], instances[i]];
  }

  // helper to compute plate balance score for a candidate plate for a given instance
  function plateScore(plateIdx, inst, plateCounts) {
    // plateCounts: array of maps level->count for each plate
    // we try to minimize imbalance: compute variance after adding
    let score = 0;
    // for each factor level in inst.levels increment count and compute sum of squared differences across plates
    Object.entries(inst.levels || {}).forEach(([fname, val]) => {
      const counts = plateCounts.map(pc => (pc[fname] && pc[fname][val]) ? pc[fname][val] : 0);
      // simulate adding
      counts[plateIdx] += 1;
      const mean = counts.reduce((a,b)=>a+b,0)/counts.length;
      let ss = 0;
      counts.forEach(x => ss += (x-mean)*(x-mean));
      score += ss;
    });
    // also prefer plates with fewer same-treatment assigned
    return score;
  }

  // initialize plateCounts
  const plateCounts = Array.from({length: nPlates}).map(()=> ({})); // maps: factorName -> {level:count}

  // track which plates have which treatments (for avoiding repeats in same plate)
  const plateHasTreatment = Array.from({length: nPlates}).map(()=> new Set());

  // heuristic assignment:
  // iterate instances and pick best available position:
  //  - prefer plates that don't have that tid yet
  //  - among candidate positions prefer those not adjacent to other same treatment
  //  - prefer plates that minimize imbalance
  // Build an array of available positions and shuffle it for randomness
  const posIndices = positions.map((p, i) => i);
  for (let i = posIndices.length -1; i>0; i--) {
    const j = Math.floor(rng()*(i+1)); [posIndices[i], posIndices[j]] = [posIndices[j], posIndices[i]];
  }

  // helper to find candidate positions for instance
  function findPositionForInstance(inst) {
    // candidates: positions not yet filled
    const candidates = posIndices.filter(pi => assignment[pi] === null);
    // compute per candidate a score
    const scored = [];

    for (let pi of candidates) {
      const pos = positions[pi];
      const pidx = pos.plate;

      // penalize if same treatment already in this plate (we want different plates)
      const hasSame = plateHasTreatment[pidx].has(inst.tid) ? 1 : 0;

      // adjacency penalty: check neighbors within same plate if any assigned with same tid
      let adjPenalty = 0;
      const neighs = neighbors(rows, cols, pos);
      for (let nb of neighs) {
        const nbGlobalIdx = pidx * (rows*cols) + nb.row*cols + nb.col;
        const assigned = assignment[nbGlobalIdx];
        if (assigned && assigned.tid === inst.tid) adjPenalty += 1;
      }

      // plate balance score
      const ps = plateScore(pidx, inst, plateCounts);

      // final combine: prioritize (hasSame minimal), then adjPenalty minimal, then ps minimal
      const final = hasSame*1000 + adjPenalty*50 + ps;
      scored.push({pi, final, pidx, pos});
    }

    // sort by final asc and pick first
    scored.sort((a,b)=> a.final - b.final);
    // take top 12% as tie-breaker and pick random among them for some jitter
    if (scored.length === 0) return null;
    const topN = Math.max(1, Math.floor(scored.length * 0.12));
    const choiceGroup = scored.slice(0, topN);
    const ch = choiceGroup[Math.floor(rng() * choiceGroup.length)];
    return ch.pi;
  }

  // assign instances one-by-one
  for (let inst of instances) {
    const pi = findPositionForInstance(inst);
    if (pi === null) {
      // no position left (shouldn't happen)
      continue;
    }
    assignment[pi] = { tid: inst.tid, label: inst.label, levels: inst.levels };
    const pos = positions[pi];
    const pidx = pos.plate;
    // record plateHasTreatment
    plateHasTreatment[pidx].add(inst.tid);
    // update plateCounts
    Object.entries(inst.levels || {}).forEach(([fname, val]) => {
      if (!plateCounts[pidx][fname]) plateCounts[pidx][fname] = {};
      plateCounts[pidx][fname][val] = (plateCounts[pidx][fname][val]||0) + 1;
    });
  }

  // build plates result
  const plates = [];
  for (let p=0;p<nPlates;p++) {
    const wells = [];
    for (let r=0;r<rows;r++) {
      for (let c=0;c<cols;c++) {
        const globalIdx = p*(rows*cols) + r*cols + c;
        const assigned = assignment[globalIdx];
        wells.push({
          index: r*cols + c,
          row: r, col: c,
          coord: String.fromCharCode(65 + r) + (c+1),
          assigned: assigned ? { tid: assigned.tid, label: assigned.label, levels: assigned.levels } : null
        });
      }
    }
    plates.push({ plateId: p+1, rows, cols, wells });
  }

  // mapping table: unique treatments with levels
  const mapping = treatments.map(t => ({ id: t.id, label: t.label, levels: t.levels }));

  return { numPlates: nPlates, plates, mapping };
}
