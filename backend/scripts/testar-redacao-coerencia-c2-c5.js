'use strict';

const assert = require('assert');
const {
  prepararMarcadoresValidados,
  nivelC2,
  nivelC3,
  nivelC4,
  nivelC5,
  VERSAO_VALIDACAO
} = require('../services/enem/redacaoCoerencia2025');

function preparar(redacaoAluno, marcadoresGrade, temaTitulo = 'Desafios para fortalecer uma cultura de paz e prevenir o bullying nas escolas brasileiras') {
  return prepararMarcadoresValidados({
    raw: {},
    marcadoresGrade: {
      c1: {}, c2: {}, c3: {}, c4: {}, c5: {},
      ...marcadoresGrade
    },
    contexto: { redacaoAluno, temaTitulo, proposta: '', textosMotivadores: [] }
  });
}

function c2Base(overrides = {}) {
  return {
    abordagemTema: 'completa',
    tipoTextual: 'dissertativo_argumentativo',
    partesReconheciveis: 3,
    partesEmbrionarias: 0,
    copiaMotivadores: 'nenhuma',
    repertorioIdentificado: '',
    repertorioEvidenciaLiteral: '',
    repertorioArticulacaoEvidenciaLiteral: '',
    repertorioOrigem: 'nenhum',
    repertorioTipo: 'nenhum',
    repertorioLegitimado: false,
    repertorioPertinente: false,
    repertorioProdutivo: false,
    ...overrides
  };
}

const redacaoBoa = `A convivência escolar deveria contribuir não apenas para a formação acadêmica, mas também para o desenvolvimento social dos estudantes. Entretanto, a permanência de práticas de intimidação, humilhação e exclusão demonstra que o bullying ainda representa um obstáculo para a construção de ambientes escolares seguros no Brasil. Nesse cenário, fortalecer uma cultura de paz exige enfrentar tanto a naturalização das agressões entre estudantes quanto a insuficiência de ações educativas permanentes voltadas à convivência respeitosa.

Segundo o sociólogo Pierre Bourdieu, determinadas formas de violência podem ser naturalizadas dentro das relações sociais, tornando-se menos perceptíveis para aqueles que convivem com elas. Essa reflexão ajuda a compreender o bullying no ambiente escolar, pois ofensas, apelidos depreciativos e exclusões muitas vezes são tratados como simples brincadeiras. Quando esse comportamento é normalizado por colegas ou até minimizado pelos adultos, a vítima pode sentir-se desamparada e o agressor tende a interpretar a ausência de reação como aceitação de sua conduta. Dessa forma, romper com essa naturalização é indispensável para a construção de uma cultura de paz.

Além disso, a própria legislação brasileira evidencia que a prevenção da violência escolar deve ocorrer de maneira contínua. A Lei nº 13.185/2015 instituiu o Programa de Combate à Intimidação Sistemática e prevê medidas de prevenção e conscientização relacionadas ao bullying. Contudo, a existência de uma norma não garante, por si só, a transformação das relações dentro das escolas. É necessário que os princípios previstos na legislação sejam incorporados ao cotidiano escolar por meio de debates, acompanhamento pedagógico e participação das famílias, para que os estudantes aprendam a reconhecer conflitos e resolvê-los sem recorrer à violência.

Portanto, as escolas brasileiras, com apoio das secretarias de educação, devem desenvolver programas permanentes de promoção da cultura de paz, por meio de rodas de conversa, atividades formativas e projetos de mediação de conflitos conduzidos por equipes pedagógicas capacitadas. Paralelamente, as instituições devem criar canais seguros de acolhimento e denúncia, além de envolver as famílias em ações de orientação sobre bullying e convivência respeitosa. Com essas medidas, será possível reduzir a naturalização das agressões, ampliar a proteção aos estudantes e transformar a escola em um espaço efetivamente baseado no diálogo e no respeito.`;

const testes = [];
function teste(nome, fn) { testes.push({ nome, fn }); }

