'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');

const checks = [
  [
    'public/aluno-redacao.html',
    [
      'devolutiva-professor-card',
      'respostaProfessorMeta',
      'respostaProfessorBadge',
      '/css/redacao-devolutiva-professor.css'
    ]
  ],
  [
    'public/aluno-redacao.js',
    [
      'function renderOrientacaoProfessor',
      'Nova orientação',
      'Professor respondeu',
      'axoriin_redacao_orientacao_lida_'
    ]
  ],
  [
    'public/css/redacao-devolutiva-professor.css',
    [
      '.devolutiva-professor-card',
      '.devolutiva-professor-badge',
      '.hist-feedback-tag'
    ]
  ]
];

let falhas = 0;

for (const [rel, termos] of checks) {
  const arquivo = path.join(raiz, rel);

  if (!fs.existsSync(arquivo)) {
    console.error(`FALTA ${rel}`);
    falhas++;
    continue;
  }

  const conteudo = fs.readFileSync(arquivo, 'utf8');
  const ausentes = termos.filter(
    (termo) => !conteudo.includes(termo)
  );

  if (ausentes.length) {
    console.error(`ERRO  ${rel}`);
    ausentes.forEach(
      (termo) => console.error(`  - termo ausente: ${termo}`)
    );
    falhas++;
  } else {
    console.log(`OK    ${rel}`);
  }
}

if (falhas) {
  console.error(`\nPatch V3.3.4 com ${falhas} falha(s).`);
  process.exit(1);
}

console.log(
  '\n✅ Patch V3.3.4 instalado: orientação do professor visível ao aluno de forma compacta.'
);
