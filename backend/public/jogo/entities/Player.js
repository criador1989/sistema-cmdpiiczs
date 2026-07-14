import { GAME_CONFIG } from '../config.js';

export class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.speed = 205;
    this.container = scene.add.container(x, y);
    this.shadow = scene.add.ellipse(0, 27, 42, 16, 0x000000, 0.22);
    this.legs = scene.add.rectangle(0, 24, 24, 20, 0x172a48).setStrokeStyle(2, 0xf3d58a, 0.25);
    this.body = scene.add.ellipse(0, 0, 34, 44, GAME_CONFIG.colors.blue, 1).setStrokeStyle(3, GAME_CONFIG.colors.gold, 1);
    this.head = scene.add.circle(0, -32, 15, 0xf4d2ae, 1).setStrokeStyle(2, 0xffffff, 0.8);
    this.hat = scene.add.rectangle(0, -47, 32, 9, GAME_CONFIG.colors.blueDark, 1).setStrokeStyle(2, GAME_CONFIG.colors.gold, 1);
    this.badge = scene.add.circle(0, -4, 5, GAME_CONFIG.colors.goldLight, 1);

    this.container.add([this.shadow, this.legs, this.body, this.head, this.hat, this.badge]);
    this.container.setDepth(y + 60);
  }

  get x() { return this.container.x; }
  get y() { return this.container.y; }
  setPosition(x, y) { this.container.setPosition(x, y); }

  update(delta, direction, bounds) {
    const seconds = delta / 1000;
    let dx = 0;
    let dy = 0;

    if (direction.left) dx -= 1;
    if (direction.right) dx += 1;
    if (direction.up) dy -= 1;
    if (direction.down) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy) || 1;
      dx = (dx / length) * this.speed * seconds;
      dy = (dy / length) * this.speed * seconds;

      const nextX = Phaser.Math.Clamp(this.x + dx, bounds.x, bounds.x + bounds.width);
      const nextY = Phaser.Math.Clamp(this.y + dy, bounds.y, bounds.y + bounds.height);
      this.container.setPosition(nextX, nextY);
      this.container.setDepth(nextY + 60);
      this.container.scaleX = dx < 0 ? -1 : dx > 0 ? 1 : this.container.scaleX;
      this.body.setScale(1, 1 + Math.sin(this.scene.time.now / 80) * 0.025);
    } else {
      this.body.setScale(1, 1);
    }
  }
}