teste('C2 recupera Pierre Bourdieu e confirma produtividade mesmo se a IA omitir o repertório', () => {
  const out = preparar(redacaoBoa, { c2: c2Base() }).c2;
  assert.strictEqual(out.repertorioIdentificado, 'Pierre Bourdieu');
  assert.strictEqual(out.repertorioLegitimado, true);
  assert.strictEqual(out.repertorioPertinente, true);
  assert.strictEqual(out.repertorioProdutivo, true);
  assert.strictEqual(nivelC2(out), 5);
});

teste('C2 preserva referência numérica completa como Lei nº 13.185/2015', () => {
  const texto = `O bullying exige prevenção contínua.\n\nA Lei nº 13.185/2015 instituiu o Programa de Combate à Intimidação Sistemática e prevê medidas de prevenção relacionadas ao bullying. Contudo, a existência da norma não garante, por si só, a transformação das relações escolares. Por isso, as escolas precisam incorporar essas medidas ao cotidiano.\n\nPortanto, é necessário agir.`;
  const out = preparar(texto, { c2: c2Base() }, 'Prevenção do bullying nas escolas brasileiras').c2;
  assert.strictEqual(out.repertorioIdentificado, 'Lei nº 13.185/2015');
  assert.strictEqual(out.repertorioProdutivo, true);
  assert.strictEqual(nivelC2(out), 5);
});

teste('C2 sem repertório legitimado continua no nível 3 e não é inflada', () => {
  const texto = `O bullying prejudica os estudantes e precisa ser combatido.\n\nMuitos alunos sofrem agressões e isso causa tristeza e isolamento. A escola precisa observar esses casos e conversar com os envolvidos.\n\nPortanto, é necessário promover ações educativas.`;
  const out = preparar(texto, { c2: c2Base() }).c2;
  assert.strictEqual(out.repertorioLegitimado, false);
  assert.strictEqual(nivelC2(out), 3);
});

teste('C3 nível 5 não depende de quatro evidências de desenvolvimento nem de duas relações tese-argumentos', () => {
  const c3 = {
    projetoTexto: 'estrategico', desenvolvimento: 'completo', contradicaoGrave: false,
    contradicaoEvidenciaLiteral: '', lacunasEvidencias: [],
    teseEvidenciaLiteral: 'Nesse cenário, fortalecer uma cultura de paz exige enfrentar tanto a naturalização das agressões entre estudantes quanto a insuficiência de ações educativas permanentes voltadas à convivência respeitosa.',
    projetoTextoEvidencias: [
      'Nesse cenário, fortalecer uma cultura de paz exige enfrentar tanto a naturalização das agressões entre estudantes quanto a insuficiência de ações educativas permanentes voltadas à convivência respeitosa.',
      'Além disso, a própria legislação brasileira evidencia que a prevenção da violência escolar deve ocorrer de maneira contínua.',
      'Portanto, as escolas brasileiras, com apoio das secretarias de educação, devem desenvolver programas permanentes de promoção da cultura de paz'
    ],
    desenvolvimentoEvidencias: [
      'Essa reflexão ajuda a compreender o bullying no ambiente escolar, pois ofensas, apelidos depreciativos e exclusões muitas vezes são tratados como simples brincadeiras.',
      'Quando esse comportamento é normalizado por colegas ou até minimizado pelos adultos, a vítima pode sentir-se desamparada e o agressor tende a interpretar a ausência de reação como aceitação de sua conduta.',
      'Contudo, a existência de uma norma não garante, por si só, a transformação das relações dentro das escolas.'
    ],
    aprofundamentoArgumentativoEvidencias: [
      'Quando esse comportamento é normalizado por colegas ou até minimizado pelos adultos, a vítima pode sentir-se desamparada e o agressor tende a interpretar a ausência de reação como aceitação de sua conduta.',
      'É necessário que os princípios previstos na legislação sejam incorporados ao cotidiano escolar por meio de debates, acompanhamento pedagógico e participação das famílias, para que os estudantes aprendam a reconhecer conflitos e resolvê-los sem recorrer à violência.'
    ],
    progressaoArgumentativaEvidencias: [
      'Dessa forma, romper com essa naturalização é indispensável para a construção de uma cultura de paz.',
      'Além disso, a própria legislação brasileira evidencia que a prevenção da violência escolar deve ocorrer de maneira contínua.'
    ],
    relacaoTeseArgumentosEvidencias: [
      'Dessa forma, romper com essa naturalização é indispensável para a construção de uma cultura de paz.'
    ],
    deslizesPontuaisEvidencias: []
  };
  const out = preparar(redacaoBoa, { c3 }).c3;
  assert.strictEqual(out.validacaoBackend.nivel5Comprovavel, true);
  assert.strictEqual(nivelC3(out), 5);
});

