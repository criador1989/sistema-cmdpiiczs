import { GAME_CONFIG } from '../config.js?v=20260718-v5-46-8-joystick-touch-fix';
import { GameState } from '../state.js?v=20260718-v5-46-8-joystick-touch-fix';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    window.AxoriinMobile?.setPlaying?.(false);
    this.cameras.main.setBackgroundColor('#061426');

    this.add.image(640, 360, 'menu-axoriin-v5461')
      .setDisplaySize(1280, 720)
      .setDepth(0);

    this.drawSelectedAvatarPreview();

    this.createIllustratedButton(307, 670, 342, 62, () => this.enterCity(), false);
    this.createIllustratedButton(660, 670, 318, 62, () => this.scene.start('AvatarScene'), true);
    this.createIllustratedButton(1003, 670, 326, 62, () => {
      window.location.href = GAME_CONFIG.portalUrl;
    }, true);

    const keys = this.input.keyboard.addKeys('ENTER,A,P');
    keys.ENTER.on('down', () => this.scene.start('MapScene'));
    keys.A.on('down', () => this.scene.start('AvatarScene'));
    keys.P.on('down', () => { window.location.href = GAME_CONFIG.portalUrl; });
  }

  async enterCity() {
    try {
      await window.AxoriinMobile?.requestGameMode?.();
    } catch (error) {
      console.warn('[Arena Axoriin] O modo mobile seguirá sem tela cheia automática.', error);
    }
    window.AxoriinMobile?.setPlaying?.(true);
    this.scene.start('MapScene');
  }

  drawSelectedAvatarPreview() {
    // O avatar ilustrado já está incorporado na arte do painel do menu.
    // Mantemos este método apenas para compatibilidade, sem desenhar
    // uma segunda instância do personagem sobre o card do perfil.
    return;
  }

  createIllustratedButton(x, y, width, height, callback, secondary = false) {
    const zone = this.add.rectangle(x, y, width, height, 0xffffff, 0.001)
      .setDepth(15)
      .setInteractive({ useHandCursor: true });

    const hover = this.add.rectangle(x, y, width - 8, height - 8,
      secondary ? 0x4c9bf2 : 0xf3d58a, 0)
      .setDepth(14)
      .setStrokeStyle(2, secondary ? 0x76b9ff : 0xffe29b, 0)
      .setBlendMode(Phaser.BlendModes.ADD);

    zone.on('pointerover', () => {
      hover.setFillStyle(secondary ? 0x4c9bf2 : 0xf3d58a, 0.10);
      hover.setStrokeStyle(2, secondary ? 0x76b9ff : 0xffe29b, 0.58);
      this.tweens.add({ targets: hover, alpha: 1, duration: 120 });
    });
    zone.on('pointerout', () => {
      this.tweens.add({ targets: hover, alpha: 0, duration: 140 });
    });
    zone.on('pointerdown', () => {
      this.cameras.main.flash(100, 243, 213, 138, false);
      callback();
    });
  }
}
