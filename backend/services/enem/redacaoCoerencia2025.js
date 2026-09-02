'use strict';

const {
  COMPETENCIAS,
  CODIGOS_FRAGILIDADE,
  nivelParaPontos
} = require('./redacaoRubrica2025');

const VERSAO_VALIDACAO = 'axoriin-coerencia-grade-2025-v7-c1-auditoria-independente';

function s(v) {
  return String(v ?? '').trim();
}

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function enumVal(v, allowed, fallback) {
  const x = s(v);
  return allowed.includes(x) ? x : fallback;
}

function array(v) {
  return Array.isArray(v) ? v : [];
}

function semAcentos(v = '') {
  return s(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizarBusca(v = '') {
  return semAcentos(v)
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'a','as','o','os','um','uma','uns','umas','de','da','do','das','dos','e','ou','em','no','na','nos','nas',
  'por','para','com','sem','que','se','ao','aos','à','às','como','mais','menos','muito','muita','muitos','muitas',
  'ser','são','foi','foram','é','sendo','seu','sua','seus','suas','esse','essa','isso','isto','aquele','aquela',
  'também','ainda','já','quando','onde','qual','quais','sobre','entre','pelo','pela','pelos','pelas'
].map(semAcentos));

function tokensSignificativos(v = '') {
  return normalizarBusca(v)
    .split(' ')
    .filter(Boolean)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function evidenciaPresente(evidencia = '', redacao = '') {
  const e = normalizarBusca(evidencia);
  const r = normalizarBusca(redacao);
  if (!e || !r) return false;
  if (r.includes(e)) return true;

  const tokens = tokensSignificativos(e);
  if (tokens.length < 2) return false;
  const setRedacao = new Set(tokensSignificativos(r));
  const encontrados = tokens.filter((token) => setRedacao.has(token)).length;
  const cobertura = encontrados / tokens.length;
  return encontrados >= 2 && cobertura >= 0.8;
}

function proporcaoTokensEmReferencia(texto = '', referencia = '') {
  const tokens = tokensSignificativos(texto);
  if (!tokens.length) return 1;
  const ref = new Set(tokensSignificativos(referencia));
  const iguais = tokens.filter((token) => ref.has(token)).length;
  return iguais / tokens.length;
}

function temAncoraExternaClara(v = '') {
  const original = s(v);
  if (!original) return false;
  if (/\b(?:18|19|20)\d{2}\b|\b\d+(?:[.,]\d+)?%\b/.test(original)) return true;
  if (/\b(?:constitui[cç][aã]o|lei|decreto|estatuto|declara[cç][aã]o|artigo|c[oó]digo|bncc|lgpd|eca)\b/i.test(original)) return true;
  if (/\b(?:ibge|inep|ipea|unesco|unicef|onu|oms|ocde|fmi|banco mundial|anpd|mec)\b/i.test(original)) return true;
  if (/\b(?:pesquisa|estudo|levantamento|censo|dados?)\s+(?:do|da|de|realizado|publicado)/i.test(original)) return true;
  if (/\b(?:obra|livro|romance|filme|document[aá]rio|can[cç][aã]o|poema|teoria|conceito|princ[ií]pio)\s+(?:de|do|da|intitulado|chamado)/i.test(original)) return true;
  if (/\b(?:segundo|conforme|de acordo com|para o|para a)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^,.!?;:]{2,80}/.test(original)) return true;
  if (/\b(?:revolu[cç][aã]o|guerra|ditadura|aboli[cç][aã]o|constitui[cç][aã]o de|movimento)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9]/.test(original)) return true;
  const nomes = original.match(/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+(?:de|da|do|dos|das|e))?\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+\b/g);
  return Boolean(nomes && nomes.length);
}

function sobreposicaoComMotivadores(evidencia = '', motivadores = []) {
  const itens = Array.isArray(motivadores) ? motivadores : [];
  let maior = 0;
  for (const item of itens) {
    const ref = `${s(item?.titulo)} ${s(item?.conteudo)} ${s(item?.fonte)}`;
    maior = Math.max(maior, proporcaoTokensEmReferencia(evidencia, ref));
  }
  return maior;
}


const CATALOGO_REPERTORIOS_C2 = Object.freeze([
  { nome: 'Estatuto da Criança e do Adolescente', tipo: 'lei_documento', regex: /\b(?:estatuto\s+da\s+crian[cç]a\s+e\s+do\s+adolescente|ECA)\b/i },
  { nome: 'Constituição Federal', tipo: 'lei_documento', regex: /\b(?:constitui[cç][aã]o\s+federal(?:\s+de\s+1988)?|CF\/?88)\b/i },
  { nome: 'Declaração Universal dos Direitos Humanos', tipo: 'lei_documento', regex: /\b(?:declara[cç][aã]o\s+universal\s+dos\s+direitos\s+humanos|DUDH)\b/i },
  { nome: 'Estatuto da Juventude', tipo: 'lei_documento', regex: /\bestatuto\s+da\s+juventude\b/i },
  { nome: 'Marco Civil da Internet', tipo: 'lei_documento', regex: /\bmarco\s+civil\s+da\s+internet\b/i },
  { nome: 'Lei Geral de Proteção de Dados', tipo: 'lei_documento', regex: /\b(?:lei\s+geral\s+de\s+prote[cç][aã]o\s+de\s+dados|LGPD)\b/i },
  { nome: 'UNICEF', tipo: 'conhecimento_mundo_especifico', regex: /\bUNICEF\b/i },
  { nome: 'UNESCO', tipo: 'conhecimento_mundo_especifico', regex: /\bUNESCO\b/i },
  { nome: 'Organização das Nações Unidas', tipo: 'conhecimento_mundo_especifico', regex: /\b(?:Organiza[cç][aã]o\s+das\s+Na[cç][oõ]es\s+Unidas|ONU)\b/i },
  { nome: 'Organização Mundial da Saúde', tipo: 'conhecimento_mundo_especifico', regex: /\b(?:Organiza[cç][aã]o\s+Mundial\s+da\s+Sa[uú]de|OMS)\b/i },
  { nome: 'IBGE', tipo: 'dado_pesquisa', regex: /\bIBGE\b/i },
  { nome: 'Inep', tipo: 'dado_pesquisa', regex: /\bInep\b/i },
  { nome: 'Ipea', tipo: 'dado_pesquisa', regex: /\bIpea\b/i }
]);

function sentencasDoTexto(texto = '') {
  const out = [];
  for (const paragrafo of paragrafosDaRedacao(texto)) {
    const sentencas = paragrafo.match(/[^.!?]+[.!?]?/g) || [paragrafo];
    sentencas.map((x) => x.trim()).filter(Boolean).forEach((x) => out.push({ texto: x, paragrafo }));
  }
  return out;
}

function temConectorAplicacao(v = '') {
  return /^(?:assim|desse\s+modo|dessa\s+forma|logo|portanto|por\s+isso|nesse\s+sentido|sob\s+essa\s+perspectiva|diante\s+disso|com\s+isso|a\s+partir\s+disso)\b/i.test(s(v));
}

function temLinguagemDeAplicacao(v = '') {
  return /\b(?:contrari|viola|garant|direit|dignidad|integridad|evidencia|demonstra|mostra|comprova|refor[cç]a|explica|relacion|aplica|revela|indica|contribui|resulta|provoca|consequ[eê]ncia|problema|desafio)\w*/i.test(s(v));
}

function localizarRepertorioCatalogado(redacao = '', contexto = {}) {
  const texto = s(redacao);
  if (!texto) return null;
  const sentencas = sentencasDoTexto(texto);
  const temaRef = `${s(contexto.temaTitulo)} ${s(contexto.proposta)}`;
  const temaTokens = new Set(tokensSignificativos(temaRef));

  for (const item of CATALOGO_REPERTORIOS_C2) {
    const idx = sentencas.findIndex((x) => item.regex.test(x.texto));
    if (idx < 0) continue;
    const atual = sentencas[idx];
    const sobreposicaoMotivadores = sobreposicaoComMotivadores(atual.texto, contexto.textosMotivadores);
    if (sobreposicaoMotivadores >= 0.72) continue;

    const tokensParagrafo = new Set(tokensSignificativos(atual.paragrafo));
    const temaComum = [...temaTokens].filter((x) => tokensParagrafo.has(x)).length;
    const pertinente = temaComum >= 1 || /\b(?:direit|educa[cç]|adolesc|crian[cç]|internet|digital|viol[eê]ncia|sa[uú]de|cidadania|igualdade|dignidade|sociedade|brasil)\w*/i.test(atual.paragrafo);

    let articulacao = '';
    const candidatos = [sentencas[idx + 1], sentencas[idx - 1]].filter(Boolean).filter((x) => x.paragrafo === atual.paragrafo);
    for (const cand of candidatos) {
      if ((temConectorAplicacao(cand.texto) && temLinguagemDeAplicacao(cand.texto)) ||
          (temLinguagemDeAplicacao(cand.texto) && tokensSignificativos(cand.texto).length >= 8)) {
        articulacao = cand.texto;
        break;
      }
    }

    return {
      repertorioIdentificado: item.nome,
      repertorioEvidenciaLiteral: atual.texto,
      repertorioArticulacaoEvidenciaLiteral: articulacao,
      repertorioOrigem: 'externo',
      repertorioTipo: item.tipo,
      repertorioLegitimado: true,
      repertorioPertinente: Boolean(pertinente),
      repertorioProdutivo: Boolean(pertinente && articulacao),
      fonteDeteccao: 'backend_catalogo',
      sobreposicaoMotivadores: Number(sobreposicaoMotivadores.toFixed(3))
    };
  }
  return null;
}

function validarListaEvidencias(itens = [], redacao = '', max = 12) {
  const out = [];
  const vistos = new Set();
  for (const item of array(itens).slice(0, max)) {
    const ev = s(item);
    const norm = normalizarBusca(ev);
    if (!ev || !norm || vistos.has(norm)) continue;
    if (!evidenciaPresente(ev, redacao)) continue;
    vistos.add(norm);
    out.push(ev);
  }
  return out;
}