teste('C4 nível 5 aceita diversidade global expressiva sem exigir duas funções distintas em cada escopo', () => {
  const texto = `A escola precisa agir porque a violência persiste. Entretanto, muitos casos são naturalizados.\n\nAlém disso, a prevenção deve ser contínua. Por isso, a comunidade precisa participar.\n\nContudo, apenas punir não resolve. Dessa forma, a mediação deve ser valorizada.\n\nPortanto, a escola deve criar ações permanentes.`;
  const c4 = {
    coesao: 'expressiva', repeticoes: 'raras_ausentes', inadequacoes: 'nenhuma_relevante', monobloco: false,
    elementosCoesivosEvidencias: ['porque a violência persiste','Entretanto, muitos casos são naturalizados.','Além disso, a prevenção deve ser contínua.','Por isso, a comunidade precisa participar.','Contudo, apenas punir não resolve.','Dessa forma, a mediação deve ser valorizada.','Portanto, a escola deve criar ações permanentes.'],
    coesaoIntraEvidencias: ['porque a violência persiste','Por isso, a comunidade precisa participar.'],
    coesaoInterEvidencias: ['Além disso, a prevenção deve ser contínua.','Contudo, apenas punir não resolve.'],
    retomadasReferenciaisEvidencias: [], repeticoesEvidencias: [], inadequacoesEvidencias: [], inadequacoesCoesivasDetalhadas: [],
    funcoesCoesivasEvidencias: [
      { funcao: 'causa', escopo: 'intra', evidencia: 'porque a violência persiste', adequadaAoSentido: true },
      { funcao: 'causa', escopo: 'intra', evidencia: 'Por isso, a comunidade precisa participar.', adequadaAoSentido: true },
      { funcao: 'adicao', escopo: 'inter', evidencia: 'Além disso, a prevenção deve ser contínua.', adequadaAoSentido: true },
      { funcao: 'oposicao', escopo: 'inter', evidencia: 'Contudo, apenas punir não resolve.', adequadaAoSentido: true },
      { funcao: 'conclusao', escopo: 'inter', evidencia: 'Portanto, a escola deve criar ações permanentes.', adequadaAoSentido: true }
    ]
  };
  const out = preparar(texto, { c4 }).c4;
  assert.strictEqual(out.validacaoBackend.funcoesIntraDistintas, 1);
  assert.strictEqual(out.validacaoBackend.nivel5Comprovavel, true);
  assert.strictEqual(nivelC4(out), 5);
});

teste('C4 com repetição/inadequação real continua recebendo teto', () => {
  const texto = `A escola precisa agir. Porém, há problemas.\n\nPorém, a escola deve agir. Porém, a família deve agir.\n\nPortanto, é preciso atuar.`;
  const c4 = {
    coesao: 'expressiva', repeticoes: 'algumas', inadequacoes: 'poucas', monobloco: false,
    elementosCoesivosEvidencias: ['Porém, há problemas.','Porém, a escola deve agir.','Porém, a família deve agir.','Portanto, é preciso atuar.'],
    coesaoIntraEvidencias: ['Porém, há problemas.'], coesaoInterEvidencias: ['Porém, a escola deve agir.'],
    retomadasReferenciaisEvidencias: [], repeticoesEvidencias: ['Porém, há problemas.','Porém, a escola deve agir.'],
    inadequacoesEvidencias: [], inadequacoesCoesivasDetalhadas: [], funcoesCoesivasEvidencias: []
  };
  const out = preparar(texto, { c4 }).c4;
  assert.ok(nivelC4(out) <= 3);
});

