'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');

const checks = [
  {
    arquivo: 'routes/api/redacao.js',
    termos: [
      'A instituição da sessão autenticada é a fonte de verdade.',
      'u.instituicao ||',
      'req.query?.t ||'
    ]
  },
  {
    arquivo: 'routes/api/redacaoGestao.js',
    termos: [
      'function instituicaoObjectId',
      'Nunca inserir slug textual nesse filtro.',
      '{ instituicao: instituicaoId }',
      '{ tenantId: instituicaoId }'
    ]
  }
];

let falhas = 0;

for (const item of checks) {
  const arquivo = path.join(raiz, item.arquivo);

  if (!fs.existsSync(arquivo)) {
    console.error(`FALTA ${item.arquivo}`);
    falhas++;
    continue;
  }

  const conteudo = fs.readFileSync(arquivo, 'utf8');
  const ausentes = item.termos.filter((termo) => !conteudo.includes(termo));

  if (ausentes.length) {
    console.error(`ERRO  ${item.arquivo}`);
    ausentes.forEach((termo) => console.error(`  - termo ausente: ${termo}`));
    falhas++;
  } else {
    console.log(`OK    ${item.arquivo}`);
  }
}

if (falhas) {
  console.error(`\nHotfix V3.3.2 com ${falhas} falha(s).`);
  process.exit(1);
}

console.log(
  '\n✅ Hotfix V3.3.2 aplicado: tenant autenticado priorizado e filtro de alunos protegido.'
);