function paragrafosDaRedacao(redacao = '') {
  return s(redacao).split(/\n\s*\n|\r?\n/).map((x) => x.trim()).filter(Boolean);
}

function indiceParagrafoEvidencia(evidencia = '', redacao = '') {
  const pars = paragrafosDaRedacao(redacao);
  for (let i = 0; i < pars.length; i += 1) {
    if (evidenciaPresente(evidencia, pars[i])) return i;
  }
  return -1;
}

function coberturaParagrafosEvidencias(evidencias = [], redacao = '') {
  const indices = new Set();
  for (const ev of array(evidencias)) {
    const idx = indiceParagrafoEvidencia(ev, redacao);
    if (idx >= 0) indices.add(idx);
  }
  return indices.size;
}

function validarDesviosAuditaveisC1(itens = [], redacao = '') {
  const categoriasPermitidas = new Set([
    'concordancia_verbal','concordancia_nominal','regencia','pontuacao','ortografia',
    'acentuacao','crase','colocacao_pronominal','estrutura_sintatica','paralelismo',
    'adequacao_vocabular','outro'
  ]);
  const out = [];
  const vistos = new Set();
  for (const item of array(itens).slice(0, 30)) {
    const categoria = categoriasPermitidas.has(s(item?.categoria)) ? s(item.categoria) : 'outro';
    const evidencia = s(item?.evidencia);
    if (!evidencia || !evidenciaPresente(evidencia, redacao)) continue;
    const key = `${categoria}|${normalizarBusca(evidencia)}`;
    if (vistos.has(key)) continue;
    vistos.add(key);
    out.push({
      categoria,
      evidencia,
      explicacao: s(item?.explicacao),
      correcaoSugerida: s(item?.correcaoSugerida),
      ehFalhaSintatica: Boolean(item?.ehFalhaSintatica)
    });
  }
  return out;
}

function validarC1(m = {}, contexto = {}) {
  const redacao = s(contexto.redacaoAluno);
  const temAuditoriaDetalhada = Object.prototype.hasOwnProperty.call(m, 'desviosAuditaveis');
  const detalhes = validarDesviosAuditaveisC1(m.desviosAuditaveis, redacao);

  const falhasInformadas = array(m.falhasSintaticasEvidencias);
  const desviosInformados = array(m.desviosFormaisEvidencias);
  const positivosInformados = array(m.periodosBemConstruidosEvidencias);
  const falhasLegadas = validarListaEvidencias(falhasInformadas, redacao, 12);
  const desviosLegados = validarListaEvidencias(desviosInformados, redacao, 30);
  const periodosBemConstruidos = validarListaEvidencias(positivosInformados, redacao, 6);

  const desvios = temAuditoriaDetalhada ? detalhes.map((x) => x.evidencia) : desviosLegados;
  const falhas = temAuditoriaDetalhada
    ? detalhes.filter((x) => x.ehFalhaSintatica).map((x) => x.evidencia)
    : falhasLegadas;

  const temListasAuditaveis = temAuditoriaDetalhada || falhasInformadas.length > 0 || desviosInformados.length > 0 ||
    Object.prototype.hasOwnProperty.call(m, 'falhasSintaticasEvidencias') ||
    Object.prototype.hasOwnProperty.call(m, 'desviosFormaisEvidencias');

  const qtdDesvios = temListasAuditaveis ? desvios.length : clamp(Math.round(n(m.desviosEstimados, 0)), 0, 99);
  const qtdFalhas = temListasAuditaveis ? falhas.length : clamp(Math.round(n(m.falhasSintaticasEstimadas, 0)), 0, 99);
  const quantidadeDesvios = qtdDesvios === 0 ? 'nenhum' : qtdDesvios <= 2 ? 'poucos' : qtdDesvios <= 5 ? 'alguns' : 'muitos';

  const porCategoria = {};
  for (const item of detalhes) porCategoria[item.categoria] = (porCategoria[item.categoria] || 0) + 1;
  const reincidenciaPorAuditoria = Object.values(porCategoria).some((qtd) => qtd >= 3);
  const reincidenciaConfirmada = qtdDesvios >= 2 && (Boolean(m.reincidenciaDesvios) || reincidenciaPorAuditoria);

  return {
    ...m,
    falhasSintaticasEvidencias: falhas,
    desviosFormaisEvidencias: desvios,
    desviosAuditaveis: detalhes,
    periodosBemConstruidosEvidencias: periodosBemConstruidos,
    falhasSintaticasEstimadas: qtdFalhas,
    desviosEstimados: qtdDesvios,
    quantidadeDesvios,
    reincidenciaDesvios: reincidenciaConfirmada,
    validacaoBackend: {
      falhasConfirmadas: qtdFalhas,
      desviosConfirmados: qtdDesvios,
      categoriasDesviosConfirmadas: Object.keys(porCategoria).length,
      desviosPorCategoria: porCategoria,
      auditoriaDetalhadaUtilizada: temAuditoriaDetalhada,
      periodosBemConstruidosConfirmados: periodosBemConstruidos.length,
      nivel5Comprovavel: periodosBemConstruidos.length >= 2 && qtdFalhas <= 1 && qtdDesvios <= 2 && !reincidenciaConfirmada,
      motivo: temAuditoriaDetalhada
        ? 'C1 foi auditada frase a frase. Cada ocorrência é validada no próprio texto e contabilizada separadamente; a quantidade de desvios pode limitar o nível independentemente de a estrutura sintática global ser boa.'
        : 'C1 combina os limites da Grade 2025 com evidências negativas e positivas localizadas no texto.'
    }
  };
}

function validarRepertorioC2(m = {}, contexto = {}) {
  const redacao = s(contexto.redacaoAluno);
  const temaRef = `${s(contexto.temaTitulo)} ${s(contexto.proposta)}`;
  let evidencia = s(m.repertorioEvidenciaLiteral);
  let articulacaoEv = s(m.repertorioArticulacaoEvidenciaLiteral);
  let identificado = s(m.repertorioIdentificado);
  let origem = enumVal(m.repertorioOrigem,
    ['nenhum','textos_motivadores','externo','conhecimento_mundo_especifico'], 'nenhum');
  let tipo = enumVal(m.repertorioTipo,
    ['nenhum','texto_motivador','autor_obra','lei_documento','dado_pesquisa','fato_historico','acontecimento_social_especifico','conceito_area_conhecimento','conhecimento_mundo_especifico'],
    'nenhum');

  let fonteDeteccao = 'ia';
  let repertorioRecuperadoBackend = false;

  function auditarAtual() {
    const evidOkLocal = evidenciaPresente(evidencia, redacao);
    const articulacaoOkLocal = evidenciaPresente(articulacaoEv, redacao);
    const origemExternaLocal = ['externo','conhecimento_mundo_especifico'].includes(origem);
    const tipoExternoLocal = !['nenhum','texto_motivador'].includes(tipo);
    const sobreposicaoTemaLocal = proporcaoTokensEmReferencia(evidencia || identificado, temaRef);
    const sobreposicaoMotivadoresLocal = sobreposicaoComMotivadores(evidencia, contexto.textosMotivadores);
    const ancoraNoIdentificadoLocal = temAncoraExternaClara(identificado);
    const ancoraNaEvidenciaLocal = temAncoraExternaClara(evidencia);
    const tokensIdentificadosLocal = tokensSignificativos(identificado);
    const evidenciaContemIdentificadoLocal = tokensIdentificadosLocal.length >= 1 && (() => {
      const ev = new Set(tokensSignificativos(evidencia));
      const qtd = tokensIdentificadosLocal.filter((x) => ev.has(x)).length;
      return qtd / tokensIdentificadosLocal.length >= 0.6;
    })();
    const veioDosMotivadoresLocal = sobreposicaoMotivadoresLocal >= 0.72;
    const ancoraValidaLocal = Boolean(identificado) && evidOkLocal && origemExternaLocal && tipoExternoLocal &&
      !veioDosMotivadoresLocal && sobreposicaoTemaLocal < 0.78 && evidenciaContemIdentificadoLocal &&
      (ancoraNoIdentificadoLocal || ancoraNaEvidenciaLocal);
    const normEvLocal = normalizarBusca(evidencia);
    const normArtLocal = normalizarBusca(articulacaoEv);
    const articulacaoDistintaLocal = Boolean(normArtLocal) && normArtLocal !== normEvLocal &&
      (tokensSignificativos(articulacaoEv).length >= 3);
    const articulacaoValidadaLocal = ancoraValidaLocal && articulacaoOkLocal && articulacaoDistintaLocal;
    return {
      evidOk: evidOkLocal,
      articulacaoOk: articulacaoOkLocal,
      origemExterna: origemExternaLocal,
      tipoExterno: tipoExternoLocal,
      sobreposicaoTema: sobreposicaoTemaLocal,
      sobreposicaoMotivadores: sobreposicaoMotivadoresLocal,
      ancoraNoIdentificado: ancoraNoIdentificadoLocal,
      ancoraNaEvidencia: ancoraNaEvidenciaLocal,
      evidenciaContemIdentificado: evidenciaContemIdentificadoLocal,
      veioDosMotivadores: veioDosMotivadoresLocal,
      ancoraValida: ancoraValidaLocal,
      articulacaoDistinta: articulacaoDistintaLocal,
      articulacaoValidada: articulacaoValidadaLocal
    };
  }

  let audit = auditarAtual();
  let suporteCatalogo = localizarRepertorioCatalogado(redacao, contexto);

  // v4.13: segunda camada determinística. Se o extrator omitir uma referência
  // normativa/institucional explicitamente nomeada, o backend procura a âncora
  // no próprio texto. Isso evita reduzir C2 por falha de extração da IA.
  if (!audit.ancoraValida) {
    const recuperado = suporteCatalogo;
    if (recuperado) {
      identificado = recuperado.repertorioIdentificado;
      evidencia = recuperado.repertorioEvidenciaLiteral;
      articulacaoEv = recuperado.repertorioArticulacaoEvidenciaLiteral;
      origem = recuperado.repertorioOrigem;
      tipo = recuperado.repertorioTipo;
      fonteDeteccao = recuperado.fonteDeteccao;
      repertorioRecuperadoBackend = true;
      audit = auditarAtual();
    }
  }

  if (audit.veioDosMotivadores) {
    origem = 'textos_motivadores';
    tipo = 'texto_motivador';
    audit = auditarAtual();
  }

  // Mesmo quando a IA encontrou a âncora mas marcou os booleanos de C2 de forma
  // conservadora/inconsistente, um item catalogado explicitamente presente pode
  // confirmar legitimidade, pertinência e produtividade a partir do próprio texto.
  // Isso não se aplica a repertórios genéricos: apenas às âncoras auditáveis acima.
  if (!suporteCatalogo) suporteCatalogo = localizarRepertorioCatalogado(redacao, contexto);
  const mesmoCatalogado = Boolean(suporteCatalogo) && (
    normalizarBusca(identificado).includes(normalizarBusca(suporteCatalogo.repertorioIdentificado)) ||
    normalizarBusca(suporteCatalogo.repertorioIdentificado).includes(normalizarBusca(identificado)) ||
    evidenciaPresente(suporteCatalogo.repertorioEvidenciaLiteral, redacao)
  );
  const legitimado = audit.ancoraValida && (Boolean(m.repertorioLegitimado) || Boolean(mesmoCatalogado && suporteCatalogo?.repertorioLegitimado));
  const pertinente = legitimado && (Boolean(m.repertorioPertinente) || Boolean(mesmoCatalogado && suporteCatalogo?.repertorioPertinente));
  const produtivo = pertinente && audit.articulacaoValidada &&
    (Boolean(m.repertorioProdutivo) || Boolean(mesmoCatalogado && suporteCatalogo?.repertorioProdutivo));

  return {
    ...m,
    repertorioIdentificado: identificado,
    repertorioEvidenciaLiteral: evidencia,
    repertorioArticulacaoEvidenciaLiteral: audit.articulacaoValidada ? articulacaoEv : '',
    repertorioOrigem: origem,
    repertorioTipo: tipo,
    repertorioLegitimado: legitimado,
    repertorioPertinente: pertinente,
    repertorioProdutivo: produtivo,
    validacaoBackend: {
      evidenciaPresente: audit.evidOk,
      ancoraValida: audit.ancoraValida,
      origemExterna: audit.origemExterna,
      tipoExterno: audit.tipoExterno,
      ancoraNoIdentificado: audit.ancoraNoIdentificado,
      ancoraNaEvidencia: audit.ancoraNaEvidencia,
      evidenciaContemIdentificado: audit.evidenciaContemIdentificado,
      veioDosMotivadores: audit.veioDosMotivadores,
      articulacaoPresente: audit.articulacaoOk,
      articulacaoDistinta: audit.articulacaoDistinta,
      articulacaoValidada: audit.articulacaoValidada,
      repertorioRecuperadoBackend,
      fonteDeteccao,
      sobreposicaoTema: Number(audit.sobreposicaoTema.toFixed(3)),
      sobreposicaoMotivadores: Number(audit.sobreposicaoMotivadores.toFixed(3)),
      motivo: produtivo
        ? `Repertório externo e sua articulação com o argumento foram confirmados por evidências distintas no texto${repertorioRecuperadoBackend ? ' (âncora recuperada deterministicamente pelo backend)' : ''}.`
        : legitimado && pertinente
          ? `Repertório legitimado e pertinente confirmado${repertorioRecuperadoBackend ? ' pelo backend' : ''}; sem evidência suficiente de articulação produtiva, o nível máximo não é confirmado.`
          : 'Não foi confirmada âncora externa auditável de repertório sociocultural; opiniões, tese e argumentos próprios não contam como repertório legitimado.'
    }
  };
}

