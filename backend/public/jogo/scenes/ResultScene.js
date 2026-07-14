import { GAME_CONFIG } from '../config.js';
import { GameState } from '../state.js';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  create() {
    const { colors } = GAME_CONFIG;
    const resultado = GameState.resultado || {};
    const contexto = GameState.contexto || {};
    const aluno = contexto.aluno || {};

    this.cameras.main.setBackgroundColor('#071529');
    this.add.rectangle(640, 360, 1280, 720, colors.navy);
    this.add.circle(640, 150, 120, colors.gold, 0.12);
    this.add.circle(140, 640, 220, colors.blue, 0.12);
    this.add.circle(1120, 620, 220, colors.gold, 0.08);

    const panel = this.add.rectangle(640, 360, 980, 585, 0x0b1f3a, 0.92)
      .setStrokeStyle(2, 0xd6a84f, 0.45);

    this.add.text(640, 120, 'Missão concluída!', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '46px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(640, 168, `${aluno.nome || 'Aluno'} • ${resultado.missaoTitulo || 'Arena do Conhecimento'}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '17px',
      color: '#f3d58a'
    }).setOrigin(0.5);

    this.drawScoreCards(resultado);
    this.drawMedal(resultado);
    this.drawRanking(contexto.ranking || []);

    const mensagem = resultado.acertos >= Math.ceil((resultado.total || 1) * 0.7)
      ? 'Excelente! Você demonstrou responsabilidade, atenção e domínio da missão.'
      : 'Você concluiu a missão. Continue treinando para melhorar sua pontuação.';

    this.add.text(640, 515, mensagem, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 760 }
    }).setOrigin(0.5);

    if (resultado.registro?.modoDemo || contexto.modoDemo) {
      this.add.text(640, 552, 'Resultado em modo demonstrativo: pronto para futura integração com a API do Axoriin.', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#a9bdd4',
        align: 'center'
      }).setOrigin(0.5);
    }

    this.createButton(418, 622, 'Voltar ao mapa', () => this.scene.start('MapScene'), 220, true);
    this.createButton(640, 622, 'Nova tentativa', () => this.scene.start('QuizScene'), 220, false);
    this.createButton(862, 622, 'Portal do Aluno', () => { window.location.href = GAME_CONFIG.portalUrl; }, 220, true);
  }

  drawScoreCards(resultado) {
    const cards = [
      { title: 'Acertos', value: `${resultado.acertos || 0}/${resultado.total || 0}` },
      { title: 'Pontuação', value: `${resultado.pontos || 0}` },
      { title: 'XP ganho', value: `+${resultado.xpGanho || 0}` }
    ];

    cards.forEach((card, i) => {
      const x = 400 + i * 240;
      this.add.rectangle(x, 260, 205, 110, 0x10233f, 0.95).setStrokeStyle(2, 0xffffff, 0.12);
      this.add.text(x, 232, card.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#a9bdd4'
      }).setOrigin(0.5);
      this.add.text(x, 282, card.value, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#f3d58a'
      }).setOrigin(0.5);
    });
  }

  drawMedal(resultado) {
    this.add.rectangle(405, 410, 360, 130, 0x10233f, 0.95).setStrokeStyle(2, 0xd6a84f, 0.35);
    this.add.text(405, 378, 'Medalha conquistada', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#a9bdd4'
    }).setOrigin(0.5);
    this.add.text(405, 428, `🏅 ${resultado.medalha || 'Aprendiz'}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#f3d58a',
      align: 'center',
      wordWrap: { width: 310 }
    }).setOrigin(0.5);
  }

  drawRanking(ranking) {
    this.add.rectangle(790, 410, 390, 130, 0x10233f, 0.95).setStrokeStyle(2, 0xd6a84f, 0.35);
    this.add.text(790, 372, 'Ranking demonstrativo da turma', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#a9bdd4'
    }).setOrigin(0.5);

    ranking.slice(0, 3).forEach((item, index) => {
      this.add.text(620, 404 + index * 28, `${item.posicao || index + 1}º ${item.nome}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: index === 0 ? '#f3d58a' : '#ffffff'
      });
      this.add.text(905, 404 + index * 28, `${item.xp} XP`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: '#a9bdd4'
      });
    });
  }

  createButton(x, y, text, callback, width = 220, secondary = false) {
    const bg = this.add.rectangle(x, y, width, 44, secondary ? 0x10355f : 0xd6a84f, 1)
      .setStrokeStyle(2, secondary ? 0x64b5ff : 0xf3d58a, 0.75)
      .setInteractive({ useHandCursor: true });
    const label = this.add.text(x, y, text, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: secondary ? '#ffffff' : '#071529'
    }).setOrigin(0.5);

    bg.on('pointerover', () => bg.setScale(1.03));
    bg.on('pointerout', () => bg.setScale(1));
    bg.on('pointerdown', callback);
    label.setInteractive({ useHandCursor: true }).on('pointerdown', callback);
  }
}
