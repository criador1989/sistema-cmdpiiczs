'use strict';

const {
  FONTE_MATRIZ_ENEM,
  resolverHabilidadeEnem,
  contarHabilidadesArea,
} = require('./enemMatrizReferenciaService');

function texto(value) {
  return String(value ?? '').trim();
}

function semAcentos(value) {
  return texto(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizarChave(value) {
  return semAcentos(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function siglaAreaEnem(codigo) {
  return ({ LINGUAGENS: 'LC', MATEMATICA: 'MAT', NATUREZA: 'CN', HUMANAS: 'CH' })[texto(codigo).toUpperCase()] || texto(codigo).toUpperCase();
}

function confiancaEnemDaVariante(variante, enem) {
  if (!enem) return '';
  return texto(variante?.habilidadeEnemConfianca).toLowerCase() === 'aproximada' ? 'aproximada' : 'direta';
}

function normalizarIdioma(value, { aplicavel = true } = {}) {
  if (!aplicavel) return 'NAO_APLICAVEL';
  const chave = normalizarChave(value);
  if (['INGLES', 'INGLESA', 'ENGLISH', 'ING'].includes(chave)) return 'INGLES';
  if (['ESPANHOL', 'ESPANHOLA', 'ESPANOL', 'ESPANOLA', 'SPANISH', 'ESP'].includes(chave)) return 'ESPANHOL';
  if (['NAO_MARCADO', 'NAO_MARCOU', 'SEM_OPCAO', 'SEM_LINGUA', 'NENHUMA'].includes(chave)) return 'NAO_MARCADO';
  if (['NAO_APLICAVEL', 'N_A', 'NA', 'SEM_IDIOMA'].includes(chave)) return 'NAO_APLICAVEL';
  return 'NAO_INFORMADO';
}

function normalizarResposta(value) {
  if (value === undefined || value === null) return { informada: false, resposta: '' };
  const chave = normalizarChave(value);
  if (!chave) return { informada: false, resposta: '' };
  if (['BRANCO', 'EM_BRANCO', 'VAZIO', 'SEM_RESPOSTA', 'NULO', 'ANULADA', 'ANULADO'].includes(chave)) {
    return { informada: true, resposta: '' };
  }
  if (['A', 'B', 'C', 'D', 'E'].includes(chave)) return { informada: true, resposta: chave };
  return { informada: false, resposta: '', invalida: true, original: texto(value) };
}

function questaoTemIdioma(questao) {
  return (questao?.variantes || []).some((item) => ['INGLES', 'ESPANHOL'].includes(texto(item?.codigo).toUpperCase()));
}

function simuladoTemIdioma(simulado) {
  return (simulado?.questoes || []).some(questaoTemIdioma);
}

function contextoIdiomaResultado(simulado, resultado = {}) {
  const diasIdioma = [...new Set((simulado?.questoes || [])
    .filter((questao) => questaoTemIdioma(questao))
    .map((questao) => Number(questao?.dia || 1))
    .filter((dia) => Number.isInteger(dia) && dia >= 1))];
  const diasAusentes = new Set((resultado?.diasAusentes || [])
    .map((dia) => Number(dia))
    .filter((dia) => Number.isInteger(dia) && dia >= 1));
  const idiomaArmazenado = normalizarIdioma(resultado?.idiomaEstrangeiro, { aplicavel: simuladoTemIdioma(simulado) });
  const naoAplicavelPorAusencia = diasIdioma.length > 0 && diasIdioma.every((dia) => diasAusentes.has(dia));

  return {
    idiomaEstrangeiroEfetivo: naoAplicavelPorAusencia ? 'NAO_APLICAVEL' : idiomaArmazenado,
    idiomaNaoAplicavelPorAusencia: naoAplicavelPorAusencia,
    idiomaEstrangeiroPreservado: idiomaArmazenado,
    idiomaOrigemPreservada: texto(resultado?.idiomaOrigem) || 'nao_informado',
  };
}

function selecionarVariante(questao, idioma) {
  const variantes = Array.isArray(questao?.variantes) ? questao.variantes : [];
  const lingua = texto(idioma).toUpperCase();
  const especifica = variantes.find((item) => texto(item?.codigo).toUpperCase() === lingua);
  if (especifica) return especifica;
  return variantes.find((item) => texto(item?.codigo).toUpperCase() === 'PADRAO') || null;
}

function arredondar(value, casas = 1) {
  const fator = 10 ** casas;
  return Math.round((Number(value) || 0) * fator) / fator;
}

function percentual(numerador, denominador) {
  return denominador > 0 ? arredondar((numerador / denominador) * 100, 1) : 0;
}

function configuracao(simulado) {
  const cfg = simulado?.configuracaoAnalise || {};
  const valorOu = (valor, fallback) => {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : fallback;
  };
  return {
    percentualConsolidado: valorOu(cfg.percentualConsolidado, 70),
    percentualAtencao: valorOu(cfg.percentualAtencao, 50),
    minimoQuestoesIndicador: valorOu(cfg.minimoQuestoesIndicador, 2),
    minimoRespondentesQuestao: valorOu(cfg.minimoRespondentesQuestao, 5),
    minimoAlunosGrupo: valorOu(cfg.minimoAlunosGrupo, 2),
    minimoCoberturaIndividual: valorOu(cfg.minimoCoberturaIndividual, 80),
  };
}

function classificarNivel(valorPercentual, evidenciaSuficiente, cfg) {
  if (!evidenciaSuficiente) return 'evidencia_insuficiente';
  if (valorPercentual >= cfg.percentualConsolidado) return 'consolidado';
  if (valorPercentual >= cfg.percentualAtencao) return 'em_desenvolvimento';
  return 'prioritario';
}

function classificarFaixaOperacional(valorPercentual, { evidenciaSuficiente = true, coberturaPercentual = 100 } = {}, cfg) {
  if (!evidenciaSuficiente || coberturaPercentual < cfg.minimoCoberturaIndividual) return 'evidencia_insuficiente';
  if (valorPercentual >= cfg.percentualConsolidado) return 'consolidado';
  if (valorPercentual >= cfg.percentualAtencao) return 'em_desenvolvimento';
  const limiteCritico = cfg.percentualAtencao * 0.5;
  const limitePrioridadeAlta = cfg.percentualAtencao * 0.8;
  if (valorPercentual < limiteCritico) return 'critico';
  if (valorPercentual < limitePrioridadeAlta) return 'prioridade_alta';
  return 'em_atencao';
}

function evidenciaPedagogica(resposta) {
  return !['IDIOMA_NAO_MARCADO', 'IDIOMA_PENDENTE', 'GABARITO_PENDENTE', 'ANULADA'].includes(texto(resposta?.situacao).toUpperCase());
}

function eixoPedagogicoDaVariante(variante) {
  const macro = texto(variante?.macroconteudo);
  if (macro) return { rotulo: macro, origem: 'macroconteudo' };
  const componente = texto(variante?.componente);
  if (componente) return { rotulo: componente, origem: 'componente' };
  return { rotulo: '', origem: '' };
}

function respostaPorCodigo(respostasInput) {
  const mapa = new Map();
  const fonte = respostasInput && typeof respostasInput.toObject === 'function'
    ? respostasInput.toObject()
    : (respostasInput || {});

  if (fonte instanceof Map) {
    fonte.forEach((value, key) => mapa.set(texto(key).toUpperCase(), value));
    return mapa;
  }

  Object.entries(fonte).forEach(([key, value]) => mapa.set(texto(key).toUpperCase(), value));
  return mapa;
}

function metricaVazia(chave, rotulo) {
  return {
    chave,
    rotulo,
    totalQuestoes: 0,
    respondidas: 0,
    observadas: 0,
    acertos: 0,
    erros: 0,
    brancos: 0,
    naoInformadas: 0,
    pendentesIdioma: 0,
    semOpcaoIdioma: 0,
    pontosObtidos: 0,
    pontosPossiveis: 0,
    pontosPossiveisAplicaveis: 0,
  };
}

function finalizarMetrica(item, cfg, evidenciaMinima = cfg.minimoQuestoesIndicador) {
  const observadas = Number(item.observadas ?? (item.respondidas + item.brancos + item.semOpcaoIdioma)) || 0;
  const evidenciaSuficiente = observadas >= evidenciaMinima;
  const percentualAcerto = percentual(item.acertos, item.respondidas);
  const percentualPontuacao = percentual(item.pontosObtidos, item.pontosPossiveis);
  const coberturaPercentual = percentual(observadas, item.totalQuestoes);

  return {
    chave: item.chave,
    rotulo: item.rotulo,
    totalQuestoes: item.totalQuestoes,
    respondidas: item.respondidas,
    observadas,
    acertos: item.acertos,
    erros: item.erros,
    brancos: item.brancos,
    naoInformadas: item.naoInformadas,
    pendentesIdioma: item.pendentesIdioma,
    semOpcaoIdioma: item.semOpcaoIdioma,
    pontosObtidos: item.pontosObtidos,
    pontosPossiveis: item.pontosPossiveis,
    percentualAcerto,
    percentualPontuacao,
    coberturaPercentual,
    evidenciaSuficiente,
    nivel: classificarNivel(percentualPontuacao, evidenciaSuficiente, cfg),
  };
}

function agruparRespostas(respostas, campo, cfg, { somentePedagogico = false } = {}) {
  const grupos = new Map();

  for (const resposta of respostas || []) {
    if (['ANULADA', 'GABARITO_PENDENTE'].includes(resposta.situacao)) continue;
    if (somentePedagogico && !evidenciaPedagogica(resposta)) continue;
    const rotulo = texto(resposta[campo]) || 'Não classificado';
    const chave = normalizarChave(rotulo) || 'NAO_CLASSIFICADO';
    if (!grupos.has(chave)) grupos.set(chave, metricaVazia(chave, rotulo));
    const item = grupos.get(chave);

    if (resposta.situacao !== 'IDIOMA_PENDENTE') {
      item.totalQuestoes += 1;
      item.pontosPossiveisAplicaveis += Number(resposta.peso) || 1;
    }

    if (resposta.situacao === 'ACERTO') {
      item.respondidas += 1;
      item.observadas += 1;
      item.acertos += 1;
      item.pontosObtidos += Number(resposta.peso) || 1;
      item.pontosPossiveis += Number(resposta.peso) || 1;
    } else if (resposta.situacao === 'ERRO') {
      item.respondidas += 1;
      item.observadas += 1;
      item.erros += 1;
      item.pontosPossiveis += Number(resposta.peso) || 1;
    } else if (resposta.situacao === 'BRANCO') {
      item.observadas += 1;
      item.brancos += 1;
      item.pontosPossiveis += Number(resposta.peso) || 1;
    } else if (resposta.situacao === 'IDIOMA_NAO_MARCADO') {
      item.observadas += 1;
      item.semOpcaoIdioma += 1;
      item.pontosPossiveis += Number(resposta.peso) || 1;
    } else if (resposta.situacao === 'NAO_INFORMADA') {
      item.naoInformadas += 1;
    } else if (resposta.situacao === 'IDIOMA_PENDENTE') {
      item.pendentesIdioma += 1;
    }
  }

  return [...grupos.values()]
    .map((item) => finalizarMetrica(item, cfg))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true }));
}

function avaliarResultado(simulado, { respostas: respostasInput = {}, idiomaEstrangeiro = 'NAO_INFORMADO', diasAusentes = [] } = {}) {
  const cfg = configuracao(simulado);
  const diasAusentesSet = new Set((Array.isArray(diasAusentes) ? diasAusentes : [])
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 10));
  const questoesAtivas = (simulado?.questoes || []).filter((questao) => !diasAusentesSet.has(Number(questao?.dia || 1)));
  const possuiIdioma = questoesAtivas.some(questaoTemIdioma);
  const idioma = normalizarIdioma(idiomaEstrangeiro, { aplicavel: possuiIdioma });
  const mapaRespostas = respostaPorCodigo(respostasInput);
  const respostas = [];
  const avisos = [];

  const resumo = {
    totalQuestoes: questoesAtivas.length,
    pontuaveis: 0,
    respondidas: 0,
    observadas: 0,
    acertos: 0,
    erros: 0,
    brancos: 0,
    naoInformadas: 0,
    anuladas: 0,
    pendentesIdioma: 0,
    semOpcaoIdioma: 0,
    pendentesGabarito: 0,
    pontosObtidos: 0,
    pontosPossiveis: 0,
    pontosPossiveisAplicaveis: 0,
  };

  for (const questao of questoesAtivas) {
    const codigoQuestao = texto(questao.codigo).toUpperCase();
    const temValor = mapaRespostas.has(codigoQuestao);
    const respostaNormalizada = normalizarResposta(temValor ? mapaRespostas.get(codigoQuestao) : undefined);
    const variante = selecionarVariante(questao, idioma);
    const eixo = eixoPedagogicoDaVariante(variante);
    const enem = resolverHabilidadeEnem(questao.area, variante?.habilidadeEnem || variante?.habilidade);
    const base = {
      codigoQuestao,
      numero: Number(questao.numero) || 1,
      dia: Number(questao.dia) || 1,
      resposta: respostaNormalizada.resposta,
      respostaInformada: respostaNormalizada.informada,
      variante: texto(variante?.codigo).toUpperCase(),
      gabarito: texto(variante?.gabarito).toUpperCase(),
      correta: null,
      area: texto(questao.area),
      componente: texto(variante?.componente),
      macroconteudo: texto(variante?.macroconteudo),
      eixoPedagogico: eixo.rotulo,
      eixoOrigem: eixo.origem,
      conteudo: texto(variante?.conteudo),
      habilidade: texto(variante?.habilidade),
      habilidadeEnemCodigo: texto(enem?.habilidadeCodigo),
      habilidadeEnemDescricao: texto(enem?.habilidadeDescricao),
      habilidadeEnemRotulo: enem ? `${siglaAreaEnem(enem.areaCodigo)}-${enem.habilidadeCodigo} - ${enem.habilidadeDescricao}` : '',
      habilidadeEnemConfianca: confiancaEnemDaVariante(variante, enem),
      competenciaEnemCodigo: texto(enem?.competenciaCodigo),
      competenciaEnemDescricao: texto(enem?.competenciaDescricao),
      competenciaEnemRotulo: enem ? `${enem.competenciaCodigo} - ${enem.competenciaDescricao}` : '',
      areaEnemCodigo: texto(enem?.areaCodigo),
      areaEnemNome: texto(enem?.areaNome),
      matrizEnemVersao: enem ? FONTE_MATRIZ_ENEM.versao : '',
      competencia: texto(variante?.competencia),
      descritor: texto(variante?.descritor),
      dificuldade: texto(variante?.dificuldade) || 'nao_informada',
      naturezaEvidencia: 'pedagogica',
      peso: Number(questao.peso) || 1,
    };

    if (respostaNormalizada.invalida) {
      avisos.push(`Resposta inválida em ${codigoQuestao}: ${respostaNormalizada.original}.`);
    }

    if (questao.anulada) {
      resumo.anuladas += 1;
      respostas.push({ ...base, situacao: 'ANULADA' });
      continue;
    }

    if (questaoTemIdioma(questao) && idioma === 'NAO_MARCADO') {
      resumo.pontuaveis += 1;
      resumo.observadas += 1;
      resumo.semOpcaoIdioma += 1;
      resumo.pontosPossiveis += base.peso;
      resumo.pontosPossiveisAplicaveis += base.peso;
      respostas.push({
        ...base,
        variante: 'SEM_OPCAO',
        gabarito: '',
        componente: '',
        macroconteudo: '',
        eixoPedagogico: '',
        eixoOrigem: '',
        conteudo: '',
        habilidade: '',
        habilidadeEnemCodigo: '',
        habilidadeEnemDescricao: '',
        habilidadeEnemRotulo: '',
        habilidadeEnemConfianca: '',
        competenciaEnemCodigo: '',
        competenciaEnemDescricao: '',
        competenciaEnemRotulo: '',
        areaEnemCodigo: '',
        areaEnemNome: '',
        matrizEnemVersao: '',
        competencia: '',
        descritor: '',
        naturezaEvidencia: 'procedimental',
        situacao: 'IDIOMA_NAO_MARCADO',
      });
      continue;
    }

    if (!variante && questaoTemIdioma(questao)) {
      resumo.pendentesIdioma += 1;
      respostas.push({ ...base, naturezaEvidencia: 'procedimental', situacao: 'IDIOMA_PENDENTE' });
      continue;
    }

    if (!variante || !base.gabarito) {
      resumo.pendentesGabarito += 1;
      respostas.push({ ...base, situacao: 'GABARITO_PENDENTE' });
      continue;
    }

    resumo.pontuaveis += 1;
    resumo.pontosPossiveisAplicaveis += base.peso;

    if (!respostaNormalizada.informada) {
      resumo.naoInformadas += 1;
      respostas.push({ ...base, situacao: 'NAO_INFORMADA' });
      continue;
    }

    if (!respostaNormalizada.resposta) {
      resumo.observadas += 1;
      resumo.brancos += 1;
      resumo.pontosPossiveis += base.peso;
      respostas.push({ ...base, situacao: 'BRANCO' });
      continue;
    }

    resumo.respondidas += 1;
    resumo.observadas += 1;
    resumo.pontosPossiveis += base.peso;
    if (respostaNormalizada.resposta === base.gabarito) {
      resumo.acertos += 1;
      resumo.pontosObtidos += base.peso;
      respostas.push({ ...base, correta: true, situacao: 'ACERTO' });
    } else {
      resumo.erros += 1;
      respostas.push({ ...base, correta: false, situacao: 'ERRO' });
    }
  }

  if (diasAusentesSet.size) {
    const dias = [...diasAusentesSet].sort((a, b) => a - b).map((dia) => `${dia}º dia`).join(', ');
    avisos.push(`Ausência confirmada em ${dias}; as questões desses dias foram excluídas do denominador e do diagnóstico pedagógico.`);
  }
  if (possuiIdioma && idioma === 'NAO_INFORMADO') {
    avisos.push('A língua estrangeira não foi informada; as questões de Inglês/Espanhol ficaram pendentes.');
  }
  if (possuiIdioma && idioma === 'NAO_MARCADO') {
    avisos.push('O aluno não marcou a opção de língua; as questões correspondentes receberam zero sem atribuição a Inglês ou Espanhol.');
  }
  if (resumo.pendentesGabarito) {
    avisos.push(`${resumo.pendentesGabarito} questão(ões) ainda não possui(em) gabarito aplicável.`);
  }

  const resumoGeral = {
    ...resumo,
    percentualAcerto: percentual(resumo.acertos, resumo.respondidas),
    percentualPontuacao: percentual(resumo.pontosObtidos, resumo.pontosPossiveis),
    coberturaPercentual: percentual(resumo.observadas, resumo.pontuaveis),
  };

  return {
    idiomaEstrangeiro: idioma,
    diasAusentes: [...diasAusentesSet].sort((a, b) => a - b),
    respostas,
    resumoGeral,
    porDia: agruparRespostas(respostas.map((item) => ({ ...item, diaRotulo: `Dia ${item.dia}` })), 'diaRotulo', cfg),
    porArea: agruparRespostas(respostas, 'area', cfg),
    porComponente: agruparRespostas(respostas, 'componente', cfg, { somentePedagogico: true }),
    porEixo: agruparRespostas(respostas, 'eixoPedagogico', cfg, { somentePedagogico: true }),
    porConteudo: agruparRespostas(respostas, 'conteudo', cfg, { somentePedagogico: true }),
    porHabilidade: agruparRespostas(respostas, 'habilidade', cfg, { somentePedagogico: true }),
    porHabilidadeEnem: agruparRespostas(respostas, 'habilidadeEnemRotulo', cfg, { somentePedagogico: true }),
    porCompetencia: agruparRespostas(respostas, 'competencia', cfg, { somentePedagogico: true }),
    porCompetenciaEnem: agruparRespostas(respostas, 'competenciaEnemRotulo', cfg, { somentePedagogico: true }),
    porDescritor: agruparRespostas(respostas, 'descritor', cfg, { somentePedagogico: true }),
    porDificuldade: agruparRespostas(respostas, 'dificuldade', cfg, { somentePedagogico: true }),
    avisos: [...new Set(avisos)],
  };
}