function validarC3(m = {}, contexto = {}) {
  const redacao = s(contexto.redacaoAluno);
  const contradicaoEv = s(m.contradicaoEvidenciaLiteral);
  const contradicaoConfirmada = Boolean(m.contradicaoGrave) && evidenciaPresente(contradicaoEv, redacao);
  const lacunas = validarListaEvidencias(m.lacunasEvidencias, redacao, 6);
  const teseEv = s(m.teseEvidenciaLiteral);
  const teseConfirmada = evidenciaPresente(teseEv, redacao);
  const projeto = validarListaEvidencias(m.projetoTextoEvidencias, redacao, 6);
  const desenvolvimento = validarListaEvidencias(m.desenvolvimentoEvidencias, redacao, 8);
  const aprofundamento = validarListaEvidencias(m.aprofundamentoArgumentativoEvidencias, redacao, 8);
  const progressao = validarListaEvidencias(m.progressaoArgumentativaEvidencias, redacao, 8);
  const relacaoTese = validarListaEvidencias(m.relacaoTeseArgumentosEvidencias, redacao, 6);
  const deslizes = validarListaEvidencias(m.deslizesPontuaisEvidencias, redacao, 4);

  const coberturaDesenvolvimento = coberturaParagrafosEvidencias(desenvolvimento, redacao);
  const coberturaAprofundamento = coberturaParagrafosEvidencias(aprofundamento, redacao);
  const coberturaProgressao = coberturaParagrafosEvidencias(progressao, redacao);

  const nivel4Comprovavel = teseConfirmada &&
    projeto.length >= 2 &&
    desenvolvimento.length >= 3 &&
    coberturaDesenvolvimento >= 2 &&
    progressao.length >= 1 &&
    lacunas.length <= 2 &&
    !contradicaoConfirmada;

  const nivel5Comprovavel = nivel4Comprovavel &&
    desenvolvimento.length >= 4 &&
    aprofundamento.length >= 2 &&
    coberturaAprofundamento >= 2 &&
    progressao.length >= 2 &&
    coberturaProgressao >= 2 &&
    relacaoTese.length >= 2 &&
    lacunas.length <= 1 &&
    deslizes.length <= 1;

  let projetoTexto = enumVal(m.projetoTexto,
    ['caotico','sem_foco','muitas_falhas','algumas_falhas','poucas_falhas','estrategico'], 'algumas_falhas');
  let desenvolvimentoClass = enumVal(m.desenvolvimento,
    ['ausente','uma_informacao','algumas_lacunas','poucas_lacunas','completo'], 'algumas_lacunas');

  if (nivel5Comprovavel) {
    projetoTexto = 'estrategico';
    desenvolvimentoClass = 'completo';
  } else if (nivel4Comprovavel) {
    if (['caotico','sem_foco','muitas_falhas','algumas_falhas'].includes(projetoTexto)) projetoTexto = 'poucas_falhas';
    if (['ausente','uma_informacao','algumas_lacunas'].includes(desenvolvimentoClass)) desenvolvimentoClass = 'poucas_lacunas';
  }

  return {
    ...m,
    projetoTexto,
    desenvolvimento: desenvolvimentoClass,
    contradicaoGrave: contradicaoConfirmada,
    contradicaoEvidenciaLiteral: contradicaoConfirmada ? contradicaoEv : '',
    lacunasEvidencias: lacunas,
    teseEvidenciaLiteral: teseConfirmada ? teseEv : '',
    projetoTextoEvidencias: projeto,
    desenvolvimentoEvidencias: desenvolvimento,
    aprofundamentoArgumentativoEvidencias: aprofundamento,
    progressaoArgumentativaEvidencias: progressao,
    relacaoTeseArgumentosEvidencias: relacaoTese,
    deslizesPontuaisEvidencias: deslizes,
    validacaoBackend: {
      contradicaoConfirmada,
      teseConfirmada,
      projetoTextoEvidenciasConfirmadas: projeto.length,
      desenvolvimentoEvidenciasConfirmadas: desenvolvimento.length,
      aprofundamentoArgumentativoConfirmado: aprofundamento.length,
      progressaoArgumentativaConfirmada: progressao.length,
      relacaoTeseArgumentosConfirmada: relacaoTese.length,
      coberturaParagrafosDesenvolvimento: coberturaDesenvolvimento,
      coberturaParagrafosAprofundamento: coberturaAprofundamento,
      coberturaParagrafosProgressao: coberturaProgressao,
      lacunasConfirmadas: lacunas.length,
      deslizesPontuaisConfirmados: deslizes.length,
      nivel4Comprovavel,
      nivel5Comprovavel,
      motivo: nivel5Comprovavel
        ? 'C3 nível 5 confirmado por projeto estratégico, desenvolvimento distribuído, aprofundamento, progressão e relação consistente entre tese e argumentos.'
        : nivel4Comprovavel
          ? 'C3 nível 4 confirmado pelas evidências de tese, projeto, desenvolvimento distribuído e progressão, ainda sem comprovação qualitativa suficiente para o nível 5.'
          : 'C3 permanece abaixo do nível 4 porque as evidências não confirmaram projeto e desenvolvimento suficientemente consistentes.'
    }
  };
}

function pareceProblemaDeC1NaExplicacao(texto = '') {
  return /\b(?:concord[aâ]ncia|reg[eê]ncia|ortograf|acentua[cç][aã]o|crase|flex[aã]o|conjuga[cç][aã]o|pontua[cç][aã]o|estrutura\s+sint[aá]tica|erro\s+gramatical|norma\s+padr[aã]o)\b/i.test(s(texto));
}

function validarInadequacoesCoesivasDetalhadas(itens = [], redacao = '') {
  const categorias = new Set([
    'conector_inadequado','relacao_semantica_inadequada','referencia_ambigua',
    'retomada_inadequada','articulacao_fragmentada','outro_coesivo'
  ]);
  const validas = [];
  const ignoradasC1 = [];
  const vistos = new Set();
  for (const item of array(itens).slice(0, 12)) {
    const evidencia = s(item?.evidencia);
    const explicacaoCoesiva = s(item?.explicacaoCoesiva);
    const categoria = categorias.has(s(item?.categoria)) ? s(item.categoria) : 'outro_coesivo';
    if (!evidencia || !evidenciaPresente(evidencia, redacao)) continue;
    const key = `${categoria}|${normalizarBusca(evidencia)}`;
    if (vistos.has(key)) continue;
    vistos.add(key);
    if (!explicacaoCoesiva || pareceProblemaDeC1NaExplicacao(explicacaoCoesiva)) {
      ignoradasC1.push({ categoria, evidencia, explicacaoCoesiva });
      continue;
    }
    validas.push({ categoria, evidencia, explicacaoCoesiva });
  }
  return { validas, ignoradasC1 };
}

