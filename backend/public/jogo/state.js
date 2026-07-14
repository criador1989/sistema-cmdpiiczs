export const GameState = {
  contexto: null,
  missaoAtual: null,
  respostas: [],
  resultado: null,
  player: {
    x: 265,
    y: 430
  },
  resetQuiz() {
    this.respostas = [];
    this.resultado = null;
  }
};