function novoAgregado(chave, rotulo) {
  return {
    chave,
    rotulo,
    totalQuestoes: new Set(),
    estudantes: new Set(),
    respondentes: new Set(),
    estudantesComEvidencia: new Set(),
    acertos: 0,
    erros: 0,
    brancos: 0,
    naoInformadas: 0,
    pendentesIdioma: 0,
    semOpcaoIdioma: 0,
    pontosObtidos: 0,
    pontosPossiveis: 0,
    pontosPossiveisAplicaveis: 0,
  };
}

function acumularCategorias(resultados, campo, cfg, { somentePedagogico = false } = {}) {
  const mapa = new Map();

  for (const resultado of resultados) {
    const alunoId = texto(resultado.aluno?._id || resultado.aluno);
    for (const resposta of resultado.respostas || []) {
      if (['ANULADA', 'GABARITO_PENDENTE'].includes(resposta.situacao)) continue;
      if (somentePedagogico && !evidenciaPedagogica(resposta)) continue;
      const rotulo = texto(resposta[campo]) || 'Não classificado';
      const chave = normalizarChave(rotulo) || 'NAO_CLASSIFICADO';
      if (!mapa.has(chave)) mapa.set(chave, novoAgregado(chave, rotulo));
      const item = mapa.get(chave);

      item.estudantes.add(alunoId);
      if (resposta.situacao !== 'IDIOMA_PENDENTE') {
        item.totalQuestoes.add(texto(resposta.codigoQuestao));
        item.pontosPossiveisAplicaveis += Number(resposta.peso) || 1;
      }
      if (resposta.situacao === 'ACERTO') {
        item.respondentes.add(alunoId);
        item.estudantesComEvidencia.add(alunoId);
        item.acertos += 1;
        item.pontosObtidos += Number(resposta.peso) || 1;
        item.pontosPossiveis += Number(resposta.peso) || 1;
      } else if (resposta.situacao === 'ERRO') {
        item.respondentes.add(alunoId);
        item.estudantesComEvidencia.add(alunoId);
        item.erros += 1;
        item.pontosPossiveis += Number(resposta.peso) || 1;
      } else if (resposta.situacao === 'BRANCO') {
        item.estudantesComEvidencia.add(alunoId);
        item.brancos += 1;
        item.pontosPossiveis += Number(resposta.peso) || 1;
      } else if (resposta.situacao === 'IDIOMA_NAO_MARCADO') {
        item.estudantesComEvidencia.add(alunoId);
        item.semOpcaoIdioma += 1;
        item.pontosPossiveis += Number(resposta.peso) || 1;
      } else if (resposta.situacao === 'NAO_INFORMADA') {
        item.naoInformadas += 1;
      } else if (resposta.situacao === 'IDIOMA_PENDENTE') {
        item.pendentesIdioma += 1;
      }
    }
  }

  return [...mapa.values()].map((item) => {
    const respondidas = item.acertos + item.erros;
    const observadas = respondidas + item.brancos + item.semOpcaoIdioma;
    const evidenciaSuficiente = item.totalQuestoes.size >= cfg.minimoQuestoesIndicador
      && item.estudantesComEvidencia.size >= cfg.minimoRespondentesQuestao;
    const percentualAcerto = percentual(item.acertos, respondidas);
    const percentualPontuacao = percentual(item.pontosObtidos, item.pontosPossiveis);
    return {
      chave: item.chave,
      rotulo: item.rotulo,
      questoes: item.totalQuestoes.size,
      estudantes: item.estudantes.size,
      respondentes: item.respondentes.size,
      estudantesComEvidencia: item.estudantesComEvidencia.size,
      evidencias: observadas,
      respondidas,
      observadas,
      acertos: item.acertos,
      erros: item.erros,
      brancos: item.brancos,
      naoInformadas: item.naoInformadas,
      pendentesIdioma: item.pendentesIdioma,
      semOpcaoIdioma: item.semOpcaoIdioma,
      percentualAcerto,
      percentualPontuacao,
      coberturaPercentual: percentual(observadas, observadas + item.naoInformadas),
      evidenciaSuficiente,
      nivel: classificarNivel(percentualPontuacao, evidenciaSuficiente, cfg),
    };
  }).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true }));
}