function validarC4(m = {}, contexto = {}) {
  const redacao = s(contexto.redacaoAluno);
  const conectivos = validarListaEvidencias(m.elementosCoesivosEvidencias, redacao, 12);
  const intra = validarListaEvidencias(m.coesaoIntraEvidencias, redacao, 12);
  const inter = validarListaEvidencias(m.coesaoInterEvidencias, redacao, 12);
  const retomadas = validarListaEvidencias(m.retomadasReferenciaisEvidencias, redacao, 10);
  const repeticoesEv = validarListaEvidencias(m.repeticoesEvidencias, redacao, 12);

  const temDetalhamentoC4 = Object.prototype.hasOwnProperty.call(m, 'inadequacoesCoesivasDetalhadas');
  const auditDetalhada = validarInadequacoesCoesivasDetalhadas(m.inadequacoesCoesivasDetalhadas, redacao);
  const inadequacoesLegadas = temDetalhamentoC4 ? [] : validarListaEvidencias(m.inadequacoesEvidencias, redacao, 12);

  const paragrafos = paragrafosDaRedacao(redacao);
  const monobloco = paragrafos.length <= 1 && normalizarBusca(redacao).length > 400;

  const funcoesPermitidas = new Set(['adicao','oposicao','causa','consequencia','conclusao','explicacao','exemplificacao','condicao','finalidade','sequenciacao','retomada_referencial','outra']);
  const escoposPermitidos = new Set(['intra','inter']);
  const funcoesValidadas = [];
  const inadequacoesFuncionais = [];
  const vistos = new Set();
  for (const item of array(m.funcoesCoesivasEvidencias).slice(0, 12)) {
    const funcao = funcoesPermitidas.has(s(item?.funcao)) ? s(item.funcao) : 'outra';
    const escopo = escoposPermitidos.has(s(item?.escopo)) ? s(item.escopo) : 'intra';
    const evidencia = s(item?.evidencia);
    if (!evidencia || !evidenciaPresente(evidencia, redacao)) continue;
    const key = funcao + '|' + escopo + '|' + normalizarBusca(evidencia);
    if (vistos.has(key)) continue;
    vistos.add(key);
    const adequadaAoSentido = item?.adequadaAoSentido !== false;
    const registro = { funcao, escopo, evidencia, adequadaAoSentido };
    if (adequadaAoSentido) funcoesValidadas.push(registro);
    else inadequacoesFuncionais.push(evidencia);
  }

  const inadequacoesEv = listaUnica([
    ...auditDetalhada.validas.map((x) => x.evidencia),
    ...inadequacoesLegadas,
    ...inadequacoesFuncionais
  ], 12);
  const todos = listaUnica([...conectivos, ...intra, ...inter, ...retomadas], 28);
  const funcoesDistintas = new Set(funcoesValidadas.map((x) => x.funcao));
  const funcoesIntra = new Set(funcoesValidadas.filter((x) => x.escopo === 'intra').map((x) => x.funcao));
  const funcoesInter = new Set(funcoesValidadas.filter((x) => x.escopo === 'inter').map((x) => x.funcao));
  const coberturaInter = coberturaParagrafosEvidencias(inter, redacao);

  const nivel5Qualitativo = intra.length >= 2 &&
    inter.length >= 2 &&
    coberturaInter >= 2 &&
    funcoesDistintas.size >= 4 &&
    funcoesIntra.size >= 2 &&
    funcoesInter.size >= 2 &&
    todos.length >= 6 &&
    repeticoesEv.length <= 1 &&
    inadequacoesEv.length === 0 &&
    !monobloco;

  let coesao = enumVal(m.coesao, ['ausente','rara','pontual','regular','constante','expressiva'], 'regular');
  if (nivel5Qualitativo) coesao = 'expressiva';
  else if (intra.length >= 1 && inter.length >= 2 && todos.length >= 4) coesao = 'constante';
  else if (todos.length >= 3) coesao = 'regular';
  else if (todos.length >= 1) coesao = 'pontual';
  else coesao = 'rara';

  const classificarProblemas = (qtd) => qtd === 0 ? 'raras_ausentes' : qtd <= 1 ? 'poucas' : qtd <= 3 ? 'algumas' : qtd <= 5 ? 'muitas' : 'excessivas';
  const classificarInadequacoes = (qtd) => qtd === 0 ? 'nenhuma_relevante' : qtd <= 1 ? 'poucas' : qtd <= 3 ? 'algumas' : qtd <= 5 ? 'muitas' : 'excessivas';

  return {
    ...m,
    coesao,
    repeticoes: classificarProblemas(repeticoesEv.length),
    inadequacoes: classificarInadequacoes(inadequacoesEv.length),
    monobloco,
    elementosCoesivosEvidencias: todos.slice(0, 12),
    coesaoIntraEvidencias: intra,
    coesaoInterEvidencias: inter,
    funcoesCoesivasEvidencias: funcoesValidadas,
    retomadasReferenciaisEvidencias: retomadas,
    repeticoesEvidencias: repeticoesEv,
    inadequacoesEvidencias: inadequacoesEv,
    inadequacoesCoesivasDetalhadas: auditDetalhada.validas,
    validacaoBackend: {
      elementosCoesivosConfirmados: todos.length,
      coesaoIntraConfirmada: intra.length,
      coesaoInterConfirmada: inter.length,
      coberturaParagrafosInter: coberturaInter,
      funcoesCoesivasDistintasConfirmadas: funcoesDistintas.size,
      funcoesIntraDistintas: funcoesIntra.size,
      funcoesInterDistintas: funcoesInter.size,
      retomadasReferenciaisConfirmadas: retomadas.length,
      repeticoesConfirmadas: repeticoesEv.length,
      inadequacoesConfirmadas: inadequacoesEv.length,
      inadequacoesIgnoradasPorSeremC1: auditDetalhada.ignoradasC1.length,
      paragrafosDetectados: paragrafos.length,
      nivel5Comprovavel: nivel5Qualitativo,
      motivo: nivel5Qualitativo
        ? 'C4 nível 5 confirmado por articulação funcional expressiva, diversidade semântica, presença intra/inter e retomada referencial sem inadequações relevantes.'
        : 'C4 foi calculada apenas com problemas genuinamente coesivos; desvios gramaticais de C1 não são usados para reduzir esta competência.'
    }
  };
}

function escolherEvidencia(m = {}, raw = {}, nome = '') {
  const mapa = {
    agente: ['agenteEvidenciaLiteral', 'agente'],
    acao: ['acaoEvidenciaLiteral', 'acao'],
    meio: ['meioEvidenciaLiteral', 'meio'],
    finalidade: ['finalidadeEvidenciaLiteral', 'finalidade'],
    detalhamento: ['detalhamentoEvidenciaLiteral', 'detalhamento']
  };
  const [campoMarcador, campoRaw] = mapa[nome] || [];
  return s(m[campoMarcador]) || s(raw.elementosIntervencao?.[campoRaw]);
}

function validarElementosC5(m = {}, raw = {}, contexto = {}) {
  const redacao = s(contexto.redacaoAluno);
  const nomes = ['agente','acao','meio','finalidade','detalhamento'];
  const evidencias = {};
  const validos = {};

  const evidenciasUsadas = [];
  for (const nome of nomes) {
    const evidencia = escolherEvidencia(m, raw, nome);
    const normalizada = normalizarBusca(evidencia);
    const repetida = Boolean(normalizada) && evidenciasUsadas.includes(normalizada);
    evidencias[nome] = evidencia;
    validos[nome] = !repetida && evidenciaPresente(evidencia, redacao);
    if (validos[nome] && normalizada) evidenciasUsadas.push(normalizada);
  }

  return {
    ...m,
    agenteValido: validos.agente,
    acaoValida: validos.acao,
    meioValido: validos.meio,
    finalidadeValida: validos.finalidade,
    detalhamentoValido: validos.detalhamento,
    agenteEvidenciaLiteral: evidencias.agente,
    acaoEvidenciaLiteral: evidencias.acao,
    meioEvidenciaLiteral: evidencias.meio,
    finalidadeEvidenciaLiteral: evidencias.finalidade,
    detalhamentoEvidenciaLiteral: evidencias.detalhamento,
    validacaoBackend: {
      elementosConfirmados: nomes.filter((nome) => validos[nome]),
      quantidade: nomes.filter((nome) => validos[nome]).length,
      motivo: 'Os elementos da intervenção só são considerados válidos quando a evidência correspondente é confirmada no texto do aluno.'
    }
  };
}

function prepararMarcadoresValidados({ raw = {}, marcadoresGrade = {}, contexto = {} }) {
  const base = JSON.parse(JSON.stringify(marcadoresGrade || {}));
  base.c1 = validarC1(base.c1 || {}, contexto);
  base.c2 = validarRepertorioC2(base.c2 || {}, contexto);
  base.c3 = validarC3(base.c3 || {}, contexto);
  base.c4 = validarC4(base.c4 || {}, contexto);
  base.c5 = validarElementosC5(base.c5 || {}, raw, contexto);
  return base;
}

function nivelC1(m = {}) {
  const estrutura = enumVal(m.estruturaSintatica,
    ['inexistente','deficitaria','regular','boa','excelente'], 'regular');
  const desvios = enumVal(m.quantidadeDesvios,
    ['nenhum','poucos','alguns','muitos'], 'alguns');
  const falhas = clamp(Math.round(n(m.falhasSintaticasEstimadas, 0)), 0, 99);
  const qtdDesvios = clamp(Math.round(n(m.desviosEstimados, 0)), 0, 99);
  const reincidencia = Boolean(m.reincidenciaDesvios);

  if (estrutura === 'inexistente') return 0;
  if (estrutura === 'deficitaria' && desvios === 'muitos') return 1;

  const nivelEstrutura = ({ deficitaria: 2, regular: 3, boa: 4, excelente: 5 })[estrutura] ?? 3;
  const nivelDesvios = ({ muitos: 2, alguns: 3, poucos: 4, nenhum: 5 })[desvios] ?? 3;

  let nivel = Math.min(nivelEstrutura, nivelDesvios);
  if (nivel === 5 && !m.validacaoBackend?.nivel5Comprovavel) nivel = 4;
  if (nivel === 5 && (falhas > 1 || qtdDesvios > 2 || reincidencia)) nivel = 4;
  return nivel;
}