teste('C5 permite que o mesmo período comprove os cinco elementos', () => {
  const ev = 'Portanto, as escolas brasileiras, com apoio das secretarias de educação, devem desenvolver programas permanentes de promoção da cultura de paz, por meio de rodas de conversa, atividades formativas e projetos de mediação de conflitos conduzidos por equipes pedagógicas capacitadas.';
  const c5 = {
    agenteValido: true, acaoValida: true, meioValido: true, finalidadeValida: true, detalhamentoValido: true,
    agenteEvidenciaLiteral: ev, acaoEvidenciaLiteral: ev, meioEvidenciaLiteral: ev, finalidadeEvidenciaLiteral: ev, detalhamentoEvidenciaLiteral: ev,
    relacaoTema: 'relacionada', respeitaDireitosHumanos: true, estruturaCondicional: false
  };
  const out = preparar(redacaoBoa, { c5 }).c5;
  assert.strictEqual(out.validacaoBackend.quantidade, 5);
  assert.strictEqual(nivelC5(out), 5);
});

teste('C5 não aplica teto condicional se a IA marcar condicional sem estrutura condicional literal', () => {
  const ev = 'Portanto, as escolas brasileiras, com apoio das secretarias de educação, devem desenvolver programas permanentes de promoção da cultura de paz, por meio de rodas de conversa, atividades formativas e projetos de mediação de conflitos conduzidos por equipes pedagógicas capacitadas.';
  const c5 = {
    agenteValido: true, acaoValida: true, meioValido: true, finalidadeValida: true, detalhamentoValido: true,
    agenteEvidenciaLiteral: ev, acaoEvidenciaLiteral: ev, meioEvidenciaLiteral: ev, finalidadeEvidenciaLiteral: ev, detalhamentoEvidenciaLiteral: ev,
    relacaoTema: 'relacionada', respeitaDireitosHumanos: true, estruturaCondicional: true
  };
  const out = preparar(redacaoBoa, { c5 }).c5;
  assert.strictEqual(out.estruturaCondicional, false);
  assert.strictEqual(nivelC5(out), 5);
});

teste('C5 mantém teto de nível 2 quando a proposta é realmente condicional', () => {
  const texto = `O problema exige resposta.\n\nSe houver recursos, a Secretaria de Educação deve criar oficinas por meio de equipes pedagógicas, para reduzir o bullying, com encontros mensais em todas as turmas.`;
  const ev = 'Se houver recursos, a Secretaria de Educação deve criar oficinas por meio de equipes pedagógicas, para reduzir o bullying, com encontros mensais em todas as turmas.';
  const c5 = {
    agenteValido: true, acaoValida: true, meioValido: true, finalidadeValida: true, detalhamentoValido: true,
    agenteEvidenciaLiteral: ev, acaoEvidenciaLiteral: ev, meioEvidenciaLiteral: ev, finalidadeEvidenciaLiteral: ev, detalhamentoEvidenciaLiteral: ev,
    relacaoTema: 'relacionada', respeitaDireitosHumanos: true, estruturaCondicional: true
  };
  const out = preparar(texto, { c5 }).c5;
  assert.strictEqual(out.estruturaCondicional, true);
  assert.strictEqual(nivelC5(out), 2);
});

teste('C5 com quatro elementos continua no nível 4', () => {
  const texto = `Portanto, a Secretaria de Educação deve criar oficinas por meio de equipes pedagógicas, para reduzir o bullying.`;
  const c5 = {
    agenteValido: true, acaoValida: true, meioValido: true, finalidadeValida: true, detalhamentoValido: false,
    agenteEvidenciaLiteral: texto, acaoEvidenciaLiteral: texto, meioEvidenciaLiteral: texto, finalidadeEvidenciaLiteral: texto, detalhamentoEvidenciaLiteral: '',
    relacaoTema: 'relacionada', respeitaDireitosHumanos: true, estruturaCondicional: false
  };
  const out = preparar(texto, { c5 }).c5;
  assert.strictEqual(nivelC5(out), 4);
});

let falhas = 0;
console.log(`\nAxoriin — regressão C2–C5 | ${VERSAO_VALIDACAO}\n`);
for (const { nome, fn } of testes) {
  try {
    fn();
    console.log(`OK  ${nome}`);
  } catch (err) {
    falhas += 1;
    console.error(`ERRO ${nome}`);
    console.error(`     ${err.message}`);
  }
}
console.log(`\nResultado: ${testes.length - falhas}/${testes.length} testes aprovados.`);
if (falhas) process.exit(1);
