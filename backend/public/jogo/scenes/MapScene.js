import { GAME_CONFIG } from '../config.js';
import { GameState } from '../state.js';
import { Player } from '../entities/Player.js';
import { Npc } from '../entities/Npc.js';

export class MapScene extends Phaser.Scene {
  constructor() {
    super('MapScene');
  }

  create() {
    const { world, colors } = GAME_CONFIG;
    this.cameras.main.setBackgroundColor('#071529');
    this.bounds = new Phaser.Geom.Rectangle(90, 135, world.width - 180, world.height - 220);
    this.virtualDirection = { up: false, down: false, left: false, right: false };
    this.canInteract = false;

    this.drawWorld();

    this.npc = new Npc(this, 835, 318, GameState.missaoAtual?.npc || 'Professor Guardião');
    this.player = new Player(this, GameState.player.x, GameState.player.y);

    this.cameras.main.setBounds(0, 0, world.width, world.height);
    this.cameras.main.startFollow(this.player.container, true, 0.08, 0.08);
    this.cameras.main.setZoom(this.scale.width < 760 ? 0.88 : 1);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,E,ESC');

    this.createHud();
    this.createMobileControls();
    this.createInteractionHint();
    this.createDialogBox();

    this.keys.E.on('down', () => this.tryInteract());
    this.keys.ESC.on('down', () => this.scene.start('MenuScene'));
  }

  update(time, delta) {
    this.npc.pulse(time);

    const direction = {
      left: this.cursors.left.isDown || this.keys.A.isDown || this.virtualDirection.left,
      right: this.cursors.right.isDown || this.keys.D.isDown || this.virtualDirection.right,
      up: this.cursors.up.isDown || this.keys.W.isDown || this.virtualDirection.up,
      down: this.cursors.down.isDown || this.keys.S.isDown || this.virtualDirection.down
    };

    this.player.update(delta, direction, this.bounds);
    GameState.player.x = this.player.x;
    GameState.player.y = this.player.y;

    this.canInteract = this.npc.distanceTo(this.player) < 115;
    this.interactionHint.setVisible(this.canInteract);
    this.dialogBox.setVisible(this.canInteract);
  }

  drawWorld() {
    const g = this.add.graphics();

    g.fillStyle(0x071529, 1);
    g.fillRect(0, 0, 1280, 720);

    this.drawIsoFloor(g, 610, 385, 15, 9, 64, 32);
    this.drawBuilding(g);
    this.drawMissionPanels(g);
    this.drawGarden(g);
  }

