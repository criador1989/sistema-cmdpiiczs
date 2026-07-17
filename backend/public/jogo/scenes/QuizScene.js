import { GAME_CONFIG } from '../config.js?v=20260717-v5-47-0-questoes-reais';
import { GameState } from '../state.js?v=20260717-v5-47-0-questoes-reais';
import {
  carregarQuestoesArena,
  responderQuestaoArena,
  finalizarMissaoArena,
  registrarResultadoDemo
} from '../api.js?v=20260717-v5-47-0-questoes-reais';
import { createStudentPortrait } from '../ui/PortraitFactory.js?v=20260717-v5-47-0-questoes-reais';

export class QuizScene extends Phaser.Scene {
  constructor() { super('QuizScene'); }

  create() {
    this.local = GameState.localAtual;
    this.missao = GameState.missaoAtual;
    this.questions = [];
    this.tentativaId = null;
    this.current = 0;
    this.answers = [];
    this.isLocked = false;
    this.questionObjects = [];
    this.answerButtons = [];
    this.lastApiResponse = null;
    this.questionStartedAt = Date.now();

    this.cameras.main.setBackgroundColor('#071529');
    this.drawBackground();
    this.renderLoading();
    this.loadMissionQuestions();

    this.input.keyboard.on('keydown-ESC', () => this.scene.start('MapScene'));
  }

  async loadMissionQuestions() {
    try {
      if (GameState.contexto?.modoDemo) {
        this.questions = GameState.prepararPerguntasDaMissao();
        GameState.definirTentativaArena(null, this.questions);
      } else {
        const data = await carregarQuestoesArena(this.local?.id || 'praca');
        this.tentativaId = data.tentativa?._id || null;
        this.questions = data.tentativa?.questoes || [];
        GameState.definirTentativaArena(data.tentativa || null, this.questions);
        GameState.sincronizarProgresso(data.progressoDiario);
      }

      this.clearQuestionObjects();
      this.drawHeader();
      if (!this.questions.length) this.renderNoQuestions();
      else this.renderQuestion();
    } catch (error) {
      if (error?.data?.progressoDiario) GameState.sincronizarProgresso(error.data.progressoDiario);
      this.clearQuestionObjects();
      this.drawHeader();
      this.renderApiError(error);
    }
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

  renderLoading() {
    this.clearQuestionObjects();
    const panel = this.add.rectangle(640, 360, 720, 230, 0x0b1f3a, 0.94).setStrokeStyle(2, 0xd6a84f, 0.45);
    const title = this.add.text(640, 330, 'Preparando sua missão...', {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', fontStyle: '900', color: '#ffffff'
    }).setOrigin(0.5);
    const subtitle = this.add.text(640, 382, 'Selecionando questões do 6º ano sem mostrar o gabarito.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#a9bdd4'
    }).setOrigin(0.5);
    this.questionObjects.push(panel, title, subtitle);
  }

