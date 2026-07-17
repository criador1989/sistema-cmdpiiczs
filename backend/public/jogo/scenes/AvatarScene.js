import { AVATARS, GAME_CONFIG } from '../config.js?v=20260717-v5-47-0-questoes-reais';
import { GameState } from '../state.js?v=20260717-v5-47-0-questoes-reais';
import { salvarAvatar } from '../api.js?v=20260717-v5-47-0-questoes-reais';

const AVAILABLE_AVATARS = ['cadete-azul', 'exploradora'];

export class AvatarScene extends Phaser.Scene {
  constructor() {
    super('AvatarScene');
    this.cardUi = [];
  }

  create() {
    // A mesma instância da cena pode ser reutilizada. Limpar referências antigas evita
    // que o botão Avatar tente atualizar objetos destruídos ao voltar do mapa.
    this.cardUi = [];
    this.savingAvatar = false;
    this.cameras.main.setBackgroundColor('#061426');

    if (!AVAILABLE_AVATARS.includes(GameState.avatarSelecionado)) {
      GameState.atualizarAvatar('cadete-azul');
    }

    this.add.image(640, 360, 'avatar-selection-v5461')
      .setDisplaySize(1280, 720)
      .setDepth(0);

    const avatarMap = new Map(AVATARS.map((avatar) => [avatar.id, avatar]));
    const cardDefs = [
      { id: 'cadete-azul', x: 469, y: 363, width: 295, height: 428, buttonY: 552 },
      { id: 'exploradora', x: 794, y: 364, width: 292, height: 424, buttonY: 552 }
    ];

    cardDefs.forEach((card) => {
      const avatar = avatarMap.get(card.id);
      if (avatar) this.createAvatarCard(card, avatar);
    });

    this.createActionButton(459, 634, 328, 60, () => this.saveAndStart(), false);
    this.createActionButton(835, 634, 327, 60, () => this.scene.start('MenuScene'), true);

    const keys = this.input.keyboard.addKeys('LEFT,RIGHT,ENTER,ESC');
    keys.LEFT.on('down', () => this.selectAvatar('cadete-azul'));
    keys.RIGHT.on('down', () => this.selectAvatar('exploradora'));
    keys.ENTER.on('down', () => this.saveAndStart());
    keys.ESC.on('down', () => this.scene.start('MenuScene'));

    this.add.text(640, 707, '←/→: trocar avatar  •  ENTER: salvar  •  ESC: voltar', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      color: '#d8c080',
      backgroundColor: 'rgba(4, 15, 30, 0.74)',
      padding: { x: 10, y: 4 }
    }).setOrigin(0.5, 1).setDepth(30).setAlpha(0.72);

