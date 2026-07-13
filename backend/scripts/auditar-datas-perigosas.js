'use strict';

/**
 * Varre o projeto procurando padrões que costumam causar erro de "data voltando um dia".
 * Uso: node scripts/auditar-datas-perigosas.js
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const exts = new Set(['.js', '.html', '.ejs', '.hbs', '.jsx', '.ts', '.tsx']);
const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'uploads', 'tmp', 'logs']);

const patterns = [
  { name: 'new Date(...)', re: /new\s+Date\s*\(/ },
  { name: 'toISOString()', re: /\.toISOString\s*\(/ },
  { name: 'split("T")/split(\'T\')', re: /\.split\s*\(\s*['"]T['"]\s*\)/ },
  { name: 'Date.parse(...)', re: /Date\.parse\s*\(/ },
  { name: 'toLocaleDateString(...)', re: /\.toLocaleDateString\s*\(/ },
  { name: 'input type="date"', re: /type\s*=\s*['"]date['"]/i },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoreDirs.has(entry.name)) walk(path.join(dir, entry.name), out);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (exts.has(ext)) out.push(path.join(dir, entry.name));
  }
  return out;
}

const files = walk(root);
let total = 0;

console.log(`Auditando datas em: ${root}`);
console.log('Procure principalmente usos com campos de calendário, filtros, nascimento, documentos e relatórios.\n');

for (const file of files) {
  const rel = path.relative(root, file);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const hits = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) return;
    for (const p of patterns) {
      if (p.re.test(line)) hits.push({ line: idx + 1, pattern: p.name, code: trimmed.slice(0, 220) });
    }
  });

  if (hits.length) {
    console.log(`\n${rel}`);
    for (const h of hits) {
      total += 1;
      console.log(`  L${h.line} [${h.pattern}] ${h.code}`);
    }
  }
}

console.log(`\nTotal de pontos para revisar: ${total}`);
console.log('\nPadrão seguro: para data de calendário, trafegue YYYY-MM-DD e use utils/dateOnly.js ou public/js/dateOnly.js.');
