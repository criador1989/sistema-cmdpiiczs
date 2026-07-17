import { GAME_CONFIG } from '../config.js?v=20260717-v5-46-6-mobile-touch-corrigido';
import { GameState } from '../state.js?v=20260717-v5-46-6-mobile-touch-corrigido';

export class ResultScene extends Phaser.Scene {
  constructor() { super('ResultScene'); }

  create() {
    const resultado = GameState.resultado || {};
    const contexto = GameState.contexto || {};
    const aluno = contexto.aluno || {};
    this.cameras.main.setBackgroundColor('#071529');
    this.drawBackground();
    this.drawCelebration();

    const panel = this.add.rectangle(640, 360, 1020, 590, 0x0b1f3a, 0.94).setStrokeStyle(2, 0xd6a84f, 0.48);
    this.add.text(640, 108, resultado.subiuNivel ? 'Você subiu de nível!' : 'Missão concluída!', {
      fontFamily: 'system-ui, sans-serif', fontSize: '46px', fontStyle: '900', color: '#ffffff'
    }).setOrigin(0.5);
    this.add.text(640, 156, `${aluno.nome || 'Aluno'} • ${resultado.localNome || 'Arena do Conhecimento'}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#f3d58a'
    }).setOrigin(0.5);

    this.drawScoreCards(resultado);
    this.drawMedal(resultado);
    this.drawDailyProgress();
    this.drawRanking(contexto.ranking || []);

    const mensagem = resultado.acertos >= Math.ceil((resultado.total || 1) * 0.7)
      ? 'Excelente! Você avançou com atenção, conhecimento e disciplina.'
      : 'Você concluiu a missão. Continue explorando para melhorar sua evolução.';

    this.add.text(640, 535, mensagem, {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#ffffff', align: 'center', wordWrap: { width: 760 }
    }).setOrigin(0.5);

    if (resultado.registro?.modoDemo || contexto.modoDemo) {
      this.add.text(640, 565, 'Modo demonstrativo: a próxima etapa será conectar este resultado ao MongoDB/API do Axoriin.', {
        fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#a9bdd4', align: 'center'
      }).setOrigin(0.5);
    }

    this.createButton(405, 638, 'Voltar à cidade', () => this.scene.start('MapScene'), 220, true);
    this.createButton(640, 638, 'Continuar aventura', () => this.scene.start('MapScene'), 240, false);
    this.createButton(885, 638, 'Portal do Aluno', () => { window.location.href = GAME_CONFIG.portalUrl; }, 220, true);
  }

  drawBackground() {
    const { colors } = GAME_CONFIG;
    this.add.rectangle(640, 360, 1280, 720, colors.navy);
    this.add.circle(640, 150, 120, colors.gold, 0.12);
    this.add.circle(140, 640, 220, colors.blue, 0.12);
    this.add.circle(1120, 620, 220, colors.gold, 0.08);
  }

  drawCelebration() {
    for (let i = 0; i < 36; i++) {
      const x = Phaser.Math.Between(80, 1200);
      const y = Phaser.Math.Between(30, 260);
      const item = this.add.text(x, y, Phaser.Utils.Array.GetRandom(['✦', '★', '🪙', '🎉']), {
        fontSize: `${Phaser.Math.Between(14, 28)}px`, color: '#f3d58a'
      }).setDepth(6000).setAlpha(0.85);
      this.tweens.add({ targets: item, y: y - Phaser.Math.Between(20, 80), alpha: 0.15, duration: Phaser.Math.Between(1200, 2100), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 900) });
    }
  }

  drawScoreCards(resultado) {
    const cards = [
      { title: 'Acertos', value: `${resultado.acertos || 0}/${resultado.total || 0}`, icon: '✅' },
      { title: 'Pontuação', value: `${resultado.pontos || 0}`, icon: '⭐' },
      { title: 'XP ganho', value: `+${resultado.xpGanho || 0}`, icon: 'XP' },
      { title: 'Moedas', value: `+${resultado.moedasGanhas || 0}`, icon: '🪙' }
    ];
    cards.forEach((card, i) => {
      const x = 277 + i * 242;
      this.add.rectangle(x, 255, 205, 112, 0x10233f, 0.95).setStrokeStyle(2, 0xffffff, 0.12);
      this.add.text(x, 221, card.icon, { fontFamily: 'system-ui, sans-serif', fontSize: card.icon === 'XP' ? '18px' : '24px', fontStyle: '900', color: '#f3d58a' }).setOrigin(0.5);
      this.add.text(x, 248, card.title, { fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: '900', color: '#a9bdd4' }).setOrigin(0.5);
      this.add.text(x, 294, card.value, { fontFamily: 'system-ui, sans-serif', fontSize: '31px', fontStyle: '900', color: '#f3d58a' }).setOrigin(0.5);
    });
  }

  drawMedal(resultado) {
    this.add.rectangle(308, 415, 360, 140, 0x10233f, 0.95).setStrokeStyle(2, 0xd6a84f, 0.35);
    this.add.text(308, 377, 'Conquista desbloqueada', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: '900', color: '#a9bdd4'
    }).setOrigin(0.5);
    this.add.circle(205, 425, 38, 0xd6a84f, 1).setStrokeStyle(3, 0xf3d58a, 0.7);
    this.add.text(205, 425, '🏅', { fontSize: '35px' }).setOrigin(0.5);
    this.add.text(365, 415, resultado.medalha || 'Explorador Curioso', {
      fontFamily: 'system-ui, sans-serif', fontSize: '21px', fontStyle: '900', color: '#f3d58a', align: 'left', wordWrap: { width: 225 }
    }).setOrigin(0.5);
    this.add.text(365, 462, `Local: ${resultado.localNome || 'Cidade'}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#ffffff'
    }).setOrigin(0.5);
  }

  drawDailyProgress() {
    const respondidas = GameState.getRespondidasHoje();
    const limite = GameState.getDailyLimit();
    this.add.rectangle(640, 415, 300, 140, 0x10233f, 0.95).setStrokeStyle(2, 0xd6a84f, 0.35);
    this.add.text(640, 377, 'Missões do dia', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: '900', color: '#a9bdd4'
    }).setOrigin(0.5);
    this.add.text(640, 422, `${respondidas}/${limite}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '36px', fontStyle: '900', color: '#f3d58a'
    }).setOrigin(0.5);
    this.add.rectangle(640, 468, 230, 14, 0x071529, 1).setStrokeStyle(1, 0xffffff, 0.16);
    this.add.rectangle(525, 468, 230 * (respondidas / Math.max(1, limite)), 14, 0xd6a84f, 1).setOrigin(0, 0.5);
    this.add.text(640, 496, respondidas >= limite ? 'Limite diário concluído.' : 'Continue explorando a cidade.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: respondidas >= limite ? '#ffcf9f' : '#ffffff'
    }).setOrigin(0.5);
  }

  drawRanking(ranking) {
    this.add.rectangle(955, 415, 355, 140, 0x10233f, 0.95).setStrokeStyle(2, 0xd6a84f, 0.35);
    this.add.text(955, 376, 'Ranking demonstrativo', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: '900', color: '#a9bdd4'
    }).setOrigin(0.5);
    ranking.slice(0, 3).forEach((item, index) => {
      const y = 407 + index * 32;
      this.add.text(805, y, `${item.posicao || index + 1}º ${item.nome}`, {
        fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: index === 0 ? 'bold' : 'normal', color: index === 0 ? '#f3d58a' : '#ffffff'
      });
      this.add.text(1060, y, `${item.xp} XP`, {
        fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#a9bdd4'
      });
    });
    this.add.text(955, 505, 'Painel real: carrinhos/foguetes + filtros por turma e mês.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#a9bdd4', align: 'center', wordWrap: { width: 280 }
    }).setOrigin(0.5);
  }

  createButton(x, y, text, callback, width = 220, secondary = false) {
    const bg = this.add.rectangle(x, y, width, 46, secondary ? 0x10355f : 0xd6a84f, 1).setStrokeStyle(2, secondary ? 0x64b5ff : 0xf3d58a, 0.75).setInteractive({ useHandCursor: true });
    const label = this.add.text(x, y, text, {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', fontStyle: 'bold', color: secondary ? '#ffffff' : '#071529'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setScale(1.03));
    bg.on('pointerout', () => bg.setScale(1));
    bg.on('pointerdown', callback);
    label.on('pointerdown', callback);
  }
}
