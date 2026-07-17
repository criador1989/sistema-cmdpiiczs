import { AVATARS } from '../config.js?v=20260717-v5-46-0-hud-corrigido';
import { GameState } from '../state.js?v=20260717-v5-46-0-hud-corrigido';

function getAvatar(avatarId) {
  return AVATARS.find((a) => a.id === (avatarId || GameState.avatarSelecionado)) || AVATARS[0];
}

export function createStudentPortrait(scene, x, y, options = {}) {
  const avatar = getAvatar(options.avatarId);
  const pose = options.pose || 'neutral';
  const scale = options.scale || 1;
  const facing = options.facing || 'left';
  const c = scene.add.container(x, y).setScale(scale);

  const glow = scene.add.circle(0, 0, 86, avatar.uniforme, 0.16).setStrokeStyle(2, avatar.detalhe, 0.42);
  const torso = scene.add.ellipse(0, 48, 112, 118, avatar.uniforme, 1).setStrokeStyle(3, avatar.detalhe, 0.85);
  const shirt = scene.add.rectangle(0, 48, 42, 74, 0xf8fafc, 1);
  const neck = scene.add.rectangle(0, -4, 24, 30, avatar.pele, 1);
  const head = scene.add.circle(0, -34, 47, avatar.pele, 1).setStrokeStyle(3, 0xffffff, 0.45);
  const hair = scene.add.arc(0, -50, 50, 180, 360, false, avatar.cabelo, 1);
  const cap = scene.add.rectangle(0, -86, 78, 14, 0x0b1f3a, 1).setStrokeStyle(3, avatar.detalhe, 1);
  const badge = scene.add.circle(0, 43, 10, avatar.detalhe, 1);

  const eyeDirection = facing === 'right' ? 5 : facing === 'left' ? -5 : 0;
  const eye1 = scene.add.circle(-15 + eyeDirection, -35, 4, 0x071529, 1);
  const eye2 = scene.add.circle(15 + eyeDirection, -35, 4, 0x071529, 1);
  const mouth = scene.add.arc(0, -17, pose === 'uncertain' ? 11 : 14, pose === 'uncertain' ? 195 : 20, pose === 'uncertain' ? 345 : 160, false, 0x7a3c20, 1);

  const leftArm = scene.add.rectangle(-62, 44, 22, 80, avatar.pele, 1).setOrigin(0.5, 0.2);
  const rightArm = scene.add.rectangle(62, 44, 22, 80, avatar.pele, 1).setOrigin(0.5, 0.2);

  if (pose === 'thinking') {
    leftArm.setRotation(-0.55).setPosition(-50, 42);
    rightArm.setRotation(-1.3).setPosition(42, 25);
    c.add(scene.add.circle(64, -8, 13, avatar.pele, 1));
    c.add(scene.add.text(72, -86, '?', { fontFamily: 'system-ui, sans-serif', fontSize: '35px', fontStyle: '900', color: '#f3d58a' }).setOrigin(0.5));
    c.add(scene.add.circle(50, -70, 5, 0xf3d58a, 0.8));
    c.add(scene.add.circle(34, -55, 3, 0xf3d58a, 0.6));
  } else if (pose === 'celebrate') {
    leftArm.setRotation(-2.35).setPosition(-48, 12);
    rightArm.setRotation(2.35).setPosition(48, 12);
    c.add(scene.add.text(0, -122, '!', { fontFamily: 'system-ui, sans-serif', fontSize: '46px', fontStyle: '900', color: '#f3d58a' }).setOrigin(0.5));
  } else if (pose === 'uncertain') {
    leftArm.setRotation(-0.35).setPosition(-52, 43);
    rightArm.setRotation(-1.0).setPosition(48, 35);
    c.add(scene.add.text(74, -68, '…', { fontFamily: 'system-ui, sans-serif', fontSize: '34px', fontStyle: '900', color: '#a9bdd4' }).setOrigin(0.5));
  } else if (pose === 'talk') {
    leftArm.setRotation(-0.3);
    rightArm.setRotation(0.6);
  }

  c.add([glow, leftArm, rightArm, torso, shirt, neck, head, hair, cap, badge, eye1, eye2, mouth]);
  c.sendToBack(glow);
  c.sendToBack(leftArm);
  c.sendToBack(rightArm);
  return c;
}

export function createNpcPortrait(scene, x, y, local, options = {}) {
  const scale = options.scale || 1;
  const c = scene.add.container(x, y).setScale(scale);
  const accent = local?.color || 0xd6a84f;
  const isGuardian = local?.id === 'escola-militar';
  const skin = isGuardian ? 0xe2b48f : 0xd6a77f;
  const uniform = isGuardian ? 0x12355f : accent;

  c.add(scene.add.circle(0, 0, 88, accent, 0.15).setStrokeStyle(2, 0xf3d58a, 0.42));
  c.add(scene.add.ellipse(0, 50, 116, 118, uniform, 1).setStrokeStyle(3, 0xf3d58a, 0.65));
  c.add(scene.add.rectangle(0, 48, 44, 74, 0xf8fafc, 1));
  c.add(scene.add.rectangle(0, -2, 26, 30, skin, 1));
  c.add(scene.add.circle(0, -36, 48, skin, 1).setStrokeStyle(3, 0xffffff, 0.42));

  if (isGuardian) {
    c.add(scene.add.arc(0, -51, 50, 180, 360, false, 0xffffff, 1));
    c.add(scene.add.rectangle(0, -88, 86, 15, 0x0b1f3a, 1).setStrokeStyle(3, 0xd6a84f, 1));
    c.add(scene.add.rectangle(0, -78, 54, 22, 0x12355f, 1));
    c.add(scene.add.arc(0, -12, 30, 10, 170, false, 0xffffff, 1));
    c.add(scene.add.circle(-17, -38, 11, 0xffffff, 0.06).setStrokeStyle(2, 0x071529, 1));
    c.add(scene.add.circle(17, -38, 11, 0xffffff, 0.06).setStrokeStyle(2, 0x071529, 1));
  } else {
    c.add(scene.add.arc(0, -55, 52, 180, 360, false, 0x3a2b22, 1));
    c.add(scene.add.circle(-15, -38, 4, 0x071529, 1));
    c.add(scene.add.circle(15, -38, 4, 0x071529, 1));
    c.add(scene.add.arc(0, -18, 14, 20, 160, false, 0x7a3c20, 1));
  }

  c.add(scene.add.circle(0, 44, 10, 0xf3d58a, 1));
  return c;
}
