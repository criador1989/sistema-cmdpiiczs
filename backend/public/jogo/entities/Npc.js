import { GAME_CONFIG } from '../config.js';

export class Npc {
  constructor(scene, x, y, name = 'Professor Guardião') {
    this.scene = scene;
    this.name = name;
    this.container = scene.add.container(x, y);

    const shadow = scene.add.ellipse(0, 29, 50, 18, 0x000000, 0.22);
    const robe = scene.add.rectangle(0, 6, 42, 56, 0x123f71, 1).setStrokeStyle(3, GAME_CONFIG.colors.goldLight, 1);
    const shirt = scene.add.rectangle(0, 0, 24, 34, 0xf8fafc, 1);
    const tie = scene.add.triangle(0, 2, -7, -13, 7, -13, 0, 18, GAME_CONFIG.colors.gold, 1);
    const head = scene.add.circle(0, -38, 17, 0xf2c9a2, 1).setStrokeStyle(2, 0xffffff, 0.85);
    const cap = scene.add.rectangle(0, -56, 38, 10, GAME_CONFIG.colors.blueDark, 1).setStrokeStyle(2, GAME_CONFIG.colors.gold, 1);
    const glow = scene.add.circle(0, -70, 5, GAME_CONFIG.colors.goldLight, 1);

    this.container.add([shadow, robe, shirt, tie, head, cap, glow]);
    this.container.setDepth(y + 60);

    this.label = scene.add.text(x, y - 100, name, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#f3d58a',
      backgroundColor: 'rgba(7, 21, 41, 0.72)',
      padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setDepth(2000);
  }

  get x() { return this.container.x; }
  get y() { return this.container.y; }

  distanceTo(player) {
    return Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
  }

  pulse(time) {
    const s = 1 + Math.sin(time / 260) * 0.025;
    this.container.setScale(s);
  }
}