function nivelC2(m = {}) {
  const abordagem = enumVal(m.abordagemTema,
    ['fuga','tangencia','completa'], 'completa');
  const tipo = enumVal(m.tipoTextual,
    ['dissertativo_argumentativo','tracos_outros_tipos','outro_predominante','caotico'],
    'dissertativo_argumentativo');
  const partes = clamp(Math.round(n(m.partesReconheciveis, 3)), 0, 3);
  const embrionarias = clamp(Math.round(n(m.partesEmbrionarias, 0)), 0, 3);
  const copia = enumVal(m.copiaMotivadores, ['nenhuma','baixa','muitos_trechos'], 'nenhuma');
  const legitimado = Boolean(m.repertorioLegitimado);
  const pertinente = Boolean(m.repertorioPertinente);
  const produtivo = Boolean(m.repertorioProdutivo);

  if (abordagem === 'fuga' || tipo === 'outro_predominante') return 0;
  if (abordagem === 'tangencia' || tipo === 'caotico' || tipo === 'tracos_outros_tipos') return 1;

  let tetoEstrutura = 5;
  if (partes <= 2 || (partes === 3 && embrionarias >= 2)) tetoEstrutura = 2;
  else if (partes === 3 && embrionarias === 1) tetoEstrutura = 3;
  if (copia === 'muitos_trechos') tetoEstrutura = Math.min(tetoEstrutura, 2);

  let tetoRepertorio = 5;
  if (!legitimado || !pertinente) tetoRepertorio = 3;
  else if (!produtivo) tetoRepertorio = 4;

  return Math.min(tetoEstrutura, tetoRepertorio);
}

function nivelC3(m = {}) {
  const projeto = enumVal(m.projetoTexto,
    ['caotico','sem_foco','muitas_falhas','algumas_falhas','poucas_falhas','estrategico'],
    'algumas_falhas');
  const desenvolvimento = enumVal(m.desenvolvimento,
    ['ausente','uma_informacao','algumas_lacunas','poucas_lacunas','completo'],
    'algumas_lacunas');
  const contradicao = Boolean(m.contradicaoGrave);

  if (projeto === 'caotico') return 0;
  if (projeto === 'sem_foco') return 1;
  if (contradicao) return 2;
  if (projeto === 'muitas_falhas' || ['ausente','uma_informacao'].includes(desenvolvimento)) return 2;
  if (projeto === 'algumas_falhas' || desenvolvimento === 'algumas_lacunas') return 3;
  if (projeto === 'poucas_falhas' || desenvolvimento === 'poucas_lacunas') return 4;
  if (projeto === 'estrategico' && desenvolvimento === 'completo') {
    return m.validacaoBackend?.nivel5Comprovavel ? 5 : 4;
  }
  return 4;
}

function nivelC4(m = {}) {
  const coesao = enumVal(m.coesao,
    ['ausente','rara','pontual','regular','constante','expressiva'], 'regular');
  const repeticoes = enumVal(m.repeticoes,
    ['excessivas','muitas','algumas','poucas','raras_ausentes'], 'algumas');
  const inadequacoes = enumVal(m.inadequacoes,
    ['excessivas','muitas','algumas','poucas','nenhuma_relevante'], 'algumas');
  const monobloco = Boolean(m.monobloco);

  let nivel = ({
    ausente: 0,
    rara: 1,
    pontual: 2,
    regular: 3,
    constante: 4,
    expressiva: 5
  })[coesao];

  const tetoRep = ({
    excessivas: 1,
    muitas: 2,
    algumas: 3,
    poucas: 4,
    raras_ausentes: 5
  })[repeticoes];
  const tetoInad = ({
    excessivas: 1,
    muitas: 2,
    algumas: 3,
    poucas: 4,
    nenhuma_relevante: 5
  })[inadequacoes];

  nivel = Math.min(nivel, tetoRep, tetoInad);
  if (monobloco) nivel = Math.min(nivel, 2);
  if (nivel === 5 && !m.validacaoBackend?.nivel5Comprovavel) nivel = 4;
  return nivel;
}

function nivelC5(m = {}) {
  const relacao = enumVal(m.relacaoTema, ['nao_relacionada','tangencial','relacionada'], 'relacionada');
  const direitos = m.respeitaDireitosHumanos !== false;
  const condicional = Boolean(m.estruturaCondicional);

  if (!direitos || relacao === 'nao_relacionada') return 0;

  const validos = [
    Boolean(m.agenteValido),
    Boolean(m.acaoValida),
    Boolean(m.meioValido),
    Boolean(m.finalidadeValida),
    Boolean(m.detalhamentoValido)
  ].filter(Boolean).length;

  if (relacao === 'tangencial') return Math.min(1, validos);
  if (validos === 0) return 0;
  if (!m.acaoValida) return Math.min(2, validos);
  if (condicional && validos >= 2) return 2;
  return clamp(validos, 1, 5);
}

function nivelDerivado(codigo, marcadores = {}) {
  switch (String(codigo).toUpperCase()) {
    case 'C1': return nivelC1(marcadores.c1 || marcadores);
    case 'C2': return nivelC2(marcadores.c2 || marcadores);
    case 'C3': return nivelC3(marcadores.c3 || marcadores);
    case 'C4': return nivelC4(marcadores.c4 || marcadores);
    case 'C5': return nivelC5(marcadores.c5 || marcadores);
    default: return 0;
  }
}

function criterioOficial(codigo, nivel) {
  const c = COMPETENCIAS[String(codigo).toUpperCase()];
  return c?.niveis?.[nivel] || '';
}

function codigoFragilidadeFallback(codigo, marcadores = {}) {
  const k = String(codigo).toUpperCase();
  if (k === 'C1') return marcadores.c1?.estruturaSintatica === 'deficitaria' ? 'c1_estrutura_sintatica' : 'c1_desvios_formais';
  if (k === 'C2') {
    if (marcadores.c2?.abordagemTema !== 'completa') return 'c2_recorte_tematico';
    if (marcadores.c2?.tipoTextual !== 'dissertativo_argumentativo') return 'c2_tipo_textual';
    if (marcadores.c2?.copiaMotivadores === 'muitos_trechos') return 'c2_copia_motivadores';
    return 'c2_repertorio_produtivo';
  }
  if (k === 'C3') return marcadores.c3?.projetoTexto === 'estrategico' ? 'c3_desenvolvimento_argumentativo' : 'c3_projeto_texto';
  if (k === 'C4') return marcadores.c4?.repeticoes === 'muitas' ? 'c4_repeticoes' : 'c4_coesao_inter';
  if (k === 'C5') {
    const m = marcadores.c5 || {};
    if (!m.acaoValida) return 'c5_acao';
    if (!m.agenteValido) return 'c5_agente';
    if (!m.meioValido) return 'c5_meio';
    if (!m.finalidadeValida) return 'c5_finalidade';
    return 'c5_detalhamento';
  }
  return 'geral_revisao';
}

function elementosValidosC5(m = {}) {
  return [
    ['agente', m.agenteValido, m.agenteEvidenciaLiteral],
    ['ação', m.acaoValida, m.acaoEvidenciaLiteral],
    ['meio/modo', m.meioValido, m.meioEvidenciaLiteral],
    ['finalidade', m.finalidadeValida, m.finalidadeEvidenciaLiteral],
    ['detalhamento', m.detalhamentoValido, m.detalhamentoEvidenciaLiteral]
  ].filter(([, ok]) => ok);
}

function diagnosticoDerivado(codigo, marcadores, nivel) {
  const k = String(codigo).toUpperCase();
  if (k === 'C1') {
    const m = marcadores.c1 || {};
    const positivos = Number(m.validacaoBackend?.periodosBemConstruidosConfirmados || 0);
    return `A estrutura sintática foi classificada como ${s(m.estruturaSintatica).replaceAll('_', ' ') || 'regular'} e a ocorrência de desvios como ${s(m.quantidadeDesvios) || 'alguns'}. Foram confirmados ${positivos} exemplo(s) positivo(s) de construção sintática. O enquadramento final é o nível ${nivel}.`;
  }
  if (k === 'C2') {
    const m = marcadores.c2 || {};
    if (!m.repertorioLegitimado || !m.repertorioPertinente) {
      return `A abordagem temática foi ${s(m.abordagemTema) || 'completa'}, mas o backend não confirmou repertório sociocultural legitimado e pertinente por evidência específica no texto. Considerada também a estrutura, o enquadramento final é o nível ${nivel}.`;
    }
    if (!m.repertorioProdutivo) {
      return `Foi confirmado repertório legitimado e pertinente (${s(m.repertorioIdentificado) || 'referência identificada'}), porém sem uso produtivo suficiente na argumentação. O enquadramento final é o nível ${nivel}.`;
    }
    return `O texto aborda o tema de forma ${s(m.abordagemTema) || 'completa'} e mobiliza repertório legitimado, pertinente e produtivo (${s(m.repertorioIdentificado) || 'referência identificada'}), com articulação comprovada ao argumento. O enquadramento final é o nível ${nivel}.`;
  }
  if (k === 'C3') {
    const m = marcadores.c3 || {};
    const v = m.validacaoBackend || {};
    return `O projeto de texto foi classificado como ${s(m.projetoTexto).replaceAll('_', ' ')} e o desenvolvimento como ${s(m.desenvolvimento).replaceAll('_', ' ')}. Foram confirmadas ${Number(v.projetoTextoEvidenciasConfirmadas || 0)} evidência(s) de projeto, ${Number(v.desenvolvimentoEvidenciasConfirmadas || 0)} de desenvolvimento, ${Number(v.aprofundamentoArgumentativoConfirmado || 0)} de aprofundamento e ${Number(v.progressaoArgumentativaConfirmada || 0)} de progressão, com ${Number(v.lacunasConfirmadas || 0)} lacuna(s). O nível 5 exige comprovação qualitativa desses elementos, não apenas ausência de lacunas. O nível final é ${nivel}.`;
  }
  if (k === 'C4') {
    const m = marcadores.c4 || {};
    const v = m.validacaoBackend || {};
    return `A coesão foi classificada como ${s(m.coesao)}, com ${Number(v.coesaoIntraConfirmada || 0)} evidência(s) intra, ${Number(v.coesaoInterConfirmada || 0)} interparágrafos, ${Number(v.funcoesCoesivasDistintasConfirmadas || 0)} função(ões) semântica(s) distinta(s) e ${Number(v.retomadasReferenciaisConfirmadas || 0)} retomada(s) referencial(is) confirmada(s). Repetições: ${s(m.repeticoes).replaceAll('_', ' ')}; inadequações: ${s(m.inadequacoes).replaceAll('_', ' ')}${m.monobloco ? '; texto em monobloco' : ''}. Quantidade de conectivos, isoladamente, não confirma nível 5. O nível final é ${nivel}.`;
  }
  if (k === 'C5') {
    const m = marcadores.c5 || {};
    const nomes = elementosValidosC5(m).map(([nome]) => nome);
    return `A proposta apresenta ${nomes.length} elemento(s) validado(s) no próprio texto: ${nomes.length ? nomes.join(', ') : 'nenhum'}. Relação com o tema: ${s(m.relacaoTema).replaceAll('_', ' ')}. O enquadramento final é o nível ${nivel}.`;
  }
  return '';
}