function acumularMatrizEnem(resultados, tipo, cfg) {
  const mapa = new Map();
  const habilidade = tipo === 'habilidade';

  for (const resultado of resultados || []) {
    const alunoId = texto(resultado.aluno?._id || resultado.aluno);
    for (const resposta of resultado.respostas || []) {
      if (!evidenciaPedagogica(resposta)) continue;
      const codigo = habilidade ? texto(resposta.habilidadeEnemCodigo) : texto(resposta.competenciaEnemCodigo);
      const descricao = habilidade ? texto(resposta.habilidadeEnemDescricao) : texto(resposta.competenciaEnemDescricao);
      const areaCodigo = texto(resposta.areaEnemCodigo);
      const areaNome = texto(resposta.areaEnemNome) || texto(resposta.area);
      if (!codigo || !descricao || !areaCodigo) continue;
      const chave = `${areaCodigo}::${codigo}`;
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          chave,
          tipo,
          codigo,
          descricao,
          rotulo: `${codigo} - ${descricao}`,
          areaCodigo,
          areaNome,
          competenciaCodigo: habilidade ? texto(resposta.competenciaEnemCodigo) : codigo,
          competenciaDescricao: habilidade ? texto(resposta.competenciaEnemDescricao) : descricao,
          habilidades: new Set(),
          questoes: new Set(),
          questoesAproximadas: new Set(),
          estudantes: new Set(),
          estudantesComEvidencia: new Set(),
          respondentes: new Set(),
          acertos: 0,
          erros: 0,
          brancos: 0,
          naoInformadas: 0,
          pontosObtidos: 0,
          pontosPossiveis: 0,
        });
      }
      const item = mapa.get(chave);
      item.estudantes.add(alunoId);
      const chaveQuestaoEnem = `${texto(resposta.codigoQuestao)}::${texto(resposta.variante) || 'PADRAO'}`;
      item.questoes.add(chaveQuestaoEnem);
      if (texto(resposta.habilidadeEnemConfianca).toLowerCase() === 'aproximada') item.questoesAproximadas.add(chaveQuestaoEnem);
      if (texto(resposta.habilidadeEnemCodigo)) item.habilidades.add(texto(resposta.habilidadeEnemCodigo));
      const peso = Number(resposta.peso) || 1;
      if (resposta.situacao === 'ACERTO') {
        item.respondentes.add(alunoId);
        item.estudantesComEvidencia.add(alunoId);
        item.acertos += 1;
        item.pontosObtidos += peso;
        item.pontosPossiveis += peso;
      } else if (resposta.situacao === 'ERRO') {
        item.respondentes.add(alunoId);
        item.estudantesComEvidencia.add(alunoId);
        item.erros += 1;
        item.pontosPossiveis += peso;
      } else if (resposta.situacao === 'BRANCO') {
        item.estudantesComEvidencia.add(alunoId);
        item.brancos += 1;
        item.pontosPossiveis += peso;
      } else if (resposta.situacao === 'NAO_INFORMADA') {
        item.naoInformadas += 1;
      }
    }
  }

  return [...mapa.values()].map((item) => {
    const respondidas = item.acertos + item.erros;
    const observadas = respondidas + item.brancos;
    const questoes = item.questoes.size;
    const evidenciaSuficiente = questoes >= cfg.minimoQuestoesIndicador
      && item.estudantesComEvidencia.size >= cfg.minimoRespondentesQuestao;
    const percentualAcerto = percentual(item.acertos, respondidas);
    const percentualPontuacao = percentual(item.pontosObtidos, item.pontosPossiveis);
    const coberturaPercentual = percentual(observadas, observadas + item.naoInformadas);
    return {
      chave: item.chave,
      tipo: item.tipo,
      codigo: item.codigo,
      descricao: item.descricao,
      rotulo: item.rotulo,
      areaCodigo: item.areaCodigo,
      areaNome: item.areaNome,
      competenciaCodigo: item.competenciaCodigo,
      competenciaDescricao: item.competenciaDescricao,
      habilidades: item.habilidades.size,
      questoes,
      questoesAproximadas: item.questoesAproximadas.size,
      confiancaMapeamento: item.questoesAproximadas.size ? (item.questoesAproximadas.size === questoes ? 'aproximada' : 'mista') : 'direta',
      estudantes: item.estudantes.size,
      estudantesComEvidencia: item.estudantesComEvidencia.size,
      respondentes: item.respondentes.size,
      evidencias: observadas,
      respondidas,
      observadas,
      acertos: item.acertos,
      erros: item.erros,
      brancos: item.brancos,
      naoInformadas: item.naoInformadas,
      percentualAcerto,
      percentualPontuacao,
      coberturaPercentual,
      evidenciaSuficiente,
      nivel: classificarNivel(percentualPontuacao, evidenciaSuficiente, cfg),
      leituraEvidencia: evidenciaSuficiente
        ? classificarNivel(percentualPontuacao, true, cfg)
        : (questoes === 1 && item.estudantesComEvidencia.size >= cfg.minimoRespondentesQuestao ? 'indicativa_um_item' : 'evidencia_insuficiente'),
    };
  }).sort((a, b) => a.areaNome.localeCompare(b.areaNome, 'pt-BR') || Number(a.codigo.replace(/\D/g, '')) - Number(b.codigo.replace(/\D/g, '')));
}

function coberturaMatrizEnem(simulado) {
  const porArea = new Map();
  const naoMapeadas = [];
  let variantesElegiveis = 0;
  let variantesMapeadas = 0;
  let variantesMapeadasDiretas = 0;
  let variantesMapeadasAproximadas = 0;

  for (const questao of simulado?.questoes || []) {
    for (const variante of questao.variantes || []) {
      variantesElegiveis += 1;
      const enem = resolverHabilidadeEnem(questao.area, variante?.habilidadeEnem || variante?.habilidade);
      if (!enem) {
        naoMapeadas.push({
          codigoQuestao: texto(questao.codigo),
          variante: texto(variante.codigo) || 'PADRAO',
          area: texto(questao.area),
          componente: texto(variante.componente),
          conteudo: texto(variante.conteudo),
        });
        continue;
      }
      variantesMapeadas += 1;
      if (texto(variante?.habilidadeEnemConfianca).toLowerCase() === 'aproximada') variantesMapeadasAproximadas += 1;
      else variantesMapeadasDiretas += 1;
      if (!porArea.has(enem.areaCodigo)) {
        porArea.set(enem.areaCodigo, {
          areaCodigo: enem.areaCodigo,
          areaNome: enem.areaNome,
          habilidades: new Set(),
          competencias: new Set(),
          questoes: new Set(),
          variantes: 0,
          variantesDiretas: 0,
          variantesAproximadas: 0,
        });
      }
      const area = porArea.get(enem.areaCodigo);
      area.habilidades.add(enem.habilidadeCodigo);
      area.competencias.add(enem.competenciaCodigo);
      area.questoes.add(texto(questao.codigo));
      area.variantes += 1;
      if (texto(variante?.habilidadeEnemConfianca).toLowerCase() === 'aproximada') area.variantesAproximadas += 1;
      else area.variantesDiretas += 1;
    }
  }

  const areas = [...porArea.values()].map((item) => {
    const totalHabilidadesMatriz = contarHabilidadesArea(item.areaCodigo) || 30;
    return {
      areaCodigo: item.areaCodigo,
      areaNome: item.areaNome,
      habilidadesTrabalhadas: item.habilidades.size,
      totalHabilidadesMatriz,
      percentualHabilidadesMatriz: percentual(item.habilidades.size, totalHabilidadesMatriz),
      competenciasTrabalhadas: item.competencias.size,
      questoesMapeadas: item.questoes.size,
      variantesMapeadas: item.variantes,
      variantesMapeadasDiretas: item.variantesDiretas,
      variantesMapeadasAproximadas: item.variantesAproximadas,
    };
  }).sort((a, b) => a.areaNome.localeCompare(b.areaNome, 'pt-BR'));

  return {
    fonte: FONTE_MATRIZ_ENEM,
    variantesElegiveis,
    variantesMapeadas,
    variantesMapeadasDiretas,
    variantesMapeadasAproximadas,
    variantesSemMapeamento: Math.max(0, variantesElegiveis - variantesMapeadas),
    percentualMapeamento: percentual(variantesMapeadas, variantesElegiveis),
    habilidadesTrabalhadas: areas.reduce((total, item) => total + item.habilidadesTrabalhadas, 0),
    competenciasTrabalhadas: areas.reduce((total, item) => total + item.competenciasTrabalhadas, 0),
    areas,
    naoMapeadas,
  };
}

