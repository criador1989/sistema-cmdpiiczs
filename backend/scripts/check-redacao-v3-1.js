'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');

const verificacoes = [
  {
    arquivo: 'services/prompts/redacaoEnemPrompt.js',
    termos: [
      'axoriin-enem-v3.1-calibracao-2026-07',
      'Não exija quantidade fixa de parágrafos',
      'propostaIntervencaoIdentificada',
      'sugestaoAprimoramentoIntervencao'
    ]
  },
  {
    arquivo: 'services/redacaoEnemService.js',
    termos: [
      'propostaIntervencaoIdentificada',
      'sugestaoAprimoramentoIntervencao'
    ]
  },
  {
    arquivo: 'models/RedacaoEnem.js',
    termos: [
      'propostaIntervencaoIdentificada',
      'sugestaoAprimoramentoIntervencao'
    ]
  },
  {
    arquivo: 'public/js/redacao-assistente.js',
    termos: [
      'A estrutura com um desenvolvimento é válida',
      'Texto pronto para a etapa de revisão',
      'Opcional para aprofundar'
    ]
  },
  {
    arquivo: 'public/aluno-redacao.html',
    termos: [
      'Intervenção identificada no texto',
      'Sugestão de aprimoramento da intervenção',
      'focoPrincipalTitulo'
    ]
  },
  {
    arquivo: 'public/aluno-redacao.js',
    termos: [
      'Próximo desafio de aprimoramento',
      'sugestaoAprimoramentoIntervencao'
    ]
  }
];

let falhas = 0;

for (const item of verificacoes) {
  const absoluto = path.join(raiz, item.arquivo);

  if (!fs.existsSync(absoluto)) {
    console.error(`FALTA ${item.arquivo}`);
    falhas++;
    continue;
  }

  const conteudo = fs.readFileSync(absoluto, 'utf8');
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
  console.error(`\nPatch V3.1 com ${falhas} falha(s).`);
  process.exit(1);
}

console.log('\n✅ Patch de calibração Redação ENEM V3.1 instalado e validado.');