function limitadoresDerivados(codigo, m = {}, nivel = 0) {
  const out = [];
  const k = String(codigo).toUpperCase();
  if (k === 'C1') {
    if (m.estruturaSintatica === 'deficitaria') out.push('Estrutura sintática deficitária limita o enquadramento nos níveis superiores.');
    if (m.quantidadeDesvios === 'muitos') out.push('A quantidade de desvios limita o enquadramento nos níveis superiores.');
  }
  if (k === 'C2') {
    if (!m.repertorioLegitimado || !m.repertorioPertinente) out.push('Sem repertório sociocultural legitimado e pertinente confirmado, C2 não ultrapassa o nível 3.');
    else if (!m.repertorioProdutivo) out.push('Repertório legitimado e pertinente, porém sem articulação produtiva comprovada por evidência distinta: teto no nível 4.');
    if (m.copiaMotivadores === 'muitos_trechos') out.push('Muitos trechos de cópia dos motivadores limitam C2 ao nível 2.');
    if (Number(m.partesReconheciveis) <= 2 || Number(m.partesEmbrionarias) >= 2) out.push('Estrutura embrionária/incompleta limita C2 ao nível 2.');
  }
  if (k === 'C3') {
    if (m.contradicaoGrave) out.push('Contradição grave limita C3 ao nível 2.');
    if (nivel < 5 && !m.validacaoBackend?.nivel5Comprovavel) out.push('Nível 5 não confirmado: projeto estratégico exige aprofundamento, progressão e relação tese-argumentos comprovados ao longo do texto.');
  }
  if (k === 'C4') {
    if (m.monobloco) out.push('Texto em monobloco não ultrapassa o nível 2 em C4.');
    if (['muitas','excessivas'].includes(m.repeticoes)) out.push('A quantidade de repetições limita o nível de C4.');
    if (['muitas','excessivas'].includes(m.inadequacoes)) out.push('As inadequações coesivas limitam o nível de C4.');
    if (nivel < 5 && !m.validacaoBackend?.nivel5Comprovavel) out.push('Nível 5 não confirmado: presença expressiva exige diversidade funcional, articulação intra/inter e retomadas adequadas — não apenas muitos conectivos.');
  }
  if (k === 'C5') {
    const qtd = elementosValidosC5(m).length;
    if (!m.acaoValida && qtd > 0) out.push('Proposta sem ação válida não ultrapassa o nível 2.');
    if (m.estruturaCondicional && qtd >= 2) out.push('Estrutura condicional com dois ou mais elementos válidos não ultrapassa o nível 2.');
  }
  return out.slice(0, 3);
}

function comoMelhorarDerivado(codigo, m = {}, nivel = 0) {
  const k = String(codigo).toUpperCase();
  if (k === 'C1') {
    if (nivel >= 5) return ['Manter o controle sintático e revisar apenas desvios excepcionais antes do envio.'];
    if (['inexistente','deficitaria'].includes(m.estruturaSintatica)) return ['Reorganizar períodos incompletos ou truncados e praticar construções sintáticas completas.', 'Revisar os desvios formais recorrentes identificados no texto.'];
    return ['Aprimorar a variedade e a complexidade sintática, revisando os desvios formais ainda presentes.'];
  }
  if (k === 'C2') {
    if (m.abordagemTema !== 'completa') return ['Treinar leitura do recorte temático e manter todos os argumentos vinculados à proposta.'];
    if (!m.repertorioLegitimado || !m.repertorioPertinente) return ['Incorporar repertório sociocultural específico, legitimado e pertinente, explicando sua relação com o argumento.'];
    if (!m.repertorioProdutivo) return ['Aprofundar a articulação entre o repertório utilizado e o argumento para torná-lo produtivo.'];
    return ['Manter repertórios específicos e ampliar sua integração crítica ao projeto de texto.'];
  }
  if (k === 'C3') {
    if (nivel >= 5) return ['Manter o projeto de texto estratégico e o desenvolvimento consistente dos argumentos.'];
    return ['Aprofundar os argumentos, reduzindo lacunas e tornando mais explícita a progressão entre tese, explicações e consequências.'];
  }
  if (k === 'C4') {
    if (nivel >= 5) return ['Manter a variedade de mecanismos coesivos sem criar repetições ou inadequações.'];
    return ['Variar mecanismos de coesão e revisar repetições ou inadequações que prejudiquem a fluidez.'];
  }
  if (k === 'C5') {
    const faltantes = [
      ['agente', m.agenteValido], ['ação', m.acaoValida], ['meio/modo', m.meioValido],
      ['finalidade', m.finalidadeValida], ['detalhamento', m.detalhamentoValido]
    ].filter(([, ok]) => !ok).map(([nome]) => nome);
    if (!faltantes.length) return ['Manter os cinco elementos da intervenção articulados ao problema e aos argumentos.'];
    return [`Completar a proposta de intervenção com ${faltantes.join(', ')}, mantendo os elementos articulados ao problema discutido.`];
  }
  return ['Revisar a competência com base na devolutiva e praticar uma nova produção.'];
}

function evidenciasDerivadas(codigo, m = {}, originais = []) {
  const k = String(codigo).toUpperCase();
  const base = array(originais).map(s).filter(Boolean);
  if (k === 'C1') {
    const v = m.validacaoBackend || {};
    const detalhes = array(m.desviosAuditaveis);
    const categorias = v.desviosPorCategoria || {};
    const resumoCategorias = Object.entries(categorias).map(([cat, qtd]) => `${cat.replaceAll('_', ' ')}: ${qtd}`).join('; ');
    const auditaveis = [
      `Desvios auditados: ${Number(v.desviosConfirmados || 0)} em ${Number(v.categoriasDesviosConfirmadas || 0)} categoria(s)${resumoCategorias ? ` — ${resumoCategorias}` : ''}.`,
      `Falhas sintáticas confirmadas: ${Number(v.falhasConfirmadas || 0)}; períodos bem construídos confirmados: ${Number(v.periodosBemConstruidosConfirmados || 0)}.`
    ];
    if (detalhes.length) auditaveis.push(`Exemplos: ${detalhes.slice(0, 3).map((x) => `“${s(x.evidencia)}” (${s(x.categoria).replaceAll('_', ' ')})`).join('; ')}.`);
    return listaUnica([...auditaveis, ...base], 4);
  }
  if (k === 'C2' && (!m.repertorioLegitimado || !m.repertorioPertinente)) {
    const neutras = base.filter((x) => !/repert[oó]rio.*(?:legitim|pertinent|produtiv|adequad)/i.test(x));
    return [
      ...neutras,
      'Não foi confirmada, por evidência específica no texto, referência sociocultural externa legitimada e pertinente.'
    ].slice(0, 3);
  }
  if (k === 'C3') {
    const v = m.validacaoBackend || {};
    const auditaveis = [
      `Projeto: ${Number(v.projetoTextoEvidenciasConfirmadas || 0)} evidência(s); desenvolvimento: ${Number(v.desenvolvimentoEvidenciasConfirmadas || 0)}; aprofundamento: ${Number(v.aprofundamentoArgumentativoConfirmado || 0)}; progressão: ${Number(v.progressaoArgumentativaConfirmada || 0)}.`,
      `Cobertura em parágrafos — desenvolvimento: ${Number(v.coberturaParagrafosDesenvolvimento || 0)}; aprofundamento: ${Number(v.coberturaParagrafosAprofundamento || 0)}; progressão: ${Number(v.coberturaParagrafosProgressao || 0)}.`
    ];
    if (!v.nivel5Comprovavel) auditaveis.push('Nível 5 não confirmado automaticamente: a Grade exige projeto estratégico e desenvolvimento consistente em todo o texto.');
    return listaUnica([...auditaveis, ...base], 4);
  }
  if (k === 'C4') {
    const coesivos = array(m.elementosCoesivosEvidencias).map(s).filter(Boolean);
    const repeticoes = array(m.repeticoesEvidencias).map(s).filter(Boolean);
    const inadequacoes = array(m.inadequacoesEvidencias).map(s).filter(Boolean);
    const auditaveis = [];
    const v = m.validacaoBackend || {};
    if (coesivos.length) auditaveis.push(`Elementos coesivos confirmados: ${coesivos.slice(0, 5).map((x) => `“${x}”`).join(', ')}.`);
    auditaveis.push(`Funções semânticas distintas: ${Number(v.funcoesCoesivasDistintasConfirmadas || 0)}; intra: ${Number(v.coesaoIntraConfirmada || 0)}; inter: ${Number(v.coesaoInterConfirmada || 0)}; retomadas referenciais: ${Number(v.retomadasReferenciaisConfirmadas || 0)}.`);
    if (repeticoes.length) auditaveis.push(`Repetições confirmadas: ${repeticoes.slice(0, 4).map((x) => `“${x}”`).join(', ')}.`);
    else auditaveis.push('Nenhuma repetição relevante foi confirmada por evidência literal para aplicar teto adicional.');
    if (inadequacoes.length) auditaveis.push(`Inadequações coesivas confirmadas: ${inadequacoes.slice(0, 4).map((x) => `“${x}”`).join(', ')}.`);
    else auditaveis.push('Nenhuma inadequação coesiva relevante foi confirmada por evidência literal para aplicar teto adicional.');
    if (Number(v.inadequacoesIgnoradasPorSeremC1 || 0) > 0) auditaveis.push(`${Number(v.inadequacoesIgnoradasPorSeremC1)} ocorrência(s) gramatical(is) foram excluídas de C4 e mantidas apenas em C1.`);
    return listaUnica([...auditaveis, ...base], 4);
  }
  if (k === 'C5') {
    const evs = elementosValidosC5(m).map(([nome, , ev]) => `${nome}: “${s(ev)}”`).filter((x) => !x.endsWith('“”'));
    if (evs.length) return evs.slice(0, 3);
  }
  return base.slice(0, 3);
}

