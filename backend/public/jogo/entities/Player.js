import { AVATARS } from '../config.js?v=20260718-v5-46-7-joystick-mobile-landscape';
import { GameState } from '../state.js?v=20260718-v5-46-7-joystick-mobile-landscape';

const DIRECTIONS = {
  N: 'north', NE: 'north-east', E: 'east', SE: 'south-east',
  S: 'south', SW: 'south-west', W: 'west', NW: 'north-west'
};

const OFFICIAL_AVATAR_PREFIX = {
  'cadete-azul': 'boy',
  'exploradora': 'girl'
};

const WALK_DIRECTIONS = [
  DIRECTIONS.S, DIRECTIONS.SE, DIRECTIONS.E, DIRECTIONS.NE,
  DIRECTIONS.N, DIRECTIONS.NW, DIRECTIONS.W, DIRECTIONS.SW
];

function directionKey(direction) {
  return direction.replaceAll('-', '_');
}

function officialIdleTexture(prefix, direction) {
  return `avatar-${prefix}-${directionKey(direction)}`;
}

function officialWalkTextures(prefix, direction) {
  return [0, 1, 2, 3, 4, 5].map((i) =>
    `avatar-${prefix}-walk-${directionKey(direction)}-${i}`
  );
}

function getWalkSequence(prefix, direction) {
  return [0, 1, 2, 3, 4, 5];
}

const WALK_BOB = [0, -0.8, -1.7, -2.2, -1.7, -0.8];