  renderNoQuestions() {
    const panel = this.add.rectangle(640, 360, 820, 290, 0x0b1f3a, 0.94).setStrokeStyle(2, 0xd6a84f, 0.45);
    const title = this.add.text(640, 320, 'Sem questões disponíveis agora', {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', fontStyle: 'bold', color: '#ffffff'
    }).setOrigin(0.5);
    const text = this.add.text(640, 370, 'Você concluiu as questões liberadas para hoje. Volte amanhã para novas missões.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#a9bdd4', align: 'center', wordWrap: { width: 640 }
    }).setOrigin(0.5);
    this.questionObjects.push(panel, title, text);
    this.createButton(640, 455, 'Voltar à cidade', () => this.scene.start('MapScene'), 220, true);
  }

  renderApiError(error) {
    const limiteConcluido = Number(error?.status) === 409;
    const panel = this.add.rectangle(640, 360, 860, 315, 0x0b1f3a, 0.96).setStrokeStyle(2, limiteConcluido ? 0xd6a84f : 0xff6b6b, 0.55);
    const title = this.add.text(640, 298, limiteConcluido ? 'Meta diária concluída!' : 'Não foi possível abrir a missão', {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', fontStyle: '900', color: '#ffffff'
    }).setOrigin(0.5);
    const message = this.add.text(640, 365, error?.message || 'Verifique a conexão e tente novamente.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#ffd7a8', align: 'center', wordWrap: { width: 690 }
    }).setOrigin(0.5);
    this.questionObjects.push(panel, title, message);
    this.createButton(500, 455, 'Tentar novamente', () => this.scene.restart(), 220, false);
    this.createButton(780, 455, 'Voltar à cidade', () => this.scene.start('MapScene'), 220, true);
  }

  renderQuestion() {
    this.clearQuestionObjects();
    this.isLocked = false;
    this.answerButtons = [];
    this.questionStartedAt = Date.now();

    const question = this.questions[this.current];
    const total = this.questions.length;
    const progress = total ? (this.current / total) : 0;

    const mainPanel = this.add.rectangle(690, 405, 1080, 520, 0x0b1f3a, 0.94).setStrokeStyle(2, 0xd6a84f, 0.38);
    this.questionObjects.push(mainPanel);

    const portraitPanel = this.add.rectangle(205, 403, 255, 430, 0x10233f, 0.92).setStrokeStyle(2, this.local?.color || 0x1f6fb5, 0.55);
    this.questionObjects.push(portraitPanel);
    this.studentPortrait = createStudentPortrait(this, 205, 388, { pose: 'thinking', facing: 'right', scale: 0.88 });
    this.questionObjects.push(this.studentPortrait);

    const thought = this.add.text(205, 578, 'Pense com calma.\nObserve o texto e as alternativas.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#ffffff', align: 'center', wordWrap: { width: 205 }
    }).setOrigin(0.5);
    this.questionObjects.push(thought);

    const progressBg = this.add.rectangle(790, 150, 720, 14, 0x071529, 1).setStrokeStyle(1, 0xffffff, 0.15);
    const progressBar = this.add.rectangle(430, 150, 720 * progress, 14, this.local?.color || 0xd6a84f, 1).setOrigin(0, 0.5);
    this.questionObjects.push(progressBg, progressBar);

    const counter = this.add.text(790, 180, `Pergunta ${this.current + 1} de ${total} • ${question.disciplina || this.missao?.area || 'Desafio'}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#f3d58a'
    }).setOrigin(0.5);
    this.questionObjects.push(counter);

    let questionY = 250;
    if (question.apoioTexto) {
      const support = this.add.text(790, 226, question.apoioTexto, {
        fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#c9d8e8', align: 'center',
        wordWrap: { width: 760 }, backgroundColor: 'rgba(7,21,41,0.58)', padding: { x: 10, y: 7 }
      }).setOrigin(0.5);
      this.questionObjects.push(support);
      questionY = Math.min(300, 245 + support.height * 0.55);
    }

    const qText = this.add.text(790, questionY, question.enunciado, {
      fontFamily: 'system-ui, sans-serif', fontSize: '23px', fontStyle: '900', color: '#ffffff', align: 'center', wordWrap: { width: 760 }
    }).setOrigin(0.5);
    this.questionObjects.push(qText);

    const optionStartY = Math.max(350, questionY + Math.min(80, qText.height * 0.55) + 45);
    question.alternativas.forEach((alt, index) => {
      const y = optionStartY + index * 62;
      const btn = this.add.rectangle(790, y, 760, 50, 0x10355f, 0.97)
        .setStrokeStyle(2, 0x64b5ff, 0.25)
        .setInteractive({ useHandCursor: true });
      const letter = alt?.letra || String.fromCharCode(65 + index);
      const altText = typeof alt === 'string' ? alt : alt?.texto;
      const bullet = this.add.circle(440, y, 18, 0xd6a84f, 1);
      const btxt = this.add.text(440, y, letter, { fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#071529' }).setOrigin(0.5);
      const label = this.add.text(475, y, altText || '', {
        fontFamily: 'system-ui, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#ffffff', wordWrap: { width: 660 }
      }).setOrigin(0, 0.5);

      btn.on('pointerover', () => { if (!this.isLocked) btn.setFillStyle(0x1f6fb5, 0.98); });
      btn.on('pointerout', () => { if (!this.isLocked) btn.setFillStyle(0x10355f, 0.97); });
      btn.on('pointerdown', () => this.answer(index));
      label.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.answer(index));
      this.answerButtons.push(btn);
      this.questionObjects.push(btn, bullet, btxt, label);
    });

    const exit = this.add.text(790, 680, 'ESC para voltar à cidade. A missão poderá ser retomada depois.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#a9bdd4'
    }).setOrigin(0.5);
    this.questionObjects.push(exit);
  }

  async answer(index) {
    if (this.isLocked) return;
    this.isLocked = true;
    const question = this.questions[this.current];
    const selected = question.alternativas[index];
    const respostaAluno = selected?.letra || String.fromCharCode(65 + index);
    const tempoRespostaSegundos = Math.max(1, Math.round((Date.now() - this.questionStartedAt) / 1000));
    this.answerButtons[index]?.setFillStyle(0xd6a84f, 0.96);

    try {
      let resposta;
      if (GameState.contexto?.modoDemo || !this.tentativaId) {
        const correta = index === Number(question.correta);
        const corretaLetra = question.alternativas[Number(question.correta)]?.letra || String.fromCharCode(65 + Number(question.correta));
        resposta = {
          ok: true,
          correta,
          respostaCorreta: corretaLetra,
          explicacao: question.explicacao || '',
          concluida: this.current + 1 >= this.questions.length,
          resultado: null
        };
      } else {
        resposta = await responderQuestaoArena({
          tentativaId: this.tentativaId,
          questaoId: question._id,
          respostaAluno,
          tempoRespostaSegundos
        });
        if (resposta.progressoDiario) GameState.sincronizarProgresso(resposta.progressoDiario);
      }

      this.lastApiResponse = resposta;
      const correta = Boolean(resposta.correta);
      const indiceCorreto = question.alternativas.findIndex((alt, idx) =>
        (alt?.letra || String.fromCharCode(65 + idx)) === resposta.respostaCorreta
      );

      this.answers.push({
        questaoId: question._id || question.id,
        respostaAluno,
        correta,
        tempoRespostaSegundos
      });

      this.answerButtons[index]?.setFillStyle(correta ? 0x48c78e : 0xff6b6b, 0.96);
      if (!correta && indiceCorreto >= 0 && this.answerButtons[indiceCorreto]) {
        this.answerButtons[indiceCorreto].setFillStyle(0x48c78e, 0.96);
      }

      this.feedback(correta, resposta.explicacao || question.explicacao || '');
      this.time.delayedCall(correta ? 1650 : 2350, () => {
        if (this.current + 1 >= this.questions.length) this.finish(resposta.resultado || null);
        else {
          this.current += 1;
          this.renderQuestion();
        }
      });
    } catch (error) {
      this.isLocked = false;
      this.answerButtons[index]?.setFillStyle(0x10355f, 0.97);
      this.showInlineError(error?.message || 'Não foi possível registrar sua resposta. Tente novamente.');
    }
  }

  feedback(correta, explicacao) {
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

    const explanation = this.add.text(790, 640, correta ? 'Resposta correta! O progresso foi registrado.' : explicacao || 'Revise a explicação e continue praticando.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: correta ? '900' : 'bold',
      color: correta ? '#a8ffd0' : '#ffd7a8', align: 'center', wordWrap: { width: 740 },
      backgroundColor: 'rgba(7,21,41,0.82)', padding: { x: 12, y: 8 }
    }).setOrigin(0.5).setDepth(5100);
    this.questionObjects.push(explanation);

    if (correta) {
      this.tweens.add({ targets: this.studentPortrait, y: 350, duration: 250, ease: 'Quad.easeOut', yoyo: true, repeat: 1 });
      this.createRewardBurst();
    } else {
      this.tweens.add({ targets: this.studentPortrait, angle: { from: -2, to: 2 }, duration: 180, yoyo: true, repeat: 2 });
    }
  }

  showInlineError(message) {
    const errorText = this.add.text(790, 640, message, {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#ffd7a8',
      align: 'center', wordWrap: { width: 720 }, backgroundColor: 'rgba(122,51,64,0.95)', padding: { x: 12, y: 8 }
    }).setOrigin(0.5).setDepth(6000);
    this.questionObjects.push(errorText);
    this.time.delayedCall(3000, () => errorText.destroy());
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

  async finish(resultadoServidor = null) {
    this.clearQuestionObjects();
    const panel = this.add.rectangle(640, 360, 720, 230, 0x0b1f3a, 0.94).setStrokeStyle(2, 0xd6a84f, 0.45);
    const title = this.add.text(640, 330, 'Registrando sua missão...', {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', fontStyle: '900', color: '#ffffff'
    }).setOrigin(0.5);
    const subtitle = this.add.text(640, 382, 'Calculando acertos, XP, moedas e progresso diário.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#a9bdd4'
    }).setOrigin(0.5);
    this.questionObjects.push(panel, title, subtitle);

    try {
      let resultado;
      if (GameState.contexto?.modoDemo || !this.tentativaId) {
        const total = this.questions.length;
        const acertos = this.answers.filter((a) => a.correta).length;
        resultado = {
          missaoId: this.missao?.id || 'demo',
          missaoTitulo: this.missao?.titulo || 'Missão',
          localId: this.local?.id || 'praca',
          localNome: this.local?.nome || 'Praça',
          medalha: this.missao?.recompensa?.medalha || 'Explorador Curioso',
          acertos,
          total,
          pontos: acertos * 100,
          xpGanho: acertos * 40 + total * 10,
          moedasGanhas: acertos * 10 + (acertos === total ? 20 : 0),
          respostas: this.answers,
          registro: { modoDemo: true }
        };
        resultado.progressoDiario = registrarResultadoDemo(total);
      } else {
        let conclusao = resultadoServidor ? { resultado: resultadoServidor, progressoDiario: this.lastApiResponse?.progressoDiario } : null;
        if (!conclusao?.resultado) conclusao = await finalizarMissaoArena(this.tentativaId);
        resultado = {
          ...conclusao.resultado,
          localNome: conclusao.resultado?.localNome || this.local?.nome || 'Arena',
          medalha: this.missao?.recompensa?.medalha || conclusao.resultado?.medalha || 'Explorador Curioso',
          respostas: this.answers,
          progressoDiario: conclusao.progressoDiario || this.lastApiResponse?.progressoDiario,
          registro: { modoDemo: false, persistido: true }
        };
      }

      GameState.resultado = resultado;
      GameState.aplicarResultadoLocal(resultado);
      this.time.delayedCall(450, () => this.scene.start('ResultScene'));
    } catch (error) {
      this.clearQuestionObjects();
      this.renderApiError(error);
    }
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
    this.questionObjects.push(bg, label);
  }
}
