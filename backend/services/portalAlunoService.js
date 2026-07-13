'use strict';

const SEGMENTOS = Object.freeze({
  ENSINO_MEDIO: 'ensino_medio',
  FUNDAMENTAL_II: 'fundamental_ii',
  INDEFINIDO: 'indefinido'
});

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°ª]/g, ' ')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .trim()
    .toUpperCase();
}

function flagAmbiente(nome, padrao = false) {
  const valor = String(process.env[nome] ?? '').trim().toLowerCase();
  if (!valor) return padrao;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(valor);
}

function extrairSerie(turma) {
  const normalizada = normalizarTexto(turma);
  if (!normalizada) return null;

  const explicita = normalizada.match(/(?:^|\s)([1-9])(?:\s*(?:ANO|SERIE|EM|EF)|\s+[A-Z]|$)/);
  if (explicita) return Number(explicita[1]);

  const primeira = normalizada.match(/(?:^|\s)([1-9])(?:\s|$)/);
  return primeira ? Number(primeira[1]) : null;
}

function classificarSegmento(turma) {
  const normalizada = normalizarTexto(turma);
  const serie = extrairSerie(turma);

  const marcaEnsinoMedio = /\b(?:ENSINO MEDIO|MEDIO|EM|SERIE)\b/.test(normalizada);
  const marcaFundamental = /\b(?:ENSINO FUNDAMENTAL|FUNDAMENTAL|EF)\b/.test(normalizada);

  if (serie >= 6 && serie <= 9) {
    return {
      segmento: SEGMENTOS.FUNDAMENTAL_II,
      serie,
      rotulo: `${serie}º ano do Ensino Fundamental II`,
      experiencia: 'gamificada'
    };
  }

  if ((serie >= 1 && serie <= 3) || marcaEnsinoMedio) {
    return {
      segmento: SEGMENTOS.ENSINO_MEDIO,
      serie: serie >= 1 && serie <= 3 ? serie : null,
      rotulo: serie ? `${serie}ª série do Ensino Médio` : 'Ensino Médio',
      experiencia: 'enem'
    };
  }

  if (marcaFundamental) {
    return {
      segmento: SEGMENTOS.FUNDAMENTAL_II,
      serie,
      rotulo: 'Ensino Fundamental II',
      experiencia: 'gamificada'
    };
  }

  return {
    segmento: SEGMENTOS.INDEFINIDO,
    serie,
    rotulo: 'Segmento ainda não identificado',
    experiencia: 'neutra'
  };
}

function modulo({ id, titulo, descricao, rota, icone, status, destaque = false }) {
  return { id, titulo, descricao, rota, icone, status, destaque };
}

function montarModulos(segmento) {
  const questionariosAtivos = flagAmbiente('PORTAL_ALUNO_QUESTIONARIOS_ATIVO', true);
  const redacaoAtiva = flagAmbiente('PORTAL_ALUNO_REDACAO_ATIVO', true);
  const simuladosAtivos = flagAmbiente('PORTAL_ALUNO_SIMULADOS_ATIVO', false);
  const jogosAtivos = flagAmbiente('PORTAL_ALUNO_JOGOS_ATIVO', false);
  const rankingAtivo = flagAmbiente('PORTAL_ALUNO_RANKING_GAMES_ATIVO', false);
  const personagensAtivos = flagAmbiente('PORTAL_ALUNO_PERSONAGENS_ATIVO', false);

  if (segmento === SEGMENTOS.ENSINO_MEDIO) {
    return [
      modulo({
        id: 'questionarios',
        titulo: 'Questionários',
        descricao: 'Treinos adaptativos por área e habilidade, com acompanhamento do desempenho.',
        rota: '/aluno-questionarios.html',
        icone: 'quiz',
        status: questionariosAtivos ? 'ativo' : 'indisponivel',
        destaque: true
      }),
      modulo({
        id: 'redacao',
        titulo: 'Redação ENEM',
        descricao: 'Produção textual, correção por competências C1–C5 e plano de estudo individual.',
        rota: '/aluno-redacao.html',
        icone: 'redacao',
        status: redacaoAtiva ? 'ativo' : 'indisponivel',
        destaque: true
      }),
      modulo({
        id: 'simulados',
        titulo: 'Simulados',
        descricao: 'Estrutura preparada para provas completas, cronômetro e análise por área.',
        rota: '/aluno-simulados.html',
        icone: 'simulado',
        status: simuladosAtivos ? 'ativo' : 'em_breve'
      })
    ];
  }

  if (segmento === SEGMENTOS.FUNDAMENTAL_II) {
    return [
      modulo({
        id: 'jogos',
        titulo: 'Mundo Axoriin',
        descricao: 'Jornada de aprendizagem com quizzes, missões e recompensas.',
        rota: '/aluno-jogos.html',
        icone: 'jogos',
        status: jogosAtivos ? 'ativo' : 'em_preparacao',
        destaque: true
      }),
      modulo({
        id: 'ranking',
        titulo: 'Ranking e ligas',
        descricao: 'Classificação saudável por turma, temporadas e conquistas.',
        rota: '/aluno-jogos.html#ranking',
        icone: 'ranking',
        status: rankingAtivo ? 'ativo' : 'em_preparacao'
      }),
      modulo({
        id: 'personagens',
        titulo: 'Personagens',
        descricao: 'Avatares próprios, itens cosméticos e evolução pela aprendizagem.',
        rota: '/aluno-jogos.html#personagens',
        icone: 'personagem',
        status: personagensAtivos ? 'ativo' : 'em_preparacao'
      })
    ];
  }

  return [
    modulo({
      id: 'identificacao',
      titulo: 'Portal em configuração',
      descricao: 'A turma precisa ser identificada para liberar a experiência correta do aluno.',
      rota: null,
      icone: 'configuracao',
      status: 'configuracao'
    })
  ];
}

function montarContextoPortal(turma) {
  const classificacao = classificarSegmento(turma);

  return {
    versao: '1.0.0',
    ...classificacao,
    modulos: montarModulos(classificacao.segmento),
    capacidades: {
      instalavel: true,
      responsivo: true,
      desktopElectron: true,
      offlineCompleto: false
    }
  };
}

module.exports = {
  SEGMENTOS,
  normalizarTexto,
  extrairSerie,
  classificarSegmento,
  montarModulos,
  montarContextoPortal
};