export class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.walkSpeed = 280;
    this.swimSpeed = 145;
    this.container = scene.add.container(x, y);
    this.direction = DIRECTIONS.S;
    this.pose = 'idle';
    this.mode = 'walk';
    this.walkTime = 0;
    this.parts = {};
    this.usesOfficialSprite = false;
    this.currentFrameIndex = 0;
    this.build();
    this.applyDirectionVisual();
    this.applyModeVisual();
  }

  get avatar() {
    return AVATARS.find((a) => a.id === GameState.avatarSelecionado) || AVATARS[0];
  }

  build() {
    this.parts.waterRing = this.scene.add.ellipse(0, 24, 76, 20, 0x8fe8ff, 0).setStrokeStyle(2, 0x8fe8ff, 0);
    this.shadow = this.scene.add.ellipse(0, 31, 60, 18, 0x000000, 0.25);
    this.parts.splash1 = this.scene.add.circle(-16, 20, 7, 0xffffff, 0);
    this.parts.splash2 = this.scene.add.circle(15, 22, 6, 0xffffff, 0);

    const selectedAvatarId = GameState.avatarSelecionado;
    this.officialPrefix = OFFICIAL_AVATAR_PREFIX[selectedAvatarId] || OFFICIAL_AVATAR_PREFIX[this.avatar.id] || 'boy';
    const firstTexture = officialIdleTexture(this.officialPrefix, this.direction);
    this.usesOfficialSprite = Boolean(firstTexture && this.scene.textures.exists(firstTexture));

    if (this.usesOfficialSprite) {
      this.sprite = this.scene.add.image(0, 35, firstTexture)
        .setOrigin(0.5, 1)
        .setDisplaySize(120, 120);
      this.parts.waterCover = this.scene.add.ellipse(0, 25, 88, 34, 0x1d83b7, 0);
      this.container.add([
        this.shadow,
        this.sprite,
        this.parts.waterCover,
        this.parts.waterRing,
        this.parts.splash1,
        this.parts.splash2
      ]);
    } else {
      this.buildVectorAvatar();
    }

    this.container.setDepth(this.container.y + 70);
  }

  buildVectorAvatar() {
    const a = this.avatar;
    this.parts.leftLeg = this.scene.add.rectangle(-8, 23, 9, 26, 0x13233d, 1).setStrokeStyle(1, 0xffffff, 0.15);
    this.parts.rightLeg = this.scene.add.rectangle(8, 23, 9, 26, 0x13233d, 1).setStrokeStyle(1, 0xffffff, 0.15);
    this.parts.leftArm = this.scene.add.rectangle(-25, 0, 8, 34, a.pele, 1).setOrigin(0.5, 0.18);
    this.parts.rightArm = this.scene.add.rectangle(25, 0, 8, 34, a.pele, 1).setOrigin(0.5, 0.18);
    this.parts.backpack = this.scene.add.rectangle(-24, 0, 11, 35, 0x12355f, 1).setStrokeStyle(1, a.detalhe, 0.6);
    this.parts.body = this.scene.add.ellipse(0, -2, 42, 54, a.uniforme, 1).setStrokeStyle(3, a.detalhe, 1);
    this.parts.shirt = this.scene.add.rectangle(0, -4, 18, 32, 0xf8fafc, 1);
    this.parts.badge = this.scene.add.circle(0, -7, 5, a.detalhe, 1);
    this.parts.head = this.scene.add.circle(0, -41, 17, a.pele, 1).setStrokeStyle(2, 0xffffff, 0.75);
    this.parts.hair = this.scene.add.arc(0, -49, 18, 180, 360, false, a.cabelo, 1);
    this.parts.cap = this.scene.add.rectangle(0, -60, 34, 8, 0x0b1f3a, 1).setStrokeStyle(2, a.detalhe, 1);
    this.parts.eye1 = this.scene.add.circle(-6, -42, 2, 0x071529, 1);
    this.parts.eye2 = this.scene.add.circle(6, -42, 2, 0x071529, 1);
    this.parts.smile = this.scene.add.arc(0, -36, 7, 20, 160, false, 0x7a3c20, 1);

    this.container.add([
      this.shadow,
      this.parts.leftLeg,
      this.parts.rightLeg,
      this.parts.backpack,
      this.parts.leftArm,
      this.parts.rightArm,
      this.parts.body,
      this.parts.shirt,
      this.parts.badge,
      this.parts.head,
      this.parts.hair,
      this.parts.cap,
      this.parts.eye1,
      this.parts.eye2,
      this.parts.smile,
      this.parts.waterRing,
      this.parts.splash1,
      this.parts.splash2
    ]);
  }

  get x() { return this.container.x; }
  get y() { return this.container.y; }
  setPosition(x, y) { this.container.setPosition(x, y); }

  update(delta, direction, bounds, obstacles = [], waterZones = []) {
    const seconds = delta / 1000;
    const hasAnalogVector = Number.isFinite(direction?.x) && Number.isFinite(direction?.y);
    let rawX = hasAnalogVector ? direction.x : 0;
    let rawY = hasAnalogVector ? direction.y : 0;

    if (!hasAnalogVector) {
      if (direction.left) rawX -= 1;
      if (direction.right) rawX += 1;
      if (direction.up) rawY -= 1;
      if (direction.down) rawY += 1;
    }

    this.mode = 'walk';

    const vectorLength = Math.hypot(rawX, rawY);
    if (vectorLength > 0.001) {
      this.pose = 'walk';
      this.direction = this.directionFromVector(rawX, rawY);

      const baseSpeed = this.mode === 'swim' ? this.swimSpeed : this.walkSpeed;
      const force = hasAnalogVector
        ? Phaser.Math.Clamp(Number(direction.magnitude) || vectorLength, 0, 1)
        : 1;
      const speed = baseSpeed * force;
      const length = vectorLength || 1;
      const dx = (rawX / length) * speed * seconds;
      const dy = (rawY / length) * speed * seconds;
      const nextX = Phaser.Math.Clamp(this.x + dx, bounds.x, bounds.x + bounds.width);
      const nextY = Phaser.Math.Clamp(this.y + dy, bounds.y, bounds.y + bounds.height);

      let finalX = this.x;
      let finalY = this.y;
      if (!this.isBlocked(nextX, this.y, obstacles)) finalX = nextX;
      if (!this.isBlocked(finalX, nextY, obstacles)) finalY = nextY;

      this.container.setPosition(finalX, finalY);
      this.mode = 'walk';
      this.container.setDepth(finalY + 70);
      this.walkTime += delta;
      this.animateWalk();
      this.applyModeVisual();
    } else {
      if (this.pose === 'walk') this.pose = 'idle';
      this.currentFrameIndex = 0;
      this.resetLimbPose();
      this.applyDirectionVisual();
      this.applyModeVisual();
    }
  }

  directionFromVector(dx, dy) {
    const angle = Math.atan2(dy, dx);
    const octant = Math.round(8 * angle / (Math.PI * 2) + 8) % 8;
    return [
      DIRECTIONS.E, DIRECTIONS.SE, DIRECTIONS.S, DIRECTIONS.SW,
      DIRECTIONS.W, DIRECTIONS.NW, DIRECTIONS.N, DIRECTIONS.NE
    ][octant];
  }

  applyDirectionVisual() {
    if (this.usesOfficialSprite) {
      let texture = officialIdleTexture(this.officialPrefix, this.direction);
      const frames = officialWalkTextures(this.officialPrefix, this.direction);
      if (this.pose === 'walk' && this.mode === 'walk' && frames?.length) {
        const sequence = getWalkSequence(this.officialPrefix, this.direction);
        const token = sequence[this.currentFrameIndex % sequence.length];
        texture = frames[token % frames.length];
      }
      if (this.scene.textures.exists(texture) && this.sprite.texture.key !== texture) {
        this.sprite.setTexture(texture);
      }
      this.container.scaleX = 1;
      return;
    }

    const isBack = [DIRECTIONS.N, DIRECTIONS.NE, DIRECTIONS.NW].includes(this.direction);
    const isSide = [DIRECTIONS.E, DIRECTIONS.W].includes(this.direction);
    const isDiagonal = [DIRECTIONS.NE, DIRECTIONS.SE, DIRECTIONS.SW, DIRECTIONS.NW].includes(this.direction);
    const facesLeft = [DIRECTIONS.W, DIRECTIONS.NW, DIRECTIONS.SW].includes(this.direction);

    this.container.scaleX = facesLeft ? -1 : 1;
    if (!this.parts.eye1 || !this.parts.eye2 || !this.parts.smile || !this.parts.shirt || !this.parts.badge || !this.parts.backpack) return;
    this.parts.eye1.setVisible(!isBack);
    this.parts.eye2.setVisible(!isBack && !isSide);
    this.parts.smile.setVisible(!isBack);
    this.parts.shirt.setVisible(!isBack);
    this.parts.badge.setVisible(!isBack);
    this.parts.backpack.setVisible(isBack || isDiagonal || isSide);

    if (isBack) {
      this.parts.backpack.setPosition(0, -1).setDisplaySize(25, 37);
      this.parts.body.setScale(1, 1);
      this.parts.head.setScale(1, 1);
      this.parts.hair.setRotation(Math.PI);
    } else if (isSide) {
      this.parts.backpack.setPosition(-18, 0).setDisplaySize(12, 35);
      this.parts.body.setScale(0.78, 1);
      this.parts.head.setScale(0.84, 1);
      this.parts.eye1.setPosition(4, -42);
      this.parts.smile.setPosition(5, -36);
      this.parts.hair.setRotation(0);
    } else if (isDiagonal) {
      this.parts.backpack.setPosition(-20, 0).setDisplaySize(11, 35);
      this.parts.body.setScale(0.9, 1);
      this.parts.head.setScale(0.92, 1);
      this.parts.eye1.setPosition(-1, -42);
      this.parts.eye2.setPosition(8, -42);
      this.parts.smile.setPosition(4, -36);
      this.parts.hair.setRotation(0);
    } else {
      this.parts.backpack.setPosition(-24, 0).setDisplaySize(11, 35);
      this.parts.body.setScale(1, 1);
      this.parts.head.setScale(1, 1);
      this.parts.eye1.setPosition(-6, -42);
      this.parts.eye2.setPosition(6, -42);
      this.parts.smile.setPosition(0, -36);
      this.parts.hair.setRotation(0);
    }
  }

  applyModeVisual() {
    const swim = this.mode === 'swim';
    this.parts.waterRing.setFillStyle(0x8fe8ff, swim ? 0.35 : 0);
    this.parts.waterRing.setStrokeStyle(2, 0x8fe8ff, swim ? 0.75 : 0);
    this.parts.splash1.setAlpha(swim ? 0.75 : 0);
    this.parts.splash2.setAlpha(swim ? 0.65 : 0);
    this.shadow.setAlpha(swim ? 0.08 : 0.25);

    if (this.usesOfficialSprite) {
      this.parts.waterCover.setFillStyle(0x1d83b7, swim ? 0.94 : 0);
      this.sprite.setAlpha(swim ? 0.96 : 1);
      return;
    }

    this.parts.leftLeg?.setVisible(!swim);
    this.parts.rightLeg?.setVisible(!swim);
    this.parts.body.y = swim ? 2 : this.parts.body.y;
    this.parts.shirt.y = swim ? 0 : this.parts.shirt.y;
  }

  animateWalk() {
    if (this.usesOfficialSprite) {
      const frames = officialWalkTextures(this.officialPrefix, this.direction);
      if (this.mode === 'walk' && frames?.length) {
        const sequence = getWalkSequence(this.officialPrefix, this.direction);
        const frameSpan = 118;
        this.currentFrameIndex = Math.floor(this.walkTime / frameSpan) % sequence.length;
        this.applyDirectionVisual();
        const diagonal = [DIRECTIONS.NE, DIRECTIONS.NW, DIRECTIONS.SE, DIRECTIONS.SW].includes(this.direction);
        const bob = WALK_BOB[this.currentFrameIndex % WALK_BOB.length] * (diagonal ? 0.9 : 1);
        this.sprite.y = 35 + bob;
        this.sprite.angle = diagonal ? Math.sin(this.walkTime / 170) * 0.28 : 0;
        const shadowPulse = Math.abs(bob) / 2.3;
        this.shadow.scaleX = 1 - shadowPulse * 0.045;
        this.shadow.scaleY = 1 - shadowPulse * 0.08;
      } else {
        const swimStep = Math.sin(this.walkTime / 110);
        this.applyDirectionVisual();
        this.sprite.y = 45 - Math.abs(swimStep) * 1.2;
        this.sprite.angle = swimStep * 0.8;
      }
      this.parts.splash1.y = 20 + Math.sin(this.walkTime / 95) * 2.2;
      this.parts.splash2.y = 22 + Math.cos(this.walkTime / 90) * 2.2;
      return;
    }

    const step = Math.sin(this.walkTime / (this.mode === 'swim' ? 115 : 82));
    const amplitude = this.mode === 'swim' ? 0.08 : 0.20;
    const armAmplitude = this.mode === 'swim' ? 0.06 : 0.13;
    const bob = this.mode === 'swim' ? 2.2 : 1.2;
    this.parts.leftLeg.rotation = this.mode === 'swim' ? 0 : step * amplitude;
    this.parts.rightLeg.rotation = this.mode === 'swim' ? 0 : -step * amplitude;
    this.parts.leftArm.rotation = -step * armAmplitude;
    this.parts.rightArm.rotation = step * armAmplitude;
    this.parts.body.y = (this.mode === 'swim' ? 2 : -2) - Math.abs(step) * bob;
    this.parts.shirt.y = (this.mode === 'swim' ? 0 : -4) - Math.abs(step) * (this.mode === 'swim' ? 1.2 : 1.0);
    this.parts.splash1.y = 20 + Math.sin(this.walkTime / 95) * 2.2;
    this.parts.splash2.y = 22 + Math.cos(this.walkTime / 90) * 2.2;
  }

  resetLimbPose() {
    if (this.usesOfficialSprite) {
      this.sprite.angle = 0;
      this.sprite.y = this.mode === 'swim' ? 45 : 35;
      this.shadow.scaleX = 1;
      this.shadow.scaleY = 1;
      return;
    }
    this.parts.leftLeg.rotation = 0;
    this.parts.rightLeg.rotation = 0;
    this.parts.leftArm.rotation = 0;
    this.parts.rightArm.rotation = 0;
    this.parts.body.y = this.mode === 'swim' ? 2 : -2;
    this.parts.shirt.y = this.mode === 'swim' ? 0 : -4;
  }

  isInWater(x, y, waterZones) {
    return false;
  }

  isBlocked(x, y, obstacles) {
    const footprint = { left: x - 14, right: x + 14, top: y + 5, bottom: y + 31 };
    return obstacles.some((rect) => !(
      footprint.right < rect.x ||
      footprint.left > rect.x + rect.width ||
      footprint.bottom < rect.y ||
      footprint.top > rect.y + rect.height
    ));
  }
}