  drawIsoFloor(g, startX, startY, cols, rows, tileW, tileH) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + (c - r) * tileW / 2;
        const y = startY + (c + r) * tileH / 2;
        const isAlt = (r + c) % 2 === 0;
        g.fillStyle(isAlt ? 0x173a62 : 0x123254, 1);
        g.lineStyle(1, 0xffffff, 0.07);
        g.beginPath();
        g.moveTo(x, y - tileH / 2);
        g.lineTo(x + tileW / 2, y);
        g.lineTo(x, y + tileH / 2);
        g.lineTo(x - tileW / 2, y);
        g.closePath();
        g.fillPath();
        g.strokePath();
      }
    }
  }

  drawBuilding(g) {
    g.fillStyle(0x0d2746, 1);
    g.fillRoundedRect(100, 70, 1080, 145, 20);
    g.lineStyle(3, 0xd6a84f, 0.5);
    g.strokeRoundedRect(100, 70, 1080, 145, 20);

    this.add.text(640, 105, 'COLÉGIO VIRTUAL AXORIIN', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '30px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5).setDepth(1000);

    this.add.text(640, 147, 'Saber • Honra • Disciplina', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#f3d58a'
    }).setOrigin(0.5).setDepth(1000);

    for (let i = 0; i < 9; i++) {
      const x = 180 + i * 115;
      g.fillStyle(0x1f6fb5, 0.35);
      g.fillRoundedRect(x, 168, 65, 34, 8);
      g.lineStyle(1, 0xffffff, 0.12);
      g.strokeRoundedRect(x, 168, 65, 34, 8);
    }
  }

  drawMissionPanels(g) {
    const panels = [
      { x: 145, y: 302, title: 'Biblioteca', icon: '📚' },
      { x: 145, y: 430, title: 'Missões', icon: '⭐' },
      { x: 1038, y: 310, title: 'Ranking', icon: '🏆' },
      { x: 1038, y: 438, title: 'Valores', icon: '🛡' }
    ];

    panels.forEach((p) => {
      g.fillStyle(0x10233f, 0.9);
      g.fillRoundedRect(p.x - 78, p.y - 43, 156, 86, 16);
      g.lineStyle(2, 0xd6a84f, 0.35);
      g.strokeRoundedRect(p.x - 78, p.y - 43, 156, 86, 16);
      this.add.text(p.x, p.y - 12, p.icon, { fontSize: '26px' }).setOrigin(0.5).setDepth(1000);
      this.add.text(p.x, p.y + 22, p.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffffff'
      }).setOrigin(0.5).setDepth(1000);
    });
  }

  drawGarden(g) {
    for (let i = 0; i < 10; i++) {
      const x = 270 + i * 80;
      const y = 610 + Math.sin(i) * 18;
      g.fillStyle(0x48c78e, 0.55);
      g.fillCircle(x, y, 18);
      g.fillStyle(0x173a62, 1);
      g.fillRect(x - 4, y + 12, 8, 20);
    }
  }

  createHud() {
    const contexto = GameState.contexto || {};
    const aluno = contexto.aluno || {};
    const jogador = contexto.jogador || {};

    const hud = this.add.container(18, 18).setScrollFactor(0).setDepth(5000);
    const bg = this.add.rectangle(0, 0, 340, 112, 0x071529, 0.82).setOrigin(0).setStrokeStyle(2, 0xd6a84f, 0.26);
    const title = this.add.text(20, 16, aluno.nome || 'Aluno', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff'
    });
    const sub = this.add.text(20, 43, `${aluno.turma || 'Turma'} • Nível ${jogador.nivel || 1}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#a9bdd4'
    });
    const mission = this.add.text(20, 72, 'Objetivo: fale com o Professor Guardião', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#f3d58a'
    });
    hud.add([bg, title, sub, mission]);

    const back = this.add.text(1115, 28, 'Menu', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: 'rgba(16, 53, 95, 0.92)',
      padding: { x: 18, y: 10 }
    }).setScrollFactor(0).setDepth(5000).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start('MenuScene'));
  }

  createInteractionHint() {
    this.interactionHint = this.add.text(640, 620, 'Pressione E ou toque em Interagir para iniciar a missão', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#071529',
      backgroundColor: '#f3d58a',
      padding: { x: 18, y: 12 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(6000).setVisible(false);
  }

  createDialogBox() {
    this.dialogBox = this.add.container(640, 520).setScrollFactor(0).setDepth(5500).setVisible(false);
    const bg = this.add.rectangle(0, 0, 760, 92, 0x071529, 0.92).setStrokeStyle(2, 0xd6a84f, 0.7);
    const text = this.add.text(-350, -30, 'Professor Guardião: Cadete, temos uma missão de conhecimento. Aproxime-se e inicie o desafio!', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
      wordWrap: { width: 700 }
    });
    this.dialogBox.add([bg, text]);
  }

  createMobileControls() {
    const isSmall = this.scale.width < 920 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const depth = 7000;

    const controls = this.add.container(0, 0).setScrollFactor(0).setDepth(depth).setVisible(isSmall);
    const makePad = (x, y, label, key) => {
      const btn = this.add.circle(x, y, 25, 0x10355f, 0.82).setStrokeStyle(2, 0xf3d58a, 0.45).setInteractive();
      const txt = this.add.text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
      btn.on('pointerdown', () => { this.virtualDirection[key] = true; });
      btn.on('pointerup', () => { this.virtualDirection[key] = false; });
      btn.on('pointerout', () => { this.virtualDirection[key] = false; });
      controls.add([btn, txt]);
    };

    makePad(92, 610, '↑', 'up');
    makePad(92, 674, '↓', 'down');
    makePad(34, 674, '←', 'left');
    makePad(150, 674, '→', 'right');

    const interact = this.add.rectangle(1092, 648, 170, 52, 0xd6a84f, 0.95).setStrokeStyle(2, 0xf3d58a, 1).setInteractive({ useHandCursor: true });
    const label = this.add.text(1092, 648, 'Interagir', { fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#071529' }).setOrigin(0.5);
    interact.on('pointerdown', () => this.tryInteract());
    controls.add([interact, label]);
  }

  tryInteract() {
    if (!this.canInteract) return;
    GameState.resetQuiz();
    this.scene.start('QuizScene');
  }
}