    this.refreshSelectionState();
  }

  createAvatarCard(card, avatar) {
    const hit = this.add.rectangle(card.x, card.y, card.width, card.height, 0xffffff, 0.001)
      .setDepth(20)
      .setInteractive({ useHandCursor: true });

    const hover = this.add.rectangle(card.x, card.y, card.width - 8, card.height - 8, 0xf3d58a, 0)
      .setDepth(18)
      .setStrokeStyle(2, 0xffffff, 0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);

    const selectedBorder = this.add.rectangle(card.x, card.y, card.width, card.height, 0xffffff, 0)
      .setDepth(19)
      .setStrokeStyle(4, card.id === 'cadete-azul' ? 0xffd778 : 0x68a8ff, 0)
      .setAlpha(0);

    const buttonBg = this.add.rectangle(card.x, card.buttonY, 192, 42, 0x0b1f3a, 0.68)
      .setDepth(21)
      .setStrokeStyle(2, 0xffffff, 0.18);

    const buttonLabel = this.add.text(card.x, card.buttonY, 'Clique para escolher', {
      fontFamily: 'Georgia, Times New Roman, serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#d5e7ff'
    }).setOrigin(0.5).setDepth(22);

    const selectedStar = this.add.text(card.x, card.y - 201, '✦', {
      fontFamily: 'Georgia, serif',
      fontSize: '20px',
      color: '#ffd778'
    }).setOrigin(0.5).setDepth(22).setAlpha(0);

    const select = () => this.selectAvatar(avatar.id);
    hit.on('pointerover', () => this.onCardHover(hover, avatar.id, true));
    hit.on('pointerout', () => this.onCardHover(hover, avatar.id, false));
    hit.on('pointerdown', select);

    this.cardUi.push({ avatarId: avatar.id, hit, hover, selectedBorder, buttonBg, buttonLabel, selectedStar, card });
  }

  onCardHover(hover, avatarId, isOver) {
    const selected = GameState.avatarSelecionado === avatarId;
    const fill = avatarId === 'cadete-azul' ? 0xf3d58a : 0x64b5ff;
    const alpha = selected ? (isOver ? 0.14 : 0.09) : (isOver ? 0.10 : 0);
    const strokeAlpha = selected ? (isOver ? 0.85 : 0.58) : (isOver ? 0.42 : 0);
    hover.setFillStyle(fill, alpha);
    hover.setStrokeStyle(2, fill, strokeAlpha);
    this.tweens.add({ targets: hover, alpha: isOver || selected ? 1 : 0, duration: 120, ease: 'Sine.easeOut' });
  }

  refreshSelectionState() {
    this.cardUi.forEach((ui) => {
      const selected = GameState.avatarSelecionado === ui.avatarId;
      const gold = ui.avatarId === 'cadete-azul';
      const fill = gold ? 0xd6a84f : 0x10355f;
      const stroke = gold ? 0xffde87 : 0x63b0ff;
      const labelColor = selected ? (gold ? '#1b1307' : '#ffffff') : '#d5e7ff';
      const labelText = selected ? 'Selecionado' : 'Clique para escolher';

      ui.selectedBorder.setStrokeStyle(4, stroke, selected ? 0.9 : 0);
      ui.selectedBorder.setAlpha(selected ? 1 : 0);
      ui.buttonBg.setFillStyle(fill, selected ? (gold ? 0.96 : 0.84) : 0.72);
      ui.buttonBg.setStrokeStyle(2, stroke, selected ? 0.95 : 0.24);
      ui.buttonLabel.setText(labelText).setColor(labelColor);
      ui.selectedStar.setAlpha(selected ? 1 : 0);
      this.onCardHover(ui.hover, ui.avatarId, false);
    });
  }

  selectAvatar(avatarId) {
    if (GameState.avatarSelecionado === avatarId) return;
    GameState.atualizarAvatar(avatarId);
    this.refreshSelectionState();
    this.cameras.main.flash(90, 243, 213, 138, false);
  }

  createActionButton(x, y, width, height, callback, secondary = false) {
    const zone = this.add.rectangle(x, y, width, height, 0xffffff, 0.001)
      .setDepth(25)
      .setInteractive({ useHandCursor: true });

    const hover = this.add.rectangle(x, y, width - 8, height - 8, secondary ? 0x4c9bf2 : 0xf3d58a, 0)
      .setDepth(24)
      .setStrokeStyle(2, secondary ? 0x76b9ff : 0xffe29b, 0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);

    zone.on('pointerover', () => {
      hover.setFillStyle(secondary ? 0x4c9bf2 : 0xf3d58a, 0.12);
      hover.setStrokeStyle(2, secondary ? 0x76b9ff : 0xffe29b, 0.60);
      this.tweens.add({ targets: hover, alpha: 1, duration: 120 });
    });
    zone.on('pointerout', () => this.tweens.add({ targets: hover, alpha: 0, duration: 140 }));
    zone.on('pointerdown', () => {
      this.cameras.main.flash(100, 243, 213, 138, false);
      callback();
    });
  }

  async saveAndStart() {
    if (this.savingAvatar) return;
    this.savingAvatar = true;

    const avatarId = AVAILABLE_AVATARS.includes(GameState.avatarSelecionado)
      ? GameState.avatarSelecionado
      : 'cadete-azul';

    GameState.atualizarAvatar(avatarId);
    try {
      await salvarAvatar(avatarId);
    } catch (error) {
      // O avatar já foi persistido localmente; uma falha da API não pode interromper o jogo.
      console.warn('[Arena Axoriin] Avatar salvo apenas localmente.', error);
    } finally {
      this.scene.start('MapScene');
    }
  }
}
