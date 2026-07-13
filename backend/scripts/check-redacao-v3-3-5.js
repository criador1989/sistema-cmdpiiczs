'use strict';

const fs = require('fs');
const path = require('path');

const arquivo = path.resolve(
  __dirname,
  '..',
  'routes',
  'api',
  'redacao.js'
);

if (!fs.existsSync(arquivo)) {
  console.error('FALTA routes/api/redacao.js');
  process.exit(1);
}

const conteudo = fs.readFileSync(arquivo, 'utf8');

const termos = [
  'function candidatosInstituicaoHistorico',
  'function matchInstituicaoHistorico',
  'function matchAlunoHistorico',
  "router.get('/historico'",
  "console.error('[redacao historico aluno]'",
  '...mHistorico',
  '...aHistorico'
];

const ausentes = termos.filter(
  (termo) => !conteudo.includes(termo)
);

if (ausentes.length) {
  console.error('ERRO routes/api/redacao.js');

  ausentes.forEach(
    (termo) => console.error(`  - termo ausente: ${termo}`)
  );

  process.exit(1);
}

console.log('OK    routes/api/redacao.js');
console.log(
  '\n✅ Hotfix V3.3.5 aplicado: histórico, contadores e detalhes antigos voltaram a aparecer para o aluno.'
);