function acumularQuestoes(resultados, cfg) {
  const mapa = new Map();
  const desempenhoAluno = new Map();

  for (const resultado of resultados) {
    const alunoId = texto(resultado.aluno?._id || resultado.aluno);
    desempenhoAluno.set(alunoId, {
      percentualPontuacao: Number(resultado.resumoGeral?.percentualPontuacao) || 0,
      coberturaPercentual: Number(resultado.resumoGeral?.coberturaPercentual) || 0,
    });
    for (const resposta of resultado.respostas || []) {
      const variante = texto(resposta.variante) || 'PENDENTE';
      const chave = `${texto(resposta.codigoQuestao)}::${variante}`;
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          chave,
          codigoQuestao: texto(resposta.codigoQuestao),
          numero: Number(resposta.numero) || 0,
          dia: Number(resposta.dia) || 1,
          variante,
          area: texto(resposta.area),
          componente: texto(resposta.componente),
          macroconteudo: texto(resposta.macroconteudo),
          eixoPedagogico: texto(resposta.eixoPedagogico),
          conteudo: texto(resposta.conteudo),
          habilidade: texto(resposta.habilidade),
          habilidadeEnemCodigo: texto(resposta.habilidadeEnemCodigo),
          habilidadeEnemDescricao: texto(resposta.habilidadeEnemDescricao),
          habilidadeEnemConfianca: texto(resposta.habilidadeEnemConfianca),
          competenciaEnemCodigo: texto(resposta.competenciaEnemCodigo),
          competenciaEnemDescricao: texto(resposta.competenciaEnemDescricao),
          areaEnemCodigo: texto(resposta.areaEnemCodigo),
          areaEnemNome: texto(resposta.areaEnemNome),
          matrizEnemVersao: texto(resposta.matrizEnemVersao),
          gabarito: texto(resposta.gabarito),
          naturezaEvidencia: texto(resposta.naturezaEvidencia) || (variante === 'SEM_OPCAO' ? 'procedimental' : 'pedagogica'),
          respondentes: new Set(),
          observadores: new Set(),
          acertos: 0,
          erros: 0,
          brancos: 0,
          naoInformadas: 0,
          pendentesIdioma: 0,
          semOpcaoIdioma: 0,
          anuladas: 0,
          alternativas: { A: 0, B: 0, C: 0, D: 0, E: 0, BRANCO: 0, NAO_INFORMADA: 0 },
          desempenhoPorAluno: new Map(),
        });
      }
      const item = mapa.get(chave);
      if (resposta.situacao === 'ACERTO') {
        item.respondentes.add(alunoId);
        item.observadores.add(alunoId);
        item.acertos += 1;
        item.desempenhoPorAluno.set(alunoId, 1);
        if (item.alternativas[resposta.resposta] !== undefined) item.alternativas[resposta.resposta] += 1;
      } else if (resposta.situacao === 'ERRO') {
        item.respondentes.add(alunoId);
        item.observadores.add(alunoId);
        item.erros += 1;
        item.desempenhoPorAluno.set(alunoId, 0);
        if (item.alternativas[resposta.resposta] !== undefined) item.alternativas[resposta.resposta] += 1;
      } else if (resposta.situacao === 'BRANCO') {
        item.observadores.add(alunoId);
        item.brancos += 1;
        item.desempenhoPorAluno.set(alunoId, 0);
        item.alternativas.BRANCO += 1;
      } else if (resposta.situacao === 'IDIOMA_NAO_MARCADO') {
        item.observadores.add(alunoId);
        item.semOpcaoIdioma += 1;
      } else if (resposta.situacao === 'NAO_INFORMADA') {
        item.naoInformadas += 1;
        item.alternativas.NAO_INFORMADA += 1;
      } else if (resposta.situacao === 'IDIOMA_PENDENTE') item.pendentesIdioma += 1;
      else if (resposta.situacao === 'ANULADA') item.anuladas += 1;
    }
  }

  const discriminar = (item) => {
    if (item.naturezaEvidencia !== 'pedagogica') return { disponivel: false, indice: 0, superior: 0, inferior: 0, nGrupo: 0, leitura: 'nao_aplicavel' };
    const elegiveis = [...item.desempenhoPorAluno.keys()]
      .map((alunoId) => ({ alunoId, ...desempenhoAluno.get(alunoId) }))
      .filter((x) => x.coberturaPercentual >= cfg.minimoCoberturaIndividual)
      .sort((a, b) => a.percentualPontuacao - b.percentualPontuacao);
    if (elegiveis.length < 10) return { disponivel: false, indice: 0, superior: 0, inferior: 0, nGrupo: 0, leitura: 'amostra_insuficiente' };
    const nGrupo = Math.max(3, Math.floor(elegiveis.length * 0.27));
    if (nGrupo * 2 > elegiveis.length) return { disponivel: false, indice: 0, superior: 0, inferior: 0, nGrupo: 0, leitura: 'amostra_insuficiente' };
    const inferiores = elegiveis.slice(0, nGrupo);
    const superiores = elegiveis.slice(-nGrupo);
    const taxa = (grupo) => percentual(grupo.reduce((soma, x) => soma + Number(item.desempenhoPorAluno.get(x.alunoId) || 0), 0), grupo.length);
    const inferior = taxa(inferiores);
    const superior = taxa(superiores);
    const indice = arredondar(superior - inferior, 1);
    const leitura = indice < 0 ? 'negativa' : indice < 10 ? 'baixa' : indice < 20 ? 'moderada' : indice < 30 ? 'boa' : 'forte';
    return { disponivel: true, indice, superior, inferior, nGrupo, leitura };
  };

  return [...mapa.values()].map((item) => {
    const respondidas = item.acertos + item.erros;
    const evidencias = respondidas + item.brancos + item.semOpcaoIdioma;
    const evidenciaSuficiente = item.observadores.size >= cfg.minimoRespondentesQuestao;
    const percentualAcerto = percentual(item.acertos, respondidas);
    const percentualPontuacao = percentual(item.acertos, evidencias);
    const distratores = Object.entries(item.alternativas)
      .filter(([alternativa]) => ['A', 'B', 'C', 'D', 'E'].includes(alternativa) && alternativa !== item.gabarito)
      .sort((a, b) => b[1] - a[1]);
    const [distratorDominante = '', distratorMarcacoes = 0] = distratores[0] || [];
    const concentracaoDistrator = percentual(distratorMarcacoes, item.erros);
    const faixaAcerto = percentualPontuacao < 20 ? 'muito_baixo'
      : percentualPontuacao < 40 ? 'baixo'
        : percentualPontuacao < 60 ? 'intermediario'
          : percentualPontuacao < 80 ? 'alto' : 'muito_alto';
    const discriminacao = discriminar(item);
    const naturezaEvidencia = item.naturezaEvidencia === 'procedimental' || item.variante === 'SEM_OPCAO' ? 'procedimental' : 'pedagogica';
    return {
      ...item,
      naturezaEvidencia,
      respondentes: item.respondentes.size,
      observadores: item.observadores.size,
      respondidas,
      observadas: evidencias,
      evidencias,
      percentualAcerto,
      percentualPontuacao,
      coberturaPercentual: percentual(evidencias, evidencias + item.naoInformadas),
      distratorDominante: distratorMarcacoes ? distratorDominante : '',
      distratorMarcacoes,
      concentracaoDistrator,
      faixaAcerto,
      leituraQuestao: evidenciaSuficiente ? faixaAcerto : 'evidencia_insuficiente',
      discriminacao,
      alertaRevisao: naturezaEvidencia === 'pedagogica' && discriminacao.disponivel && discriminacao.indice < 0,
      evidenciaSuficiente,
      nivel: classificarNivel(percentualPontuacao, evidenciaSuficiente, cfg),
      desempenhoPorAluno: undefined,
    };
  }).sort((a, b) => a.dia - b.dia || a.numero - b.numero || a.variante.localeCompare(b.variante));
}

function resumirTurmas(resultados, cfg) {
  const mapa = new Map();
  for (const resultado of resultados) {
    const turma = texto(resultado.alunoTurmaSnapshot) || 'Sem turma';
    if (!mapa.has(turma)) mapa.set(turma, { turma, alunos: 0, acertos: 0, respondidas: 0, pontosObtidos: 0, pontosPossiveis: 0, cobertura: 0 });
    const item = mapa.get(turma);
    const r = resultado.resumoGeral || {};
    item.alunos += 1;
    item.acertos += Number(r.acertos) || 0;
    item.respondidas += Number(r.respondidas) || 0;
    item.pontosObtidos += Number(r.pontosObtidos) || 0;
    item.pontosPossiveis += Number(r.pontosPossiveis) || 0;
    item.cobertura += Number(r.coberturaPercentual) || 0;
  }
  return [...mapa.values()].map((item) => {
    const percentualAcerto = percentual(item.acertos, item.respondidas);
    const percentualPontuacao = percentual(item.pontosObtidos, item.pontosPossiveis);
    const evidenciaSuficiente = item.alunos >= cfg.minimoAlunosGrupo;
    return {
      turma: item.turma,
      alunos: item.alunos,
      percentualAcerto,
      percentualPontuacao,
      coberturaPercentual: item.alunos ? arredondar(item.cobertura / item.alunos, 1) : 0,
      evidenciaSuficiente,
      nivel: classificarNivel(percentualPontuacao, evidenciaSuficiente, cfg),
    };
  }).sort((a, b) => a.turma.localeCompare(b.turma, 'pt-BR', { numeric: true }));
}

function serieDaTurma(turma, simulado) {
  const chave = normalizarChave(turma);
  const match = chave.match(/^(?:(?:EM|EF|EJA)_?)?(\d{1,2})(?:_|[A-Z]|$)/);
  if (match) return `${Number(match[1])}º ano/série`;
  const series = (simulado?.series || []).map(texto).filter(Boolean);
  if (series.length === 1) return series[0];
  return 'Série não identificada';
}

function resumirSeries(simulado, resultados, cfg) {
  const mapa = new Map();
  for (const resultado of resultados) {
    const serie = serieDaTurma(resultado.alunoTurmaSnapshot, simulado);
    if (!mapa.has(serie)) mapa.set(serie, { serie, alunos: 0, acertos: 0, respondidas: 0, pontosObtidos: 0, pontosPossiveis: 0, cobertura: 0 });
    const item = mapa.get(serie);
    const r = resultado.resumoGeral || {};
    item.alunos += 1;
    item.acertos += Number(r.acertos) || 0;
    item.respondidas += Number(r.respondidas) || 0;
    item.pontosObtidos += Number(r.pontosObtidos) || 0;
    item.pontosPossiveis += Number(r.pontosPossiveis) || 0;
    item.cobertura += Number(r.coberturaPercentual) || 0;
  }
  return [...mapa.values()].map((item) => {
    const percentualAcerto = percentual(item.acertos, item.respondidas);
    const percentualPontuacao = percentual(item.pontosObtidos, item.pontosPossiveis);
    const evidenciaSuficiente = item.alunos >= cfg.minimoAlunosGrupo;
    return {
      serie: item.serie,
      alunos: item.alunos,
      percentualAcerto,
      percentualPontuacao,
      coberturaPercentual: item.alunos ? arredondar(item.cobertura / item.alunos, 1) : 0,
      evidenciaSuficiente,
      nivel: classificarNivel(percentualPontuacao, evidenciaSuficiente, cfg),
    };
  }).sort((a, b) => a.serie.localeCompare(b.serie, 'pt-BR', { numeric: true }));
}

