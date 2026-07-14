import { GAME_CONFIG } from '../config.js';
import { carregarContextoJogo } from '../api.js';
import { GameState } from '../state.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {}

  async create() {
    this.cameras.main.setBackgroundColor('#071529');
    this.add.rectangle(640, 360, 1280, 720, GAME_CONFIG.colors.navy);
    this.add.circle(640, 280, 90, GAME_CONFIG.colors.blue, 0.15);
    this.add.circle(640, 280, 58, GAME_CONFIG.colors.gold, 0.12);
    this.add.text(640, 340, 'Carregando Arena do Conhecimento...', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    this.add.text(640, 386, 'Conectando ao Portal do Aluno', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#a9bdd4'
    }).setOrigin(0.5);

    try {
      GameState.contexto = await carregarContextoJogo();
      GameState.missaoAtual = GameState.contexto.missoes[0];
    } catch (error) {
      console.error(error);
    }

    this.time.delayedCall(450, () => this.scene.start('MenuScene'));
  }
}
