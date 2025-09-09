/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function getCoverage() {
  const covPathJson = path.join(process.cwd(), 'coverage.json');
  if (!fs.existsSync(covPathJson)) {
    throw new Error(`coverage.json not found at ${covPathJson}. Run hardhat coverage first.`);
  }
  const raw = fs.readFileSync(covPathJson, 'utf8');
  return JSON.parse(raw);
}

function pickFile(coverage, relPath) {
  const entry = coverage[relPath];
  if (!entry) {
    const list = Object.keys(coverage).filter(k => k.includes('periphery/'));
    throw new Error(`Coverage entry not found for ${relPath}. Available periphery keys: ${list.slice(0,10).join(', ')} ...`);
  }
  return entry;
}

function checkModule(name, entry) {
  const s = entry.s ? Object.keys(entry.s).length : 0;
  const l = entry.l ? Object.keys(entry.l).length : 0;
  if (!entry || !entry.path) {
    throw new Error(`Invalid coverage entry for ${name}`);
  }
  // Istanbul summary is not provided per-file in coverage.json; derive pct from hit maps
  const statementsCovered = entry.s ? Object.values(entry.s).filter(v => v > 0).length : 0;
  const linesCovered = entry.l ? Object.values(entry.l).filter(v => v > 0).length : 0;
  const sPct = s === 0 ? 100 : (statementsCovered / s) * 100;
  const lPct = l === 0 ? 100 : (linesCovered / l) * 100;
  const pass = sPct >= 90 && lPct >= 90;
  return { sPct, lPct, pass };
}

(function main(){
  const cov = getCoverage();
  const targets = [
    'periphery/PositionStaking.sol',
    'periphery/MigrationManager.sol',
  ];

  let allPass = true;
  const results = {};
  for (const rel of targets) {
    const entry = pickFile(cov, rel);
    const res = checkModule(rel, entry);
    results[rel] = { statements: res.sPct.toFixed(2), lines: res.lPct.toFixed(2), pass: res.pass };
    if (!res.pass) allPass = false;
  }

  if (!allPass) {
    console.error('Module coverage below 90%:', results);
    process.exit(1);
  } else {
    console.log('Module coverage OK (>=90%):', results);
  }
})(); 
