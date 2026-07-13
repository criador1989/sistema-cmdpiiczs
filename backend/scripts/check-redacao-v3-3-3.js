'use strict';

const fs = require('fs');
const path = require('path');

const arquivo = path.resolve(
  __dirname,
  '..',
  'routes',
  'api',
  'redacaoGestao.js'
);

if (!fs.existsSync(arquivo)) {
  console.error('FALTA routes/api/redacaoGestao.js');
  process.exit(1);
}

const conteudo = fs.readFileSync(arquivo, 'utf8');

const termos = [
  'Compatibilidade com redações criadas antes do Hotfix V3.3.2',
  'adicionar(req.query?.t);',
  'adicionar(req.query?.tenant);',
  'adicionar(req.tenantSlug);',
  'function instituicaoObjectId'
];

const ausentes = termos.filter(
  (termo) => !conteudo.includes(termo)
);

if (ausentes.length) {
  console.error('ERRO routes/api/redacaoGestao.js');
  ausentes.forEach(
    (termo) => console.error(`  - termo ausente: ${termo}`)
  );
  process.exit(1);
}

console.log('OK    routes/api/redacaoGestao.js');
console.log(
  '\\n✅ Hotfix V3.3.3 aplicado: redações antigas por slug passam a aparecer no painel.'
);
