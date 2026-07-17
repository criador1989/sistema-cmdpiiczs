import { GAME_CONFIG } from '../config.js?v=20260717-v5-46-6-mobile-touch-corrigido';
import { GameState } from '../state.js?v=20260717-v5-46-6-mobile-touch-corrigido';
import { enviarResultadoMissao } from '../api.js?v=20260717-v5-46-6-mobile-touch-corrigido';
import { createStudentPortrait } from '../ui/PortraitFactory.js?v=20260717-v5-46-6-mobile-touch-corrigido';

export class QuizScene extends Phaser.Scene {
  constructor() { super('QuizScene'); }

  create() {
    this.local = GameState.localAtual;
    this.missao = GameState.missaoAtual;
    this.questions = GameState.prepararPerguntasDaMissao();
    this.current = 0;
    this.answers = [];
    this.isLocked = false;
    this.questionObjects = [];
    this.answerButtons = [];

    this.cameras.main.setBackgroundColor('#071529');
    this.drawBackground();
    this.drawHeader();

    if (!this.questions.length) this.renderNoQuestions();
    else this.renderQuestion();

    this.input.keyboard.on('keydown-ESC', () => this.scene.start('MapScene'));
  }

  drawBackground() {
    const { colors } = GAME_CONFIG;
    this.add.rectangle(640, 360, 1280, 720, colors.navy);
    this.add.circle(130, 420, 280, this.local?.color || colors.blue, 0.15);
    this.add.circle(1120, 605, 240, colors.gold, 0.09);
    const g = this.add.graphics();
    g.lineStyle(1, 0xffffff, 0.04);
    for (let x = 0; x < 1280; x += 50) g.lineBetween(x, 0, x, 720);
    for (let y = 0; y < 720; y += 50) g.lineBetween(0, y, 1280, y);
  }

