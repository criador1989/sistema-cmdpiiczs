'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const obrigatorios = [
  'routes/api/portalAluno.js',
  'services/portalAlunoService.js',
  'public/painel-aluno.html',
  'public/portal-aluno/portal-runtime.js',
  'public/portal-aluno/portal-aluno.js',
  'public/portal-aluno/portal-aluno.css',
  'public/aluno-jogos.html',
  'public/aluno-simulados.html',
  'public/manifest-aluno.json'
];

let falhou = false;
for (const arquivo of obrigatorios) {
  const completo = path.join(raiz, arquivo);
  const existe = fs.existsSync(completo);
  console.log(`${existe ? 'OK ' : 'ERRO'} ${arquivo}`);
  if (!existe) falhou = true;
}

const index = fs.readFileSync(path.join(raiz, 'index.js'), 'utf8');
const marcadores = [
  "require('./routes/api/portalAluno')",
  "mountIf('/api/portal-aluno'",
  "'/aluno-jogos.html'",
  "'/aluno-simulados.html'"
];

for (const marcador of marcadores) {
  const existe = index.includes(marcador);
  console.log(`${existe ? 'OK ' : 'ERRO'} index.js contém ${marcador}`);
  if (!existe) falhou = true;
}

if (falhou) {
  console.error('\nPortal do Aluno incompleto. Revise a instalação.');
  process.exit(1);
}

console.log('\nPortal do Aluno instalado e index.js registrado.');
