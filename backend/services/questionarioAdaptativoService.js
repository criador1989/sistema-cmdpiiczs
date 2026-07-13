'use strict';

const DIFICULDADES = ['facil', 'medio', 'dificil'];

function embaralharSeguro(lista) {
  const copia = Array.isArray(lista) ? [...lista] : [];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function dificuldadeEfetiva(questao) {
  const usos = Number(questao?.usoContador) || 0;
  const acertos = Number(questao?.acertosContador) || 0;

  // Depois de uma amostra mínima, usa o desempenho real para calibrar a dificuldade.
  if (usos >= 20) {
    const taxa = acertos / usos;
    if (taxa >= 0.75) return 'facil';
    if (taxa >= 0.45) return 'medio';
    return 'dificil';
  }

  return DIFICULDADES.includes(questao?.dificuldade)
    ? questao.dificuldade
    : 'medio';
}

function analisarPerfilAdaptativo(tentativas = []) {
  const finalizadas = (tentativas || [])
    .filter((t) => t?.status === 'finalizado')
    .slice(0, 10);

  const perfil = {
    totalTentativas: finalizadas.length,
    mediaGeral: 0,
    mediaPonderadaRecente: 0,
    ultimaNota: finalizadas[0]?.nota ?? null,
    habilidadeMaisFraca: '',
    areaMaisFraca: '',
    dificuldadeAlvo: 'facil',
    recomendacao: 'Comece consolidando questões fáceis e avance gradualmente.'
  };

  if (!finalizadas.length) return perfil;

  const notas = finalizadas.map((t) => Number(t.nota) || 0);
  perfil.mediaGeral = Math.round(notas.reduce((s, n) => s + n, 0) / notas.length);

  const pesos = [0.35, 0.25, 0.17, 0.13, 0.10];
  const recentes = notas.slice(0, pesos.length);
  const somaPesos = pesos.slice(0, recentes.length).reduce((s, p) => s + p, 0);
  perfil.mediaPonderadaRecente = Math.round(
    recentes.reduce((s, n, i) => s + n * pesos[i], 0) / somaPesos
  );

  const errosArea = new Map();
  const errosHabilidade = new Map();

  for (const tentativa of finalizadas.slice(0, 6)) {
    for (const item of tentativa?.resumoDesempenho?.errosPorArea || []) {
      const nome = String(item?.area || '').trim();
      if (!nome || nome === 'Geral') continue;
      errosArea.set(nome, (errosArea.get(nome) || 0) + (Number(item.quantidade) || 0));
    }

    for (const item of tentativa?.resumoDesempenho?.errosPorHabilidade || []) {
      const nome = String(item?.habilidade || '').trim();
      if (!nome || nome === 'Geral') continue;
      errosHabilidade.set(nome, (errosHabilidade.get(nome) || 0) + (Number(item.quantidade) || 0));
    }
  }

  perfil.areaMaisFraca = [...errosArea.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  perfil.habilidadeMaisFraca = [...errosHabilidade.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  const duasUltimas = notas.slice(0, 2);
  const sequenciaAlta = duasUltimas.length === 2 && duasUltimas.every((n) => n >= 80);
  const sequenciaBaixa = duasUltimas.length === 2 && duasUltimas.every((n) => n < 55);

  if (perfil.mediaPonderadaRecente >= 78 && sequenciaAlta) {
    perfil.dificuldadeAlvo = 'dificil';
    perfil.recomendacao = 'Avance para questões difíceis, mantendo uma parcela de revisão fácil e média.';
  } else if (perfil.mediaPonderadaRecente >= 55 && !sequenciaBaixa) {
    perfil.dificuldadeAlvo = 'medio';
    perfil.recomendacao = 'Consolide questões médias e mantenha revisão periódica dos fundamentos.';
  } else {
    perfil.dificuldadeAlvo = 'facil';
    perfil.recomendacao = 'Reforce os fundamentos com maior presença de questões fáceis.';
  }

  return perfil;
}

function distribuicaoPorDificuldade({ alvo, tipo, quantidade }) {
  let proporcoes;

  if (tipo === 'diagnostico') {
    proporcoes = { facil: 0.40, medio: 0.40, dificil: 0.20 };
  } else if (alvo === 'dificil') {
    // Mantém 15% de questões fáceis para revisão espaçada.
    proporcoes = { facil: 0.15, medio: 0.35, dificil: 0.50 };
  } else if (alvo === 'medio') {
    proporcoes = { facil: 0.25, medio: 0.55, dificil: 0.20 };
  } else {
    proporcoes = { facil: 0.70, medio: 0.25, dificil: 0.05 };
  }

  const cotas = {
    facil: Math.floor(quantidade * proporcoes.facil),
    medio: Math.floor(quantidade * proporcoes.medio),
    dificil: Math.floor(quantidade * proporcoes.dificil)
  };

  let restante = quantidade - cotas.facil - cotas.medio - cotas.dificil;
  const ordem = alvo === 'dificil'
    ? ['dificil', 'medio', 'facil']
    : alvo === 'medio'
      ? ['medio', 'facil', 'dificil']
      : ['facil', 'medio', 'dificil'];

  let i = 0;
  while (restante > 0) {
    cotas[ordem[i % ordem.length]] += 1;
    restante -= 1;
    i += 1;
  }

  return cotas;
}

function selecionarQuestoesAdaptativas({
  questoes = [],
  tentativasRecentes = [],
  quantidade = 5,
  tipo = 'treino',
  dificuldadeSolicitada = '',
  habilidadeFoco = '',
  idsReforco = [],
  idsRecentes = []
}) {
  const perfil = analisarPerfilAdaptativo(tentativasRecentes);
  const alvo = DIFICULDADES.includes(dificuldadeSolicitada)
    ? dificuldadeSolicitada
    : perfil.dificuldadeAlvo;

  const cotas = distribuicaoPorDificuldade({ alvo, tipo, quantidade });
  const reforcoSet = new Set((idsReforco || []).map(String));
  const recentesSet = new Set((idsRecentes || []).map(String));
  const selecionadas = [];
  const usados = new Set();

  function adicionar(lista, limite, reforcoAplicado = false) {
    if (limite <= 0) return;
    for (const q of embaralharSeguro(lista)) {
      if (selecionadas.length >= quantidade || limite <= 0) break;
      const id = String(q?._id || '');
      if (!id || usados.has(id)) continue;
      usados.add(id);
      selecionadas.push({ ...q, __reforcoAplicado: reforcoAplicado });
      limite -= 1;
    }
  }

  const reforcoQuota = tipo === 'revisao'
    ? Math.ceil(quantidade * 0.40)
    : Math.ceil(quantidade * 0.25);

  const questoesReforco = questoes.filter((q) => reforcoSet.has(String(q?._id)));
  adicionar(questoesReforco, reforcoQuota, true);

  const contagemAtual = () => {
    const c = { facil: 0, medio: 0, dificil: 0 };
    for (const q of selecionadas) c[dificuldadeEfetiva(q)] += 1;
    return c;
  };

  for (const dificuldade of DIFICULDADES) {
    const atuais = contagemAtual();
    const faltam = Math.max(0, cotas[dificuldade] - atuais[dificuldade]);

    const focoNaoRecente = questoes.filter((q) =>
      dificuldadeEfetiva(q) === dificuldade &&
      (!habilidadeFoco || q?.habilidade === habilidadeFoco) &&
      !recentesSet.has(String(q?._id)) &&
      !usados.has(String(q?._id))
    );

    const geraisNaoRecentes = questoes.filter((q) =>
      dificuldadeEfetiva(q) === dificuldade &&
      !recentesSet.has(String(q?._id)) &&
      !usados.has(String(q?._id))
    );

    const focoLimite = habilidadeFoco ? Math.ceil(faltam * 0.55) : 0;
    adicionar(focoNaoRecente, focoLimite, tipo === 'revisao');

    const depoisFoco = contagemAtual();
    adicionar(
      geraisNaoRecentes,
      Math.max(0, cotas[dificuldade] - depoisFoco[dificuldade]),
      false
    );
  }

  // Primeiro fallback: quaisquer questões não recentes.
  adicionar(
    questoes.filter((q) => !recentesSet.has(String(q?._id)) && !usados.has(String(q?._id))),
    quantidade - selecionadas.length,
    false
  );

  // Segundo fallback: permite repetição recente para não deixar o treino incompleto.
  adicionar(
    questoes.filter((q) => !usados.has(String(q?._id))),
    quantidade - selecionadas.length,
    false
  );

  return {
    selecionadas: selecionadas.slice(0, quantidade),
    perfil,
    dificuldadeAlvo: alvo,
    distribuicaoPlanejada: cotas
  };
}

module.exports = {
  analisarPerfilAdaptativo,
  dificuldadeEfetiva,
  distribuicaoPorDificuldade,
  selecionarQuestoesAdaptativas
};
