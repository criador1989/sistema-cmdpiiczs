import { GAME_CONFIG } from '../config.js';
import { GameState } from '../state.js';
import { enviarResultadoMissao } from '../api.js';

export class QuizScene extends Phaser.Scene {
  constructor() {
    super('QuizScene');
  }

  create() {
    this.missao = GameState.missaoAtual;
    this.questions = this.missao?.perguntas || [];
    this.current = 0;
    this.answers = [];
    this.isLocked = false;

    this.cameras.main.setBackgroundColor('#071529');
    this.drawBackground();
    this.drawHeader();
    this.renderQuestion();

    this.input.keyboard.on('keydown-ESC', () => this.scene.start('MapScene'));
  }

  drawBackground() {
    const { colors } = GAME_CONFIG;
    this.add.rectangle(640, 360, 1280, 720, colors.navy);
    this.add.circle(180, 160, 160, colors.blue, 0.14);
    this.add.circle(1120, 610, 240, colors.gold, 0.10);

    const g = this.add.graphics();
    g.lineStyle(1, 0xffffff, 0.05);
    for (let x = 0; x < 1280; x += 42) g.lineBetween(x, 0, x, 720);
    for (let y = 0; y < 720; y += 42) g.lineBetween(0, y, 1280, y);
  }

  drawHeader() {
    const aluno = GameState.contexto?.aluno || {};
    this.add.text(640, 58, this.missao?.titulo || 'Missão', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(640, 96, `${aluno.nome || 'Aluno'} • ${aluno.turma || 'Turma'}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#f3d58a'
    }).setOrigin(0.5);
  }

  renderQuestion() {
    this.clearQuestionObjects();
    this.isLocked = false;

    const question = this.questions[this.current];
    const total = this.questions.length;
    const progress = total ? (this.current / total) : 0;

    this.questionObjects = [];

    const panel = this.add.rectangle(640, 378, 980, 490, 0x0b1f3a, 0.9)
      .setStrokeStyle(2, 0xd6a84f, 0.35);
    this.questionObjects.push(panel);

    const progressBg = this.add.rectangle(640, 154, 820, 13, 0x071529, 1).setStrokeStyle(1, 0xffffff, 0.15);
    const progressBar = this.add.rectangle(230, 154, 820 * progress, 13, 0xd6a84f, 1).setOrigin(0, 0.5);
    this.questionObjects.push(progressBg, progressBar);

    const counter = this.add.text(640, 186, `Pergunta ${this.current + 1} de ${total}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#f3d58a'
    }).setOrigin(0.5);
    this.questionObjects.push(counter);

    const qText = this.add.text(640, 245, question.enunciado, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 820 }
    }).setOrigin(0.5);
    this.questionObjects.push(qText);

    question.alternativas.forEach((alt, index) => {
      const y = 335 + index * 70;
      const btn = this.add.rectangle(640, y, 820, 54, 0x10355f, 0.95)
        .setStrokeStyle(2, 0x64b5ff, 0.25)
        .setInteractive({ useHandCursor: true });
      const letter = String.fromCharCode(65 + index);
      const label = this.add.text(260, y, `${letter}) ${alt}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffffff',
        wordWrap: { width: 760 }
      }).setOrigin(0, 0.5);

      btn.on('pointerover', () => { if (!this.isLocked) btn.setFillStyle(0x1f6fb5, 0.95); });
      btn.on('pointerout', () => { if (!this.isLocked) btn.setFillStyle(0x10355f, 0.95); });
      btn.on('pointerdown', () => this.answer(index, btn));
      label.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.answer(index, btn));

      this.questionObjects.push(btn, label);
    });

    const exit = this.add.text(640, 670, 'ESC para voltar ao mapa sem concluir', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#a9bdd4'
    }).setOrigin(0.5);
    this.questionObjects.push(exit);
  }

  answer(index, btn) {
    if (this.isLocked) return;
    this.isLocked = true;

    const question = this.questions[this.current];
    const correta = index === question.correta;

    this.answers.push({
      perguntaId: question.id,
      resposta: index,
      correta
    });

    btn.setFillStyle(correta ? 0x48c78e : 0xff6b6b, 0.95);
    this.add.text(640, 604, correta ? 'Resposta correta!' : 'Ainda não foi desta vez. Continue a missão!', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: correta ? '#48c78e' : '#ffb3b3'
    }).setOrigin(0.5);

    this.time.delayedCall(850, () => {
      if (this.current < this.questions.length - 1) {
        this.current += 1;
        this.renderQuestion();
      } else {
        this.finishQuiz();
      }
    });
  }

  async finishQuiz() {
    const acertos = this.answers.filter((a) => a.correta).length;
    const total = this.questions.length;
    const pontos = acertos * 20;
    const xpGanho = Math.max(10, Math.round((acertos / total) * (this.missao.recompensa?.xpBase || 100)));
    const medalha = acertos >= Math.ceil(total * 0.7)
      ? this.missao.recompensa?.medalha || 'Guardião do Conhecimento'
      : 'Aprendiz Persistente';

    const resultado = {
      missaoId: this.missao.id,
      missaoTitulo: this.missao.titulo,
      acertos,
      total,
      pontos,
      xpGanho,
      medalha,
      respostas: this.answers
    };

    GameState.resultado = resultado;

    this.clearQuestionObjects();
    this.add.rectangle(640, 360, 720, 220, 0x0b1f3a, 0.92).setStrokeStyle(2, 0xd6a84f, 0.45);
    this.add.text(640, 335, 'Registrando resultado...', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    this.add.text(640, 380, 'Preparando sua recompensa.', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#a9bdd4'
    }).setOrigin(0.5);

    GameState.resultado.registro = await enviarResultadoMissao(resultado);
    this.time.delayedCall(500, () => this.scene.start('ResultScene'));
  }

  clearQuestionObjects() {
    if (!this.questionObjects) return;
    this.questionObjects.forEach((obj) => obj.destroy());
    this.questionObjects = [];
  }
}