function gruposDeIntervencao(resultados, cfg) {
  const grupos = new Map();
  const participantes = Math.max(1, (resultados || []).length);
  const limiteColetivo = Math.max(cfg.minimoAlunosGrupo + 1, Math.ceil(participantes * 0.60));
  const limiteGrupoFocal = Math.max(Number(cfg.minimoAlunosGrupo || 5), 15);

  for (const resultado of resultados) {
    const aluno = {
      id: texto(resultado.aluno?._id || resultado.aluno),
      nome: texto(resultado.alunoNomeSnapshot),
      turma: texto(resultado.alunoTurmaSnapshot),
    };
    const respostas = resultado.respostas || [];
    const habilidadesEnem = agruparRespostas(respostas, 'habilidadeEnemRotulo', cfg, { somentePedagogico: true })
      .filter((item) => item.nivel === 'prioritario' && item.evidenciaSuficiente && item.chave !== 'NAO_CLASSIFICADO');
    const habilidades = agruparRespostas(respostas, 'habilidade', cfg, { somentePedagogico: true })
      .filter((item) => item.nivel === 'prioritario' && item.evidenciaSuficiente && item.chave !== 'NAO_CLASSIFICADO');
    const eixos = agruparRespostas(respostas, 'eixoPedagogico', cfg, { somentePedagogico: true })
      .filter((item) => item.nivel === 'prioritario' && item.evidenciaSuficiente && item.chave !== 'NAO_CLASSIFICADO');
    const tipoSelecionado = habilidadesEnem.length ? 'habilidade_enem' : (habilidades.length ? 'habilidade' : 'eixo');
    const metricas = habilidadesEnem.length ? habilidadesEnem : (habilidades.length ? habilidades : eixos);
    for (const metrica of metricas) {
      const chave = `${tipoSelecionado.toUpperCase()}::${metrica.chave}`;
      if (!grupos.has(chave)) grupos.set(chave, {
        chave,
        tipoAlvo: tipoSelecionado,
        rotulo: metrica.rotulo,
        alunos: new Map(),
      });
      grupos.get(chave).alunos.set(aluno.id, {
        ...aluno,
        percentualAcerto: metrica.percentualAcerto,
        percentualPontuacao: metrica.percentualPontuacao,
        evidencias: metrica.observadas || metrica.totalQuestoes,
      });
    }
  }

  return [...grupos.values()]
    .map((grupo) => {
      const alunos = [...grupo.alunos.values()];
      const percentualParticipantes = arredondar((alunos.length / participantes) * 100, 1);
      const alcanceIntervencao = alunos.length >= limiteColetivo
        ? 'turma'
        : (alunos.length > limiteGrupoFocal ? 'ampla' : 'grupo');
      return {
        ...grupo,
        alunos,
        percentualParticipantes,
        alcanceIntervencao,
        limiteGrupoFocal,
      };
    })
    .filter((grupo) => grupo.alunos.length >= cfg.minimoAlunosGrupo && grupo.alunos.length < limiteColetivo)
    .sort((a, b) => b.alunos.length - a.alunos.length || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

function percentualDiagnostico(item) {
  return Number(item?.percentualPontuacao) || 0;
}

function gerarAlertasIntegridade({ resumo, alunosBaixaCobertura = [], cfg }) {
  const alertas = [];
  if (resumo.coberturaPercentual < 100 || resumo.naoInformadas > 0) {
    alertas.push({
      tipo: 'qualidade_dados',
      severidade: resumo.coberturaPercentual < 90 ? 'alta' : 'moderada',
      titulo: 'Base de respostas ainda não está completa',
      mensagem: `Cobertura de ${resumo.coberturaPercentual.toFixed(1)}%, com ${resumo.naoInformadas} resposta(s) não importada(s).`,
      acaoSugerida: 'Concluir as importações pendentes e revisar os estudantes com cobertura individual incompleta antes de decisões individualizadas.',
      evidencia: `${resumo.observadas} de ${resumo.aplicaveis} respostas aplicáveis estão confirmadas; ${alunosBaixaCobertura.length} aluno(s) estão abaixo de 100% de cobertura.`,
    });
  }
  if (resumo.alunosIdiomaPendente > 0) {
    alertas.push({
      tipo: 'idioma_pendente',
      severidade: 'alta',
      titulo: 'Há estudantes com língua estrangeira pendente',
      mensagem: `${resumo.alunosIdiomaPendente} aluno(s) ainda precisa(m) ter a língua conferida.`,
      acaoSugerida: 'Resolver a pendência de idioma antes de concluir o diagnóstico individual desses estudantes.',
      evidencia: `${resumo.pendentesIdioma} questão(ões) permaneceram fora da pontuação por idioma pendente.`,
    });
  }
  if (resumo.alunosSemOpcaoIdioma > 0) {
    alertas.push({
      tipo: 'lingua_nao_marcada',
      severidade: 'moderada',
      titulo: 'Ocorrência procedimental: língua não marcada',
      mensagem: `${resumo.alunosSemOpcaoIdioma} aluno(s) não marcou(aram) Inglês nem Espanhol; o zero foi aplicado somente às questões de língua.`,
      acaoSugerida: 'Orientar o preenchimento correto nas próximas aplicações. Não tratar esta ocorrência como conteúdo ou habilidade não aprendida.',
      evidencia: `${resumo.semOpcaoIdioma} resposta(s) receberam zero por ausência da opção de língua, sem atribuição fictícia a Inglês ou Espanhol.`,
    });
  }
  const incompletosCriticos = alunosBaixaCobertura.filter((item) => !item.participacaoParcial && item.coberturaPercentual < cfg.minimoCoberturaIndividual);
  if (incompletosCriticos.length) {
    alertas.push({
      tipo: 'cobertura_individual_insuficiente',
      severidade: 'alta',
      titulo: 'Diagnósticos individuais provisórios',
      mensagem: `${incompletosCriticos.length} aluno(s) está(ão) abaixo da cobertura mínima individual de ${cfg.minimoCoberturaIndividual.toFixed(0)}%.`,
      acaoSugerida: 'Não concluir necessidade individual a partir desses resultados até completar ou justificar a base ausente.',
      evidencia: incompletosCriticos.slice(0, 8).map((item) => `${item.nome} (${item.turma}) - ${item.coberturaPercentual.toFixed(1)}%`).join(' · '),
    });
  }
  return alertas;
}

function gerarPrioridadesPedagogicas({ resumo, porArea, prioridadesEixo, prioridadesHabilidade, prioridadesHabilidadeEnem, questoesPrioritarias, questoesRevisao, intervencoesAmplas, gruposIntervencao, alunosIntervencaoIndividual, cfg }) {
  const acoes = [];
  const areasPrioritarias = [...(porArea || [])]
    .filter((item) => item.evidenciaSuficiente && item.nivel === 'prioritario')
    .sort((a, b) => percentualDiagnostico(a) - percentualDiagnostico(b));

  if (resumo.percentualPontuacao < cfg.percentualAtencao && areasPrioritarias.length) {
    const area = areasPrioritarias[0];
    acoes.push({
      tipo: 'intervencao_coletiva',
      nivelIntervencao: 'turma',
      titulo: `Intervenção coletiva em ${area.rotulo}`,
      porQue: `O desempenho confirmado da área é ${area.percentualPontuacao.toFixed(1)}% e o resultado geral do recorte é ${resumo.percentualPontuacao.toFixed(1)}%.`,
      acaoSugerida: 'Revisar o planejamento da área, selecionar os eixos mais frágeis e aplicar uma retomada coletiva seguida de verificação curta.',
      evidencia: `${area.evidencias} resposta(s) observada(s), ${area.questoes} questão(ões) e ${area.estudantesComEvidencia} estudante(s) com evidência.`,
    });
  }

  const alvos = [...(prioridadesHabilidadeEnem || []), ...(prioridadesHabilidade || []), ...(prioridadesEixo || [])]
    .filter((item) => item.evidenciaSuficiente)
    .sort((a, b) => percentualDiagnostico(a) - percentualDiagnostico(b) || b.questoes - a.questoes);
  const vistos = new Set();
  for (const item of alvos) {
    if (acoes.length >= 4) break;
    const chave = normalizarChave(item.rotulo);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    const alcanceColetivo = Number(item.estudantesComEvidencia || 0) >= Math.ceil(Math.max(1, resumo.participantes || 0) * 0.60);
    const nivelIntervencao = alcanceColetivo ? 'turma' : 'grupo';
    const rotuloAlvo = item.origemPrioridade === 'habilidade_enem'
      ? `${siglaAreaEnem(item.areaCodigo)}-${item.codigo || item.habilidadeCodigo || ''} - ${item.descricao || item.habilidadeDescricao || item.rotulo}`
      : item.rotulo;
    acoes.push({
      tipo: item.origemPrioridade === 'habilidade_enem' ? 'retomada_habilidade_enem' : (item.origemPrioridade === 'habilidade' ? 'retomada_habilidade' : 'retomada_eixo'),
      nivelIntervencao,
      titulo: `${item.origemPrioridade === 'habilidade_enem' ? 'Retomar habilidade ENEM' : (item.origemPrioridade === 'habilidade' ? 'Retomar a habilidade' : 'Reforçar o eixo')}: ${rotuloAlvo}`,
      porQue: `Desempenho confirmado de ${item.percentualPontuacao.toFixed(1)}% com evidência sustentada por ${item.questoes} questão(ões).`,
      acaoSugerida: alcanceColetivo
        ? 'Realizar retomada coletiva da habilidade, trabalhar exemplos equivalentes e reaplicar itens diferentes que meçam o mesmo alvo.'
        : 'Realizar intervenção focalizada com os estudantes que compartilham a dificuldade e reaplicar itens equivalentes.',
      evidencia: `${item.evidencias} resposta(s) observada(s) de ${item.estudantesComEvidencia} estudante(s); cobertura de ${item.coberturaPercentual.toFixed(1)}%.`,
    });
  }

  if ((intervencoesAmplas || []).length && acoes.length < 5) {
    const grupo = intervencoesAmplas[0];
    acoes.push({
      tipo: 'intervencao_ampla',
      nivelIntervencao: 'turma',
      titulo: `Organizar intervenção ampla por turma: ${grupo.rotulo}`,
      porQue: `${grupo.alunos.length} aluno(s) (${grupo.percentualParticipantes.toFixed(1)}% do recorte) compartilham a mesma necessidade. Esse volume não deve ser tratado como “pequeno grupo”.`,
      acaoSugerida: 'Distribuir a retomada por turma e, dentro de cada sala, formar grupos menores somente quando necessário. Reaplicar itens equivalentes após a intervenção.',
      evidencia: grupo.alunos.slice(0, 6).map((item) => `${item.nome} (${item.turma})`).join(' · '),
    });
  }

  if (gruposIntervencao.length && acoes.length < 5) {
    const grupo = gruposIntervencao[0];
    acoes.push({
      tipo: 'agrupamento',
      nivelIntervencao: 'grupo',
      titulo: `Organizar grupo de intervenção: ${grupo.rotulo}`,
      porQue: `${grupo.alunos.length} aluno(s) compartilham a mesma necessidade com evidência mínima atendida.`,
      acaoSugerida: 'Realizar intervenção focalizada em pequeno grupo e registrar nova evidência sobre o mesmo alvo.',
      evidencia: grupo.alunos.slice(0, 6).map((item) => `${item.nome} (${item.turma})`).join(' · '),
    });
  }

  const itemRevisao = questoesRevisao[0] || questoesPrioritarias[0];
  if (itemRevisao && acoes.length < 5) {
    const sinal = itemRevisao.discriminacao?.disponivel
      ? ` Índice simples de discriminação: ${itemRevisao.discriminacao.indice.toFixed(1)} p.p. (${itemRevisao.discriminacao.leitura}).`
      : '';
    acoes.push({
      tipo: 'revisao_item',
      nivelIntervencao: 'item',
      titulo: `Revisar tecnicamente a questão ${itemRevisao.codigoQuestao}`,
      porQue: `O item teve ${itemRevisao.percentualPontuacao.toFixed(1)}% de desempenho confirmado.${sinal}`,
      acaoSugerida: 'Conferir gabarito, clareza do enunciado, aderência ao conteúdo trabalhado e funcionamento dos distratores antes de usar o item como prova isolada de aprendizagem.',
      evidencia: `${itemRevisao.acertos} acerto(s), ${itemRevisao.erros} erro(s), ${itemRevisao.brancos} branco(s) e cobertura de ${itemRevisao.coberturaPercentual.toFixed(1)}%.`,
    });
  }

  if (alunosIntervencaoIndividual.length && acoes.length < 5) {
    acoes.push({
      tipo: 'acompanhamento_individual',
      nivelIntervencao: 'individual',
      titulo: 'Acompanhamento individual apenas para casos críticos',
      porQue: `${alunosIntervencaoIndividual.length} aluno(s) está(ão) na faixa crítica com cobertura individual suficiente.`,
      acaoSugerida: 'Definir até três alvos por estudante, depois de confirmar se a dificuldade também aparece em outras evidências de sala de aula.',
      evidencia: alunosIntervencaoIndividual.slice(0, 6).map((item) => `${item.nome} (${item.turma}) - ${item.percentualPontuacao.toFixed(1)}%`).join(' · '),
    });
  }

  return acoes.slice(0, 5).map((item, index) => ({ prioridade: index + 1, ...item }));
}

function gerarPlanoIntervencao({ porArea, prioridadesEixo, prioridadesHabilidadeEnem, intervencoesAmplas, gruposIntervencao, alunosIntervencaoIndividual, participantes }) {
  const turma = [...(porArea || [])]
    .filter((item) => item.evidenciaSuficiente && item.nivel === 'prioritario')
    .sort((a, b) => percentualDiagnostico(a) - percentualDiagnostico(b))
    .slice(0, 4)
    .map((item) => ({ rotulo: item.rotulo, percentualPontuacao: item.percentualPontuacao, evidencias: item.evidencias }));
  const eixos = (prioridadesEixo || []).slice(0, 5).map((item) => ({
    rotulo: item.rotulo,
    percentualPontuacao: item.percentualPontuacao,
    questoes: item.questoes,
    estudantes: item.estudantesComEvidencia,
  }));
  const habilidadesEnem = (prioridadesHabilidadeEnem || []).slice(0, 8).map((item) => ({
    rotulo: item.rotulo,
    areaCodigo: item.areaCodigo,
    areaNome: item.areaNome,
    competenciaCodigo: item.competenciaCodigo,
    competenciaDescricao: item.competenciaDescricao,
    habilidadeCodigo: item.codigo || item.habilidadeCodigo,
    habilidadeDescricao: item.descricao || item.habilidadeDescricao,
    percentualPontuacao: item.percentualPontuacao,
    questoes: item.questoes,
    estudantes: item.estudantesComEvidencia,
  }));
  return {
    ordem: ['turma', 'ampla', 'grupo', 'individual'],
    turma: { necessario: turma.length > 0, areas: turma, eixos, habilidadesEnem },
    amplas: (intervencoesAmplas || []).slice(0, 12),
    grupos: (gruposIntervencao || []).slice(0, 12),
    individual: (alunosIntervencaoIndividual || []).slice(0, 100),
    sintese: `${participantes} participante(s): começar por intervenção coletiva, tratar necessidades numerosas como intervenção ampla organizada por turma, usar pequenos grupos apenas para subconjuntos realmente focais e reservar acompanhamento individual aos casos críticos com base suficiente.`,
  };
}


function montarAnaliseVisual({ resultados = [], questoes = [], porArea = [], porTurma = [], porHabilidadeEnem = [], distribuicaoAlunos = [], participacaoPorDia = [], resumo = {}, cfg }) {
  const faixas = Array.from({ length: 10 }, (_item, index) => ({
    inicio: index * 10,
    fim: index === 9 ? 100 : (index + 1) * 10,
    rotulo: index === 9 ? '90–100%' : `${index * 10}–${(index + 1) * 10 - 0.1}%`,
    alunos: 0,
  }));

  const alunosValidos = (resultados || []).filter((resultado) => {
    const cobertura = Number(resultado?.resumoGeral?.coberturaPercentual || 0);
    const pendente = Number(resultado?.resumoGeral?.pendentesIdioma || 0) > 0;
    const parcial = Array.isArray(resultado?.diasAusentes) && resultado.diasAusentes.length > 0;
    return cobertura >= Number(cfg?.minimoCoberturaIndividual || 80) && !pendente && !parcial;
  });
  for (const resultado of alunosValidos) {
    const valor = Math.max(0, Math.min(100, Number(resultado?.resumoGeral?.percentualPontuacao || 0)));
    const indice = Math.min(9, Math.floor(valor / 10));
    faixas[indice].alunos += 1;
  }

  const totalDistribuicao = (distribuicaoAlunos || []).reduce((soma, item) => soma + (Number(item.quantidade) || 0), 0);
  const distribuicao = (distribuicaoAlunos || []).map((item) => ({
    ...item,
    percentual: totalDistribuicao ? arredondar((Number(item.quantidade || 0) / totalDistribuicao) * 100, 1) : 0,
  }));

  const faixasQuestao = [
    ['muito_baixo', 'Muito baixo'],
    ['baixo', 'Baixo'],
    ['intermediario', 'Intermediário'],
    ['alto', 'Alto'],
    ['muito_alto', 'Muito alto'],
    ['evidencia_insuficiente', 'Evidência insuficiente'],
  ].map(([chave, rotulo]) => ({
    chave,
    rotulo,
    quantidade: (questoes || []).filter((item) => String(item.leituraQuestao || item.faixaAcerto || '') === chave).length,
  }));

  const habilidades = (porHabilidadeEnem || [])
    .filter((item) => item.chave !== 'NAO_CLASSIFICADO')
    .map((item) => ({
      areaCodigo: item.areaCodigo,
      areaNome: item.areaNome,
      codigo: item.codigo || item.habilidadeCodigo,
      descricao: item.descricao || item.habilidadeDescricao || item.rotulo,
      percentualPontuacao: Number(item.percentualPontuacao || 0),
      coberturaPercentual: Number(item.coberturaPercentual || 0),
      questoes: Number(item.questoes || item.totalQuestoes || 0),
      estudantes: Number(item.estudantesComEvidencia || item.estudantes || 0),
      nivel: item.nivel,
      evidenciaSuficiente: Boolean(item.evidenciaSuficiente),
      questoesAproximadas: Number(item.questoesAproximadas || 0),
    }))
    .sort((a, b) => String(a.areaCodigo).localeCompare(String(b.areaCodigo), 'pt-BR') || String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));

  return {
    resumo: {
      participantes: Number(resumo.participantes || 0),
      percentualPontuacao: Number(resumo.percentualPontuacao || 0),
      coberturaPercentual: Number(resumo.coberturaPercentual || 0),
      alunosValidosHistograma: alunosValidos.length,
    },
    histogramaDesempenho: faixas,
    distribuicaoFaixas: distribuicao,
    faixasQuestoes: faixasQuestao,
    porArea,
    porTurma,
    participacaoPorDia,
    habilidadesEnem: habilidades,
  };
}

function agregarDashboard(simulado, resultados = []) {
  const cfg = configuracao(simulado);
  const participantes = resultados.length;
  const geral = resultados.reduce((acc, resultado) => {
    const r = resultado.resumoGeral || {};
    const observadas = Number(r.observadas ?? ((Number(r.respondidas) || 0) + (Number(r.brancos) || 0))) || 0;
    acc.acertos += Number(r.acertos) || 0;
    acc.respondidas += Number(r.respondidas) || 0;
    acc.observadas += observadas;
    acc.aplicaveis += Number(r.pontuaveis) || 0;
    acc.pontosObtidos += Number(r.pontosObtidos) || 0;
    acc.pontosPossiveis += Number(r.pontosPossiveis) || 0;
    acc.brancos += Number(r.brancos) || 0;
    acc.naoInformadas += Number(r.naoInformadas) || 0;
    acc.pendentesIdioma += Number(r.pendentesIdioma) || 0;
    acc.semOpcaoIdioma += Number(r.semOpcaoIdioma) || 0;
    return acc;
  }, { acertos: 0, respondidas: 0, observadas: 0, aplicaveis: 0, pontosObtidos: 0, pontosPossiveis: 0, brancos: 0, naoInformadas: 0, pendentesIdioma: 0, semOpcaoIdioma: 0 });

  const diasSimulado = [...new Set((simulado?.questoes || []).map((item) => Number(item?.dia || 1)).filter(Boolean))].sort((a, b) => a - b);
  const participacaoPorDia = diasSimulado.map((dia) => {
    const ausentes = resultados.filter((resultado) => (resultado?.diasAusentes || []).map(Number).includes(dia));
    return {
      dia,
      previstos: participantes,
      presentes: Math.max(0, participantes - ausentes.length),
      ausentes: ausentes.length,
      alunosAusentes: ausentes.map((resultado) => ({
        alunoId: resultado.aluno?._id || resultado.aluno,
        nome: resultado.alunoNomeSnapshot,
        turma: resultado.alunoTurmaSnapshot,
      })),
    };
  });
  const totalAusenciasConfirmadas = participacaoPorDia.reduce((total, item) => total + item.ausentes, 0);
  const alunosComAusencia = resultados.filter((resultado) => Array.isArray(resultado?.diasAusentes) && resultado.diasAusentes.length).length;

  const resultadosComDia = resultados.map((resultado) => ({
    ...resultado,
    respostas: (resultado.respostas || []).map((resposta) => ({ ...resposta, diaRotulo: `Dia ${Number(resposta.dia) || 1}` })),
  }));
  const porDia = acumularCategorias(resultadosComDia, 'diaRotulo', cfg)
    .map((item) => ({ ...item, dia: Number(String(item.rotulo).replace(/\D+/g, '')) || 1 }))
    .sort((a, b) => a.dia - b.dia);
  const porArea = acumularCategorias(resultados, 'area', cfg);
  const porComponente = acumularCategorias(resultados, 'componente', cfg, { somentePedagogico: true });
  const porEixo = acumularCategorias(resultados, 'eixoPedagogico', cfg, { somentePedagogico: true });
  const porConteudo = acumularCategorias(resultados, 'conteudo', cfg, { somentePedagogico: true });
  const porHabilidade = acumularCategorias(resultados, 'habilidade', cfg, { somentePedagogico: true });
  const porHabilidadeEnem = acumularMatrizEnem(resultados, 'habilidade', cfg);
  const porCompetencia = acumularCategorias(resultados, 'competencia', cfg, { somentePedagogico: true });
  const porCompetenciaEnem = acumularMatrizEnem(resultados, 'competencia', cfg);
  const coberturaEnem = simulado?.tipo === 'enem' ? coberturaMatrizEnem(simulado) : null;
  const porDescritor = acumularCategorias(resultados, 'descritor', cfg, { somentePedagogico: true });
  const porDificuldade = acumularCategorias(resultados, 'dificuldade', cfg, { somentePedagogico: true });
  const questoes = acumularQuestoes(resultados, cfg);

  const prioridades = (lista, origemPrioridade = '') => lista
    .filter((item) => item.evidenciaSuficiente && item.nivel === 'prioritario' && item.chave !== 'NAO_CLASSIFICADO')
    .map((item) => ({ ...item, origemPrioridade }))
    .sort((a, b) => percentualDiagnostico(a) - percentualDiagnostico(b) || b.questoes - a.questoes || b.evidencias - a.evidencias);
  const consolidados = (lista) => lista
    .filter((item) => item.evidenciaSuficiente && item.nivel === 'consolidado' && item.chave !== 'NAO_CLASSIFICADO')
    .sort((a, b) => percentualDiagnostico(b) - percentualDiagnostico(a) || b.evidencias - a.evidencias);

  const alunosMapeados = resultados.map((resultado) => {
    const respostas = resultado.respostas || [];
    const metricasHabilidadeEnem = agruparRespostas(respostas, 'habilidadeEnemRotulo', cfg, { somentePedagogico: true })
      .filter((item) => item.nivel === 'prioritario' && item.evidenciaSuficiente && item.chave !== 'NAO_CLASSIFICADO');
    const metricasHabilidade = agruparRespostas(respostas, 'habilidade', cfg, { somentePedagogico: true })
      .filter((item) => item.nivel === 'prioritario' && item.evidenciaSuficiente && item.chave !== 'NAO_CLASSIFICADO');
    const metricasEixo = agruparRespostas(respostas, 'eixoPedagogico', cfg, { somentePedagogico: true })
      .filter((item) => item.nivel === 'prioritario' && item.evidenciaSuficiente && item.chave !== 'NAO_CLASSIFICADO');
    const metricasConteudo = agruparRespostas(respostas, 'conteudo', cfg, { somentePedagogico: true })
      .filter((item) => item.nivel === 'prioritario' && item.evidenciaSuficiente && item.chave !== 'NAO_CLASSIFICADO');
    const combinadas = [...metricasHabilidadeEnem, ...metricasHabilidade, ...metricasEixo, ...metricasConteudo]
      .sort((a, b) => percentualDiagnostico(a) - percentualDiagnostico(b));
    const vistas = new Set();
    const necessidades = combinadas.filter((item) => {
      const chave = normalizarChave(item.rotulo);
      if (!chave || vistas.has(chave)) return false;
      vistas.add(chave);
      return true;
    }).slice(0, 3).map((item) => ({
      rotulo: item.rotulo,
      percentualAcerto: item.percentualAcerto,
      percentualPontuacao: item.percentualPontuacao,
      evidencias: item.observadas || item.totalQuestoes,
    }));
    const percentualPontuacao = Number(resultado.resumoGeral?.percentualPontuacao) || 0;
    const coberturaPercentual = Number(resultado.resumoGeral?.coberturaPercentual) || 0;
    const observadas = Number(resultado.resumoGeral?.observadas ?? ((Number(resultado.resumoGeral?.respondidas) || 0) + (Number(resultado.resumoGeral?.brancos) || 0))) || 0;
    const idiomaPendente = Number(resultado.resumoGeral?.pendentesIdioma) > 0;
    const diasAusentes = (resultado.diasAusentes || []).map(Number).filter(Boolean).sort((a, b) => a - b);
    const participacaoParcial = diasAusentes.length > 0;
    const evidenciaBasica = observadas >= cfg.minimoQuestoesIndicador && !idiomaPendente;
    const baseAdequadaNoEscopoRealizado = coberturaPercentual >= cfg.minimoCoberturaIndividual && evidenciaBasica;
    const baseAdequadaGlobal = !participacaoParcial && baseAdequadaNoEscopoRealizado;
    const baseIncompleta = !baseAdequadaNoEscopoRealizado;
    const faixaOperacional = participacaoParcial
      ? 'participacao_parcial'
      : classificarFaixaOperacional(percentualPontuacao, { evidenciaSuficiente: evidenciaBasica, coberturaPercentual }, cfg);
    const situacaoBase = participacaoParcial
      ? (baseIncompleta ? 'participacao_parcial_base_incompleta' : 'participacao_parcial')
      : (baseIncompleta ? 'base_incompleta' : (coberturaPercentual >= 100 ? 'base_completa' : 'base_adequada'));
    return {
      resultadoId: resultado._id,
      alunoId: resultado.aluno?._id || resultado.aluno,
      nome: resultado.alunoNomeSnapshot,
      turma: resultado.alunoTurmaSnapshot,
      percentualAcerto: Number(resultado.resumoGeral?.percentualAcerto) || 0,
      percentualPontuacao,
      coberturaPercentual,
      observadas,
      necessidades,
      idiomaPendente,
      semOpcaoIdioma: Number(resultado.resumoGeral?.semOpcaoIdioma) > 0,
      diasAusentes,
      participacaoParcial,
      baseAdequadaNoEscopoRealizado,
      baseAdequadaGlobal,
      baseIncompleta,
      diagnosticoGlobalComparavel: baseAdequadaGlobal,
      situacaoBase,
      faixaOperacional,
      diagnosticoProvisorio: !participacaoParcial && baseIncompleta,
    };
  });

  const alunosAcompanhamento = alunosMapeados
    .filter((item) => ['critico', 'prioridade_alta', 'em_atencao'].includes(item.faixaOperacional))
    .sort((a, b) => a.percentualPontuacao - b.percentualPontuacao);
  const alunosIntervencaoIndividual = alunosMapeados
    .filter((item) => item.faixaOperacional === 'critico')
    .sort((a, b) => a.percentualPontuacao - b.percentualPontuacao);
  const destaques = [...alunosMapeados]
    .filter((item) => !item.diagnosticoProvisorio && !item.participacaoParcial)
    .sort((a, b) => b.percentualPontuacao - a.percentualPontuacao)
    .slice(0, 20);
  const questoesPrioritarias = questoes
    .filter((item) => item.naturezaEvidencia === 'pedagogica' && item.evidenciaSuficiente && item.nivel === 'prioritario')
    .sort((a, b) => percentualDiagnostico(a) - percentualDiagnostico(b));
  const questoesRevisao = questoes
    .filter((item) => item.naturezaEvidencia === 'pedagogica' && item.evidenciaSuficiente && (
      item.alertaRevisao || (item.nivel === 'prioritario' && item.distratorDominante && item.concentracaoDistrator >= 60)
    ))
    .sort((a, b) => {
      const negA = a.discriminacao?.disponivel && a.discriminacao.indice < 0 ? 0 : 1;
      const negB = b.discriminacao?.disponivel && b.discriminacao.indice < 0 ? 0 : 1;
      return negA - negB || percentualDiagnostico(a) - percentualDiagnostico(b);
    });
  const prioridadesConteudo = prioridades(porConteudo, 'conteudo');
  const prioridadesHabilidade = prioridades(porHabilidade, 'habilidade');
  const prioridadesHabilidadeEnem = prioridades(porHabilidadeEnem, 'habilidade_enem');
  const prioridadesCompetenciaEnem = prioridades(porCompetenciaEnem, 'competencia_enem');
  const prioridadesEixo = prioridades(porEixo, 'eixo');
  const prioridadesComponente = prioridades(porComponente, 'componente');
  const agrupamentosIntervencao = gruposDeIntervencao(resultados, cfg);
  const intervencoesAmplas = agrupamentosIntervencao.filter((grupo) => grupo.alcanceIntervencao === 'ampla');
  const gruposIntervencao = agrupamentosIntervencao.filter((grupo) => grupo.alcanceIntervencao === 'grupo');
  const resumo = {
    participantes,
    turmas: new Set(resultados.map((item) => texto(item.alunoTurmaSnapshot)).filter(Boolean)).size,
    respondidas: geral.respondidas,
    observadas: geral.observadas,
    aplicaveis: geral.aplicaveis,
    acertos: geral.acertos,
    percentualAcerto: percentual(geral.acertos, geral.respondidas),
    percentualPontuacao: percentual(geral.pontosObtidos, geral.pontosPossiveis),
    coberturaPercentual: percentual(geral.observadas, geral.aplicaveis),
    brancos: geral.brancos,
    naoInformadas: geral.naoInformadas,
    pendentesIdioma: geral.pendentesIdioma,
    alunosIdiomaPendente: resultados.filter((item) => Number(item.resumoGeral?.pendentesIdioma) > 0).length,
    semOpcaoIdioma: geral.semOpcaoIdioma,
    alunosSemOpcaoIdioma: resultados.filter((item) => Number(item.resumoGeral?.semOpcaoIdioma) > 0).length,
    alunosBaseCompleta: alunosMapeados.filter((item) => item.situacaoBase === 'base_completa').length,
    alunosBaseAdequada: alunosMapeados.filter((item) => ['base_completa', 'base_adequada'].includes(item.situacaoBase)).length,
    alunosParticipacaoParcial: alunosMapeados.filter((item) => item.participacaoParcial).length,
    alunosParticipacaoParcialBaseIncompleta: alunosMapeados.filter((item) => item.participacaoParcial && item.baseIncompleta).length,
    alunosBaseIncompleta: alunosMapeados.filter((item) => item.baseIncompleta).length,
    // Compatibilidade: o campo legado representa apenas participação completa com base realmente incompleta.
    alunosDiagnosticoProvisorio: alunosMapeados.filter((item) => item.diagnosticoProvisorio).length,
    alunosComAusencia,
    ausenciasConfirmadas: totalAusenciasConfirmadas,
  };
  const porTurma = resumirTurmas(resultados, cfg).map((item) => ({
    ...item,
    diferencaGeral: arredondar(item.percentualPontuacao - resumo.percentualPontuacao, 1),
  }));
  const ordemFaixas = ['critico', 'prioridade_alta', 'em_atencao', 'em_desenvolvimento', 'consolidado', 'participacao_parcial', 'evidencia_insuficiente'];
  const distribuicaoAlunos = ordemFaixas.map((nivel) => ({
    nivel,
    quantidade: alunosMapeados.filter((item) => item.faixaOperacional === nivel).length,
  }));
  const alunosBaixaCobertura = alunosMapeados
    .filter((item) => item.coberturaPercentual < 100 || item.idiomaPendente)
    .sort((a, b) => a.coberturaPercentual - b.coberturaPercentual);
  const alunosParticipacaoParcial = alunosMapeados
    .filter((item) => item.participacaoParcial)
    .sort((a, b) => a.turma.localeCompare(b.turma, 'pt-BR', { numeric: true }) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const alertasIntegridade = gerarAlertasIntegridade({ resumo, alunosBaixaCobertura, cfg });
  if (totalAusenciasConfirmadas > 0) {
    const detalhes = participacaoPorDia.filter((item) => item.ausentes > 0)
      .map((item) => `${item.dia}º dia: ${item.ausentes} ausência(s)`)
      .join(' · ');
    alertasIntegridade.push({
      tipo: 'ausencias_aplicacao',
      severidade: 'informativa',
      titulo: 'Ausências confirmadas foram excluídas do diagnóstico',
      mensagem: `${totalAusenciasConfirmadas} ausência(s) confirmada(s) em ${alunosComAusencia} estudante(s). As questões dos dias não realizados não entram como erro, branco ou dado ausente.`,
      acaoSugerida: 'Manter a ausência registrada e analisar o estudante somente nas áreas/dias efetivamente realizados.',
      evidencia: detalhes,
    });
  }
  const parciaisComBaseIncompleta = alunosParticipacaoParcial.filter((item) => item.baseIncompleta);
  if (parciaisComBaseIncompleta.length) {
    alertasIntegridade.push({
      tipo: 'participacao_parcial_base_incompleta',
      severidade: 'alta',
      titulo: 'Participação parcial com base ainda incompleta',
      mensagem: `${parciaisComBaseIncompleta.length} estudante(s) têm ausência confirmada e, além disso, a base do que foi realizado ainda não atende ao mínimo de cobertura/evidência.`,
      acaoSugerida: 'Manter a ausência registrada, mas conferir as respostas do(s) dia(s) realizado(s) antes de concluir qualquer diagnóstico individual nessas áreas.',
      evidencia: parciaisComBaseIncompleta.slice(0, 8).map((item) => `${item.nome} (${item.turma}) - ${item.coberturaPercentual.toFixed(1)}%`).join(' · '),
    });
  }
  if (simulado.tipo === 'enem' && coberturaEnem && coberturaEnem.variantesElegiveis > 0 && coberturaEnem.variantesMapeadas < coberturaEnem.variantesElegiveis) {
    alertasIntegridade.push({
      tipo: 'mapeamento_enem_incompleto',
      severidade: 'moderada',
      titulo: 'Mapeamento de habilidades ENEM incompleto',
      mensagem: `${coberturaEnem.variantesMapeadas} de ${coberturaEnem.variantesElegiveis} variante(s) pedagógica(s) possuem HABILIDADE_ENEM válida.`,
      acaoSugerida: 'Completar o mapeamento pela planilha específica. O Axoriin não infere habilidade ENEM apenas pelo conteúdo da questão.',
      evidencia: `${coberturaEnem.naoMapeadas.length} variante(s) ainda sem habilidade oficial associada.`,
    });
  }
  else if (simulado.tipo === 'enem' && coberturaEnem && coberturaEnem.variantesMapeadasAproximadas > 0) {
    alertasIntegridade.push({
      tipo: 'mapeamento_enem_aproximado',
      severidade: 'informativa',
      titulo: 'Mapeamento ENEM completo com aproximações pedagógicas identificadas',
      mensagem: `${coberturaEnem.variantesMapeadas} de ${coberturaEnem.variantesElegiveis} variante(s) estão mapeadas; ${coberturaEnem.variantesMapeadasAproximadas} usam o melhor encaixe disponível na Matriz ENEM.`,
      acaoSugerida: 'Manter as aproximações identificadas como tal e revisá-las se a escola adotar uma matriz complementar ou um critério pedagógico mais específico.',
      evidencia: `${coberturaEnem.variantesMapeadasDiretas} vínculo(s) direto(s) e ${coberturaEnem.variantesMapeadasAproximadas} aproximado(s).`,
    });
  }
  const prioridadesPedagogicas = gerarPrioridadesPedagogicas({
    resumo,
    porArea,
    prioridadesEixo,
    prioridadesHabilidade,
    prioridadesHabilidadeEnem,
    questoesPrioritarias,
    questoesRevisao,
    intervencoesAmplas,
    gruposIntervencao,
    alunosIntervencaoIndividual,
    cfg,
  });
  const planoIntervencao = gerarPlanoIntervencao({
    porArea,
    prioridadesEixo,
    prioridadesHabilidadeEnem,
    intervencoesAmplas,
    gruposIntervencao,
    alunosIntervencaoIndividual,
    participantes,
  });
  const analiseVisual = montarAnaliseVisual({
    resultados,
    questoes,
    porArea,
    porTurma,
    porHabilidadeEnem,
    distribuicaoAlunos,
    participacaoPorDia,
    resumo,
    cfg,
  });

  return {
    configuracao: cfg,
    metodologia: {
      versao: 5,
      classificacaoUsa: 'percentualPontuacao',
      indicadores: [
        { chave: 'percentualPontuacao', nome: 'Desempenho confirmado', formula: 'pontos obtidos ÷ pontos possíveis nas respostas confirmadas; branco vale zero e dado ausente não entra na conta', uso: 'Medir o resultado bruto confirmado' },
        { chave: 'percentualAcerto', nome: 'Taxa de acerto nas respostas marcadas', formula: 'acertos ÷ respostas com alternativa A-E', uso: 'Distinguir erros de respostas em branco' },
        { chave: 'coberturaPercentual', nome: 'Cobertura dos dados', formula: 'respostas confirmadas, inclusive brancos, ÷ questões aplicáveis', uso: 'Mostrar se o diagnóstico é completo ou parcial' },
      ],
      faixas: [
        { nivel: 'critico', regra: `abaixo de ${(cfg.percentualAtencao * 0.5).toFixed(1)}% com cobertura individual mínima atendida` },
        { nivel: 'prioridade_alta', regra: `de ${(cfg.percentualAtencao * 0.5).toFixed(1)}% até menos de ${(cfg.percentualAtencao * 0.8).toFixed(1)}%` },
        { nivel: 'em_atencao', regra: `de ${(cfg.percentualAtencao * 0.8).toFixed(1)}% até menos de ${cfg.percentualAtencao}%` },
        { nivel: 'em_desenvolvimento', regra: `de ${cfg.percentualAtencao}% até menos de ${cfg.percentualConsolidado}%` },
        { nivel: 'consolidado', regra: `a partir de ${cfg.percentualConsolidado}%` },
        { nivel: 'participacao_parcial', regra: 'ausência confirmada em pelo menos um dia; classificar somente áreas e habilidades efetivamente realizadas' },
        { nivel: 'evidencia_insuficiente', regra: `participação completa, porém cobertura individual abaixo de ${cfg.minimoCoberturaIndividual}% ou evidência mínima não atendida` },
      ],
      classificacaoItens: 'Questões individuais usam faixas de acerto (muito baixo, baixo, intermediário, alto e muito alto), sem chamar uma habilidade de consolidada por causa de um único item.',
      discriminacaoItens: 'Quando há pelo menos 10 estudantes com cobertura individual adequada, o relatório calcula uma triagem simples de discriminação comparando os 27% de maior e menor desempenho. Índice negativo é sinal de revisão do item, não prova de erro no gabarito.',
      separacaoProcedimental: 'Língua estrangeira não marcada permanece valendo zero no resultado do simulado, mas não é transformada em conteúdo, habilidade, eixo pedagógico ou questão acadêmica prioritária.',
      tratamentoAusencia: 'Ausência confirmada em um dia de aplicação retira as questões daquele dia do denominador, da cobertura e das inferências daquele dia. O estudante passa a ter status próprio de participação parcial, separado de evidência insuficiente; as áreas e habilidades dos dias efetivamente realizados permanecem válidas.',
      hierarquiaIntervencao: 'A ordem operacional é turma → intervenção ampla → pequeno grupo → individual. Necessidades com mais de 15 estudantes, mas abaixo do limiar coletivo de 60%, deixam de ser chamadas de pequeno grupo e devem ser organizadas por turma. Ausência confirmada não vira erro nem baixa cobertura artificial.',
      matrizEnem: simulado.tipo === 'enem' ? `Habilidades e competências oficiais são resolvidas pela ${FONTE_MATRIZ_ENEM.titulo} (${FONTE_MATRIZ_ENEM.orgao}, ${FONTE_MATRIZ_ENEM.ano}). O código H1-H30 deve ser mapeado explicitamente por questão; o Axoriin não deduz habilidade apenas pelo conteúdo.` : '',
      evidenciaHabilidadeEnem: simulado.tipo === 'enem' ? `Uma habilidade ENEM só recebe classificação pedagógica quando há pelo menos ${cfg.minimoQuestoesIndicador} questão(ões) e ${cfg.minimoRespondentesQuestao} estudante(s) com evidência. Resultado baseado em um único item é exibido como indicativo, não como domínio consolidado.` : '',
      observacao: 'Os percentuais são acertos brutos para diagnóstico pedagógico. Não correspondem à nota TRI oficial do ENEM. As faixas operacionais são critérios internos de gestão e não cortes oficiais.',
    },
    resumo,
    leituraExecutiva: {
      statusDados: resumo.coberturaPercentual === 100 && !resumo.naoInformadas && !resumo.alunosIdiomaPendente ? 'completo' : 'parcial',
      sintese: `${participantes} participante(s), desempenho confirmado de ${resumo.percentualPontuacao.toFixed(1)}%, taxa de acerto nas respostas marcadas de ${resumo.percentualAcerto.toFixed(1)}% e cobertura de ${resumo.coberturaPercentual.toFixed(1)}%.`,
      criterio: `Intervenção em três níveis: primeiro a turma, depois grupos com dificuldade comum e, por último, casos individuais críticos. Para classificação global individual, é necessária participação completa e ao menos ${cfg.minimoCoberturaIndividual}% de cobertura. Ausência confirmada é tratada separadamente: as áreas e habilidades dos dias realizados continuam válidas.`,
    },
    alertasIntegridade,
    prioridadesPedagogicas,
    acoesGestao: prioridadesPedagogicas,
    planoIntervencao,
    analiseVisual,
    distribuicaoAlunos,
    porDia,
    participacaoPorDia,
    porSerie: resumirSeries(simulado, resultados, cfg),
    porTurma,
    porArea,
    porComponente,
    porEixo,
    porConteudo,
    porHabilidade,
    porHabilidadeEnem,
    porCompetencia,
    porCompetenciaEnem,
    coberturaEnem,
    porDescritor,
    porDificuldade,
    prioridadesComponente,
    prioridadesEixo,
    prioridadesConteudo,
    prioridadesHabilidade,
    prioridadesHabilidadeEnem,
    prioridadesCompetenciaEnem,
    pontosFortesConteudo: consolidados(porConteudo),
    pontosFortesHabilidadeEnem: consolidados(porHabilidadeEnem),
    pontosFortesHabilidade: consolidados(porHabilidade),
    pontosFortesEixo: consolidados(porEixo),
    questoes,
    questoesPrioritarias,
    questoesRevisao,
    alunosPrioritarios: alunosAcompanhamento.slice(0, 100),
    alunosIntervencaoIndividual: alunosIntervencaoIndividual.slice(0, 100),
    alunosDestaque: destaques,
    alunosBaixaCobertura,
    alunosParticipacaoParcial,
    intervencoesAmplas,
    gruposIntervencao,
  };
}

function compararResultados(atuais = [], anteriores = [], cfg = {}) {
  const anteriorPorAluno = new Map(anteriores.map((item) => [texto(item.aluno?._id || item.aluno), item]));
  const pares = [];
  const paresCompletos = [];
  const minimoCoberturaIndividual = Number(cfg?.minimoCoberturaIndividual || 80);
  const globalComparavel = (resultado) => {
    const cobertura = Number(resultado?.resumoGeral?.coberturaPercentual || 0);
    const idiomaPendente = Number(resultado?.resumoGeral?.pendentesIdioma || 0) > 0;
    const participacaoParcial = Array.isArray(resultado?.diasAusentes) && resultado.diasAusentes.length > 0;
    return !participacaoParcial && !idiomaPendente && cobertura >= minimoCoberturaIndividual;
  };

  for (const atual of atuais) {
    const alunoId = texto(atual.aluno?._id || atual.aluno);
    const anterior = anteriorPorAluno.get(alunoId);
    if (!anterior) continue;
    paresCompletos.push({ atual, anterior });
    if (!globalComparavel(atual) || !globalComparavel(anterior)) continue;
    const antes = Number(anterior.resumoGeral?.percentualPontuacao) || 0;
    const depois = Number(atual.resumoGeral?.percentualPontuacao) || 0;
    pares.push({
      alunoId,
      nome: atual.alunoNomeSnapshot,
      turma: atual.alunoTurmaSnapshot,
      anterior: antes,
      atual: depois,
      variacao: arredondar(depois - antes, 1),
    });
  }

  function agregarComparacaoMetricas(chaveLista, limite = 60) {
    const mapa = new Map();
    for (const par of paresCompletos) {
      const atuaisMetricas = Array.isArray(par.atual?.[chaveLista]) ? par.atual[chaveLista] : [];
      const anterioresMetricas = Array.isArray(par.anterior?.[chaveLista]) ? par.anterior[chaveLista] : [];
      const anteriorPorChave = new Map(anterioresMetricas.map((item) => [normalizarChave(item.chave || item.rotulo), item]));
      for (const atualMetrica of atuaisMetricas) {
        const chave = normalizarChave(atualMetrica.chave || atualMetrica.rotulo);
        if (!chave) continue;
        const anteriorMetrica = anteriorPorChave.get(chave);
        if (!anteriorMetrica) continue;
        if (!mapa.has(chave)) mapa.set(chave, {
          chave,
          rotulo: atualMetrica.rotulo,
          areaCodigo: atualMetrica.areaCodigo || '',
          areaNome: atualMetrica.areaNome || '',
          habilidadeCodigo: atualMetrica.habilidadeCodigo || atualMetrica.codigo || '',
          habilidadeDescricao: atualMetrica.habilidadeDescricao || atualMetrica.descricao || '',
          atualObtidos: 0,
          atualPossiveis: 0,
          anteriorObtidos: 0,
          anteriorPossiveis: 0,
          alunos: 0,
        });
        const item = mapa.get(chave);
        item.atualObtidos += Number(atualMetrica.pontosObtidos || 0);
        item.atualPossiveis += Number(atualMetrica.pontosPossiveis || 0);
        item.anteriorObtidos += Number(anteriorMetrica.pontosObtidos || 0);
        item.anteriorPossiveis += Number(anteriorMetrica.pontosPossiveis || 0);
        item.alunos += 1;
      }
    }
    return [...mapa.values()].map((item) => {
      const anterior = percentual(item.anteriorObtidos, item.anteriorPossiveis);
      const atual = percentual(item.atualObtidos, item.atualPossiveis);
      return {
        chave: item.chave,
        rotulo: item.rotulo,
        areaCodigo: item.areaCodigo,
        areaNome: item.areaNome,
        habilidadeCodigo: item.habilidadeCodigo,
        habilidadeDescricao: item.habilidadeDescricao,
        alunos: item.alunos,
        anterior,
        atual,
        variacao: arredondar(atual - anterior, 1),
      };
    }).sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao) || a.rotulo.localeCompare(b.rotulo, 'pt-BR')).slice(0, limite);
  }

  const porArea = agregarComparacaoMetricas('porArea', 12);
  const porHabilidadeEnem = agregarComparacaoMetricas('porHabilidadeEnem', 80);
  const distribuicaoVariacao = [
    { chave: 'melhora_forte', rotulo: 'Melhora ≥ 5 p.p.', quantidade: pares.filter((item) => item.variacao >= 5).length },
    { chave: 'estavel', rotulo: 'Entre -5 e +5 p.p.', quantidade: pares.filter((item) => item.variacao > -5 && item.variacao < 5).length },
    { chave: 'queda_forte', rotulo: 'Queda ≤ -5 p.p.', quantidade: pares.filter((item) => item.variacao <= -5).length },
  ];

  return {
    alunosComparados: pares.length,
    mediaVariacao: pares.length ? arredondar(pares.reduce((soma, item) => soma + item.variacao, 0) / pares.length, 1) : 0,
    melhoraram: pares.filter((item) => item.variacao > 0).length,
    mantiveram: pares.filter((item) => item.variacao === 0).length,
    reduziram: pares.filter((item) => item.variacao < 0).length,
    distribuicaoVariacao,
    porArea,
    porHabilidadeEnem,
    alunos: pares.sort((a, b) => b.variacao - a.variacao),
  };
}

module.exports = {
  texto,
  semAcentos,
  normalizarChave,
  normalizarIdioma,
  normalizarResposta,
  questaoTemIdioma,
  simuladoTemIdioma,
  contextoIdiomaResultado,
  selecionarVariante,
  serieDaTurma,
  configuracao,
  classificarNivel,
  classificarFaixaOperacional,
  avaliarResultado,
  agregarDashboard,
  compararResultados,
};
