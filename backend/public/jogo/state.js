import { GAME_CONFIG, LOCATIONS, AVATARS } from './config.js?v=20260717-v5-47-0-questoes-reais';

export const GameState = {
  contexto: null,
  localAtual: null,
  missaoAtual: null,
  perguntasAtuais: [],
  respostas: [],
  resultado: null,
  tentativaAtual: null,
  player: { ...GAME_CONFIG.playerStart },
  avatarSelecionado: 'cadete-azul',

  setContexto(contexto) {
    this.contexto = contexto;

    let avatarLocal = null;
    try { avatarLocal = localStorage.getItem('arena_avatar_demo'); } catch (_) {}

    const avatarContexto = contexto?.jogador?.avatar;
    const candidato = avatarLocal || avatarContexto || 'cadete-azul';
    const selecionado = AVATARS.some((avatar) => avatar.id === candidato)
      ? candidato
      : 'cadete-azul';

    this.avatarSelecionado = selecionado;
    if (this.contexto?.jogador) this.contexto.jogador.avatar = selecionado;
    try { localStorage.setItem('arena_avatar_demo', selecionado); } catch (_) {}

    this.missaoAtual = contexto?.missoes?.[0] || null;
  },

  getDailyLimit() {
    return this.contexto?.progressoDiario?.limite || GAME_CONFIG.dailyLimit;
  },

  getRespondidasHoje() {
    return this.contexto?.progressoDiario?.respondidasHoje || 0;
  },

  getRestantesHoje() {
    const informado = this.contexto?.progressoDiario?.restantesHoje;
    if (Number.isFinite(Number(informado))) return Math.max(0, Number(informado));
    return Math.max(0, this.getDailyLimit() - this.getRespondidasHoje());
  },

  getMissoesPorLocal(localId) {
    return (this.contexto?.missoes || []).filter((m) => m.localId === localId);
  },

  escolherLocal(local) {
    const missao = this.getMissoesPorLocal(local.id)[0] || this.contexto?.missoes?.[0] || null;
    this.localAtual = local;
    this.missaoAtual = missao;
    this.resetQuiz();
  },

  prepararPerguntasDaMissao() {
    const perguntas = this.missaoAtual?.perguntas || [];
    const restantes = this.getRestantesHoje();
    const qtd = Math.min(perguntas.length, Math.max(0, restantes), 3);
    this.perguntasAtuais = perguntas.slice(0, qtd);
    return this.perguntasAtuais;
  },

  definirTentativaArena(tentativa, perguntas = []) {
    this.tentativaAtual = tentativa || null;
    this.perguntasAtuais = Array.isArray(perguntas) ? perguntas : [];
    this.respostas = [];
    this.resultado = null;
  },

  sincronizarProgresso(progresso) {
    if (!this.contexto || !progresso) return;
    this.contexto.progressoDiario = {
      ...(this.contexto.progressoDiario || {}),
      ...progresso
    };
    if (progresso.jogador) {
      this.contexto.jogador = {
        ...(this.contexto.jogador || {}),
        ...progresso.jogador,
        avatar: this.avatarSelecionado
      };
    }
  },

  resetQuiz() {
    this.respostas = [];
    this.resultado = null;
    this.perguntasAtuais = [];
    this.tentativaAtual = null;
  },

  atualizarAvatar(avatarId) {
    const avatarValido = AVATARS.some((avatar) => avatar.id === avatarId);
    const selecionado = avatarValido ? avatarId : 'cadete-azul';
    this.avatarSelecionado = selecionado;
    if (this.contexto?.jogador) this.contexto.jogador.avatar = selecionado;
    try { localStorage.setItem('arena_avatar_demo', selecionado); } catch (_) {}
  },

  aplicarResultadoLocal(resultado) {
    if (!this.contexto) return;
    if (resultado?.progressoDiario) {
      this.sincronizarProgresso(resultado.progressoDiario);
      return;
    }

    const jogador = this.contexto.jogador || {};
    jogador.xp = Number(jogador.xp || 0) + Number(resultado.xpGanho || 0);
    jogador.moedas = Number(jogador.moedas || 0) + Number(resultado.moedasGanhas || 0);
    jogador.nivel = 1 + Math.floor(Number(jogador.xp || 0) / 1000);
    jogador.xpProximoNivel = jogador.nivel * 1000;
    this.contexto.jogador = jogador;

    if (!this.contexto.progressoDiario) {
      this.contexto.progressoDiario = { respondidasHoje: 0, limite: GAME_CONFIG.dailyLimit };
    }
    this.contexto.progressoDiario.respondidasHoje = Math.min(
      this.getDailyLimit(),
      Number(this.contexto.progressoDiario.respondidasHoje || 0) + Number(resultado.total || 0)
    );
    this.contexto.progressoDiario.restantesHoje = Math.max(
      0,
      this.getDailyLimit() - this.contexto.progressoDiario.respondidasHoje
    );
  },

  getLocationById(id) {
    return LOCATIONS.find((l) => l.id === id) || LOCATIONS[0];
  }
};