function planoPorFragilidade(codigo = '') {
  const mapa = {
    c1_estrutura_sintatica: 'Praticar construção de períodos completos e progressivamente mais complexos, revisando falhas sintáticas reais encontradas no texto.',
    c1_desvios_formais: 'Revisar os desvios formais efetivamente identificados, com exercícios de pontuação, concordância, regência e escolha vocabular conforme a necessidade.',
    c2_recorte_tematico: 'Treinar leitura do tema, recorte e palavras-chave para manter toda a argumentação dentro da proposta.',
    c2_tipo_textual: 'Revisar a organização dissertativo-argumentativa e a defesa explícita de um ponto de vista.',
    c2_repertorio_produtivo: 'Praticar seleção e uso de repertório sociocultural legitimado, pertinente e articulado ao argumento, evitando referências decorativas.',
    c2_copia_motivadores: 'Treinar paráfrase e construção de argumentos próprios, usando os textos motivadores apenas como ponto de partida.',
    c3_tese: 'Treinar formulação de tese clara e coerente com os argumentos desenvolvidos.',
    c3_projeto_texto: 'Planejar tese, argumentos e progressão antes da escrita para tornar o projeto de texto mais estratégico.',
    c3_desenvolvimento_argumentativo: 'Aprofundar os argumentos com explicação, relação causal e análise, evitando ideias apenas mencionadas.',
    c3_lacunas_progressao: 'Revisar a progressão entre as ideias e preencher lacunas de desenvolvimento identificadas nos parágrafos.',
    c4_coesao_intra: 'Praticar articulação entre orações e períodos com mecanismos coesivos adequados ao sentido.',
    c4_coesao_inter: 'Praticar transições entre parágrafos e retomadas referenciais, evitando conectivos mecânicos.',
    c4_repeticoes: 'Revisar repetições e variar mecanismos de retomada sem comprometer a precisão do texto.',
    c5_acao: 'Treinar propostas de intervenção com ação concreta e executável, articulada ao problema discutido.',
    c5_agente: 'Especificar o agente responsável pela intervenção e sua relação com a ação proposta.',
    c5_meio: 'Detalhar o meio ou modo pelo qual a ação será executada.',
    c5_finalidade: 'Explicitar a finalidade da intervenção e o efeito esperado sobre o problema.',
    c5_detalhamento: 'Aprimorar o detalhamento de pelo menos um elemento da proposta de intervenção.',
    geral_revisao: 'Revisar a devolutiva e praticar uma nova produção completa.'
  };
  return mapa[codigo] || mapa.geral_revisao;
}

function pontoForte(codigo, nivel, marcadores = {}) {
  const k = String(codigo).toUpperCase();
  if (k === 'C1' && nivel >= 4) return 'Bom domínio da modalidade escrita formal, com estrutura sintática adequada ao nível identificado.';
  if (k === 'C2') {
    const m = marcadores.c2 || {};
    if (m.abordagemTema === 'completa' && m.tipoTextual === 'dissertativo_argumentativo') {
      if (nivel >= 4 && m.repertorioLegitimado) return 'Abordagem completa do tema, manutenção do tipo dissertativo-argumentativo e repertório pertinente confirmado.';
      return 'Abordagem completa do tema e manutenção do tipo dissertativo-argumentativo.';
    }
  }
  if (k === 'C3' && nivel >= 4) return 'Projeto de texto organizado, com progressão argumentativa consistente e poucas lacunas.';
  if (k === 'C4' && nivel >= 4) return 'Boa articulação entre as partes do texto, com mecanismos coesivos adequados ao nível identificado.';
  if (k === 'C5' && nivel >= 4) return `Proposta de intervenção com ${elementosValidosC5(marcadores.c5 || {}).length} elementos válidos confirmados no texto.`;
  return '';
}

function pontoMelhoria(codigo, nivel, marcadores = {}) {
  const k = String(codigo).toUpperCase();
  if (nivel >= 5) return '';
  return comoMelhorarDerivado(k, marcadores[k.toLowerCase()] || {}, nivel)[0] || '';
}

function listaUnica(itens = [], max = 6) {
  const vistos = new Set();
  const out = [];
  for (const item of itens) {
    const valor = s(item);
    if (!valor) continue;
    const chave = semAcentos(valor).toLocaleLowerCase('pt-BR');
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(valor);
    if (out.length >= max) break;
  }
  return out;
}

function construirNarrativaSincronizada({ feedbackCompetencias, marcadoresGrade, notaTotal, recomendacaoEstruturada }) {
  const codigos = ['C1','C2','C3','C4','C5'];
  const pares = codigos.map((codigo) => {
    const f = feedbackCompetencias[codigo.toLowerCase()] || {};
    return { codigo, nivel: Number(f.nivelGrade || 0), pontos: Number(f.pontuacao || 0), fragilidade: f.codigoFragilidade };
  });
  const ordenadas = [...pares].sort((a, b) => a.pontos - b.pontos || a.codigo.localeCompare(b.codigo));
  const fortes = listaUnica(pares.map((p) => pontoForte(p.codigo, p.nivel, marcadoresGrade)).filter(Boolean), 5);
  if (fortes.length < 2) {
    fortes.push('A devolutiva identificou aspectos concretos do texto que podem orientar a próxima etapa de estudo.');
  }
  const melhorar = listaUnica(ordenadas.map((p) => pontoMelhoria(p.codigo, p.nivel, marcadoresGrade)).filter(Boolean), 5);
  const desempenhoMaximo = pares.every((p) => p.pontos === 200);
  const prioridade = desempenhoMaximo ? 'GERAL' : (recomendacaoEstruturada?.competencia || ordenadas[0]?.codigo || 'GERAL');
  const fragilidade = desempenhoMaximo ? 'geral_revisao' : (recomendacaoEstruturada?.codigoFragilidade || ordenadas[0]?.fragilidade || 'geral_revisao');
  const foco = desempenhoMaximo
    ? 'Manter o desempenho máximo estimado e buscar maior refinamento, autoria e consistência em novas propostas.'
    : planoPorFragilidade(fragilidade);
  const planos = desempenhoMaximo
    ? ['Comparar estratégias argumentativas de redações exemplares e experimentar novas formas de aprofundamento sem perder clareza.', 'Revisar a produção com foco em precisão vocabular, autoria e consistência entre tese, argumentos e intervenção.']
    : listaUnica(ordenadas.slice(0, 4).map((p) => planoPorFragilidade(p.fragilidade)), 5);
  const notas = pares.map((p) => `${p.codigo} ${p.pontos}`).join(' • ');
  const principal = melhorar[0] || foco;

  const resumoAvaliacao = desempenhoMaximo
    ? `Estimativa pedagógica: ${notaTotal} pontos (${notas}). Todas as competências atingiram o nível 5 nesta estimativa; não há prioridade corretiva. O próximo passo é manter o desempenho e buscar refinamento.`
    : `Estimativa pedagógica: ${notaTotal} pontos (${notas}). A prioridade pedagógica atual é ${prioridade}: ${principal}`;

  const c2 = marcadoresGrade.c2 || {};
  const c5 = marcadoresGrade.c5 || {};
  const obsC2 = c2.repertorioLegitimado && c2.repertorioPertinente
    ? `Em C2, foi confirmado repertório ${c2.repertorioProdutivo ? 'produtivo' : 'pertinente, porém ainda não produtivo'}: ${s(c2.repertorioIdentificado) || 'referência identificada'}.`
    : 'Em C2, não foi confirmada evidência específica de repertório sociocultural legitimado e pertinente no texto.';
  const qtdC5 = elementosValidosC5(c5).length;
  const obsC5 = `Em C5, foram confirmados ${qtdC5} de 5 elementos da proposta de intervenção.`;
  const observacoesTecnicas = `Enquadramento final sincronizado com a Grade Específica ENEM 2025: ${pares.map((p) => `${p.codigo} nível ${p.nivel}`).join(', ')}. ${obsC2} ${obsC5}`;

  const faltantesC5 = [
    ['agente', c5.agenteValido], ['ação', c5.acaoValida], ['meio/modo', c5.meioValido],
    ['finalidade', c5.finalidadeValida], ['detalhamento', c5.detalhamentoValido]
  ].filter(([, ok]) => !ok).map(([nome]) => nome);
  const sugestaoAprimoramentoIntervencao = faltantesC5.length
    ? `Exemplo de aprimoramento: explicite ${faltantesC5.join(', ')} na proposta, mantendo cada elemento diretamente relacionado ao problema discutido.`
    : 'A proposta já apresenta os cinco elementos validados pela grade; preserve essa completude nas próximas produções.';

  return {
    resumoAvaliacao,
    focoPrincipal: foco,
    pontosFortes: fortes.slice(0, 5),
    pontosMelhorar: melhorar.length ? melhorar : ['Manter o desempenho e buscar maior refinamento, autoria e consistência nas próximas produções.'],
    recomendacoes: listaUnica([foco, ...planos], 6),
    planoEstudoSugerido: planos.length ? planos : [foco],
    observacoesTecnicas,
    sugestaoAprimoramentoIntervencao
  };
}

