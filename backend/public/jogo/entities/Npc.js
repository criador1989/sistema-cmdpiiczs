export class Npc {
  constructor(scene, x, y, name = 'Professor Guardião') {
    this.scene = scene;
    this.name = name;
    this.container = scene.add.container(x, y);
    const shadow = scene.add.ellipse(0, 29, 50, 18, 0x000000, 0.22);
    const robe = scene.add.rectangle(0, 6, 42, 56, 0x123f71, 1).setStrokeStyle(3, 0xf3d58a, 1);
    const shirt = scene.add.rectangle(0, 0, 24, 34, 0xf8fafc, 1);
    const head = scene.add.circle(0, -38, 17, 0xf2c9a2, 1).setStrokeStyle(2, 0xffffff, 0.85);
    const cap = scene.add.rectangle(0, -56, 38, 10, 0x0b1f3a, 1).setStrokeStyle(2, 0xd6a84f, 1);
    this.container.add([shadow, robe, shirt, head, cap]);
    this.container.setDepth(y + 60);
  }
  get x() { return this.container.x; }
  get y() { return this.container.y; }
  distanceTo(player) { return Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y); }
  pulse(time) { this.container.setScale(1 + Math.sin(time / 260) * 0.025); }
}