  drawHeader() {
    const aluno = GameState.contexto?.aluno || {};
    const jogador = GameState.contexto?.jogador || {};
    const localName = this.local?.nome || 'Arena';
    this.add.text(640, 42, `${this.local?.icon || '⭐'} ${localName}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '35px', fontStyle: '900', color: '#ffffff'
    }).setOrigin(0.5);
    this.add.text(640, 82, `${this.missao?.area || 'Missão'} • ${aluno.nome || 'Aluno'} • ${aluno.turma || '6º A'}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#f3d58a'
    }).setOrigin(0.5);
    this.add.text(640, 111, `Disponíveis hoje: ${GameState.getRestantesHoje()} de ${GameState.getDailyLimit()} • 🪙 ${jogador.moedas || 0}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#a9bdd4'
    }).setOrigin(0.5);
  }

  renderNoQuestions() {
    this.add.rectangle(640, 360, 820, 290, 0x0b1f3a, 0.94).setStrokeStyle(2, 0xd6a84f, 0.45);
    this.add.text(640, 320, 'Sem questões disponíveis agora', {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', fontStyle: 'bold', color: '#ffffff'
    }).setOrigin(0.5);
    this.add.text(640, 370, 'Você concluiu as questões liberadas para hoje. Volte amanhã para novas missões.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#a9bdd4', align: 'center', wordWrap: { width: 640 }
    }).setOrigin(0.5);
    this.createButton(640, 455, 'Voltar à cidade', () => this.scene.start('MapScene'), 220, true);
  }

  renderQuestion() {
    this.clearQuestionObjects();
    this.isLocked = false;
    this.answerButtons = [];

    const question = this.questions[this.current];
    const total = this.questions.length;
    const progress = total ? (this.current / total) : 0;

    const mainPanel = this.add.rectangle(690, 405, 1080, 520, 0x0b1f3a, 0.94).setStrokeStyle(2, 0xd6a84f, 0.38);
    this.questionObjects.push(mainPanel);

    const portraitPanel = this.add.rectangle(205, 403, 255, 430, 0x10233f, 0.92).setStrokeStyle(2, this.local?.color || 0x1f6fb5, 0.55);
    this.questionObjects.push(portraitPanel);
    this.studentPortrait = createStudentPortrait(this, 205, 388, { pose: 'thinking', facing: 'right', scale: 0.88 });
    this.questionObjects.push(this.studentPortrait);

    const thought = this.add.text(205, 578, 'Pense com calma.\nObserve os dados e as alternativas.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#ffffff', align: 'center', wordWrap: { width: 205 }
    }).setOrigin(0.5);
    this.questionObjects.push(thought);

    const progressBg = this.add.rectangle(790, 160, 720, 14, 0x071529, 1).setStrokeStyle(1, 0xffffff, 0.15);
    const progressBar = this.add.rectangle(430, 160, 720 * progress, 14, this.local?.color || 0xd6a84f, 1).setOrigin(0, 0.5);
    this.questionObjects.push(progressBg, progressBar);

    const counter = this.add.text(790, 192, `Pergunta ${this.current + 1} de ${total}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#f3d58a'
    }).setOrigin(0.5);
    this.questionObjects.push(counter);

    const qText = this.add.text(790, 245, question.enunciado, {
      fontFamily: 'system-ui, sans-serif', fontSize: '25px', fontStyle: '900', color: '#ffffff', align: 'center', wordWrap: { width: 760 }
    }).setOrigin(0.5);
    this.questionObjects.push(qText);

    question.alternativas.forEach((alt, index) => {
      const y = 340 + index * 68;
      const btn = this.add.rectangle(790, y, 760, 54, 0x10355f, 0.97)
        .setStrokeStyle(2, 0x64b5ff, 0.25)
        .setInteractive({ useHandCursor: true });
      const letter = String.fromCharCode(65 + index);
      const bullet = this.add.circle(440, y, 18, 0xd6a84f, 1);
      const btxt = this.add.text(440, y, letter, { fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#071529' }).setOrigin(0.5);
      const label = this.add.text(475, y, alt, {
        fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#ffffff', wordWrap: { width: 660 }
      }).setOrigin(0, 0.5);

      btn.on('pointerover', () => { if (!this.isLocked) btn.setFillStyle(0x1f6fb5, 0.98); });
      btn.on('pointerout', () => { if (!this.isLocked) btn.setFillStyle(0x10355f, 0.97); });
      btn.on('pointerdown', () => this.answer(index));
      label.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.answer(index));
      this.answerButtons.push(btn);
      this.questionObjects.push(btn, bullet, btxt, label);
    });

    const exit = this.add.text(790, 670, 'ESC para voltar à cidade sem concluir a missão', {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#a9bdd4'
    }).setOrigin(0.5);
    this.questionObjects.push(exit);
  }

  answer(index) {
    if (this.isLocked) return;
    this.isLocked = true;
    const question = this.questions[this.current];
    const correta = index === question.correta;
    this.answers.push({ perguntaId: question.id, resposta: index, correta });

    this.answerButtons[index].setFillStyle(correta ? 0x48c78e : 0xff6b6b, 0.96);
    if (!correta && this.answerButtons[question.correta]) {
      this.answerButtons[question.correta].setFillStyle(0x48c78e, 0.96);
    }

    this.feedback(correta, question);
    this.time.delayedCall(correta ? 1650 : 2350, () => {
      if (this.current + 1 >= this.questions.length) this.finish();
      else { this.current += 1; this.renderQuestion(); }
    });
  }

  feedback(correta, question) {
    if (this.studentPortrait) this.studentPortrait.destroy();
    this.studentPortrait = createStudentPortrait(this, 205, correta ? 398 : 388, {
      pose: correta ? 'celebrate' : 'uncertain', facing: 'right', scale: 0.88
    });
    this.questionObjects.push(this.studentPortrait);

    const phrase = correta
      ? Phaser.Utils.Array.GetRandom(['Muito bem!', 'Excelente!', 'Consegui!', 'Missão cumprida!'])
      : 'Quase! Vamos entender.';
    const bubble = this.add.text(205, 185, phrase, {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', fontStyle: '900',
      color: correta ? '#071529' : '#ffffff', backgroundColor: correta ? '#f3d58a' : '#7a3340',
      padding: { x: 15, y: 9 }, align: 'center'
    }).setOrigin(0.5).setDepth(5200);
    this.questionObjects.push(bubble);

    const explanation = this.add.text(790, 625, correta ? 'Resposta correta! +10 moedas e XP.' : question.explicacao || 'Observe a explicação e tente novamente na próxima missão.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: correta ? '900' : 'bold',
      color: correta ? '#a8ffd0' : '#ffd7a8', align: 'center', wordWrap: { width: 740 },
      backgroundColor: 'rgba(7,21,41,0.72)', padding: { x: 12, y: 8 }
    }).setOrigin(0.5).setDepth(5100);
    this.questionObjects.push(explanation);

    if (correta) {
      this.tweens.add({
        targets: this.studentPortrait,
        y: 350,
        duration: 250,
        ease: 'Quad.easeOut',
        yoyo: true,
        repeat: 1
      });
      this.createRewardBurst();
    } else {
      this.tweens.add({ targets: this.studentPortrait, angle: { from: -2, to: 2 }, duration: 180, yoyo: true, repeat: 2 });
    }
  }

  createRewardBurst() {
    for (let i = 0; i < 18; i++) {
      const item = this.add.text(205 + Phaser.Math.Between(-75, 75), 335 + Phaser.Math.Between(-25, 45), Phaser.Utils.Array.GetRandom(['✦', '★', '🪙']), {
        fontSize: `${Phaser.Math.Between(16, 25)}px`, color: '#f3d58a'
      }).setDepth(5300);
      this.questionObjects.push(item);
      this.tweens.add({
        targets: item,
        y: item.y - Phaser.Math.Between(55, 110),
        x: item.x + Phaser.Math.Between(-65, 65),
        alpha: 0,
        duration: 900,
        ease: 'Sine.easeOut',
        onComplete: () => item.destroy()
      });
    }
  }

  async finish() {
    const total = this.questions.length;
    const acertos = this.answers.filter((a) => a.correta).length;
    const pontos = acertos * 100;
    const xpGanho = acertos * 40 + total * 10;
    const moedasGanhas = acertos * 10 + (acertos === total ? 20 : 0);
    const resultado = {
      missaoId: this.missao?.id || 'demo',
      missaoTitulo: this.missao?.titulo || 'Missão',
      localId: this.local?.id || 'praca',
      localNome: this.local?.nome || 'Praça',
      medalha: this.missao?.recompensa?.medalha || 'Explorador Curioso',
      acertos, total, pontos, xpGanho, moedasGanhas,
      respostas: this.answers
    };

    GameState.resultado = resultado;
    this.clearQuestionObjects();
    this.add.rectangle(640, 360, 720, 230, 0x0b1f3a, 0.94).setStrokeStyle(2, 0xd6a84f, 0.45);
    this.add.text(640, 330, 'Registrando sua missão...', {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', fontStyle: '900', color: '#ffffff'
    }).setOrigin(0.5);
    this.add.text(640, 382, 'Calculando XP, moedas e progresso diário.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#a9bdd4'
    }).setOrigin(0.5);

    const registro = await enviarResultadoMissao(resultado);
    resultado.registro = registro;
    GameState.aplicarResultadoLocal(resultado);
    this.time.delayedCall(500, () => this.scene.start('ResultScene'));
  }

  clearQuestionObjects() {
    this.questionObjects.forEach((obj) => {
      if (obj?.active) obj.destroy();
    });
    this.questionObjects = [];
  }

  createButton(x, y, text, callback, width = 220, secondary = false) {
    const bg = this.add.rectangle(x, y, width, 48, secondary ? 0x10355f : 0xd6a84f, 1)
      .setStrokeStyle(2, secondary ? 0x64b5ff : 0xf3d58a, 0.75)
      .setInteractive({ useHandCursor: true });
    const label = this.add.text(x, y, text, {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', fontStyle: 'bold', color: secondary ? '#ffffff' : '#071529'
    }).setOrigin(0.5);
    bg.on('pointerdown', callback);
    label.setInteractive({ useHandCursor: true }).on('pointerdown', callback);
  }
}