function validarCoerencia({ raw = {}, feedbackCompetencias = {}, marcadoresGrade = {}, contexto = {} }) {
  const marcadoresValidados = prepararMarcadoresValidados({ raw, marcadoresGrade, contexto });
  const saida = {};
  const ajustes = [];
  const codigos = ['C1','C2','C3','C4','C5'];

  codigos.forEach((codigo) => {
    const chave = codigo.toLowerCase();
    const original = feedbackCompetencias[chave] || {};
    const inicial = clamp(Math.round(n(original.nivelGrade, 0)), 0, 5);
    const final = nivelDerivado(codigo, marcadoresValidados);
    const ajustada = inicial !== final;
    const m = marcadoresValidados[chave] || {};

    saida[chave] = {
      ...original,
      nivelGrade: final,
      pontuacao: nivelParaPontos(final),
      nivel: `Nível ${final}`,
      criterioAplicado: criterioOficial(codigo, final),
      diagnostico: diagnosticoDerivado(codigo, marcadoresValidados, final),
      evidencias: evidenciasDerivadas(codigo, m, original.evidencias),
      limitadores: limitadoresDerivados(codigo, m, final),
      comoMelhorar: comoMelhorarDerivado(codigo, m, final),
      codigoFragilidade: CODIGOS_FRAGILIDADE.includes(original.codigoFragilidade)
        ? original.codigoFragilidade
        : codigoFragilidadeFallback(codigo, marcadoresValidados)
    };

    const fallback = codigoFragilidadeFallback(codigo, marcadoresValidados);
    if (final < 5 && (!CODIGOS_FRAGILIDADE.includes(saida[chave].codigoFragilidade) || saida[chave].codigoFragilidade === 'geral_revisao')) {
      saida[chave].codigoFragilidade = fallback;
    }

    if (ajustada) {
      ajustes.push({
        competencia: codigo,
        nivelInicial: inicial,
        pontosIniciais: nivelParaPontos(inicial),
        nivelFinal: final,
        pontosFinais: nivelParaPontos(final),
        motivo: `Nível recalculado a partir dos marcadores validados no próprio texto. Critério final: ${criterioOficial(codigo, final)}`
      });
    }
  });

  const competencias = Object.fromEntries(Object.entries(saida).map(([k, f]) => [k, f.pontuacao]));
  const notaTotal = Object.values(competencias).reduce((acc, x) => acc + x, 0);
  const menor = Math.min(...Object.values(competencias));
  const desempenhoMaximo = menor === 200;
  const candidatas = Object.keys(competencias).filter((k) => competencias[k] === menor);
  const atual = s(raw.recomendacaoEstruturada?.competencia).toLowerCase();
  const prioridade = desempenhoMaximo ? 'geral' : (candidatas.includes(atual) ? atual : candidatas[0]);
  const codPrioridade = desempenhoMaximo ? 'geral_revisao' : codigoFragilidadeFallback(prioridade.toUpperCase(), marcadoresValidados);

  const recomendacaoEstruturada = desempenhoMaximo ? {
    competencia: 'GERAL',
    codigoFragilidade: 'geral_revisao',
    prioridade: 1,
    motivo: 'Todas as competências atingiram o nível 5 na estimativa atual; não há competência deficitária a priorizar. O próximo passo é manter consistência e buscar refinamento.'
  } : {
    competencia: prioridade.toUpperCase(),
    codigoFragilidade: codPrioridade,
    prioridade: 1,
    motivo: saida[prioridade]?.diagnostico || 'Competência com menor pontuação na avaliação.'
  };

  const narrativa = construirNarrativaSincronizada({
    feedbackCompetencias: saida,
    marcadoresGrade: marcadoresValidados,
    notaTotal,
    recomendacaoEstruturada
  });

  const c5 = marcadoresValidados.c5 || {};
  const elementosIntervencao = {
    agente: c5.agenteValido ? s(c5.agenteEvidenciaLiteral) : '',
    acao: c5.acaoValida ? s(c5.acaoEvidenciaLiteral) : '',
    meio: c5.meioValido ? s(c5.meioEvidenciaLiteral) : '',
    finalidade: c5.finalidadeValida ? s(c5.finalidadeEvidenciaLiteral) : '',
    detalhamento: c5.detalhamentoValido ? s(c5.detalhamentoEvidenciaLiteral) : '',
    respeitaDireitosHumanos: c5.respeitaDireitosHumanos !== false
  };

  return {
    feedbackCompetencias: saida,
    competencias,
    notaTotal,
    marcadoresGrade: marcadoresValidados,
    recomendacaoEstruturada,
    elementosIntervencao,
    ...narrativa,
    auditoriaCoerencia: {
      versao: VERSAO_VALIDACAO,
      status: ajustes.length ? 'ajustada' : 'coerente',
      competenciasAjustadas: ajustes,
      quantidadeAjustes: ajustes.length,
      c1DesviosConfirmados: Number(marcadoresValidados.c1?.validacaoBackend?.desviosConfirmados || 0),
      c1CategoriasDesviosConfirmadas: Number(marcadoresValidados.c1?.validacaoBackend?.categoriasDesviosConfirmadas || 0),
      c1AuditoriaDetalhadaUtilizada: Boolean(marcadoresValidados.c1?.validacaoBackend?.auditoriaDetalhadaUtilizada),
      c1PeriodosBemConstruidosConfirmados: Number(marcadoresValidados.c1?.validacaoBackend?.periodosBemConstruidosConfirmados || 0),
      c1Nivel5Comprovavel: Boolean(marcadoresValidados.c1?.validacaoBackend?.nivel5Comprovavel),
      repertorioC2Validado: Boolean(marcadoresValidados.c2?.repertorioLegitimado && marcadoresValidados.c2?.repertorioPertinente),
      c2AncoraExternaValidada: Boolean(marcadoresValidados.c2?.validacaoBackend?.ancoraValida),
      c2ArticulacaoProdutivaValidada: Boolean(marcadoresValidados.c2?.validacaoBackend?.articulacaoValidada),
      c2RepertorioRecuperadoBackend: Boolean(marcadoresValidados.c2?.validacaoBackend?.repertorioRecuperadoBackend),
      c2FonteDeteccao: s(marcadoresValidados.c2?.validacaoBackend?.fonteDeteccao || 'ia'),
      c3TeseConfirmada: Boolean(marcadoresValidados.c3?.validacaoBackend?.teseConfirmada),
      c3ProjetoEvidenciasConfirmadas: Number(marcadoresValidados.c3?.validacaoBackend?.projetoTextoEvidenciasConfirmadas || 0),
      c3DesenvolvimentoEvidenciasConfirmadas: Number(marcadoresValidados.c3?.validacaoBackend?.desenvolvimentoEvidenciasConfirmadas || 0),
      c3AprofundamentoConfirmado: Number(marcadoresValidados.c3?.validacaoBackend?.aprofundamentoArgumentativoConfirmado || 0),
      c3ProgressaoConfirmada: Number(marcadoresValidados.c3?.validacaoBackend?.progressaoArgumentativaConfirmada || 0),
      c3RelacaoTeseArgumentosConfirmada: Number(marcadoresValidados.c3?.validacaoBackend?.relacaoTeseArgumentosConfirmada || 0),
      c3CoberturaParagrafosAprofundamento: Number(marcadoresValidados.c3?.validacaoBackend?.coberturaParagrafosAprofundamento || 0),
      c3Nivel4Comprovavel: Boolean(marcadoresValidados.c3?.validacaoBackend?.nivel4Comprovavel),
      c3Nivel5Comprovavel: Boolean(marcadoresValidados.c3?.validacaoBackend?.nivel5Comprovavel),
      c3LacunasConfirmadas: Number(marcadoresValidados.c3?.validacaoBackend?.lacunasConfirmadas || 0),
      c4EvidenciasCoesivasConfirmadas: Number(marcadoresValidados.c4?.validacaoBackend?.elementosCoesivosConfirmados || 0),
      c4CoesaoIntraConfirmada: Number(marcadoresValidados.c4?.validacaoBackend?.coesaoIntraConfirmada || 0),
      c4CoesaoInterConfirmada: Number(marcadoresValidados.c4?.validacaoBackend?.coesaoInterConfirmada || 0),
      c4FuncoesCoesivasDistintasConfirmadas: Number(marcadoresValidados.c4?.validacaoBackend?.funcoesCoesivasDistintasConfirmadas || 0),
      c4FuncoesIntraDistintas: Number(marcadoresValidados.c4?.validacaoBackend?.funcoesIntraDistintas || 0),
      c4FuncoesInterDistintas: Number(marcadoresValidados.c4?.validacaoBackend?.funcoesInterDistintas || 0),
      c4RetomadasReferenciaisConfirmadas: Number(marcadoresValidados.c4?.validacaoBackend?.retomadasReferenciaisConfirmadas || 0),
      c4Nivel5Comprovavel: Boolean(marcadoresValidados.c4?.validacaoBackend?.nivel5Comprovavel),
      c4RepeticoesConfirmadas: Number(marcadoresValidados.c4?.validacaoBackend?.repeticoesConfirmadas || 0),
      c4InadequacoesConfirmadas: Number(marcadoresValidados.c4?.validacaoBackend?.inadequacoesConfirmadas || 0),
      c4InadequacoesIgnoradasPorSeremC1: Number(marcadoresValidados.c4?.validacaoBackend?.inadequacoesIgnoradasPorSeremC1 || 0),
      c4ParagrafosDetectados: Number(marcadoresValidados.c4?.validacaoBackend?.paragrafosDetectados || 0),
      elementosC5Validados: elementosValidosC5(c5).map(([nome]) => nome),
      validadoEm: new Date()
    }
  };
}

module.exports = {
  VERSAO_VALIDACAO,
  nivelC1,
  nivelC2,
  nivelC3,
  nivelC4,
  nivelC5,
  nivelDerivado,
  validarCoerencia,
  criterioOficial,
  codigoFragilidadeFallback,
  prepararMarcadoresValidados,
  construirNarrativaSincronizada,
  evidenciaPresente
};
