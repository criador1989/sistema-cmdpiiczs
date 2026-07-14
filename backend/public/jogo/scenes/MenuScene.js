import { GAME_CONFIG } from '../config.js';
import { GameState } from '../state.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const { colors } = GAME_CONFIG;
    const contexto = GameState.contexto;
    this.cameras.main.setBackgroundColor('#071529');

    this.add.rectangle(640, 360, 1280, 720, colors.navy);
    this.add.circle(210, 150, 180, colors.blue, 0.16);
    this.add.circle(1080, 90, 230, colors.gold, 0.10);
    this.add.circle(1050, 650, 180, colors.blueLight, 0.10);

    this.drawDecorativeGrid();

    const panel = this.add.rectangle(640, 360, 980, 560, 0x0b1f3a, 0.82)
      .setStrokeStyle(2, 0xd6a84f, 0.55);

    this.add.text(640, 142, GAME_CONFIG.title, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '54px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(640, 198, GAME_CONFIG.subtitle, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#f3d58a'
    }).setOrigin(0.5);

    const modeText = contexto?.modoDemo ? 'MODO DEMONSTRATIVO' : 'CONECTADO AO AXORIIN';
    const modeColor = contexto?.modoDemo ? '#f3d58a' : '#48c78e';

    this.add.text(640, 238, modeText, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: modeColor,
      backgroundColor: 'rgba(255,255,255,0.08)',
      padding: { x: 10, y: 6 }
    }).setOrigin(0.5);

    this.drawProfileCard(245, 310, contexto);
    this.drawMissionCard(660, 310, GameState.missaoAtual);
    this.drawRankingCard(1020, 310, contexto?.ranking || []);

    this.createButton(640, 615, 'Iniciar Missão', () => {
      this.scene.start('MapScene');
    }, 260);

    this.createButton(640, 670, 'Voltar ao Portal', () => {
      window.location.href = GAME_CONFIG.portalUrl;
    }, 220, true);
  }

  drawDecorativeGrid() {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0xffffff, 0.08);
    for (let x = -100; x < 1400; x += 80) {
      graphics.lineBetween(x, 720, x + 320, 0);
      graphics.lineBetween(x, 0, x + 320, 720);
    }
  }

  drawProfileCard(x, y, contexto) {
    const aluno = contexto?.aluno || {};
    const jogador = contexto?.jogador || {};
    const g = this.add.graphics();
    g.fillStyle(0x10233f, 0.88);
    g.lineStyle(2, 0xffffff, 0.12);
    g.fillRoundedRect(x - 160, y - 96, 320, 192, 18);
    g.strokeRoundedRect(x - 160, y - 96, 320, 192, 18);

    this.add.text(x - 132, y - 70, 'Perfil do Aluno', labelStyle('#f3d58a'));
    this.add.text(x - 132, y - 34, aluno.nome || 'Aluno', bodyStyle('#ffffff')).setWordWrapWidth(255);
    this.add.text(x - 132, y - 2, `${aluno.turma || 'Turma'} • ${aluno.serie || aluno.etapa || 'Etapa'}`, bodyStyle('#a9bdd4'));
    this.add.text(x - 132, y + 34, `Nível ${jogador.nivel || 1}  |  XP ${jogador.xp || 0}/${jogador.xpProximoNivel || 100}`, bodyStyle('#ffffff'));

    const barBg = this.add.rectangle(x - 2, y + 72, 255, 12, 0x071529, 1).setOrigin(0.5);
    const pct = Math.min(1, (jogador.xp || 0) / (jogador.xpProximoNivel || 100));
    this.add.rectangle(x - 129, y + 72, 255 * pct, 12, 0xd6a84f, 1).setOrigin(0, 0.5);
    barBg.setStrokeStyle(1, 0xffffff, 0.18);
  }

  drawMissionCard(x, y, missao) {
    const g = this.add.graphics();
    g.fillStyle(0x10233f, 0.88);
    g.lineStyle(2, 0xd6a84f, 0.22);
    g.fillRoundedRect(x - 230, y - 96, 460, 192, 18);
    g.strokeRoundedRect(x - 230, y - 96, 460, 192, 18);

    this.add.text(x - 200, y - 70, 'Missão disponível', labelStyle('#f3d58a'));
    this.add.text(x - 200, y - 34, missao?.titulo || 'Missão', bodyStyle('#ffffff')).setWordWrapWidth(385);
    this.add.text(x - 200, y + 4, missao?.descricao || '', bodyStyle('#a9bdd4')).setWordWrapWidth(390);
    this.add.text(x - 200, y + 66, `Recompensa: ${missao?.recompensa?.medalha || 'Medalha'} + XP`, bodyStyle('#f3d58a'));
  }

  drawRankingCard(x, y, ranking) {
    const g = this.add.graphics();
    g.fillStyle(0x10233f, 0.88);
    g.lineStyle(2, 0xffffff, 0.12);
    g.fillRoundedRect(x - 160, y - 96, 320, 192, 18);
    g.strokeRoundedRect(x - 160, y - 96, 320, 192, 18);

    this.add.text(x - 132, y - 70, 'Ranking demonstrativo', labelStyle('#f3d58a'));
    ranking.slice(0, 5).forEach((item, index) => {
      this.add.text(x - 132, y - 32 + index * 28, `${item.posicao || index + 1}º  ${item.nome} — ${item.xp} XP`, bodyStyle(index === 0 ? '#f3d58a' : '#ffffff')).setWordWrapWidth(260);
    });
  }

  createButton(x, y, text, callback, width = 260, secondary = false) {
    const bg = this.add.rectangle(x, y, width, 44, secondary ? 0x10355f : 0xd6a84f, 1)
      .setStrokeStyle(2, secondary ? 0x64b5ff : 0xf3d58a, 0.8)
      .setInteractive({ useHandCursor: true });
    const label = this.add.text(x, y, text, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: secondary ? '#ffffff' : '#071529'
    }).setOrigin(0.5);

    bg.on('pointerover', () => bg.setScale(1.03));
    bg.on('pointerout', () => bg.setScale(1));
    bg.on('pointerdown', callback);
    label.setInteractive({ useHandCursor: true }).on('pointerdown', callback);
  }
}

function labelStyle(color) {
  return {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '14px',
    fontStyle: 'bold',
    color
  };
}

function bodyStyle(color) {
  return {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '16px',
    color
  };
}
