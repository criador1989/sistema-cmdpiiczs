import { GAME_CONFIG, LOCATIONS, DISTRICTS, AVATARS } from '../config.js?v=20260718-v5-46-7-joystick-mobile-landscape';
import { GameState } from '../state.js?v=20260718-v5-46-7-joystick-mobile-landscape';
import { Player } from '../entities/Player.js?v=20260718-v5-46-7-joystick-mobile-landscape';

export class MapScene extends Phaser.Scene {
  constructor() { super('MapScene'); }

  create() {
    try {
      const { world } = GAME_CONFIG;
      this.cameras.main.setBackgroundColor('#071529');
      this.bounds = new Phaser.Geom.Rectangle(70, 70, world.width - 140, world.height - 140);
      this.virtualDirection = { up: false, down: false, left: false, right: false };
      this.virtualStick = { active: false, pointerId: null, x: 0, y: 0, magnitude: 0 };
      this.nearestLocation = null;
      this.lockedNotice = null;
      this.approachNotice = null;
      this.destinationMarker = null;
      this.currentDistrictId = null;
      this.mapOpen = false;
      this.obstacles = [];
      this.waterZones = [];
      this.wildlife = [];
      this.unifiedPlazaPilot = true;
      this.centralArtV2 = false;
      this.riverWaterMain = null;
      this.riverWaterOverlay = null;
      this.riverWaterFlow = null;
      this.riverWaterHighlights = null;
      this.riverSparkles = [];
      this.riverRippleEvent = null;
      this.riverAnimTiles = [];
      this.fishSprites = [];
      this.fishJumpSprites = [];
      this.avatarTransitionInProgress = false;
      this.mapLoadFailed = false;

      this.drawWorld();
      this.createZooAnimalAnimations();
      this.createBirdAnimations();
      this.createFishAnimations();
      // V5.42: o terreno completo agora é uma única arte-base.
      // Mantemos personagens, HUD, missões e as edificações refinadas em camadas superiores.
      this.drawLocations();
      // V5.45.2: insere a fonte central da praça diretamente no miolo do círculo principal.
      // Ela fica no espaço vazio da Praça Central, acima do piso e abaixo das nuvens/HUD.
      this.createCentralPlazaFountain();
      // V5.43.4: ativa explicitamente as nuvens do cenário.
      // Antes os assets eram carregados, mas a camada não era instanciada no mapa.
      this.createCloudLayers();
      this.createBirdFlocks();
      this.createRiverFish();

      const start = GAME_CONFIG.playerStart;
      let px = Number.isFinite(GameState.player.x) ? GameState.player.x : start.x;
      let py = Number.isFinite(GameState.player.y) ? GameState.player.y : start.y;
      try {
        const layoutKey = 'axoriin_arena_map_layout';
        if (localStorage.getItem(layoutKey) !== 'map-ground-v543-0') {
          px = start.x;
          py = start.y;
          GameState.player.x = px;
          GameState.player.y = py;
          localStorage.setItem(layoutKey, 'map-ground-v543-0');
        }
      } catch (_) {
        // O jogo continua funcionando mesmo se o armazenamento local estiver indisponível.
      }
      px = Phaser.Math.Clamp(px, this.bounds.x, this.bounds.right);
      py = Phaser.Math.Clamp(py, this.bounds.y, this.bounds.bottom);
      this.player = new Player(this, px, py);

      this.setupCamera();
      this.setupInput();
      this.createHud();
      this.createGuidePanel();
      this.createInteractionHint();
      this.createMobileControls();
      this.createMapOverlay();
      this.createDistrictToast();
      this.createSparkleLoop();
      this.updateDistrictIndicator(true);
    } catch (error) {
      this.mapLoadFailed = true;
      console.error('[Arena Axoriin] Falha ao abrir a cidade viva:', error);
      this.showMapLoadError(error);
    }
  }

  setupCamera() {
    const { world, camera } = GAME_CONFIG;
    const main = this.cameras.main;
    main.setBounds(0, 0, world.width, world.height);
    main.setZoom(camera.zoom);
    main.startFollow(this.player.container, true, camera.lerpX, camera.lerpY);
    main.setDeadzone(camera.deadzoneWidth, camera.deadzoneHeight);
    main.roundPixels = true;
    main.fadeIn(550, 7, 21, 41);
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,E,ESC,M');
    this.keys.E.on('down', () => this.tryInteract());
    this.keys.M.on('down', () => this.toggleMapOverlay());
    this.keys.ESC.on('down', () => {
      if (this.mapOpen) this.toggleMapOverlay(false);
      else this.scene.start('MenuScene');
    });
  }

  showMapLoadError(error) {
    this.children.removeAll(true);
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(1).setScroll(0, 0).setBackgroundColor('#071529');
    this.add.text(640, 235, 'Não foi possível abrir a cidade', {
      fontFamily: 'system-ui, sans-serif', fontSize: '34px', fontStyle: '900', color: '#f3d58a'
    }).setOrigin(0.5).setScrollFactor(0);
    this.add.text(640, 310, 'O jogo encontrou um erro ao montar o mapa. Recarregue a página. Se continuar, copie a mensagem abaixo.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#ffffff', align: 'center', wordWrap: { width: 760 }
    }).setOrigin(0.5).setScrollFactor(0);
    const message = error?.message || String(error || 'Erro desconhecido');
    this.add.text(640, 390, message, {
      fontFamily: 'monospace', fontSize: '15px', color: '#ffb4b4', backgroundColor: '#0b1f3a',
      padding: { x: 18, y: 14 }, align: 'center', wordWrap: { width: 760 }
    }).setOrigin(0.5).setScrollFactor(0);
    const button = this.add.rectangle(640, 500, 250, 54, 0xd6a84f, 1)
      .setStrokeStyle(2, 0xf3d58a, 1).setInteractive({ useHandCursor: true }).setScrollFactor(0);
    this.add.text(640, 500, 'Voltar ao menu', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#071529'
    }).setOrigin(0.5).setScrollFactor(0);
    button.on('pointerdown', () => this.scene.start('MenuScene'));
  }

  update(time, delta) {
    if (this.mapLoadFailed || !this.player || !this.cursors || !this.keys) return;

    if (this.mapOpen) {
      this.updateMapPlayerMarker();
      return;
    }

    if (this.riverWaterMain) {
      this.riverWaterMain.tilePositionY -= delta * 0.020;
      this.riverWaterMain.tilePositionX += delta * 0.004;
    }
    if (this.riverWaterOverlay) {
      this.riverWaterOverlay.tilePositionY += delta * 0.014;
      this.riverWaterOverlay.tilePositionX -= delta * 0.008;
    }
    if (this.riverWaterFlow) {
      this.riverWaterFlow.tilePositionY -= delta * 0.060;
      this.riverWaterFlow.tilePositionX += delta * 0.016;
    }
    if (this.riverWaterHighlights) {
      this.riverWaterHighlights.tilePositionY -= delta * 0.034;
      this.riverWaterHighlights.tilePositionX -= delta * 0.010;
    }
    if (this.riverAnimTiles?.length) {
      this.riverAnimTiles.forEach((tile) => {
        tile.tilePositionY += delta * tile.getData('speedY');
        tile.tilePositionX += delta * tile.getData('speedX');
      });
    }

    const keyboardX =
      (this.cursors.right.isDown || this.keys.D.isDown ? 1 : 0) -
      (this.cursors.left.isDown || this.keys.A.isDown ? 1 : 0);
    const keyboardY =
      (this.cursors.down.isDown || this.keys.S.isDown ? 1 : 0) -
      (this.cursors.up.isDown || this.keys.W.isDown ? 1 : 0);

    const stick = this.virtualStick || { active: false, x: 0, y: 0, magnitude: 0 };
    const useAnalog = stick.active && stick.magnitude > 0.001;
    const inputX = useAnalog ? stick.x : keyboardX;
    const inputY = useAnalog ? stick.y : keyboardY;
    const magnitude = useAnalog ? stick.magnitude : (keyboardX || keyboardY ? 1 : 0);

    const direction = {
      x: inputX,
      y: inputY,
      magnitude,
      left: inputX < -0.18,
      right: inputX > 0.18,
      up: inputY < -0.18,
      down: inputY > 0.18
    };

    this.player.update(delta, direction, this.bounds, this.obstacles, this.waterZones);
    GameState.player.x = this.player.x;
    GameState.player.y = this.player.y;

    this.nearestLocation = this.findNearestLocation();
    this.updateInteractionHint();
    this.updateDistrictIndicator();
    this.updateMapPlayerMarker();
    this.updateHudMiniMap();
  }


  createCentralPlazaFountain() {
    // V5.45.3 — fonte posicionada no centro real da rosa dos ventos.
    if (this.centralPlazaFountain) return;

    const x = 1980;
    const y = 1080;

    const shadow = this.add.ellipse(x, y + 72, 236, 50, 0x071529, 0.12)
      .setDepth(y + 55);

    const fountain = this.add.image(x, y, 'central-v2-fountain-v5454')
      .setOrigin(0.5, 0.79)
      .setDisplaySize(300, 280)
      .setDepth(y + 70);

    this.centralPlazaFountain = { fountain, shadow };

    // Colisão apenas na base inferior da fonte, permitindo circulação natural ao redor.
    this.obstacles.push(new Phaser.Geom.Rectangle(x - 118, y - 34, 236, 86));

    this.createFountainLife(x, y);
  }

  drawWorld() {
    const { world, colors } = GAME_CONFIG;

    const base = this.add.graphics().setDepth(-125);
    base.fillStyle(colors.navy, 1);
    base.fillRect(0, 0, world.width, world.height);

    // V5.42: mapa-base único. O chão, rio, pontes, estradas, vegetação e áreas dos prédios
    // estão numa única arte final para eliminar emendas, sobreposições e duplicações.
    this.add.image(0, 0, 'arena-ground-complete-v542')
      .setOrigin(0)
      .setDisplaySize(world.width, world.height)
      .setDepth(-120);

    // V5.43.8: efeito real aplicado no rio que está na arte-base, na lateral esquerda.
    this.createLeftRiverAnimationLayer();

    // Moldura sutil do mundo.
    const border = this.add.graphics().setDepth(-80);
    border.lineStyle(6, colors.gold, 0.20);
    border.strokeRoundedRect(45, 45, world.width - 90, world.height - 90, 70);

    // V5.42.5: zonas de água reajustadas para seguir melhor o curso do rio do mapa-base.
    // A água ocupa uma faixa mais orgânica na lateral esquerda, com largura variável.
    this.waterZones.push(new Phaser.Geom.Rectangle(0, 0, 560, 700));
    this.waterZones.push(new Phaser.Geom.Rectangle(0, 620, 520, 560));
    this.waterZones.push(new Phaser.Geom.Rectangle(0, 1120, 500, 760));
    this.waterZones.push(new Phaser.Geom.Rectangle(0, 1820, 470, 780));
    this.waterZones.push(new Phaser.Geom.Rectangle(420, 0, 110, 240));
    this.waterZones.push(new Phaser.Geom.Rectangle(400, 240, 90, 260));
    this.waterZones.push(new Phaser.Geom.Rectangle(380, 1220, 90, 240));
    this.waterZones.push(new Phaser.Geom.Rectangle(365, 1980, 80, 300));

    this.defineEnvironmentCollisions();
  }

  createLeftRiverAnimationLayer() {
    if (this.leftRiverAnimationCreated) return;
    this.leftRiverAnimationCreated = true;

    // V5.44.6 — máscara derivada da própria arte-base do mapa.
    // O efeito agora usa um recorte do rio seguindo o curso real e respeitando a ponte.
    const maskImage = this.make.image({ x: 0, y: 0, key: 'arena-river-mask', add: false });
    const riverMask = maskImage.createBitmapMask();

    const bounds = {
      minX: 0,
      minY: 0,
      maxX: 930,
      maxY: 2600
    };
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const centerX = bounds.minX + width / 2;
    const centerY = bounds.minY + height / 2;

    const shimmer = this.add.tileSprite(centerX, centerY, width + 120, height + 120, 'arena-river-water')
      .setOrigin(0.5)
      .setDepth(-119)
      .setAlpha(0.34)
      .setTint(0xf0fdff)
      .setMask(riverMask);
    shimmer.setData('speedX', 0.0034);
    shimmer.setData('speedY', 0.020);
    this.riverAnimTiles.push(shimmer);

    const flow = this.add.tileSprite(centerX, centerY, width + 140, height + 140, 'arena-river-flow-overlay')
      .setOrigin(0.5)
      .setDepth(-118)
      .setAlpha(1.00)
      .setTint(0xffffff)
      .setMask(riverMask);
    flow.setData('speedX', 0.0085);
    flow.setData('speedY', 0.060);
    this.riverAnimTiles.push(flow);

    const highlights = this.add.tileSprite(centerX, centerY, width + 180, height + 180, 'arena-river-highlights-overlay')
      .setOrigin(0.5)
      .setDepth(-117)
      .setAlpha(0.72)
      .setTint(0xffffff)
      .setMask(riverMask);
    highlights.setData('speedX', -0.0045);
    highlights.setData('speedY', 0.026);
    this.riverAnimTiles.push(highlights);

    const sparklePoints = [
      [700, 120], [610, 280], [500, 470], [448, 650], [455, 830],
      [460, 1130], [435, 1335], [392, 1550], [320, 1775], [250, 1990], [185, 2240]
    ];

    const ripplePoints = [
      [675, 165], [560, 355], [472, 575], [450, 760], [455, 1015],
      [444, 1245], [410, 1450], [350, 1680], [282, 1915], [210, 2150]
    ];

    this.createLeftRiverSparkles(sparklePoints, ripplePoints);
  }

  createLeftRiverSparkles(sparklePoints = [], ripplePoints = []) {
    if (!this.anims.exists('river-sparkle-cycle')) {
      this.anims.create({
        key: 'river-sparkle-cycle',
        frames: this.anims.generateFrameNumbers('arena-river-sparkle-sheet', { start: 0, end: 3 }),
        frameRate: 7,
        repeat: -1,
        yoyo: true
      });
    }

    const fallbackSparkles = [
      [490, 150], [462, 370], [450, 620], [432, 1140], [355, 1560], [238, 1990], [135, 2350]
    ];
    const fallbackRipples = [
      [500, 200], [475, 520], [458, 690], [430, 1240], [330, 1680], [195, 2140]
    ];
    const sparkles = sparklePoints.length ? sparklePoints : fallbackSparkles;
    const ripples = ripplePoints.length ? ripplePoints : fallbackRipples;

    this.riverSparkles.forEach((item) => item.destroy());
    this.riverSparkles = sparkles.map(([x, y], index) => {
      const sparkle = this.add.sprite(x, y, 'arena-river-sparkle-sheet', 0)
        .setDepth(-116)
        .setScale(0.26 + (index % 3) * 0.05)
        .setAlpha(0.58 + (index % 2) * 0.12);
      sparkle.play('river-sparkle-cycle');
      this.tweens.add({
        targets: sparkle,
        alpha: { from: Math.max(0.30, sparkle.alpha - 0.14), to: Math.min(0.95, sparkle.alpha + 0.18) },
        scale: { from: sparkle.scale * 0.96, to: sparkle.scale * 1.08 },
        duration: 1180 + index * 90,
        repeat: -1,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });
      return sparkle;
    });

    if (this.riverRippleEvent) {
      this.riverRippleEvent.remove(false);
      this.riverRippleEvent = null;
    }

    this.riverRippleEvent = this.time.addEvent({
      delay: 820,
      loop: true,
      callback: () => {
        const point = Phaser.Utils.Array.GetRandom(ripples);
        this.spawnRiverRipple(point[0] + Phaser.Math.Between(-10, 10), point[1] + Phaser.Math.Between(-8, 8));
      }
    });
  }


  spawnRiverRipple(x, y) {
    const ripple = this.add.ellipse(x, y, 42, 10, 0xcff9ff, 0)
      .setDepth(-115)
      .setStrokeStyle(2, 0xf8ffff, 0.72);
    this.tweens.add({
      targets: ripple,
      scaleX: 1.95,
      scaleY: 1.48,
      alpha: 0,
      duration: 1180,
      ease: 'Sine.easeOut',
      onStart: () => ripple.setAlpha(0.60),
      onComplete: () => ripple.destroy()
    });
  }

  defineEnvironmentCollisions() {
    // V5.43.0 — removemos as barreiras técnicas espalhadas pelo mapa para
    // liberar totalmente as ruas de pedra. Agora as colisões do cenário
    // ficam concentradas nas próprias edificações, evitando bloqueios
    // invisíveis e obrigando menos contornos.
  }

  createGrassTextureLayer() {
    const { world } = GAME_CONFIG;
    const makeRoundedMask = (x, y, width, height, radius) => {
      const shape = this.make.graphics({ x: 0, y: 0, add: false });
      shape.fillStyle(0xffffff, 1);
      shape.fillRoundedRect(x, y, width, height, radius);
      return shape.createGeometryMask();
    };

    this.add.tileSprite(80, 80, world.width - 160, world.height - 160, 'arena-grass-01')
      .setOrigin(0)
      .setDepth(-112)
      .setMask(makeRoundedMask(80, 80, world.width - 160, world.height - 160, 55));

    [
      [2740, 180, 720, 1120, 100],
      [2740, 1320, 720, 1080, 105]
    ].forEach(([x, y, width, height, radius]) => {
      this.add.tileSprite(x, y, width, height, 'arena-grass-02')
        .setOrigin(0)
        .setDepth(-111)
        .setAlpha(0.94)
        .setMask(makeRoundedMask(x, y, width, height, radius));
    });
  }

  drawGroundcoverLayer() {
    const patches = [
      ['arena-groundcover-01', 220, 260, 0.34, false],
      ['arena-groundcover-02', 500, 220, 0.28, true],
      ['arena-groundcover-03', 850, 240, 0.30, false],
      ['arena-groundcover-01', 1130, 340, 0.26, true],
      ['arena-groundcover-02', 360, 820, 0.31, false],
      ['arena-groundcover-03', 610, 920, 0.27, true],
      ['arena-groundcover-01', 850, 1120, 0.25, false],
      ['arena-groundcover-02', 1190, 1040, 0.23, true],
      ['arena-groundcover-03', 360, 1480, 0.29, false],
      ['arena-groundcover-01', 610, 1570, 0.27, true],
      ['arena-groundcover-02', 1040, 1510, 0.24, false],
      ['arena-groundcover-03', 1270, 1630, 0.24, true],
      ['arena-groundcover-01', 280, 2240, 0.30, false],
      ['arena-groundcover-02', 1230, 2280, 0.25, true],
      ['arena-groundcover-03', 1730, 2200, 0.27, false],
      ['arena-groundcover-01', 2040, 1950, 0.24, true],
      ['arena-groundcover-02', 2260, 2160, 0.25, false],
      ['arena-groundcover-03', 2310, 710, 0.23, true],
      ['arena-groundcover-01', 2240, 930, 0.24, false],
      ['arena-groundcover-02', 2300, 1510, 0.22, true],
      ['arena-groundcover-03', 2395, 340, 0.22, false],
      ['arena-groundcover-03', 2710, 310, 0.24, true],
      ['arena-groundcover-01', 2860, 300, 0.28, false],
      ['arena-groundcover-02', 3320, 340, 0.27, true],
      ['arena-groundcover-03', 2870, 1190, 0.25, false],
      ['arena-groundcover-01', 3310, 1180, 0.29, true],
      ['arena-groundcover-03', 2775, 1470, 0.25, false],
      ['arena-groundcover-02', 2930, 1430, 0.29, true],
      ['arena-groundcover-01', 3330, 1510, 0.31, false],
      ['arena-groundcover-03', 2870, 2050, 0.28, true],
      ['arena-groundcover-02', 3160, 2350, 0.30, false],
      ['arena-groundcover-01', 3390, 2200, 0.27, true]
    ];

    patches.forEach(([key, x, y, scale, flipX]) => {
      this.add.image(x, y, key)
        .setOrigin(0.5, 0.82)
        .setScale(flipX ? -scale : scale, scale)
        .setDepth(-34 + Math.round(y / 10000))
        .setAlpha(0.98);
    });
  }


  drawIllustratedTreeLayer() {
    // V5.37.1: arvores substituidas pela nova familia ilustrada com PNG recortado e transparencia real.
    // Elas ficam fora das faixas principais de circulação para preservar rotas e interações.
    const trees = [
      // Oeste / bairro cultural
      ['tree-v537-round', 150, 215, 150, 185, false],
      ['tree-v537-pine', 315, 185, 112, 190, true],
      ['tree-v537-ancient', 520, 205, 190, 205, false],
      ['tree-v537-blossom', 760, 195, 150, 185, true],
      ['tree-v537-columnar', 1070, 235, 112, 195, false],
      ['tree-v537-pine', 165, 760, 105, 178, false],
      ['tree-v537-round', 335, 820, 145, 178, true],
      ['tree-v537-blossom', 540, 845, 142, 176, false],

      // Centro, sem bloquear entradas
      ['tree-v537-round', 1460, 880, 128, 162, false],
      ['tree-v537-pine', 1840, 900, 96, 170, true],
      ['tree-v537-blossom', 1260, 1210, 125, 158, false],
      ['tree-v537-ancient', 2035, 1260, 154, 180, true],
      ['tree-v537-columnar', 950, 1860, 100, 178, false],
      ['tree-v537-blossom', 2280, 1870, 128, 166, true],
      ['tree-v537-round', 1750, 2220, 140, 172, false],
      ['tree-v537-pine', 2050, 2260, 102, 182, true],

      // Zoológico: bordas, sem invadir acesso principal
      ['tree-v537-ancient', 2850, 250, 178, 202, false],
      ['tree-v537-pine', 3045, 235, 104, 188, true],
      ['tree-v537-round', 3230, 250, 142, 178, false],
      ['tree-v537-columnar', 3420, 295, 98, 184, true],
      ['tree-v537-blossom', 2860, 520, 136, 172, false],
      ['tree-v537-pine', 3440, 540, 104, 184, false],
      ['tree-v537-round', 2845, 785, 138, 174, true],
      ['tree-v537-ancient', 3430, 805, 172, 198, false],
      ['tree-v537-columnar', 2890, 1210, 96, 182, false],
      ['tree-v537-blossom', 3400, 1200, 136, 172, true],

      // Floresta: árvores nas laterais da trilha, centro livre
      ['tree-v537-ancient', 2840, 1390, 176, 204, false],
      ['tree-v537-pine', 3040, 1385, 104, 188, true],
      ['tree-v537-round', 3270, 1400, 142, 178, false],
      ['tree-v537-columnar', 3420, 1420, 96, 184, true],
      ['tree-v537-blossom', 2860, 1595, 136, 172, true],
      ['tree-v537-pine', 3060, 1640, 104, 188, false],
      ['tree-v537-round', 3400, 1605, 142, 178, false],
      ['tree-v537-pine', 2860, 2070, 104, 188, false],
      ['tree-v537-round', 3420, 2090, 142, 178, true],
      ['tree-v537-ancient', 2980, 2350, 176, 204, false],
      ['tree-v537-blossom', 3260, 2370, 136, 172, true]
    ];

    trees.forEach(([key, x, y, width, height, flip]) => {
      this.createIllustratedTree(key, x, y, width, height, flip);
    });
  }

  createIllustratedTree(key, x, y, width, height, flip = false) {
    const tree = this.add.image(x, y, key)
      .setOrigin(0.5, 0.92)
      .setDisplaySize(width, height)
      .setFlipX(flip)
      .setDepth(y + 18);
    // V5.43.0 — as árvores permanecem decorativas; sem bloqueios invisíveis nas ruas.

    return tree;
  }

  drawDistrictGrounds(g) {
    // Zonas técnicas fixas. A arte final será produzida exatamente sobre estas áreas.
    g.fillStyle(0x3b9563, 0.24);
    g.fillRoundedRect(130, 130, 1120, 760, 90); // Bairro residencial

    g.fillStyle(0x4c9569, 0.20);
    g.fillRoundedRect(700, 880, 720, 720, 82); // Bairro cultural

    g.fillStyle(0x4f9f6c, 0.18);
    g.fillRoundedRect(1280, 480, 760, 760, 88); // Centro cívico

    g.fillStyle(0x4f9f6c, 0.15);
    g.fillRoundedRect(1320, 1180, 650, 500, 70); // Centro / praça

    g.fillStyle(0x568d6c, 0.18);
    g.fillRoundedRect(1950, 930, 500, 720, 78); // Centro histórico

    g.fillStyle(0x3b9563, 0.25);
    g.fillRoundedRect(300, 1580, 1450, 760, 85); // Campus sul

    g.fillStyle(0x37875b, 0.22);
    g.fillRoundedRect(2740, 180, 720, 1120, 100); // Parque / zoológico

    g.fillStyle(0x27784f, 0.28);
    g.fillRoundedRect(2740, 1320, 720, 1080, 105); // Reserva / floresta

  }

  drawRiver(g) {
    const riverOffsetX = 180;
    const baseRiverPoints = [
      [2470, 80], [2700, 80], [2670, 390], [2730, 720], [2665, 1030], [2720, 1370],
      [2660, 1690], [2715, 2020], [2680, 2520], [2440, 2520], [2470, 2020], [2415, 1690],
      [2475, 1370], [2420, 1030], [2480, 720], [2435, 390]
    ];
    const riverPoints = baseRiverPoints.map(([x, y]) => [x + riverOffsetX, y]);

    const minX = 2415 + riverOffsetX;
    const maxX = 2730 + riverOffsetX;
    const minY = 80;
    const maxY = 2520;
    const width = maxX - minX;
    const height = maxY - minY;

    const riverMask = this.buildRiverMask(riverPoints);

    this.riverWaterMain = this.add.tileSprite(minX, minY, width, height, 'arena-river-water')
      .setOrigin(0)
      .setDepth(-109)
      .setAlpha(1.00)
      .setMask(riverMask);

    this.riverWaterOverlay = this.add.tileSprite(minX - 18, minY - 18, width + 36, height + 36, 'arena-river-water')
      .setOrigin(0)
      .setDepth(-108)
      .setScale(1.02)
      .setAlpha(0.24)
      .setTint(0xc8f6ff)
      .setMask(riverMask);

    this.riverWaterFlow = this.add.tileSprite(minX - 30, minY - 30, width + 60, height + 60, 'arena-river-flow-overlay')
      .setOrigin(0)
      .setDepth(-107)
      .setAlpha(0.82)
      .setMask(riverMask);

    this.riverWaterHighlights = this.add.tileSprite(minX - 18, minY - 18, width + 36, height + 36, 'arena-river-highlights-overlay')
      .setOrigin(0)
      .setDepth(-106)
      .setAlpha(0.74)
      .setTint(0xf2feff)
      .setMask(riverMask);

    // Margens e reforço visual do leito.
    g.lineStyle(20, 0x2b6c9f, 0.22);
    g.beginPath();
    g.moveTo(riverPoints[0][0], riverPoints[0][1]);
    for (let i = 1; i < riverPoints.length; i++) g.lineTo(riverPoints[i][0], riverPoints[i][1]);
    g.closePath();
    g.strokePath();

    g.lineStyle(6, 0xd8fbff, 0.18);
    g.beginPath();
    g.moveTo(2492 + riverOffsetX, 165);
    g.lineTo(2634 + riverOffsetX, 430);
    g.lineTo(2515 + riverOffsetX, 780);
    g.lineTo(2628 + riverOffsetX, 1180);
    g.lineTo(2510 + riverOffsetX, 1565);
    g.lineTo(2625 + riverOffsetX, 1985);
    g.lineTo(2540 + riverOffsetX, 2410);
    g.strokePath();

    this.createRiverAnimationAssets(riverOffsetX);

    // Ponte Norte: cidade -> zoológico. Ponte Sul: cidade -> floresta.
    this.drawBridge(g, 2365, 1030, 445, 78);
    this.drawBridge(g, 2370, 1710, 440, 78);

    // Zonas navegáveis, interrompidas nas pontes.
    this.waterZones.push(
      new Phaser.Geom.Rectangle(2425 + riverOffsetX, 80, 305, 900),
      new Phaser.Geom.Rectangle(2425 + riverOffsetX, 1130, 305, 520),
      new Phaser.Geom.Rectangle(2425 + riverOffsetX, 1810, 305, 710),
      new Phaser.Geom.Rectangle(2500 + riverOffsetX, 420, 70, 180),
      new Phaser.Geom.Rectangle(2490 + riverOffsetX, 2020, 76, 220)
    );
  }

  buildRiverMask(riverPoints) {
    const maskShape = this.make.graphics({ x: 0, y: 0, add: false });
    maskShape.fillStyle(0xffffff, 1);
    maskShape.beginPath();
    maskShape.moveTo(riverPoints[0][0], riverPoints[0][1]);
    for (let i = 1; i < riverPoints.length; i++) maskShape.lineTo(riverPoints[i][0], riverPoints[i][1]);
    maskShape.closePath();
    maskShape.fillPath();
    return maskShape.createGeometryMask();
  }

  createRiverAnimationAssets(riverOffsetX = 0) {
    if (!this.anims.exists('river-sparkle-cycle')) {
      this.anims.create({
        key: 'river-sparkle-cycle',
        frames: this.anims.generateFrameNumbers('arena-river-sparkle-sheet', { start: 0, end: 3 }),
        frameRate: 7,
        repeat: -1,
        yoyo: true
      });
    }

    const sparklePoints = [
      [2520, 180], [2585, 380], [2500, 570], [2595, 790], [2515, 1040], [2590, 1290],
      [2505, 1560], [2580, 1825], [2500, 2080], [2575, 2340]
    ].map(([x, y]) => [x + riverOffsetX, y]);

    this.riverSparkles.forEach((item) => item.destroy());
    this.riverSparkles = sparklePoints.map(([x, y], index) => {
      const sparkle = this.add.sprite(x, y, 'arena-river-sparkle-sheet', 0)
        .setDepth(-105)
        .setScale(0.36 + (index % 3) * 0.05)
        .setAlpha(0.62 + (index % 2) * 0.14);
      sparkle.play('river-sparkle-cycle');
      this.tweens.add({
        targets: sparkle,
        alpha: { from: Math.max(0.42, sparkle.alpha - 0.16), to: Math.min(0.96, sparkle.alpha + 0.18) },
        scale: { from: sparkle.scale * 0.94, to: sparkle.scale * 1.12 },
        duration: 1300 + index * 110,
        repeat: -1,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });
      return sparkle;
    });

    if (this.riverRippleEvent) {
      this.riverRippleEvent.remove(false);
      this.riverRippleEvent = null;
    }
    const ripplePoints = [
      [2525, 300], [2575, 520], [2515, 920], [2590, 1180], [2510, 1490], [2580, 1760], [2525, 2170]
    ].map(([x, y]) => [x + riverOffsetX, y]);
    this.riverRippleEvent = this.time.addEvent({
      delay: 720,
      loop: true,
      callback: () => {
        const point = Phaser.Utils.Array.GetRandom(ripplePoints);
        this.spawnRiverRipple(point[0] + Phaser.Math.Between(-14, 14), point[1] + Phaser.Math.Between(-18, 18));
      }
    });
  }

  spawnRiverRippleLegacy(x, y) {
    const ripple = this.add.ellipse(x, y, 40, 10, 0xcff9ff, 0)
      .setDepth(-104)
      .setStrokeStyle(2, 0xeefcff, 0.58);
    this.tweens.add({
      targets: ripple,
      scaleX: 2.0,
      scaleY: 1.55,
      alpha: 0,
      duration: 1200,
      ease: 'Sine.easeOut',
      onStart: () => ripple.setAlpha(0.50),
      onComplete: () => ripple.destroy()
    });
  }

  drawBridge(g, x, y, width, height) {
    // Ponte de pedra para integrar naturalmente os caminhos até o lado leste.
    g.fillStyle(0x071529, 0.18);
    g.fillRoundedRect(x + 10, y + 14, width, height, 18);

    g.fillStyle(0x8e8371, 1);
    g.fillRoundedRect(x - 22, y - 12, 56, height + 24, 14);
    g.fillRoundedRect(x + width - 34, y - 12, 56, height + 24, 14);
    g.lineStyle(3, 0xd8cfba, 0.48);
    g.strokeRoundedRect(x - 22, y - 12, 56, height + 24, 14);
    g.strokeRoundedRect(x + width - 34, y - 12, 56, height + 24, 14);

    g.fillStyle(0x7a705f, 1);
    g.fillRoundedRect(x, y, width, height, 16);
    g.fillStyle(0xe6dcc3, 1);
    g.fillRoundedRect(x + 6, y + 6, width - 12, height - 12, 12);
    this.drawStoneMosaic(g, [[x + 18, y + height / 2], [x + width - 18, y + height / 2]], height - 14, {
      stoneColor: 0xf0e4ca,
      jointColor: 0xa58e67,
      alpha: 0.26,
      step: 21,
      across: 15,
      rows: 2
    });

    g.lineStyle(5, 0xe8dfc8, 0.92);
    g.lineBetween(x + 10, y + 10, x + width - 10, y + 10);
    g.lineBetween(x + 10, y + height - 10, x + width - 10, y + height - 10);
    g.lineStyle(3, 0x695c48, 0.84);
    for (let px = x + 18; px < x + width - 12; px += 58) {
      g.lineBetween(px, y - 8, px, y + 16);
      g.lineBetween(px, y + height - 16, px, y + height + 8);
      g.fillStyle(0xf3d58a, 0.68);
      g.fillCircle(px, y - 10, 4);
      g.fillCircle(px, y + height + 10, 4);
    }
    g.lineStyle(4, 0xf3d58a, 0.30);
    g.strokeRoundedRect(x, y, width, height, 16);
  }


  drawOrganicRoads(g) {
    // V5.40.2: reanalise completa das vias.
    // Regra aplicada: nao desenhar estrada em cima da ponte e nao criar ramais duplicados.
    const roads = [
      // Biblioteca -> Praca
      {
        name: 'biblioteca-praca',
        width: 74,
        main: true,
        points: [[650, 1320], [965, 1305], [1240, 1328], [1450, 1360], [1630, 1370]]
      },

      // Praca -> Prefeitura
      {
        name: 'praca-prefeitura',
        width: 72,
        main: true,
        points: [[1630, 1370], [1637, 1200], [1644, 1015], [1650, 820]]
      },

      // Praca -> Ponte Norte, parando antes da ponte.
      {
        name: 'praca-ponte-norte-oeste',
        width: 68,
        main: true,
        points: [[1630, 1370], [1900, 1372], [2155, 1375], [2328, 1210], [2370, 1086]]
      },

      // Saida da Ponte Norte -> Museu/Zoologico.
      {
        name: 'ponte-norte-leste-zoologico',
        width: 56,
        main: false,
        points: [[2810, 1086], [3000, 965], [3165, 800], [3315, 585]]
      },

      // Praca -> Escola Militar / Campus Sul.
      {
        name: 'praca-escola',
        width: 70,
        main: true,
        // eixo ajustado para passar ao lado do Laboratorio, e nao por baixo dele
        points: [[1630, 1370], [1700, 1530], [1660, 1710], [1505, 1870], [1260, 2025], [760, 2070], [360, 2130]]
      },

      // Escola/Campus -> Ponte Sul, parando antes da ponte.
      {
        name: 'campus-ponte-sul-oeste',
        width: 58,
        main: false,
        natural: true,
        points: [[1370, 1950], [1705, 1900], [2030, 1810], [2360, 1748]]
      },

      // Saida da Ponte Sul -> Floresta, um unico acesso.
      {
        name: 'ponte-sul-leste-floresta',
        width: 52,
        main: false,
        natural: true,
        points: [[2810, 1748], [3005, 1855], [3180, 2035], [3335, 2250]]
      },

      // Zoologico antigo / setor norte, uma unica via.
      {
        name: 'prefeitura-zoologico-oeste',
        width: 52,
        main: false,
        points: [[1650, 820], [1450, 730], [1190, 615], [920, 545], [620, 520], [300, 540]]
      },


    ];

    roads.forEach((road) => this.drawStoneRoad(g, road.points, road));

    // Juncoes discretas, apenas onde duas vias realmente se encontram.
    [
      [1630, 1370, false, 36],
      [1650, 820, false, 28],
      [1370, 1950, true, 24]
    ].forEach(([x, y, natural, radius]) => {
      g.fillStyle(natural ? 0xcbb487 : 0xe9dcc1, 1);
      g.fillCircle(x, y, radius);
      g.lineStyle(2, natural ? 0x8a714e : 0xa98f66, 0.18);
      g.strokeCircle(x, y, radius - 5);
      this.drawStoneMosaic(g, [[x - 16, y], [x + 16, y]], radius * 1.20, {
        stoneColor: natural ? 0xd7bf91 : 0xf0e4c9,
        jointColor: natural ? 0x8a714e : 0xa98f66,
        alpha: 0.16,
        step: 18,
        across: 13,
        rows: 2
      });
    });

    this.drawEntryRoads(g);
  }

  drawEntryRoads(g) {
    // V5.40.2: sem ramais extras aqui.
    // Os acessos ja estao resolvidos na malha principal; este metodo so marca o ponto interativo.
    LOCATIONS.filter((loc) => loc.entryX && loc.entryY && loc.id !== 'praca').forEach((loc) => {
      const padX = loc.entryX;
      const padY = loc.entryY;
      const width = loc.id === 'escola-militar' ? 70 : loc.id === 'zoologico' || loc.id === 'floresta' ? 62 : 56;
      const height = loc.id === 'escola-militar' ? 26 : 22;

      g.fillStyle(loc.id === 'floresta' ? 0xd1b981 : 0xeadfc5, 0.94);
      g.fillRoundedRect(padX - width / 2, padY - height / 2, width, height, 10);
      g.lineStyle(2, loc.color, 0.28);
      g.strokeRoundedRect(padX - width / 2, padY - height / 2, width, height, 10);
    });
  }

  strokePolyline(g, points, width, color, alpha) {
    if (!points.length) return;
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
    g.strokePath();
  }

  drawStoneRoad(g, points, road, isEntry = false) {
    const natural = !!road.natural;
    const width = road.width;
    const outer = natural ? 0x7c6849 : 0x766c5b;
    const curb = natural ? 0xbca375 : 0xb6a583;
    const fill = natural ? 0xcbb487 : 0xe9dcc1;
    const seam = natural ? 0x8a714e : 0xa98f66;

    // Sombra lateral discreta, sem duplicar a forma principal.
    this.strokePolyline(g, points.map(([x, y]) => [x + 6, y + 8]), width + 14, 0x071529, 0.10);

    // Estrada unica: base, meio-fio e miolo de pedra.
    this.strokePolyline(g, points, width + 18, outer, natural ? 0.80 : 0.88);
    this.strokePolyline(g, points, width + 11, curb, natural ? 0.90 : 0.96);
    this.strokePolyline(g, points, width, fill, 1);

    this.strokeRoadEdges(g, points, width * 0.5 - 3, 0xf5ecd8, natural ? 0.16 : 0.22);

    this.drawStoneMosaic(g, points, width - 8, {
      stoneColor: natural ? 0xd7bf91 : 0xf0e4c9,
      jointColor: seam,
      alpha: natural ? 0.16 : 0.20,
      step: natural ? 28 : 24,
      across: natural ? 18 : 16,
      rows: natural ? 2 : (road.main ? 3 : 2)
    });

    if (!isEntry) {
      this.drawRoadEdgePlanting(g, points, width + 24, natural ? 0x6d8c4f : 0x7da15c, natural ? 135 : 150, 72);
    }
  }

  strokeRoadEdges(g, points, offset, color, alpha) {
    if (!points || points.length < 2) return;
    [-1, 1].forEach((side) => {
      g.lineStyle(3, color, alpha);
      g.beginPath();
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(points.length - 1, i + 1)];
        const dx = next[0] - prev[0];
        const dy = next[1] - prev[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const px = x + nx * offset * side;
        const py = y + ny * offset * side;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    });
  }


  drawStoneMosaic(g, points, usableWidth, options = {}) {
    const stoneColor = options.stoneColor ?? 0xeedfc0;
    const jointColor = options.jointColor ?? 0xa58e67;
    const alpha = options.alpha ?? 0.24;
    const step = options.step ?? 22;
    const across = options.across ?? 16;
    const rows = options.rows ?? 3;

    this.stampAlongPolyline(points, step, (x, y, nx, ny, segmentIndex, localIndex) => {
      for (let row = -rows; row <= rows; row++) {
        const offset = row * across * 0.78 + (((segmentIndex + localIndex + row) % 2) * across * 0.24);
        if (Math.abs(offset) > usableWidth * 0.5) continue;
        const sx = x + nx * offset;
        const sy = y + ny * offset;
        const w = 11 + ((segmentIndex + row + localIndex) % 3) * 4;
        const h = 6 + ((segmentIndex + row) % 2) * 2;
        g.fillStyle(stoneColor, alpha);
        g.fillEllipse(sx, sy, w, h);
        g.lineStyle(1, jointColor, alpha * 0.95);
        g.strokeEllipse(sx, sy, w, h);
      }
    });
  }

  drawRoadEdgePlanting(g, points, distance, color, spacing = 60, jitter = 88) {
    this.stampAlongPolyline(points, spacing, (x, y, nx, ny, segmentIndex, localIndex) => {
      [-1, 1].forEach((side) => {
        if (((segmentIndex + localIndex + (side > 0 ? 1 : 0)) % 3) === 0) return;
        const offset = distance * side + (((segmentIndex + localIndex) % 2) ? 6 : -6);
        const px = x + nx * offset;
        const py = y + ny * offset;
        const rx = 8 + ((segmentIndex + localIndex) % 3) * 2;
        const ry = 4 + ((segmentIndex + localIndex) % 2) * 2;
        g.fillStyle(color, 0.16);
        g.fillEllipse(px, py, rx * 2.6, ry * 2.1);
      });
    });
  }

  stampAlongPolyline(points, step, callback) {
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      if (!length) continue;
      const ux = dx / length;
      const uy = dy / length;
      const nx = -uy;
      const ny = ux;
      let localIndex = 0;
      for (let d = step * 0.4; d < length - 4; d += step) {
        callback(x1 + ux * d, y1 + uy * d, nx, ny, i, localIndex);
        localIndex += 1;
      }
    }
  }

  drawRoadDashes(g, points, color = 0xf6e8a8, alpha = 0.45) {
    g.lineStyle(3, color, alpha);
    const dashLength = 20;
    const gap = 19;
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      if (!length) continue;
      const ux = dx / length;
      const uy = dy / length;
      for (let d = gap * 0.5; d < length - 4; d += dashLength + gap) {
        const end = Math.min(d + dashLength, length);
        g.lineBetween(x1 + ux * d, y1 + uy * d, x1 + ux * end, y1 + uy * end);
      }
    }
  }

  drawCrosswalk(g, x, y, vertical = false, span = 76) {
    g.fillStyle(0xffffff, 0.62);
    const bars = 6;
    const step = 10;
    for (let i = 0; i < bars; i++) {
      const offset = (i - (bars - 1) / 2) * step;
      if (vertical) g.fillRoundedRect(x - span / 2, y + offset - 3, span, 6, 2);
      else g.fillRoundedRect(x + offset - 3, y - span / 2, 6, span, 2);
    }
  }

  drawStonePathOverlay() {
    // V5.40: abordagem por peças PNG foi removida.
  }


  drawFineBuildingDetails(g) {
    // V5.41.1: acabamento fino e discreto.
    // Regra: nao cria novas ruas, nao cria patios grandes e nao cobre a grama.
    // Apenas pequenas pedras, bordas, canteiros e detalhes proximos aos predios.
    const details = [
      {
        id: 'biblioteca',
        stones: [[720, 1215], [755, 1235], [790, 1248], [885, 1240], [930, 1224], [965, 1195]],
        beds: [[665, 1165, 62, 24], [975, 1168, 60, 24], [700, 1256, 50, 20], [940, 1258, 48, 20]]
      },
      {
        id: 'prefeitura',
        stones: [[1540, 710], [1590, 730], [1650, 742], [1710, 730], [1760, 710]],
        beds: [[1488, 620, 62, 24], [1810, 622, 62, 24], [1538, 744, 48, 20], [1760, 746, 48, 20]]
      },
      {
        id: 'museu',
        stones: [[2925, 995], [2975, 972], [3030, 948], [3090, 948], [3142, 974]],
        beds: [[2888, 898, 56, 22], [3180, 900, 56, 22], [2925, 1018, 48, 19], [3150, 1018, 48, 19]]
      },
      {
        id: 'zoologico',
        stones: [[3220, 674], [3265, 638], [3315, 600], [3370, 620], [3415, 662]],
        beds: [[3150, 535, 66, 24], [3505, 540, 66, 24], [3155, 720, 56, 21], [3495, 724, 56, 21]]
      },
      {
        id: 'escola',
        stones: [[1510, 1858], [1570, 1835], [1630, 1815], [1695, 1835], [1760, 1862]],
        beds: [[1448, 1720, 64, 24], [1818, 1725, 64, 24], [1480, 1900, 54, 20], [1785, 1902, 54, 20]]
      },
      {
        id: 'laboratorio',
        stones: [[910, 1698], [950, 1718], [990, 1728], [1035, 1718], [1075, 1698]],
        beds: [[835, 1602, 54, 21], [1120, 1605, 54, 21], [835, 1732, 46, 18], [1110, 1734, 46, 18]]
      }
    ];

    details.forEach((item) => {
      (item.stones || []).forEach(([x, y], index) => {
        const w = 15 + (index % 3) * 4;
        const h = 7 + (index % 2) * 3;
        g.fillStyle(0xf0e4c9, 0.32);
        g.fillEllipse(x, y, w, h);
        g.lineStyle(1, 0xa98f66, 0.18);
        g.strokeEllipse(x, y, w, h);
      });

      (item.beds || []).forEach(([x, y, w, h], index) => {
        g.fillStyle(0x214f38, 0.16);
        g.fillEllipse(x + 3, y + 4, w + 6, h + 6);
        g.fillStyle(index % 2 ? 0x2f8154 : 0x397c4d, 0.72);
        g.fillEllipse(x, y, w, h);
        g.lineStyle(1, 0xe8d6a6, 0.36);
        g.strokeEllipse(x, y, w, h);

        const colors = index % 2 ? [0xf4b6c2, 0xffffff, 0xffd76a] : [0xb8e986, 0xffd76a, 0xf4b6c2];
        [-1, 0, 1].forEach((pos, flowerIndex) => {
          g.fillStyle(colors[flowerIndex], 0.76);
          g.fillCircle(x + pos * (w / 5), y + (flowerIndex % 2 ? 2 : -2), 2.5);
        });
      });
    });
  }

  drawTerrainDetails(g) {
    // Lagos provisórios das áreas naturais.
    g.fillStyle(0x1d83b7, 0.68);
    g.fillEllipse(3150, 560, 260, 110);
    g.fillEllipse(3200, 2120, 210, 88);
    g.fillStyle(0x8fe8ff, 0.16);
    g.fillEllipse(3150, 548, 190, 60);

    // V5.37.1: arvores renovadas e recortadas, sem fundo branco.

    const lamps = [
      [520, 2090], [760, 2025], [1040, 2035], [1320, 2035], [1510, 1770], [1610, 1550],
      [1460, 1370], [1810, 1370], [2050, 1370], [2320, 1180], [1620, 1130], [1630, 900],
      [940, 1280], [1190, 1305], [1380, 1350], [1900, 1030], [2260, 1740], [2860, 1750]
    ];
    lamps.forEach(([x, y]) => this.drawLamp(x, y));

    this.createDistrictLabel(620, 190, 'BAIRRO RESIDENCIAL');
    this.createDistrictLabel(1040, 930, 'BAIRRO CULTURAL');
    this.createDistrictLabel(1650, 535, 'CENTRO CÍVICO');
    this.createDistrictLabel(1640, 1230, 'CENTRO DA CIDADE');
    this.createDistrictLabel(2160, 990, 'CENTRO HISTÓRICO');
    this.createDistrictLabel(900, 1630, 'CAMPUS SUL');
    this.createDistrictLabel(3130, 220, 'PARQUE LESTE / ZOOLÓGICO');
    this.createDistrictLabel(3130, 1370, 'RESERVA LESTE / FLORESTA');

    this.createRoadSign(720, 1970, ['Escola Militar', 'Laboratório', 'Praça Central']);
    this.createRoadSign(1260, 1320, ['Biblioteca', 'Prefeitura', 'Museu']);
    this.createRoadSign(2240, 1330, ['Museu', 'Ponte Norte', 'Ponte Sul']);
    this.createRoadSign(2895, 1215, ['Zoológico', 'Centro', 'Floresta']);
  }

  drawWorldEntrance(g) {
    g.fillStyle(0x12355f, 1);
    g.fillRoundedRect(515, 2260, 610, 118, 22);
    g.lineStyle(4, 0xd6a84f, 0.65);
    g.strokeRoundedRect(515, 2260, 610, 118, 22);
    this.add.text(820, 2292, 'ARENA V5.42 • MAPA-BASE ÚNICO', {
      fontFamily: 'system-ui, sans-serif', fontSize: '21px', fontStyle: '900', color: '#ffffff'
    }).setOrigin(0.5).setDepth(2400);
    this.add.text(820, 2334, 'Acabamento fino discreto: pequenas pedras, canteiros e bordas leves sem criar novas ruas ou pátios grandes.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#f3d58a'
    }).setOrigin(0.5).setDepth(2400);
  }

  createTree(x, y, index = 0, solid = false) {
    const palette = [
      [0x2c8158, 0x3da76d, 0x63c986],
      [0x26724f, 0x338d61, 0x58b77a],
      [0x356f55, 0x4a9367, 0x76bc82]
    ][index % 3];
    const c = this.add.container(x, y).setDepth(y + 28);
    c.add(this.add.ellipse(8, 40, 82, 26, 0x071529, 0.16));
    c.add(this.add.rectangle(0, 17, 15, 53, 0x74502e, 1).setStrokeStyle(2, 0x4b3423, 0.55));
    c.add(this.add.triangle(-2, 8, -7, 20, -35, -2, -4, 4, 0x74502e, 1));
    c.add(this.add.triangle(3, 5, 7, 18, 34, -5, 5, 2, 0x74502e, 1));
    c.add(this.add.circle(-22, -2, 30, palette[1], 1).setStrokeStyle(2, 0x1d5b3e, 0.30));
    c.add(this.add.circle(19, -2, 32, palette[0], 1).setStrokeStyle(2, 0x1d5b3e, 0.30));
    c.add(this.add.circle(0, -28, 34, palette[1], 1).setStrokeStyle(2, 0x1d5b3e, 0.30));
    c.add(this.add.circle(-32, 16, 20, palette[0], 1));
    c.add(this.add.circle(31, 15, 22, palette[1], 1));
    c.add(this.add.circle(-6, -43, 14, palette[2], 0.80));
    c.add(this.add.circle(-26, -12, 10, 0xbaf2c5, 0.18));
    c.add(this.add.circle(15, -22, 9, 0xd6ffd6, 0.14));
    [-20, -8, 7, 19].forEach((lx, li) => c.add(this.add.circle(lx, -10 + (li % 2) * 6, 2.5, li % 2 ? 0x9ce7aa : 0xd7ffd8, 0.18)));
    if (index % 5 === 0) [[-24, 2], [5, -29], [27, 4], [-2, 14]].forEach(([fx, fy], flowerIndex) => c.add(this.add.circle(fx, fy, 3.5, flowerIndex % 2 ? 0xffd76a : 0xf4b6c2, 0.88)));
    if (solid) this.obstacles.push(new Phaser.Geom.Rectangle(x - 25, y - 9, 50, 64));
  }

  drawLamp(x, y) {
    const c = this.add.container(x, y).setDepth(y + 16);
    c.add(this.add.ellipse(0, 44, 26, 8, 0x071529, 0.18));
    c.add(this.add.rectangle(0, 39, 18, 8, 0x33445b, 1));
    c.add(this.add.rectangle(0, 13, 5, 56, 0x1b2d43, 1).setStrokeStyle(1, 0x6e8092, 0.55));
    c.add(this.add.rectangle(0, -17, 25, 5, 0x1b2d43, 1));
    c.add(this.add.rectangle(0, -23, 18, 17, 0xeff6d2, 0.92).setStrokeStyle(2, 0xd6a84f, 0.82));
    c.add(this.add.circle(0, -23, 18, 0xf3d58a, 0.10));
    const glow = this.add.circle(0, -23, 36, 0xf3d58a, 0.055);
    c.add(glow);
    this.tweens.add({ targets: glow, alpha: { from: 0.025, to: 0.11 }, scale: { from: 0.85, to: 1.12 }, duration: 2100, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
  }

  createDistrictLabel(x, y, text) {
    this.add.text(x, y, text, {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: '900', color: '#dff6ea',
      backgroundColor: 'rgba(7,21,41,0.58)', padding: { x: 13, y: 7 }
    }).setOrigin(0.5).setDepth(y + 5);
  }

  createRoadSign(x, y, lines) {
    const c = this.add.container(x, y).setDepth(y + 25);
    c.add(this.add.rectangle(0, 26, 8, 78, 0x6b4b2a, 1));
    lines.forEach((line, index) => {
      const yy = -24 + index * 27;
      c.add(this.add.rectangle(0, yy, 156, 24, 0x12355f, 1).setStrokeStyle(1, 0xf3d58a, 0.55));
      c.add(this.add.text(0, yy, line, { fontFamily: 'system-ui, sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
    });
  }

  createFlowerBed(x, y, width = 92, color = 0xffd76a, depth = null) {
    const c = this.add.container(x, y).setDepth(depth ?? y + 4);
    c.add(this.add.ellipse(0, 6, width, 28, 0x234f36, 0.92).setStrokeStyle(2, 0xd6c69e, 0.52));
    c.add(this.add.ellipse(0, 2, width - 12, 20, 0x357d50, 1));
    for (let i = -3; i <= 3; i++) {
      c.add(this.add.circle(i * (width / 9), (i % 2) * 4, 3.5, i % 2 ? color : 0xf4b6c2, 0.96));
      c.add(this.add.rectangle(i * (width / 9), 5, 1.5, 9, 0x245c3e, 0.9));
    }
    return c;
  }

  createPlanter(x, y, scale = 1) {
    const c = this.add.container(x, y).setDepth(y + 14).setScale(scale);
    c.add(this.add.ellipse(0, 18, 38, 10, 0x071529, 0.14));
    c.add(this.add.polygon(0, 10, [-17, -13, 17, -13, 12, 14, -12, 14], 0xb07a4e, 1).setStrokeStyle(2, 0x73462e, 0.55));
    c.add(this.add.circle(-9, -5, 13, 0x2f8c5d, 1));
    c.add(this.add.circle(8, -7, 15, 0x3aa46b, 1));
    c.add(this.add.circle(0, -16, 12, 0x58bd7c, 1));
    return c;
  }

  createParkedVehicle(x, y, color = 0x3f8ac7, flip = false) {
    const c = this.add.container(x, y).setDepth(y + 12).setScale(flip ? -1 : 1, 1);
    c.add(this.add.ellipse(0, 20, 74, 16, 0x071529, 0.18));
    c.add(this.add.roundedRect ? this.add.roundedRect(0, 5, 68, 25, 7, color, 1) : this.add.rectangle(0, 5, 68, 25, color, 1));
    c.add(this.add.polygon(0, -5, [-25, 0, -13, -18, 17, -18, 29, 0], Phaser.Display.Color.IntegerToColor(color).darken(12).color, 1));
    c.add(this.add.rectangle(-7, -12, 17, 10, 0x8fd7ef, 0.78));
    c.add(this.add.rectangle(14, -12, 15, 10, 0x8fd7ef, 0.72));
    c.add(this.add.circle(-23, 18, 8, 0x17202c, 1).setStrokeStyle(2, 0xa8b5bd, 0.85));
    c.add(this.add.circle(23, 18, 8, 0x17202c, 1).setStrokeStyle(2, 0xa8b5bd, 0.85));
    c.add(this.add.rectangle(34, 5, 5, 7, 0xffe9a3, 0.92));
    return c;
  }

  createKiosk(x, y) {
    const c = this.add.container(x, y).setDepth(y + 26);
    c.add(this.add.ellipse(0, 40, 96, 22, 0x071529, 0.16));
    c.add(this.add.rectangle(0, 5, 72, 64, 0x315c73, 1).setStrokeStyle(2, 0xe5d39e, 0.64));
    c.add(this.add.triangle(0, -40, -47, -6, 47, -6, 0, -58, 0x8c4f36, 1));
    c.add(this.add.rectangle(0, 4, 43, 22, 0x8fd7ef, 0.66).setStrokeStyle(2, 0xffffff, 0.26));
    c.add(this.add.rectangle(0, 22, 54, 7, 0xd6a84f, 0.88));
    c.add(this.add.text(0, -13, 'INFO', { fontFamily: 'system-ui, sans-serif', fontSize: '10px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5));
    return c;
  }

  drawUnifiedPlazaPilot() {
    if (!this.unifiedPlazaPilot || !this.centralArtV2) return;

    const centerX = 1630;
    const centerY = 1250;
    this.add.image(centerX, centerY, 'central-v2-ground')
      .setDisplaySize(1500, 980)
      .setDepth(1080)
      .setAlpha(1);

    const add = (key, x, y, w, h, depth = y + 50, flip = false) => {
      const img = this.add.image(x, y, key).setDisplaySize(w, h).setDepth(depth);
      img.setFlipX(flip);
      return img;
    };

    // Prédios próprios do jogo, inspirados na referência, mas sem usar a imagem estática.
    add('central-v2-library', 1100, 1128, 340, 300, 1245);
    add('central-v2-cityhall', 1650, 820, 390, 320, 980);
    add('central-v2-museum', 2150, 1225, 340, 285, 1365);
    add('central-v2-fountain', 1630, 1362, 300, 260, 1490);

    const trees = [
      ['tree-v537-ancient', 1378, 1120, 245, 280, false],
      ['tree-v537-columnar', 1845, 1118, 190, 285, true],
      ['tree-v537-blossom', 1395, 1540, 220, 250, false],
      ['tree-v537-round', 1870, 1510, 230, 265, true],
      ['tree-v537-columnar', 1510, 1040, 145, 225, false],
      ['tree-v537-blossom', 1760, 1035, 155, 225, true]
    ];
    trees.forEach(([key,x,y,w,h,flip]) => {
      add(key,x,y,w,h,y+h*.38,flip);
      this.obstacles.push(new Phaser.Geom.Rectangle(x-22,y+45,44,62));
    });

    [
      [1495,1465,false],[1765,1463,true],[1515,1264,true],[1745,1260,false]
    ].forEach(([x,y,flip]) => add('central-v2-bench',x,y,155,86,y+42,flip));

    [
      [1450,1360],[1810,1360],[1570,1178],[1690,1178],[1570,1560],[1690,1560]
    ].forEach(([x,y]) => {
      add('central-v2-lamp',x,y,78,156,y+80);
      const glow=this.add.circle(x,y-52,42,0xf3d58a,.045).setDepth(y+79);
      this.tweens.add({targets:glow,alpha:{from:.02,to:.12},scale:{from:.86,to:1.16},duration:1800,repeat:-1,yoyo:true,ease:'Sine.easeInOut'});
    });

    [
      [1500,1320],[1760,1320],[1515,1418],[1745,1420],[1455,1500],[1805,1495]
    ].forEach(([x,y]) => add('central-v2-planter',x,y,150,84,y+38));
  }

  drawDecorativeCity() {
    const houses = [
      [290, 350, 0xc58a67, 0], [450, 330, 0x6d8daf, 1], [620, 370, 0xb77682, 2], [790, 340, 0x88a05e, 3],
      [970, 410, 0xb88a61, 4], [350, 650, 0x7896b3, 5], [540, 650, 0xbc7884, 6], [740, 690, 0x668aa8, 7],
      [960, 720, 0xc18a61, 8], [780, 950, 0x8ca863, 9], [930, 980, 0xb28a69, 10],
      [520, 1460, 0x6d8daf, 11], [690, 1490, 0xc08a66, 12], [1820, 1650, 0x7896b3, 13],
      [2040, 1710, 0xb28a69, 14], [2200, 1580, 0x8ca863, 15]
    ];
    houses.forEach(([x, y, color, i]) => {
      const insideCentral = this.centralArtV2 && x > 900 && x < 2380 && y > 700 && y < 1750;
      if (!insideCentral) this.createHouse(x, y, color, i);
    });

    // Bancos da praça, biblioteca, museu e campus.
    [[730, 1980, 0], [1450, 1990, 1]].forEach(([x, y, flip]) => {
      const bench = this.add.container(x, y).setDepth(y + 12).setScale(flip ? -1 : 1, 1);
      bench.add(this.add.ellipse(0, 20, 66, 13, 0x071529, 0.13));
      bench.add(this.add.rectangle(0, 0, 58, 8, 0x8f623d, 1).setStrokeStyle(1, 0x5f3d28, 0.72));
      bench.add(this.add.rectangle(0, -10, 58, 8, 0x9f7047, 1).setStrokeStyle(1, 0x5f3d28, 0.72));
      bench.add(this.add.rectangle(-21, 11, 5, 23, 0x26384c, 1));
      bench.add(this.add.rectangle(21, 11, 5, 23, 0x26384c, 1));
    });

    // Jardins e vasos para dar leitura urbana sem bloquear as rotas.
    [[680, 1690], [880, 1690], [1260, 1720], [1500, 1720]].forEach(([x, y], i) => {
      this.add.image(x, y, `arena-groundcover-0${(i % 3) + 1}`)
        .setOrigin(0.5, 0.82).setScale(0.23 + (i % 2) * 0.03).setDepth(y - 6);
    });
    [].forEach(([x, y], i) => this.createPlanter(x, y, i % 2 ? 0.88 : 1));

    // Veículos estacionados em zonas seguras, apenas como decoração.
    this.createParkedVehicle(610, 1990, 0x3f8ac7, false);
    this.createParkedVehicle(1165, 2102, 0xc65f62, true);

    // Bicicletário no Campus Sul.
    const rack = this.add.container(1010, 1885).setDepth(1905);
    for (let i = -2; i <= 2; i++) {
      rack.add(this.add.arc(i * 17, 0, 10, 180, 360, false, 0x6e8092, 1).setStrokeStyle(3, 0x6e8092, 1));
    }
    rack.add(this.add.rectangle(0, 8, 90, 5, 0x33445b, 1));

    // Elementos urbanos adicionais para reduzir o aspecto vetorial.
    this.createMarketStall(820, 1525, 0xc65f62);
    this.createMarketStall(888, 1520, 0x3f8ac7);
    this.createMarketStall(956, 1518, 0x4aa46e);
    this.createCanalLookout(2520, 892, false);
    this.createCanalLookout(2520, 1595, true);
  }

  drawHeroEnvironment() {
    // Núcleos cenográficos que aproximam o mapa de uma vila viva.
    [
      ['arena-groundcover-02', 3050, 1460, 0.34],
      ['arena-groundcover-03', 3210, 1472, 0.33],
      ['arena-groundcover-01', 3090, 2330, 0.34],
      ['arena-groundcover-02', 3230, 2290, 0.32]
    ].forEach(([key, x, y, scale]) => {
      this.add.image(x, y, key).setOrigin(0.5, 0.82).setScale(scale).setDepth(y - 6);
    });

    // Pequenos brilhos de água nas margens do rio.
    for (let i = 0; i < 18; i++) {
      const x = 2465 + (i % 2) * 170 + ((i * 23) % 40);
      const y = 180 + i * 118;
      const glint = this.add.ellipse(x, y, 26, 7, 0xbef6ff, 0.18).setDepth(y + 4);
      this.tweens.add({ targets: glint, alpha: { from: 0.08, to: 0.28 }, scaleX: { from: 0.82, to: 1.12 }, duration: 1450 + i * 40, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
    }
  }

  createGazebo(x, y) {
    const c = this.add.container(x, y).setDepth(y + 26);
    c.add(this.add.ellipse(0, 34, 116, 24, 0x071529, 0.16));
    c.add(this.add.circle(0, 12, 42, 0xdcc79c, 1).setStrokeStyle(3, 0x8a6c42, 0.55));
    c.add(this.add.circle(0, 4, 33, 0xf1e7d1, 1).setStrokeStyle(2, 0xb99c64, 0.45));
    [-26, -9, 9, 26].forEach((px) => c.add(this.add.rectangle(px, -5, 5, 42, 0xf4efd8, 1).setStrokeStyle(1, 0xb39b61, 0.45)));
    c.add(this.add.polygon(0, -31, [-48, 2, -24, -24, 0, -38, 24, -24, 48, 2, 0, 16], 0x365980, 1).setStrokeStyle(2, 0xf3d58a, 0.58));
    c.add(this.add.circle(0, -34, 5, 0xf3d58a, 1));
    return c;
  }

  createMarketStall(x, y, awningColor = 0xc65f62) {
    const c = this.add.container(x, y).setDepth(y + 20);
    c.add(this.add.ellipse(0, 20, 76, 18, 0x071529, 0.14));
    c.add(this.add.rectangle(0, 6, 58, 18, 0xd6c69e, 1).setStrokeStyle(2, 0x7a6343, 0.45));
    c.add(this.add.rectangle(-20, -8, 4, 34, 0x6b4b2a, 1));
    c.add(this.add.rectangle(20, -8, 4, 34, 0x6b4b2a, 1));
    c.add(this.add.rectangle(0, -18, 58, 10, awningColor, 1).setStrokeStyle(2, 0xf3d58a, 0.48));
    c.add(this.add.rectangle(-17, -18, 7, 10, 0xffffff, 0.34));
    c.add(this.add.rectangle(0, -18, 7, 10, 0xffffff, 0.18));
    c.add(this.add.rectangle(17, -18, 7, 10, 0xffffff, 0.34));
    return c;
  }

  createCanalLookout(x, y, flip = false) {
    const c = this.add.container(x, y).setDepth(y + 20).setScale(flip ? -1 : 1, 1);
    c.add(this.add.ellipse(0, 18, 92, 18, 0x071529, 0.12));
    c.add(this.add.rectangle(0, 4, 74, 10, 0xb7a07a, 1).setStrokeStyle(2, 0x7a6142, 0.45));
    c.add(this.add.rectangle(-20, -14, 6, 44, 0xe8e2cc, 1));
    c.add(this.add.rectangle(20, -14, 6, 44, 0xe8e2cc, 1));
    c.add(this.add.rectangle(0, -24, 50, 8, 0xe8e2cc, 1));
    c.add(this.add.circle(-8, -2, 4, 0xf3d58a, 0.82));
    c.add(this.add.circle(8, -2, 4, 0xf3d58a, 0.82));
    return c;
  }

  createHouse(x, y, color, index) {
    const roofColors = [0x783f32, 0x4b5870, 0x704333, 0x56613d];
    const trimColors = [0xf2e2c4, 0xe4edf2, 0xf3d9c6, 0xe4edcf];
    const roof = roofColors[index % roofColors.length];
    const trim = trimColors[index % trimColors.length];
    const width = index % 3 === 0 ? 106 : index % 3 === 1 ? 92 : 84;
    const height = index % 2 === 0 ? 74 : 68;
    const c = this.add.container(x, y).setDepth(y + 34);
    const darker = Phaser.Display.Color.IntegerToColor(color).darken(16).color;
    const lighter = Phaser.Display.Color.IntegerToColor(color).lighten(8).color;

    c.add(this.add.ellipse(10, 50, width + 38, 26, 0x071529, 0.16));
    c.add(this.add.rectangle(12, 12, width, height, darker, 1).setStrokeStyle(2, 0x5c493d, 0.22));
    c.add(this.add.rectangle(0, 4, width, height, color, 1).setStrokeStyle(2, 0x59473b, 0.34));
    c.add(this.add.polygon(0, -34, [-width / 2 - 12, 8, -width / 2 + 8, -26, 0, -48, width / 2 - 8, -26, width / 2 + 12, 8], roof, 1).setStrokeStyle(2, 0x4f3328, 0.52));
    c.add(this.add.rectangle(0, -22, width - 12, 8, Phaser.Display.Color.IntegerToColor(roof).lighten(8).color, 0.34));
    c.add(this.add.rectangle(width * 0.24, -48, 11, 23, 0x744c36, 1).setStrokeStyle(1, 0x4b3327, 0.55));
    c.add(this.add.rectangle(width * 0.24, -60, 16, 5, 0x4d3429, 1));

    const doorX = index % 2 ? -18 : 18;
    c.add(this.add.rectangle(doorX, 18, 21, 42, 0x30465d, 1).setStrokeStyle(2, trim, 0.70));
    c.add(this.add.circle(doorX + (index % 2 ? 6 : -6), 20, 2.2, 0xf3d58a, 1));
    c.add(this.add.rectangle(doorX, 42, 34, 6, 0xd6c69e, 1));
    c.add(this.add.rectangle(doorX, -4, 26, 6, trim, 0.55));

    const windowXs = width > 90 ? [-30, 30] : [-24, 24];
    windowXs.forEach((wx) => {
      c.add(this.add.rectangle(wx, 4, 22, 24, 0x72c9e8, 0.70).setStrokeStyle(2, trim, 0.76));
      c.add(this.add.line(wx, 4, -9, 0, 9, 0, 0xffffff, 0.42).setLineWidth(1));
      c.add(this.add.line(wx, 4, 0, -10, 0, 10, 0xffffff, 0.42).setLineWidth(1));
      c.add(this.add.rectangle(wx, 18, 28, 4, lighter, 1));
    });

    if (width > 96) {
      c.add(this.add.rectangle(0, -4, 20, 18, 0x72c9e8, 0.68).setStrokeStyle(2, trim, 0.64));
      c.add(this.add.rectangle(0, -18, 32, 8, roof, 1));
    }

    c.add(this.add.rectangle(0, 45, width + 10, 5, 0xe7dec7, 1));
    c.add(this.add.rectangle(0, 52, width + 26, 4, 0x6b4b2a, 0.85));
    for (let fx = -width / 2 + 8; fx <= width / 2 - 8; fx += 18) c.add(this.add.rectangle(fx, 43, 3, 18, 0xe7dec7, 0.95));

    const planterY = 29;
    c.add(this.add.ellipse(-20, planterY, 30, 10, 0x2f7d51, 0.92));
    c.add(this.add.ellipse(20, planterY, 30, 10, 0x2f7d51, 0.92));
    [-28, -20, -12, 12, 20, 28].forEach((fx, i) => c.add(this.add.circle(fx, planterY - 2 + (i % 2) * 2, 3, i % 2 ? 0xffd76a : 0xf4b6c2, 0.92)));

    if (index % 4 === 0) c.add(this.add.text(-width / 2 + 10, -8, '★', { fontSize: '11px', color: '#f3d58a' }).setOrigin(0.5));
    this.obstacles.push(new Phaser.Geom.Rectangle(x - width * 0.36, y - 28, width * 0.72, 78));
  }

  drawNatureZones() {
    // Margens do rio: pedras, juncos, flores aquáticas e pequenos decks.
    const riverDetails = [
      [2448, 260, 0.82], [2678, 330, 0.92], [2440, 620, 0.74], [2690, 760, 0.84],
      [2442, 1260, 0.92], [2692, 1450, 0.78], [2438, 2010, 0.86], [2684, 2260, 0.94]
    ];
    riverDetails.forEach(([x, y, scale], index) => {
      this.add.image(x, y, 'arena-groundcover-03').setOrigin(0.5, 0.82).setScale(0.20 + scale * 0.08).setDepth(y - 4).setFlipX(index % 2 === 0);
      this.createStoneCluster(x + (index % 2 ? -28 : 28), y + 34, 0.72 + (index % 3) * 0.08);
    });
    [[2530, 420], [2605, 575], [2515, 1320], [2620, 1510], [2540, 2140], [2610, 2350]].forEach(([x, y], index) => {
      this.createLilyPad(x, y, 0.74 + (index % 3) * 0.10);
    });

    // Recintos do Zoológico com leitura mais clara de parque vivo.
    this.createHabitat(2970, 505, 205, 132, 0x4f9f6c, 'ÁREA DAS AVES', true);
    this.createHabitat(3250, 645, 196, 138, 0x3f8e61, 'GRANDES ANIMAIS', false);
    this.createHabitat(3045, 885, 222, 128, 0x5aa977, 'PRIMATAS', false);
    this.createZooPond(3200, 430, 156, 76);
    this.createZooPond(2915, 770, 128, 64);

    // Reserva Leste mais orgânica, com troncos, cogumelos e pedras.
    this.createFallenLog(2970, 1580, 1.05, -8);
    this.createFallenLog(3320, 2200, 0.88, 12);
    this.createFallenLog(3030, 2280, 0.72, 5);
    [[2890, 1510], [3360, 1510], [2925, 2070], [3345, 2050], [3120, 2370]].forEach(([x, y], index) => {
      this.add.image(x, y, `arena-groundcover-0${(index % 3) + 1}`)
        .setOrigin(0.5, 0.82).setScale(0.22 + (index % 3) * 0.025).setDepth(y - 5).setFlipX(index % 2 === 0);
    });
    [[2870, 1660], [3370, 1780], [2920, 2210], [3300, 2320]].forEach(([x, y], index) => {
      this.createStoneCluster(x, y, 0.82 + (index % 2) * 0.12);
    });
  }

  createReedPatch(x, y, scale = 1, flip = false) {
    const c = this.add.container(x, y).setDepth(y + 10).setScale(flip ? -scale : scale, scale);
    c.add(this.add.ellipse(0, 18, 54, 15, 0x173d2b, 0.20));
    const reeds = [-20, -12, -4, 5, 14, 22];
    reeds.forEach((rx, index) => {
      const stem = this.add.rectangle(rx, 2 - (index % 3) * 4, 3, 34 + (index % 3) * 8, 0x2f7650, 1).setOrigin(0.5, 1);
      c.add(stem);
      c.add(this.add.ellipse(rx + (index % 2 ? 2 : -2), -18 - (index % 3) * 4, 7, 16, 0x8a633b, 0.92));
    });
    return c;
  }

  createLilyPad(x, y, scale = 1) {
    const c = this.add.container(x, y).setDepth(y + 4).setScale(scale);
    c.add(this.add.ellipse(0, 0, 34, 16, 0x2f8c5d, 0.92).setStrokeStyle(1, 0xbaf2c5, 0.35));
    c.add(this.add.triangle(10, -1, -2, -6, 8, 0, -2, 6, 0x1d83b7, 0.82));
    c.add(this.add.circle(-5, -4, 4, 0xf4b6c2, 0.96));
    c.add(this.add.circle(-2, -6, 3, 0xffffff, 0.72));
    this.tweens.add({ targets: c, angle: { from: -2.5, to: 2.5 }, y: y - 3, duration: 1700, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
    return c;
  }

  createStoneCluster(x, y, scale = 1) {
    const c = this.add.container(x, y).setDepth(y + 7).setScale(scale);
    c.add(this.add.ellipse(0, 9, 58, 15, 0x071529, 0.14));
    c.add(this.add.ellipse(-16, 1, 28, 19, 0x7f8c83, 1).setStrokeStyle(1, 0xbfc9c3, 0.34));
    c.add(this.add.ellipse(10, -1, 35, 24, 0x6f7f78, 1).setStrokeStyle(1, 0xbfc9c3, 0.30));
    c.add(this.add.ellipse(25, 5, 22, 15, 0x95a198, 1));
    c.add(this.add.ellipse(2, -7, 13, 5, 0xd9dfdc, 0.18));
    return c;
  }

  createHabitat(x, y, width, height, color, label, aviary = false) {
    const c = this.add.container(x, y).setDepth(y + 18);
    c.add(this.add.ellipse(0, height * 0.28, width + 24, height * 0.32, 0x071529, 0.13));
    c.add(this.add.ellipse(0, 8, width, height, color, 0.56).setStrokeStyle(3, 0xe4d6ad, 0.50));
    c.add(this.add.ellipse(-width * 0.18, 5, width * 0.36, height * 0.45, 0x2d754f, 0.42));
    c.add(this.add.ellipse(width * 0.23, 12, width * 0.30, height * 0.38, 0x76bc82, 0.24));
    c.add(this.add.rectangle(0, -height * 0.48, width * 0.64, 22, 0x315f48, 0.94).setStrokeStyle(2, 0xf3d58a, 0.52));
    c.add(this.add.text(0, -height * 0.48, label, { fontFamily: 'system-ui, sans-serif', fontSize: '9px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5));
    for (let px = -width / 2 + 12; px < width / 2; px += 24) {
      c.add(this.add.rectangle(px, 5, 3, height * 0.72, 0x48545d, 0.78));
    }
    c.add(this.add.rectangle(0, -height * 0.28, width - 18, 3, 0xb9c2c8, 0.60));
    c.add(this.add.rectangle(0, height * 0.30, width - 18, 3, 0xb9c2c8, 0.60));
    if (aviary) {
      c.add(this.add.arc(0, -4, width * 0.40, 180, 360, false, 0x8fe8ff, 0.10).setStrokeStyle(3, 0xe4edf2, 0.54));
    }
    return c;
  }

  createZooPond(x, y, width, height) {
    const c = this.add.container(x, y).setDepth(y + 4);
    c.add(this.add.ellipse(0, 5, width + 20, height + 18, 0x6f7f78, 0.46));
    c.add(this.add.ellipse(0, 0, width, height, 0x1d83b7, 0.78).setStrokeStyle(3, 0x8fe8ff, 0.38));
    c.add(this.add.ellipse(-width * 0.18, -height * 0.12, width * 0.34, height * 0.16, 0xc8f8ff, 0.12));
    const ripple = this.add.ellipse(width * 0.18, 4, 34, 12, 0x8fe8ff, 0).setStrokeStyle(2, 0xd8fbff, 0.42);
    c.add(ripple);
    this.tweens.add({ targets: ripple, scale: 1.75, alpha: 0, duration: 1600, repeat: -1, ease: 'Sine.easeOut' });
    return c;
  }

  createFallenLog(x, y, scale = 1, angle = 0) {
    const c = this.add.container(x, y).setDepth(y + 12).setScale(scale).setAngle(angle);
    c.add(this.add.ellipse(0, 14, 94, 19, 0x071529, 0.15));
    c.add(this.add.rectangle(0, 0, 82, 22, 0x6b4b2a, 1).setStrokeStyle(2, 0x49321f, 0.54));
    c.add(this.add.circle(-41, 0, 13, 0x8d6742, 1).setStrokeStyle(2, 0x49321f, 0.58));
    c.add(this.add.circle(-41, 0, 6, 0x5c432c, 1));
    c.add(this.add.rectangle(18, -9, 17, 6, 0x2f8c5d, 0.74));
    c.add(this.add.circle(25, -11, 8, 0x48a66f, 0.76));
    return c;
  }

  createMushroomPatch(x, y, scale = 1) {
    const c = this.add.container(x, y).setDepth(y + 8).setScale(scale);
    c.add(this.add.ellipse(0, 10, 58, 14, 0x071529, 0.10));
    [[-18, 2, 0xc85f66], [0, -3, 0xf0b44d], [18, 4, 0xb18cff], [8, 9, 0xe77a83]].forEach(([mx, my, color], index) => {
      c.add(this.add.rectangle(mx, my + 8, 4 + (index % 2), 12, 0xf0e5cf, 1));
      c.add(this.add.ellipse(mx, my, 16 + (index % 2) * 4, 9, color, 1).setStrokeStyle(1, 0xffffff, 0.20));
      c.add(this.add.circle(mx - 3, my - 1, 1.5, 0xffffff, 0.68));
    });
    return c;
  }

  createZooAnimalAnimations() {
    const makeAnim = (key, sheetKey, frameRate = 3) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: [0, 1, 2, 1].map((frame) => ({ key: sheetKey, frame })),
        frameRate,
        repeat: -1
      });
    };

    makeAnim('zoo-horse-idle', 'zoo-horse-sheet', 2.2);
    makeAnim('zoo-lion-idle', 'zoo-lion-sheet', 2.6);
    makeAnim('zoo-giraffe-idle', 'zoo-giraffe-sheet', 2.0);
    makeAnim('zoo-monkey-idle', 'zoo-monkey-sheet', 3.8);
    makeAnim('zoo-zebra-idle', 'zoo-zebra-sheet', 2.4);
  }

  addZooAnimals(container) {
    const make = (sheetKey, animKey, x, y, scale, opts = {}) => {
      const sprite = this.add.sprite(x, y, sheetKey).setOrigin(0.5, 0.88).setScale(scale);
      if (opts.flipX) sprite.setFlipX(true);
      sprite.play(animKey);
      container.add(sprite);
      if (opts.tween) this.tweens.add({ targets: sprite, repeat: -1, yoyo: true, ease: 'Sine.easeInOut', ...opts.tween });
      return sprite;
    };

    // V5.43.2 — animais trazidos bem mais para o lado direito do zoológico
    // e com recorte transparente para evitar bordas brancas.
    make('zoo-giraffe-sheet', 'zoo-giraffe-idle', 142, -92, 0.17, {
      tween: { angle: { from: -2.2, to: 2.2 }, duration: 1700 }
    });
    make('zoo-monkey-sheet', 'zoo-monkey-idle', 196, -92, 0.118, {
      tween: { y: { from: -92, to: -108 }, duration: 520 }
    });
    make('zoo-horse-sheet', 'zoo-horse-idle', 148, -18, 0.145, {
      flipX: true, tween: { y: { from: -18, to: -24 }, duration: 1200 }
    });
    make('zoo-zebra-sheet', 'zoo-zebra-idle', 202, -18, 0.138, {
      tween: { x: { from: 199, to: 205 }, duration: 1450 }
    });
    make('zoo-lion-sheet', 'zoo-lion-idle', 244, -18, 0.133, {
      tween: { angle: { from: -1.5, to: 1.5 }, duration: 980 }
    });
  }

  drawLocations() {
    this.locationObjects = [];
    LOCATIONS.forEach((loc) => {
      const container = this.add.container(loc.x, loc.y).setDepth(loc.y + 35);
      const entry = this.getInteractionPoint(loc);
      const interactive = this.add.circle(entry.x, entry.y, 28, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true }).setDepth(entry.y + 120);
      interactive.on('pointerdown', () => this.tryInteract(loc, true));

      const building = this.drawBuildingFor(loc);
      if (building) container.add(building);

      // A Praça Central é parte do cenário aberto. Não deve exibir placa ou
      // medalhão E acompanhando o jogador/câmera como se fosse um HUD.
      // Os demais locais continuam com marcador e placa de entrada.
      let label = null;
      if (loc.id !== 'praca') {
        this.drawEntryBeacon(entry.x, entry.y, loc);

        const labelOffsets = {
          floresta: 122,
          zoologico: 150,
          biblioteca: 156,
          prefeitura: 154,
          museu: 154,
          'escola-militar': 164,
          laboratorio: 156
        };
        const labelOffset = labelOffsets[loc.id] ?? 104;
        label = this.createLocationLabel(loc.x, loc.y + labelOffset, loc);
      }
      this.locationObjects.push({ loc, container, label, interactive });

      const obstacle = this.getObstacleForLocation(loc);
      if (Array.isArray(obstacle)) this.obstacles.push(...obstacle.filter(Boolean));
      else if (obstacle) this.obstacles.push(obstacle);
    });
  }

  drawEntryBeacon(x, y, loc) {
    const pad = this.add.container(x, y).setDepth(12050);
    const halo = this.add.circle(0, 0, 26, 0xf3d58a, 0.10).setStrokeStyle(1, 0xf3d58a, 0.22);
    const ring = this.add.circle(0, 0, 22, 0x0b2748, 0.98).setStrokeStyle(3, 0xf3d58a, 1);
    const letter = this.add.text(0, -1, 'E', { fontFamily: 'Georgia, Times New Roman, serif', fontSize: '22px', fontStyle: 'bold', color: '#f3d58a' }).setOrigin(0.5);
    pad.add([halo, ring, letter]);
    this.tweens.add({ targets: halo, alpha: { from: 0.05, to: 0.22 }, scale: { from: 0.90, to: 1.12 }, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  getInteractionPoint(loc) {
    return { x: loc.entryX ?? loc.x, y: loc.entryY ?? loc.y };
  }

  getObstacleForLocation(loc) {
    const rect = (dx, dy, width, height) =>
      new Phaser.Geom.Rectangle(loc.x + dx, loc.y + dy, width, height);

    switch (loc.id) {
      case 'zoologico':
        return [
          rect(-152, -134, 304, 96),
          rect(-154, -38, 88, 60),
          rect(66, -38, 88, 60)
        ];
      case 'biblioteca':
        return [
          rect(-162, -138, 324, 96),
          rect(-160, -42, 90, 60),
          rect(70, -42, 90, 60)
        ];
      case 'prefeitura':
        return [
          rect(-160, -138, 320, 98),
          rect(-160, -40, 92, 58),
          rect(68, -40, 92, 58)
        ];
      case 'museu':
        return [
          rect(-164, -138, 328, 100),
          rect(-164, -40, 94, 60),
          rect(70, -40, 94, 60)
        ];
      case 'escola-militar':
        return [
          rect(-206, -184, 412, 116),
          rect(-208, -66, 114, 82),
          rect(94, -66, 114, 82)
        ];
      case 'laboratorio':
        return [
          rect(-154, -150, 308, 104),
          rect(-154, -46, 88, 64),
          rect(66, -46, 88, 64)
        ];
      default:
        return null;
    }
  }

  drawBuildingFor(loc) {
    if (this.centralArtV2 && ['biblioteca','praca','prefeitura','museu'].includes(loc.id)) return null;
    switch (loc.id) {
      case 'biblioteca': return this.drawLibrary();
      case 'zoologico': return this.drawZoo();
      case 'prefeitura': return this.drawCityHall();
      case 'museu': return this.drawMuseum();
      case 'floresta': return null;
      case 'praca': return null;
      case 'escola-militar': return this.drawMilitarySchool();
      case 'laboratorio': return this.drawLaboratory();
      default: return this.drawSimpleBuilding(loc.color);
    }
  }

  drawSimpleBuilding(color) {
    const c = this.add.container(0, 0);
    c.add(this.add.ellipse(0, 52, 145, 34, 0x000000, 0.18));
    c.add(this.add.rectangle(0, 10, 112, 82, color, 1).setStrokeStyle(3, 0xf3d58a, 0.55));
    c.add(this.add.triangle(0, -52, -70, -2, 70, -2, 0, -82, 0x0b1f3a, 1).setStrokeStyle(2, 0xd6a84f, 0.7));
    return c;
  }

  drawLibrary() {
    const c = this.add.container(0, 0);
    c.add(this.add.ellipse(0, 120, 332, 40, 0x071529, 0.08));
    const building = this.add.image(0, 18, 'landmark-library').setOrigin(0.5, 0.86).setScale(0.332);
    c.add(building);
    const sparkle1 = this.add.circle(-44, 14, 4, 0xf3d58a, 0.26);
    const sparkle2 = this.add.circle(52, -8, 3, 0xf8f0cc, 0.22);
    c.add([sparkle1, sparkle2]);
    this.tweens.add({ targets: [sparkle1, sparkle2], alpha: { from: 0.08, to: 0.38 }, scale: { from: 0.8, to: 1.25 }, duration: 1350, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return c;
  }

  drawZoo() {
    const c = this.add.container(0, 0);
    c.add(this.add.ellipse(0, 120, 336, 40, 0x071529, 0.08));
    const building = this.add.image(0, 18, 'landmark-zoo').setOrigin(0.5, 0.88).setScale(0.334);
    c.add(building);
    this.addZooAnimals(c);
    const pennantL = this.add.triangle(-92, -48, -10, -7, -10, 7, 12, 0, 0xd6a84f, 1).setOrigin(0.05, 0.5);
    const pennantR = this.add.triangle(94, -44, -10, -7, -10, 7, 12, 0, 0x2e8f68, 1).setOrigin(0.05, 0.5);
    c.add([this.add.rectangle(-102, -36, 3, 52, 0xf4ead8, 0.95), pennantL, this.add.rectangle(84, -34, 3, 48, 0xf4ead8, 0.95), pennantR]);
    this.tweens.add({ targets: [pennantL, pennantR], scaleX: { from: 0.88, to: 1.10 }, angle: { from: -2, to: 2 }, duration: 980, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return c;
  }

  drawCityHall() {
    const c = this.add.container(0, 0);
    c.add(this.add.ellipse(0, 122, 336, 40, 0x071529, 0.08));
    const building = this.add.image(0, 18, 'landmark-cityhall').setOrigin(0.5, 0.86).setScale(0.336);
    c.add(building);
    const pole = this.add.rectangle(88, -20, 4, 86, 0xf0e7d7, 0.98);
    const flag = this.add.triangle(104, -54, -15, -9, -15, 9, 18, 0, 0xc94646, 1).setOrigin(0.05, 0.5);
    c.add([pole, flag]);
    this.tweens.add({ targets: flag, scaleX: { from: 0.88, to: 1.12 }, angle: { from: -2, to: 2 }, duration: 820, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
    return c;
  }

  drawMuseum() {
    const c = this.add.container(0, 0);
    c.add(this.add.ellipse(0, 120, 332, 40, 0x071529, 0.08));
    const building = this.add.image(0, 14, 'landmark-museum').setOrigin(0.5, 0.88).setScale(0.332);
    c.add(building);
    const sparkle = this.add.circle(-18, -10, 4, 0xf3d58a, 0.18);
    c.add(sparkle);
    this.tweens.add({ targets: sparkle, alpha: { from: 0.06, to: 0.35 }, scale: { from: 0.8, to: 1.35 }, duration: 1450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return c;
  }

  drawForestSpot() {
    const c = this.add.container(0, 0);
    c.add(this.add.ellipse(0, 70, 210, 42, 0x071529, 0.14));

    // Portal simples; sem caminho interno duplicado.
    c.add(this.add.rectangle(-70, 18, 14, 86, 0x6b4b2a, 1).setStrokeStyle(2, 0x46301f, 0.55));
    c.add(this.add.rectangle(70, 18, 14, 86, 0x6b4b2a, 1).setStrokeStyle(2, 0x46301f, 0.55));
    c.add(this.add.rectangle(0, -27, 164, 24, 0x5d7f48, 1).setStrokeStyle(3, 0xe8d6a6, 0.50));
    c.add(this.add.text(0, -28, 'TRILHA DA FLORESTA', { fontFamily: 'system-ui, sans-serif', fontSize: '10px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5));

    const treeData = [
      ['tree-v537-pine', -106, 16, 72, 122, false],
      ['tree-v537-round', -42, -10, 84, 116, false],
      ['tree-v537-blossom', 42, -10, 84, 116, true],
      ['tree-v537-columnar', 106, 16, 64, 122, false]
    ];

    treeData.forEach(([key, tx, ty, width, height, flip]) => {
      c.add(this.add.image(tx, ty + 28, key)
        .setOrigin(0.5, 0.92)
        .setDisplaySize(width, height)
        .setFlipX(flip));
    });

    [[-46, 56], [46, 56]].forEach(([rx, ry], i) => c.add(this.add.ellipse(rx, ry, 23, 13, i % 2 ? 0x7f8c83 : 0x6f7f78, 0.96)));
    return c;
  }

  drawPlazaSpot() {
    const c = this.add.container(0, 0);
    c.add(this.add.ellipse(0, 74, 192, 34, 0x071529, 0.12));
    c.add(this.add.rectangle(0, 59, 132, 12, 0xa99a7c, 1));
    c.add(this.add.rectangle(0, 48, 112, 12, 0xd9cfb8, 1));
    c.add(this.add.rectangle(0, 32, 84, 22, 0x315f48, 1).setStrokeStyle(2, 0xf3d58a, 0.60));
    c.add(this.add.text(0, 32, 'PRAÇA CENTRAL', { fontFamily: 'system-ui, sans-serif', fontSize: '10px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5));
    c.add(this.add.text(0, 0, '★', { fontSize: '30px', color: '#f3d58a' }).setOrigin(0.5));
    return c;
  }

  drawMilitarySchool() {
    const c = this.add.container(0, 0);
    c.add(this.add.ellipse(0, 122, 370, 42, 0x071529, 0.08));

    const school = this.add.image(0, 16, 'military-school-final')
      .setOrigin(0.5, 0.80)
      .setScale(0.438);
    c.add(school);

    const glowLeft = this.add.circle(-32, 27, 10, 0xf3d58a, 0.10);
    const glowRight = this.add.circle(30, 27, 10, 0xf3d58a, 0.10);
    c.add(glowLeft);
    c.add(glowRight);
    this.tweens.add({ targets: [glowLeft, glowRight], alpha: { from: 0.05, to: 0.18 }, scale: { from: 0.9, to: 1.12 }, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const flagPoleL = this.add.rectangle(-64, 54, 3, 46, 0xeadfca, 0.95);
    const flagL = this.add.triangle(-51, 40, -11, -7, -11, 7, 12, 0, 0x153d69, 1)
      .setStrokeStyle(2, 0xd6a84f, 0.70)
      .setOrigin(0.05, 0.5);
    const flagPoleR = this.add.rectangle(56, 70, 3, 46, 0xeadfca, 0.95);
    const flagR = this.add.triangle(69, 56, -11, -7, -11, 7, 12, 0, 0x153d69, 1)
      .setStrokeStyle(2, 0xd6a84f, 0.70)
      .setOrigin(0.05, 0.5);
    c.add(flagPoleL); c.add(flagL); c.add(flagPoleR); c.add(flagR);
    this.tweens.add({ targets: flagL, scaleX: { from: 0.90, to: 1.10 }, angle: { from: -2, to: 2 }, duration: 820, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: flagR, scaleX: { from: 0.92, to: 1.12 }, angle: { from: -2, to: 2 }, duration: 900, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });

    return c;
  }

  drawLaboratory() {
    const c = this.add.container(0, 0);
    c.add(this.add.ellipse(0, 121, 330, 40, 0x071529, 0.08));
    const building = this.add.image(0, 18, 'landmark-laboratory').setOrigin(0.5, 0.86).setScale(0.334);
    c.add(building);
    const pulse = this.add.circle(48, -10, 15, 0x8fe8ff, 0.07);
    c.add(pulse);
    this.tweens.add({ targets: pulse, alpha: { from: 0.02, to: 0.18 }, scale: { from: 0.8, to: 1.25 }, duration: 1200, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
    return c;
  }

  createLocationLabel(x, y, loc) {
    const width = loc.id === 'escola-militar' ? 218 : loc.id === 'laboratorio' ? 206 : 194;
    const c = this.add.container(x, y).setDepth(10000);
    const g = this.add.graphics();
    g.fillStyle(0x071529, 0.96);
    g.fillRoundedRect(-width / 2, -24, width, 48, 14);
    g.lineStyle(2.5, 0xd6a84f, 0.95);
    g.strokeRoundedRect(-width / 2 + 1, -23, width - 2, 46, 14);
    g.lineStyle(1, 0xffe4ad, 0.30);
    g.strokeRoundedRect(-width / 2 + 6, -18, width - 12, 36, 11);
    c.add(g);
    c.add(this.add.text(-width / 2 + 28, 0, loc.icon, { fontSize: '22px' }).setOrigin(0.5));
    c.add(this.add.text(12, 0, loc.nome, { fontFamily: 'Georgia, Times New Roman, serif', fontSize: '16px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
    return c;
  }

  createWildlife() {
    // Zoológico / Parque Leste.
    this.createCritter(3020, 650, '🦓', { x: 2920, y: 560, width: 220, height: 140 }, 0.88);
    this.createCritter(3200, 700, '🐘', { x: 3100, y: 610, width: 190, height: 140 }, 0.92);
    this.createCritter(3100, 880, '🐒', { x: 2970, y: 790, width: 250, height: 150 }, 0.88);
    this.createCritter(3270, 520, '🦜', { x: 3000, y: 420, width: 300, height: 180 }, 0.82, true);

    // Floresta / Reserva Leste.
    this.createCritter(3060, 1780, '🦌', { x: 2920, y: 1640, width: 270, height: 240 }, 0.88);
    this.createCritter(3300, 1940, '🐇', { x: 3150, y: 1820, width: 200, height: 180 }, 0.82);
    this.createCritter(3220, 1550, '🦋', { x: 2920, y: 1450, width: 420, height: 250 }, 0.78, true);

    // Rio.
    this.createCritter(2570, 1420, '🐟', { x: 2485, y: 1260, width: 160, height: 280 }, 0.72, true, 12000);

    // Aves sobre a cidade e moradores provisórios na praça.
    this.createCritter(1350, 500, '🕊️', { x: 900, y: 350, width: 1100, height: 330 }, 0.70, true, 13000);
    this.createCritter(1700, 1280, '🧑', { x: 1500, y: 1250, width: 300, height: 210 }, 0.74);
    this.createCritter(1550, 1450, '👧', { x: 1450, y: 1380, width: 280, height: 180 }, 0.70);
  }

  createLivingEnvironment() {
    this.createFountainLife();
    this.createRiverLife();
    this.createCloudLayers();
    this.createBirdFlocks();
    this.createAmbientCitizens();
    this.createWindowGlints();
    this.createSunLightSweep();
    this.createNatureAnimations();
  }

  createFountainLife(x = 1980, y = 1080) {
    if (this.fountainLifeCreated) return;
    this.fountainLifeCreated = true;

    const glow = this.add.ellipse(x, y + 36, 122, 42, 0x8fe8ff, 0.06)
      .setDepth(y + 68);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.03, to: 0.12 },
      scaleX: { from: 0.94, to: 1.08 },
      scaleY: { from: 0.94, to: 1.10 },
      duration: 1500,
      repeat: -1,
      yoyo: true,
      ease: 'Sine.easeInOut'
    });

    this.time.addEvent({
      delay: 210,
      loop: true,
      callback: () => {
        const lane = Phaser.Math.Between(-1, 1);
        const drop = this.add.circle(
          x + lane * Phaser.Math.Between(4, 12),
          y - 198,
          Phaser.Math.Between(2, 4),
          0xd9fbff,
          0.80
        ).setDepth(y + 72);
        this.tweens.add({
          targets: drop,
          x: drop.x + lane * Phaser.Math.Between(8, 18),
          y: drop.y - Phaser.Math.Between(20, 48),
          alpha: 0,
          scale: 0.45,
          duration: Phaser.Math.Between(520, 780),
          ease: 'Sine.easeOut',
          onComplete: () => drop.destroy()
        });
      }
    });

    this.time.addEvent({
      delay: 760,
      loop: true,
      callback: () => {
        const ring = this.add.ellipse(x, y + 34, 38, 12, 0x8fe8ff, 0)
          .setStrokeStyle(2, 0xd8fbff, 0.48)
          .setDepth(y + 69);
        this.tweens.add({
          targets: ring,
          scaleX: 2.0,
          scaleY: 1.65,
          alpha: 0,
          duration: 1050,
          ease: 'Sine.easeOut',
          onComplete: () => ring.destroy()
        });
      }
    });
  }

  createRiverLife() {
    const lanes = [2490, 2540, 2600, 2650];
    lanes.forEach((x, laneIndex) => {
      for (let i = 0; i < 7; i++) {
        const y = 170 + i * 340 + laneIndex * 55;
        const wave = this.add.ellipse(x, y, 62 + laneIndex * 6, 10, 0x9cecff, 0.22)
          .setDepth(18).setAngle(laneIndex % 2 ? 8 : -8);
        this.tweens.add({
          targets: wave,
          y: y + 260,
          x: x + (laneIndex % 2 ? 22 : -18),
          alpha: { from: 0.08, to: 0.30 },
          duration: 5200 + laneIndex * 680 + i * 130,
          repeat: -1,
          ease: 'Linear',
          onRepeat: () => { wave.y = 100 + laneIndex * 30; }
        });
      }
    });

    for (let i = 0; i < 12; i++) {
      const bubble = this.add.circle(2480 + Phaser.Math.Between(20, 180), 300 + i * 170, Phaser.Math.Between(2, 5), 0xd8fbff, 0.34)
        .setStrokeStyle(1, 0xffffff, 0.34).setDepth(19);
      this.tweens.add({
        targets: bubble,
        y: bubble.y - Phaser.Math.Between(36, 72),
        alpha: 0,
        duration: Phaser.Math.Between(1400, 2500),
        delay: i * 180,
        repeat: -1,
        ease: 'Sine.easeOut'
      });
    }
  }

  createCloudLayers() {
    if (this.cloudLayerCreated) return;
    this.cloudLayerCreated = true;

    const clouds = [
      // Mais visíveis e distribuídas já na região inicial/rio.
      { key: 'arena-cloud-01', x: 380, y: 280, width: 330, alpha: 0.70, depth: 9055, duration: 36000, driftX: 620, driftY: -16, flipX: false },
      { key: 'arena-cloud-02', x: 980, y: 520, width: 280, alpha: 0.64, depth: 9050, duration: 39000, driftX: 740, driftY: 20, flipX: true },
      { key: 'arena-cloud-03', x: 1540, y: 420, width: 340, alpha: 0.66, depth: 9052, duration: 41000, driftX: 820, driftY: -18, flipX: false },
      { key: 'arena-cloud-04', x: 2160, y: 700, width: 290, alpha: 0.58, depth: 9048, duration: 43000, driftX: 840, driftY: 22, flipX: true },
      { key: 'arena-cloud-05', x: 1740, y: 1380, width: 320, alpha: 0.52, depth: 9042, duration: 48000, driftX: 960, driftY: 32, flipX: false },
      { key: 'arena-cloud-01', x: 2860, y: 1260, width: 300, alpha: 0.48, depth: 9040, duration: 52000, driftX: 760, driftY: -20, flipX: true }
    ];

    clouds.forEach((cfg, index) => {
      const source = this.textures.get(cfg.key).getSourceImage();
      const cloud = this.add.image(cfg.x, cfg.y, cfg.key)
        .setOrigin(0.5)
        .setDepth(cfg.depth)
        .setAlpha(cfg.alpha)
        .setDisplaySize(cfg.width, cfg.width * (source.height / source.width))
        .setFlipX(!!cfg.flipX);

      this.tweens.add({
        targets: cloud,
        x: cfg.x + cfg.driftX,
        y: cfg.y + cfg.driftY,
        duration: cfg.duration,
        repeat: -1,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });

      this.tweens.add({
        targets: cloud,
        alpha: { from: Math.max(0.42, cfg.alpha - 0.10), to: Math.min(0.84, cfg.alpha + 0.10) },
        duration: 2800 + index * 220,
        repeat: -1,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });
    });
  }

  createBirdAnimations() {
    const makeAnim = (key, sheetKey, frameRate = 8) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(sheetKey, { start: 0, end: 3 }),
        frameRate,
        repeat: -1,
        yoyo: true
      });
    };

    makeAnim('bird-swallow-fly', 'bird-swallow-sheet', 8.5);
    makeAnim('bird-sparrow-fly', 'bird-sparrow-sheet', 7.2);
  }

  createBirdFlocks() {
    if (this.birdLayerCreated) return;
    this.birdLayerCreated = true;
    this.birdSprites = [];

    const flockConfigs = [
      {
        lead: { sheetKey: 'bird-swallow-sheet', animKey: 'bird-swallow-fly' },
        startX: 260, startY: 240,
        endX: 3480, endY: 390,
        scale: 0.18, alpha: 0.96, depth: 9096,
        duration: 42000, bob: 14, bobDuration: 2200,
        formation: [
          { dx: 0, dy: 0, scaleMul: 1.00 },
          { dx: -42, dy: 18, scaleMul: 0.88 },
          { dx: 34, dy: -14, scaleMul: 0.82 }
        ]
      },
      {
        lead: { sheetKey: 'bird-swallow-sheet', animKey: 'bird-swallow-fly' },
        startX: 3360, startY: 560,
        endX: 380, endY: 360,
        scale: 0.15, alpha: 0.90, depth: 9094,
        duration: 36500, bob: 12, bobDuration: 1900,
        formation: [
          { dx: 0, dy: 0, scaleMul: 1.00 },
          { dx: 26, dy: 16, scaleMul: 0.84 },
          { dx: -28, dy: -12, scaleMul: 0.80 }
        ]
      },
      {
        lead: { sheetKey: 'bird-sparrow-sheet', animKey: 'bird-sparrow-fly' },
        startX: 520, startY: 930,
        endX: 3140, endY: 790,
        scale: 0.17, alpha: 0.92, depth: 9092,
        duration: 45500, bob: 10, bobDuration: 2300,
        formation: [
          { dx: 0, dy: 0, scaleMul: 1.00 },
          { dx: -30, dy: 14, scaleMul: 0.86 },
          { dx: 38, dy: -10, scaleMul: 0.82 }
        ]
      },
      {
        lead: { sheetKey: 'bird-sparrow-sheet', animKey: 'bird-sparrow-fly' },
        startX: 2980, startY: 1340,
        endX: 680, endY: 1120,
        scale: 0.145, alpha: 0.86, depth: 9090,
        duration: 39200, bob: 9, bobDuration: 2000,
        formation: [
          { dx: 0, dy: 0, scaleMul: 1.00 },
          { dx: 24, dy: 12, scaleMul: 0.84 },
          { dx: -22, dy: -11, scaleMul: 0.80 }
        ]
      }
    ];

    const startFlight = (sprite, cfg, member, reverse = false) => {
      const fromX = (reverse ? cfg.endX : cfg.startX) + member.dx;
      const fromY = (reverse ? cfg.endY : cfg.startY) + member.dy;
      const toX = (reverse ? cfg.startX : cfg.endX) + member.dx;
      const toY = (reverse ? cfg.startY : cfg.endY) + member.dy;
      sprite.setPosition(fromX, fromY);
      sprite.setFlipX(toX < fromX);
      this.tweens.add({
        targets: sprite,
        x: toX,
        y: toY,
        duration: cfg.duration,
        ease: 'Sine.easeInOut',
        onComplete: () => startFlight(sprite, cfg, member, !reverse)
      });
    };

    flockConfigs.forEach((cfg, flockIndex) => {
      cfg.formation.forEach((member, memberIndex) => {
        const sprite = this.add.sprite(cfg.startX + member.dx, cfg.startY + member.dy, cfg.lead.sheetKey, 0)
          .setOrigin(0.5, 0.5)
          .setScale(cfg.scale * member.scaleMul)
          .setAlpha(Math.max(0.70, cfg.alpha - memberIndex * 0.05))
          .setDepth(cfg.depth + flockIndex + memberIndex * 0.1);
        sprite.play(cfg.lead.animKey);
        this.tweens.add({
          targets: sprite,
          y: sprite.y - (cfg.bob + memberIndex * 2),
          angle: { from: -1.6, to: 1.6 },
          duration: cfg.bobDuration + memberIndex * 120,
          repeat: -1,
          yoyo: true,
          ease: 'Sine.easeInOut'
        });
        startFlight(sprite, cfg, member, false);
        this.birdSprites.push(sprite);
      });
    });
  }


  createFishAnimations() {
    const makeAnim = (key, sheetKey, endFrame, frameRate = 5, yoyo = true, repeatDelay = 0) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(sheetKey, { start: 0, end: endFrame }),
        frameRate,
        repeat: -1,
        yoyo,
        repeatDelay
      });
    };

    makeAnim('fish-swim-blue', 'fish-swim-blue-sheet', 3, 4.2, true);
    makeAnim('fish-swim-orange', 'fish-swim-orange-sheet', 3, 4.0, true);
    makeAnim('fish-swim-teal', 'fish-swim-teal-sheet', 3, 4.4, true);
    makeAnim('fish-jump-trout', 'fish-jump-trout-sheet', 5, 7.2, false, 2200);
  }

  createRiverFish() {
    if (this.fishLayerCreated) return;
    this.fishLayerCreated = true;

    const schoolConfigs = [
      {
        key: 'fish-swim-blue-sheet',
        anim: 'fish-swim-blue',
        x: 660, y: 235,
        scale: 0.23,
        members: [
          { dx: 0, dy: 0, scaleMul: 1.00, angle: -12 },
          { dx: -22, dy: 18, scaleMul: 0.86, angle: -18 },
          { dx: 20, dy: 20, scaleMul: 0.82, angle: -8 }
        ],
        driftX: -26, driftY: 18, duration: 3800
      },
      {
        key: 'fish-swim-teal-sheet',
        anim: 'fish-swim-teal',
        x: 520, y: 690,
        scale: 0.22,
        members: [
          { dx: 0, dy: 0, scaleMul: 1.00, angle: -22 },
          { dx: 16, dy: 24, scaleMul: 0.82, angle: -28 },
          { dx: -20, dy: 20, scaleMul: 0.78, angle: -16 }
        ],
        driftX: 18, driftY: 24, duration: 4200
      },
      {
        key: 'fish-swim-orange-sheet',
        anim: 'fish-swim-orange',
        x: 430, y: 1220,
        scale: 0.21,
        members: [
          { dx: 0, dy: 0, scaleMul: 1.00, angle: -14 },
          { dx: 18, dy: 18, scaleMul: 0.84, angle: -8 },
          { dx: -18, dy: 22, scaleMul: 0.80, angle: -20 }
        ],
        driftX: -22, driftY: 22, duration: 4400
      },
      {
        key: 'fish-swim-blue-sheet',
        anim: 'fish-swim-blue',
        x: 295, y: 1860,
        scale: 0.20,
        members: [
          { dx: 0, dy: 0, scaleMul: 1.00, angle: -10 },
          { dx: 18, dy: 16, scaleMul: 0.82, angle: -16 },
          { dx: -15, dy: 18, scaleMul: 0.78, angle: -6 }
        ],
        driftX: 20, driftY: 26, duration: 4600
      }
    ];

    schoolConfigs.forEach((cfg, schoolIndex) => {
      const group = this.add.container(cfg.x, cfg.y).setDepth(44 + schoolIndex);
      cfg.members.forEach((member, memberIndex) => {
        const fish = this.add.sprite(member.dx, member.dy, cfg.key, 0)
          .setOrigin(0.5, 0.52)
          .setScale(cfg.scale * member.scaleMul)
          .setAngle(member.angle)
          .setAlpha(Math.max(0.78, 0.96 - memberIndex * 0.06));
        fish.play(cfg.anim);
        group.add(fish);
        this.tweens.add({
          targets: fish,
          angle: { from: member.angle - 3, to: member.angle + 3 },
          duration: 1200 + memberIndex * 180,
          repeat: -1,
          yoyo: true,
          ease: 'Sine.easeInOut'
        });
        this.fishSprites.push(fish);
      });

      this.tweens.add({
        targets: group,
        x: cfg.x + cfg.driftX,
        y: cfg.y + cfg.driftY,
        duration: cfg.duration,
        repeat: -1,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });
    });

    const jumpConfigs = [
      { x: 610, y: 420, scale: 0.24, delay: 0 },
      { x: 448, y: 1080, scale: 0.23, delay: 1100 },
      { x: 208, y: 2140, scale: 0.22, delay: 1900 }
    ];

    jumpConfigs.forEach((cfg, index) => {
      const jumper = this.add.sprite(cfg.x, cfg.y, 'fish-jump-trout-sheet', 0)
        .setOrigin(0.5, 0.72)
        .setScale(cfg.scale)
        .setDepth(54 + index)
        .setAlpha(0.96);
      this.time.delayedCall(cfg.delay, () => {
        if (jumper?.active) jumper.play({ key: 'fish-jump-trout', startFrame: index % 2 === 0 ? 0 : 1 });
      });
      this.fishJumpSprites.push(jumper);

      this.tweens.add({
        targets: jumper,
        angle: { from: -2.5, to: 2.5 },
        duration: 800,
        repeat: -1,
        yoyo: true,
        ease: 'Sine.easeInOut',
        delay: cfg.delay
      });
    });
  }

  createAmbientCitizens() {
    const routes = [
      { x: 1470, y: 1420, tx: 1780, ty: 1390, color: 0x8e78c7, speed: 6200 },
      { x: 1530, y: 1280, tx: 1710, ty: 1495, color: 0xd65d71, speed: 5600 },
      { x: 960, y: 1250, tx: 1240, ty: 1320, color: 0x3f8ac7, speed: 6600 },
      { x: 680, y: 1980, tx: 1200, ty: 2010, color: 0x2f9b68, speed: 7200 },
      { x: 1960, y: 1340, tx: 2250, ty: 1420, color: 0xd6a84f, speed: 6100 }
    ];
    routes.forEach((route, index) => this.createCitizen(route, index));
  }

  createCitizen(route, index) {
    const c = this.add.container(route.x, route.y).setDepth(route.y + 22).setScale(0.86 + (index % 2) * 0.08);
    const shadow = this.add.ellipse(0, 23, 26, 9, 0x000000, 0.18);
    const leftLeg = this.add.rectangle(-4, 15, 5, 16, 0x13233d, 1).setOrigin(0.5, 0.1);
    const rightLeg = this.add.rectangle(4, 15, 5, 16, 0x13233d, 1).setOrigin(0.5, 0.1);
    const body = this.add.ellipse(0, 1, 20, 28, route.color, 1).setStrokeStyle(1, 0xffffff, 0.22);
    const head = this.add.circle(0, -18, 8, index % 2 ? 0x8f5a39 : 0xf0c39e, 1);
    c.add([shadow, leftLeg, rightLeg, body, head]);
    this.tweens.add({ targets: leftLeg, angle: { from: -16, to: 16 }, duration: 360, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: rightLeg, angle: { from: 16, to: -16 }, duration: 360, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
    this.tweens.add({
      targets: c,
      x: route.tx,
      y: route.ty,
      duration: route.speed,
      repeat: -1,
      yoyo: true,
      ease: 'Sine.easeInOut',
      onYoyo: () => { c.scaleX = -Math.abs(c.scaleX); },
      onRepeat: () => { c.scaleX = Math.abs(c.scaleX); }
    });
  }

  createWindowGlints() {
    const glints = [
      [750, 1745, 70], [810, 1745, 95], [1345, 1785, 120], [1410, 1785, 180],
      [1060, 1120, 250], [1120, 1120, 330], [1610, 800, 420], [1680, 800, 520],
      [2110, 1218, 620], [2185, 1218, 720], [450, 330, 790], [790, 340, 860]
    ];
    glints.forEach(([x, y, delay]) => {
      const shine = this.add.rectangle(x, y, 5, 28, 0xffffff, 0).setAngle(18).setDepth(y + 80);
      this.tweens.add({
        targets: shine,
        x: x + 28,
        alpha: { from: 0, to: 0.68 },
        duration: 720,
        delay,
        hold: 110,
        repeat: -1,
        repeatDelay: 5200 + delay,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });
    });
  }

  createSunLightSweep() {
    const beam = this.add.polygon(1800, 1150, [-260, -980, 120, -980, 420, 980, -120, 980], 0xfff4c7, 0.025)
      .setDepth(14010).setAngle(-12);
    this.tweens.add({ targets: beam, x: 2350, alpha: { from: 0.012, to: 0.048 }, duration: 14500, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
  }

  createNatureAnimations() {
    // Peixes estilizados sob a superfície do rio.
    const fishRoutes = [
      { x: 2520, y: 520, tx: 2635, ty: 720, duration: 6200 },
      { x: 2640, y: 1180, tx: 2505, ty: 1450, duration: 7400 },
      { x: 2515, y: 1910, tx: 2640, ty: 2220, duration: 6900 }
    ];
    fishRoutes.forEach((route, index) => {
      const fish = this.add.container(route.x, route.y).setDepth(20).setAlpha(0.48).setScale(0.8 + index * 0.08);
      fish.add(this.add.ellipse(0, 0, 28, 12, index % 2 ? 0xf3d58a : 0xd8fbff, 0.66));
      fish.add(this.add.triangle(-17, 0, 0, -7, -11, 0, 0, 7, index % 2 ? 0xf3d58a : 0xd8fbff, 0.58));
      fish.add(this.add.circle(8, -2, 1.5, 0x071529, 0.82));
      this.tweens.add({
        targets: fish,
        x: route.tx,
        y: route.ty,
        angle: { from: -6, to: 6 },
        duration: route.duration,
        repeat: -1,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onYoyo: () => { fish.scaleX = -Math.abs(fish.scaleX); },
        onRepeat: () => { fish.scaleX = Math.abs(fish.scaleX); }
      });
    });

    // Borboletas no parque e vaga-lumes na floresta.
    const butterflies = [[2900, 420], [3160, 530], [3370, 820], [3000, 1510], [3260, 1660]];
    butterflies.forEach(([x, y], index) => {
      const b = this.add.container(x, y).setDepth(y + 110).setScale(0.78 + (index % 3) * 0.10);
      const left = this.add.ellipse(-5, 0, 10, 15, index % 2 ? 0xf4b6c2 : 0xffd76a, 0.82);
      const right = this.add.ellipse(5, 0, 10, 15, index % 2 ? 0xb18cff : 0x8fe8ff, 0.82);
      b.add([left, right, this.add.rectangle(0, 1, 2, 12, 0x4b3423, 0.88)]);
      this.tweens.add({ targets: left, scaleX: 0.25, duration: 240 + index * 25, repeat: -1, yoyo: true });
      this.tweens.add({ targets: right, scaleX: 0.25, duration: 240 + index * 25, repeat: -1, yoyo: true });
      this.tweens.add({ targets: b, x: x + 80 - index * 8, y: y - 45 + index * 10, duration: 3800 + index * 420, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
    });

    for (let i = 0; i < 24; i++) {
      const x = Phaser.Math.Between(2850, 3380);
      const y = Phaser.Math.Between(1450, 2320);
      const glow = this.add.circle(x, y, Phaser.Math.Between(2, 4), 0xf3d58a, 0.12).setDepth(y + 120);
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.06, to: 0.82 },
        x: x + Phaser.Math.Between(-25, 25),
        y: y + Phaser.Math.Between(-35, 15),
        duration: Phaser.Math.Between(1200, 2600),
        delay: i * 95,
        repeat: -1,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });
    }

    // Folhas leves atravessando a reserva sem interferir na jogabilidade.
    this.time.addEvent({
      delay: 620,
      loop: true,
      callback: () => {
        const leaf = this.add.ellipse(Phaser.Math.Between(2860, 3370), Phaser.Math.Between(1400, 2050), 9, 5, Phaser.Math.RND.pick([0x76bc82, 0xd6a84f, 0xb27b4c]), 0.66)
          .setDepth(14500).setAngle(Phaser.Math.Between(-30, 30));
        this.tweens.add({
          targets: leaf,
          x: leaf.x + Phaser.Math.Between(30, 90),
          y: leaf.y + Phaser.Math.Between(70, 150),
          angle: leaf.angle + Phaser.Math.Between(120, 280),
          alpha: 0,
          duration: Phaser.Math.Between(2200, 3900),
          ease: 'Sine.easeInOut',
          onComplete: () => leaf.destroy()
        });
      }
    });
  }

  createCritter(x, y, emoji, area, scale = 0.9, floating = false, depth = null) {
    const t = this.add.text(x, y, emoji, { fontSize: `${Math.round(28 * scale)}px` }).setOrigin(0.5).setDepth(depth ?? y + 20);
    const wander = () => {
      const tx = Phaser.Math.Between(area.x, area.x + area.width);
      const ty = Phaser.Math.Between(area.y, area.y + area.height);
      this.tweens.add({
        targets: t,
        x: tx,
        y: ty,
        duration: Phaser.Math.Between(1800, 3800),
        ease: 'Sine.easeInOut',
        yoyo: false,
        onComplete: () => this.time.delayedCall(Phaser.Math.Between(400, 1200), wander)
      });
    };
    if (floating) {
      this.tweens.add({ targets: t, angle: { from: -4, to: 4 }, duration: 800, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: t, y: y - 8, duration: 900, repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
    }
    this.time.delayedCall(Phaser.Math.Between(200, 1200), wander);
    this.wildlife.push(t);
  }

  createHud() {
    const ctx = GameState.contexto || {};
    const aluno = ctx.aluno || {};
    const jogador = ctx.jogador || {};
    const respondidas = GameState.getRespondidasHoje();
    const limite = Math.max(1, GameState.getDailyLimit());
    const xpAtual = Number(jogador.xp || 0);
    const xpMeta = Math.max(1, Number(jogador.xpProximoNivel || 2000));
    const avatarTexture = GameState.avatarSelecionado === 'exploradora' ? 'avatar-girl-south' : 'avatar-boy-south';
    const profilePlateTexture = GameState.avatarSelecionado === 'exploradora' ? 'hud-profile-plate-girl-v5462' : 'hud-profile-plate-boy-v5462';

    const profile = this.add.container(18, 18).setScrollFactor(0).setDepth(16500);
    profile.add(this.add.image(0, 0, profilePlateTexture).setOrigin(0).setDisplaySize(300, 104));

    const stats = this.add.container(802, 12).setScrollFactor(0).setDepth(16500);
    stats.add(this.add.image(0, 0, 'hud-status-bar-v5461').setOrigin(0).setDisplaySize(460, 121));

    const hudButton = (x, y, width, height, callback) => {
      const hit = this.add.rectangle(x, y, width, height, 0xffffff, 0.001)
        .setScrollFactor(0)
        .setDepth(16600)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => this.tweens.add({ targets: hit, alpha: 0.14, duration: 80 }));
      hit.on('pointerout', () => this.tweens.add({ targets: hit, alpha: 0.001, duration: 100 }));
      hit.on('pointerdown', callback);
      return hit;
    };
    hudButton(920, 106, 112, 34, () => this.toggleMapOverlay());
    hudButton(1075, 106, 112, 34, () => this.openAvatarSceneSafely());
    hudButton(1226, 106, 112, 34, () => this.scene.start('MenuScene'));

    const mission = this.add.container(18, 624).setScrollFactor(0).setDepth(16400);
    mission.add(this.add.image(0, 0, 'hud-mission-banner-v5461').setOrigin(0).setDisplaySize(310, 81));

    this.createHudMiniMap();

  }

  createHudPanel(x, y, width, height, depth = 16000, accent = 0xd6a84f, style = 'default') {
    const container = this.add.container(x, y).setScrollFactor(0).setDepth(depth);
    const g = this.add.graphics();
    g.fillStyle(0x051124, 0.965);
    g.fillRoundedRect(0, 0, width, height, 18);
    g.lineStyle(4, accent, 0.98);
    g.strokeRoundedRect(2, 2, width - 4, height - 4, 18);
    g.lineStyle(1.6, 0xffe6ab, 0.35);
    g.strokeRoundedRect(8, 8, width - 16, height - 16, 14);
    g.lineStyle(1.1, 0x234b73, 0.32);
    g.strokeRoundedRect(12, 12, width - 24, height - 24, 12);
    g.fillStyle(0x15385e, style === 'stats' ? 0.18 : 0.12);
    g.fillRoundedRect(10, 10, width - 20, Math.max(18, height * 0.28), 12);
    container.add(g);

    const cornerSize = 14;
    const drawCorner = (cx, cy, flipX, flipY) => {
      const cg = this.add.graphics();
      cg.lineStyle(2.2, accent, 0.98);
      cg.lineBetween(cx, cy + cornerSize * flipY, cx, cy);
      cg.lineBetween(cx, cy, cx + cornerSize * flipX, cy);
      cg.lineStyle(1, 0xffe6ab, 0.42);
      cg.lineBetween(cx + 3 * flipX, cy, cx + cornerSize * flipX, cy);
      cg.lineBetween(cx, cy + 3 * flipY, cx, cy + cornerSize * flipY);
      container.add(cg);
    };
    drawCorner(12, 12, 1, 1);
    drawCorner(width - 12, 12, -1, 1);
    drawCorner(width - 12, height - 12, -1, -1);
    drawCorner(12, height - 12, 1, -1);
    return container;
  }

  drawHudIcon(container, x, y, kind, color = 0xd6a84f, alpha = 1) {
    const g = this.add.graphics();
    g.lineStyle(2, color, alpha);
    g.fillStyle(color, alpha);

    if (kind === 'coin') {
      g.fillCircle(x, y, 14);
      g.lineStyle(2, 0xffe5a3, 0.9);
      g.strokeCircle(x, y, 11);
      const star = this.add.text(x, y - 1, '★', { fontFamily: 'Georgia, serif', fontSize: '11px', color: '#7a4d0e' }).setOrigin(0.5);
      container.add([g, star]);
      return;
    }
    if (kind === 'book') {
      g.strokeRoundedRect(x - 13, y - 11, 12, 22, 2);
      g.strokeRoundedRect(x + 1, y - 11, 12, 22, 2);
      g.lineBetween(x, y - 10, x, y + 11);
      g.lineBetween(x - 9, y - 5, x - 3, y - 5);
      g.lineBetween(x + 4, y - 5, x + 10, y - 5);
    } else if (kind === 'map') {
      g.strokePoints([{x:x-13,y:y-8},{x:x-4,y:y-11},{x:x+4,y:y-7},{x:x+13,y:y-10},{x:x+13,y:y+9},{x:x+4,y:y+11},{x:x-4,y:y+7},{x:x-13,y:y+10}], true);
      g.lineBetween(x-4,y-11,x-4,y+7);
      g.lineBetween(x+4,y-7,x+4,y+11);
    } else if (kind === 'avatar') {
      g.fillCircle(x, y - 6, 6);
      g.fillRoundedRect(x - 10, y + 2, 20, 12, 6);
    } else if (kind === 'menu') {
      [-8,0,8].forEach((dy) => g.lineBetween(x - 12, y + dy, x + 12, y + dy));
    } else if (kind === 'mission') {
      g.fillCircle(x, y, 17);
      container.add(g);
      const star = this.add.text(x, y - 1, '★', { fontFamily: 'Georgia, serif', fontSize: '17px', color: '#071529' }).setOrigin(0.5);
      container.add(star);
      return;
    } else if (kind === 'academy') {
      g.lineBetween(x - 10, y + 7, x + 10, y + 7);
      g.strokeRect(x - 7, y - 3, 14, 10);
      g.fillTriangle(x - 10, y - 3, x, y - 10, x + 10, y - 3);
      g.lineBetween(x - 4, y - 1, x - 4, y + 7);
      g.lineBetween(x + 4, y - 1, x + 4, y + 7);
    }
    container.add(g);
  }

  createHudButton(x, y, label, icon, callback, width = 132) {
    const container = this.add.container(x, y).setScrollFactor(0).setDepth(16600);
    const g = this.add.graphics();
    const draw = (hover = false) => {
      g.clear();
      g.fillStyle(hover ? 0x123b66 : 0x071b34, 0.985);
      g.fillRoundedRect(-width / 2, -22, width, 44, 22);
      g.lineStyle(3, 0xd6a84f, 1);
      g.strokeRoundedRect(-width / 2 + 1.5, -22 + 1.5, width - 3, 41, 22);
      g.lineStyle(1.2, hover ? 0xffe6ab : 0xffe6ab, hover ? 0.58 : 0.34);
      g.strokeRoundedRect(-width / 2 + 7, -16, width - 14, 29, 15);
    };
    draw(false);
    container.add(g);
    this.drawHudIcon(container, -width / 2 + 28, 0, icon, 0xf3d58a, 0.98);
    container.add(this.add.text(16, 0, label, {
      fontFamily: 'Georgia, Times New Roman, serif', fontSize: '16px', fontStyle: 'bold', color: '#ffffff'
    }).setOrigin(0.5));
    const hit = this.add.rectangle(0, 0, width, 44, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => draw(true));
    hit.on('pointerout', () => draw(false));
    hit.on('pointerdown', () => {
      if (!container.active) return;
      callback();
    });
    container.add(hit);
    return container;
  }

  openAvatarSceneSafely() {
    if (this.avatarTransitionInProgress) return;
    this.avatarTransitionInProgress = true;
    this.cameras.main.fadeOut(120, 6, 20, 38);
    this.time.delayedCall(130, () => {
      try {
        this.scene.start('AvatarScene');
      } catch (error) {
        this.avatarTransitionInProgress = false;
        console.error('[Arena Axoriin] Não foi possível abrir a seleção de avatar.', error);
        this.cameras.main.fadeIn(120, 6, 20, 38);
      }
    });
  }

  createHudMiniMap() {
    const smallScreen = this.scale.width < 920 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const size = smallScreen ? 158 : 176;
    const x = 1280 - size - 16;
    const y = 720 - size - 12;
    const c = this.add.container(x, y).setScrollFactor(0).setDepth(16450);
    c.add(this.add.image(0, 0, 'hud-mini-map-v5461').setOrigin(0).setDisplaySize(size, size));

    const mapX = 26;
    const mapY = 48;
    const mapW = size - 52;
    const mapH = size - 64;
    this.hudMiniPlayer = this.add.circle(mapX, mapY, 4.5, 0xffffff, 1).setStrokeStyle(2, 0xd6a84f, 1);
    c.add(this.hudMiniPlayer);
    this.hudMiniMetrics = { mapX, mapY, mapW, mapH };
    this.updateHudMiniMap();
  }

  updateHudMiniMap() {
    if (!this.hudMiniPlayer || !this.hudMiniMetrics || !this.player) return;
    const { mapX, mapY, mapW, mapH } = this.hudMiniMetrics;
    this.hudMiniPlayer.setPosition(
      mapX + (this.player.x / GAME_CONFIG.world.width) * mapW,
      mapY + (this.player.y / GAME_CONFIG.world.height) * mapH
    );
  }

  createGuidePanel() {
    const c = this.add.container(440, 506).setScrollFactor(0).setDepth(15500);
    c.add(this.add.image(0, 0, 'hud-guide-panel-v5461').setOrigin(0).setDisplaySize(420, 140));
    this.guidePanel = c;
    this.time.delayedCall(9000, () => {
      if (!c.active) return;
      this.tweens.add({ targets: c, alpha: 0, y: c.y + 20, duration: 420, onComplete: () => c.setVisible(false) });
    });
  }

  drawProfessorPortrait(container, x, y) {
    container.add(this.add.circle(x, y, 52, 0x08192e, 1).setStrokeStyle(4, 0xd6a84f, 0.95));
    container.add(this.add.circle(x, y, 44, 0x12355f, 1).setStrokeStyle(1, 0xffe4ad, 0.48));
    container.add(this.add.circle(x, y - 6, 19, 0xf1c9a5, 1));
    container.add(this.add.arc(x, y - 30, 27, 188, 352, false, 0x6b4b2a, 1).setStrokeStyle(6, 0x7a542f, 1));
    container.add(this.add.arc(x, y - 21, 36, 202, 338, false, 0x214d8b, 1).setStrokeStyle(3, 0xd6a84f, 0.95));
    container.add(this.add.rectangle(x, y - 30, 40, 8, 0x0b1f3a, 1).setStrokeStyle(2, 0xd6a84f, 0.9));
    container.add(this.add.ellipse(x, y + 14, 34, 30, 0xf3f0e8, 1));
    container.add(this.add.ellipse(x - 10, y + 20, 20, 16, 0xf3f0e8, 1));
    container.add(this.add.ellipse(x + 10, y + 20, 20, 16, 0xf3f0e8, 1));
    container.add(this.add.text(x, y + 44, '✦', { fontFamily: 'Georgia, serif', fontSize: '16px', color: '#f3d58a' }).setOrigin(0.5));
  }

  createInteractionHint() {
    const c = this.add.container(412, 648).setScrollFactor(0).setDepth(16500).setVisible(false);
    c.add(this.add.rectangle(0, 0, 456, 42, 0x051124, 0.90).setOrigin(0).setStrokeStyle(2, 0xd6a84f, 0.55));
    c.add(this.add.image(26, 21, 'hud-interact-emblem-v5461').setOrigin(0.5).setDisplaySize(24, 24));
    this.interactionHintText = this.add.text(238, 21, '', {
      fontFamily: 'Georgia, Times New Roman, serif', fontSize: '14px', fontStyle: 'bold', color: '#f3d58a', align: 'center', wordWrap: { width: 390 }
    }).setOrigin(0.5);
    c.add(this.interactionHintText);
    this.interactionHint = c;
  }

  updateInteractionHint() {
    if (!this.interactionHint || !this.interactionHintText) return;
    if (!this.nearestLocation || this.mapOpen) {
      this.interactionHint.setVisible(false);
      return;
    }
    const restantes = GameState.getRestantesHoje();
    const loc = this.nearestLocation;
    const text = restantes > 0
      ? `Pressione E para entrar em ${loc.nome}  •  ${loc.area}`
      : 'Missões do dia concluídas! Você pode explorar a cidade e voltar amanhã.';
    this.interactionHintText.setText(text);
    this.interactionHint.setVisible(true);
  }

  createMobileControls() {
    const isTouchDevice = Boolean(
      window.AxoriinMobile?.isTouchDevice?.() ||
      window.matchMedia?.('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    );

    const controls = this.add.container(0, 0)
      .setScrollFactor(0)
      .setDepth(19000)
      .setVisible(isTouchDevice);

    this.mobileControls = controls;
    if (!isTouchDevice) return;

    const centerX = 118;
    const centerY = 604;
    const outerRadius = 90;
    const travelRadius = 52;
    const deadZone = 0.13;

    const shadow = this.add.ellipse(centerX, centerY + 64, 176, 44, 0x020811, 0.42);
    const outer = this.add.circle(centerX, centerY, outerRadius, 0x071529, 0.58)
      .setStrokeStyle(4, 0xd6a84f, 0.72);
    const middle = this.add.circle(centerX, centerY, 72, 0x0b2442, 0.72)
      .setStrokeStyle(2, 0xffe6ab, 0.32);
    const guide = this.add.circle(centerX, centerY, travelRadius, 0x12355f, 0.26)
      .setStrokeStyle(2, 0x76b9ff, 0.28);
    const knobShadow = this.add.ellipse(centerX, centerY + 14, 78, 42, 0x000000, 0.36);
    const knob = this.add.circle(centerX, centerY, 38, 0x17243a, 0.98)
      .setStrokeStyle(3, 0xf3d58a, 0.86);
    const knobHighlight = this.add.circle(centerX - 9, centerY - 11, 16, 0x5d6f8a, 0.34);
    const caption = this.add.text(centerX, centerY + 108, 'ANALÓGICO', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      fontStyle: '900',
      color: '#f3d58a',
      backgroundColor: 'rgba(5, 17, 36, 0.72)',
      padding: { x: 8, y: 3 }
    }).setOrigin(0.5);
    const hit = this.add.circle(centerX, centerY, 108, 0xffffff, 0.001)
      .setInteractive(new Phaser.Geom.Circle(0, 0, 108), Phaser.Geom.Circle.Contains);

    controls.add([shadow, outer, middle, guide, knobShadow, knob, knobHighlight, caption, hit]);

    const setKnobPosition = (x, y) => {
      knob.setPosition(x, y);
      knobHighlight.setPosition(x - 9, y - 11);
      knobShadow.setPosition(x, y + 14);
    };

    const resetStick = () => {
      this.virtualStick = { active: false, pointerId: null, x: 0, y: 0, magnitude: 0 };
      setKnobPosition(centerX, centerY);
      knob.setFillStyle(0x17243a, 0.98).setStrokeStyle(3, 0xf3d58a, 0.86);
      outer.setStrokeStyle(4, 0xd6a84f, 0.72);
    };

    const updateStick = (pointer) => {
      if (this.virtualStick.pointerId !== null && pointer.id !== this.virtualStick.pointerId) return;

      const dx = pointer.x - centerX;
      const dy = pointer.y - centerY;
      const distance = Math.hypot(dx, dy);
      const clampedDistance = Math.min(distance, travelRadius);
      const unitX = distance > 0 ? dx / distance : 0;
      const unitY = distance > 0 ? dy / distance : 0;
      const rawMagnitude = Phaser.Math.Clamp(distance / travelRadius, 0, 1);
      const magnitude = rawMagnitude <= deadZone
        ? 0
        : Phaser.Math.Clamp((rawMagnitude - deadZone) / (1 - deadZone), 0, 1);

      setKnobPosition(
        centerX + unitX * clampedDistance,
        centerY + unitY * clampedDistance
      );

      this.virtualStick.active = magnitude > 0;
      this.virtualStick.x = unitX;
      this.virtualStick.y = unitY;
      this.virtualStick.magnitude = magnitude;

      knob.setFillStyle(magnitude > 0 ? 0x235b93 : 0x17243a, 0.98);
      knob.setStrokeStyle(3, magnitude > 0 ? 0xffe6ab : 0xf3d58a, 1);
      outer.setStrokeStyle(4, magnitude > 0 ? 0x76b9ff : 0xd6a84f, magnitude > 0 ? 0.95 : 0.72);
    };

    const startStick = (pointer) => {
      pointer.event?.preventDefault?.();
      if (this.virtualStick.pointerId !== null) return;
      this.virtualStick.pointerId = pointer.id;
      updateStick(pointer);
    };

    const moveStick = (pointer) => {
      if (pointer.id !== this.virtualStick.pointerId || !pointer.isDown) return;
      pointer.event?.preventDefault?.();
      updateStick(pointer);
    };

    const endStick = (pointer) => {
      if (pointer.id !== this.virtualStick.pointerId) return;
      pointer.event?.preventDefault?.();
      resetStick();
    };

    hit.on('pointerdown', startStick);
    this.input.on('pointermove', moveStick);
    this.input.on('pointerup', endStick);
    this.input.on('pointerupoutside', endStick);

    const interactShadow = this.add.circle(1122, 638, 57, 0x071529, 0.82)
      .setStrokeStyle(3, 0xf3d58a, 0.42);
    const interact = this.add.circle(1122, 634, 50, 0xd6a84f, 1)
      .setStrokeStyle(4, 0xffe6ab, 1)
      .setInteractive(new Phaser.Geom.Circle(0, 0, 62), Phaser.Geom.Circle.Contains);
    const label = this.add.text(1122, 630, 'E', {
      fontFamily: 'Georgia, Times New Roman, serif',
      fontSize: '34px',
      fontStyle: '900',
      color: '#071529'
    }).setOrigin(0.5);
    const interactCaption = this.add.text(1122, 686, 'INTERAGIR', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      fontStyle: '900',
      color: '#f3d58a',
      backgroundColor: 'rgba(5, 17, 36, 0.76)',
      padding: { x: 8, y: 3 }
    }).setOrigin(0.5);

    const interactNow = (pointer) => {
      pointer.event?.preventDefault?.();
      interact.setFillStyle(0xf3d58a, 1).setScale(0.94);
      this.nearestLocation = this.findNearestLocation();
      this.tryInteract();
      this.time.delayedCall(110, () => {
        if (interact.active) interact.setFillStyle(0xd6a84f, 1).setScale(1);
      });
    };

    interact.on('pointerdown', interactNow);
    label.setInteractive({ useHandCursor: true }).on('pointerdown', interactNow);
    controls.add([interactShadow, interact, label, interactCaption]);

    const resetOnBlur = () => resetStick();
    const resetOnVisibility = () => { if (document.hidden) resetStick(); };
    window.addEventListener('blur', resetOnBlur);
    document.addEventListener('visibilitychange', resetOnVisibility);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      resetStick();
      this.input.off('pointermove', moveStick);
      this.input.off('pointerup', endStick);
      this.input.off('pointerupoutside', endStick);
      window.removeEventListener('blur', resetOnBlur);
      document.removeEventListener('visibilitychange', resetOnVisibility);
    });
  }

  createMapOverlay() {
    const overlay = this.add.container(640, 360).setScrollFactor(0).setDepth(20000).setVisible(false);
    overlay.add(this.add.rectangle(0, 0, 1030, 620, 0x071529, 0.975).setStrokeStyle(3, 0xd6a84f, 0.72));
    overlay.add(this.add.text(-455, -275, 'ARENA V5.42 • MAPA-BASE ÚNICO', {
      fontFamily: 'system-ui, sans-serif', fontSize: '25px', fontStyle: '900', color: '#ffffff'
    }));
    overlay.add(this.add.text(-455, -238, 'As coordenadas permanecem intactas; esta versão aprofunda o rio, as pontes, o Zoológico e a Floresta sem alterar os caminhos validados.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#f3d58a', wordWrap: { width: 850 }
    }));

    const mapX = -450;
    const mapY = -190;
    const mapW = 900;
    const mapH = 440;
    overlay.add(this.add.rectangle(mapX, mapY, mapW, mapH, 0x2d7d51, 1).setOrigin(0).setStrokeStyle(2, 0xffffff, 0.16));

    // Distritos técnicos.
    DISTRICTS.forEach((district) => {
      const x = mapX + (district.x / GAME_CONFIG.world.width) * mapW;
      const y = mapY + (district.y / GAME_CONFIG.world.height) * mapH;
      const w = (district.width / GAME_CONFIG.world.width) * mapW;
      const h = (district.height / GAME_CONFIG.world.height) * mapH;
      overlay.add(this.add.rectangle(x, y, w, h, district.color, 0.10).setOrigin(0).setStrokeStyle(1, district.color, 0.42));
    });

    const riverX = mapX + (2545 / GAME_CONFIG.world.width) * mapW;
    const riverW = (235 / GAME_CONFIG.world.width) * mapW;
    overlay.add(this.add.rectangle(riverX, mapY, riverW, mapH, 0x1d83b7, 0.86).setOrigin(0));

    // Pontes no minimapa.
    [1068, 1748].forEach((bridgeY) => {
      const py = mapY + (bridgeY / GAME_CONFIG.world.height) * mapH;
      overlay.add(this.add.rectangle(riverX - 10, py - 5, riverW + 20, 10, 0x8b6b3a, 1).setOrigin(0));
    });

    LOCATIONS.forEach((loc) => {
      const px = mapX + (loc.x / GAME_CONFIG.world.width) * mapW;
      const py = mapY + (loc.y / GAME_CONFIG.world.height) * mapH;
      overlay.add(this.add.circle(px, py, 15, loc.color, 1).setStrokeStyle(2, 0xf3d58a, 0.72));
      overlay.add(this.add.text(px, py, loc.icon, { fontSize: '15px' }).setOrigin(0.5));
      overlay.add(this.add.text(px, py + 24, loc.nome, {
        fontFamily: 'system-ui, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#ffffff',
        backgroundColor: 'rgba(7,21,41,0.72)', padding: { x: 4, y: 2 }
      }).setOrigin(0.5));
    });

    this.mapPlayerDot = this.add.circle(0, 0, 9, 0xffffff, 1).setStrokeStyle(3, 0xf3d58a, 1);
    overlay.add(this.mapPlayerDot);

    const close = this.add.rectangle(395, -268, 150, 42, 0xd6a84f, 1).setStrokeStyle(2, 0xf3d58a, 1).setInteractive({ useHandCursor: true });
    const closeLabel = this.add.text(395, -268, 'Fechar mapa', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#071529'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleMapOverlay(false));
    closeLabel.on('pointerdown', () => this.toggleMapOverlay(false));
    overlay.add([close, closeLabel]);

    this.mapOverlay = overlay;
    this.mapMetrics = { mapX, mapY, mapW, mapH };
  }

  toggleMapOverlay(force) {
    const next = typeof force === 'boolean' ? force : !this.mapOpen;
    this.mapOpen = next;
    this.mapOverlay?.setVisible(next);
    this.interactionHint?.setVisible(false);
    this.virtualDirection = { up: false, down: false, left: false, right: false };
    if (next) this.updateMapPlayerMarker();
  }

  updateMapPlayerMarker() {
    if (!this.mapPlayerDot || !this.mapMetrics || !this.player) return;
    const { mapX, mapY, mapW, mapH } = this.mapMetrics;
    this.mapPlayerDot.setPosition(
      mapX + (this.player.x / GAME_CONFIG.world.width) * mapW,
      mapY + (this.player.y / GAME_CONFIG.world.height) * mapH
    );
  }

  createDistrictToast() {
    this.districtToast = this.add.container(640, 76).setScrollFactor(0).setDepth(15000).setAlpha(0);
    const g = this.add.graphics();
    g.fillStyle(0x071529, 0.94);
    g.fillRoundedRect(-180, -26, 360, 52, 18);
    g.lineStyle(2.5, 0xd6a84f, 0.84);
    g.strokeRoundedRect(-179, -25, 358, 50, 18);
    g.lineStyle(1, 0xffe4ad, 0.24);
    g.strokeRoundedRect(-170, -18, 340, 36, 12);
    this.districtToast.add(g);
    this.districtToastText = this.add.text(0, 0, '', {
      fontFamily: 'Georgia, Times New Roman, serif', fontSize: '18px', fontStyle: 'bold', color: '#f3d58a'
    }).setOrigin(0.5);
    this.districtToast.add(this.districtToastText);
  }

  updateDistrictIndicator(force = false) {
    const district = this.getDistrictAt(this.player.x, this.player.y);
    if (!district || (!force && district.id === this.currentDistrictId)) return;
    this.currentDistrictId = district.id;
    this.districtToastText.setText(district.nome);
    this.tweens.killTweensOf(this.districtToast);
    this.districtToast.setAlpha(0).setY(62);
    this.tweens.add({ targets: this.districtToast, alpha: 1, y: 78, duration: 260, yoyo: true, hold: 1600, ease: 'Sine.easeOut' });
  }

  getDistrictAt(x, y) {
    const found = DISTRICTS.find((d) => x >= d.x && x <= d.x + d.width && y >= d.y && y <= d.y + d.height);
    return found || { id: 'avenidas', nome: 'Avenidas da Cidade' };
  }

  createSparkleLoop() {
    this.time.addEvent({ delay: 1150, loop: true, callback: () => {
      const loc = Phaser.Utils.Array.GetRandom(LOCATIONS);
      const entry = this.getInteractionPoint(loc);
      const star = this.add.text(entry.x + Phaser.Math.Between(-58, 58), entry.y - 40 + Phaser.Math.Between(-12, 12), '✦', {
        fontSize: `${Phaser.Math.Between(15, 24)}px`, color: '#f3d58a'
      }).setDepth(12000).setAlpha(0.82);
      this.tweens.add({ targets: star, y: star.y - 30, alpha: 0, duration: 900, ease: 'Sine.easeOut', onComplete: () => star.destroy() });
    }});
  }

  findNearestLocation() {
    let nearest = null;
    let best = Infinity;
    LOCATIONS.forEach((loc) => {
      const entry = this.getInteractionPoint(loc);
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.x, entry.y);
      if (dist < loc.radius && dist < best) { nearest = loc; best = dist; }
    });
    return nearest;
  }

  tryInteract(loc = null, fromPointer = false) {
    if (this.mapOpen) return;
    const target = loc || this.nearestLocation;
    if (!target) return;
    const entry = this.getInteractionPoint(target);

    if (fromPointer) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.x, entry.y);
      if (distance > target.radius) {
        this.showApproachNotice(target);
        return;
      }
    }

    if (GameState.getRestantesHoje() <= 0) {
      this.showDailyLimitNotice();
      return;
    }
    GameState.escolherLocal(target);
    this.scene.start('DialogueScene', { localId: target.id });
  }

  showApproachNotice(target) {
    if (this.approachNotice) this.approachNotice.destroy();
    const entry = this.getInteractionPoint(target);
    const c = this.add.container(640, 565).setScrollFactor(0).setDepth(18200);
    c.add(this.add.rectangle(0, 0, 650, 96, 0x071529, 0.97).setStrokeStyle(2, 0xd6a84f, 0.58));
    c.add(this.add.text(0, -19, `Caminhe até a entrada de ${target.nome}`, { fontFamily: 'system-ui, sans-serif', fontSize: '20px', fontStyle: '900', color: '#f3d58a' }).setOrigin(0.5));
    c.add(this.add.text(0, 19, 'Siga o caminho até o ponto com a letra E. Lá a missão começará.', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#ffffff' }).setOrigin(0.5));
    this.approachNotice = c;

    if (this.destinationMarker) this.destinationMarker.destroy();
    const marker = this.add.container(entry.x, entry.y - 48).setDepth(14000);
    marker.add(this.add.circle(0, 0, 28, 0xf3d58a, 0.17).setStrokeStyle(3, 0xf3d58a, 0.95));
    marker.add(this.add.text(0, 0, '⌄', { fontFamily: 'system-ui, sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#f3d58a' }).setOrigin(0.5));
    this.destinationMarker = marker;
    this.tweens.add({ targets: marker, y: marker.y - 18, duration: 600, yoyo: true, repeat: 5, ease: 'Sine.easeInOut' });
    this.time.delayedCall(2600, () => { if (c.active) c.destroy(); });
    this.time.delayedCall(7200, () => { if (marker.active) marker.destroy(); });
  }

  showDailyLimitNotice() {
    if (this.lockedNotice) this.lockedNotice.destroy();
    const c = this.add.container(640, 360).setScrollFactor(0).setDepth(18500);
    c.add(this.add.rectangle(0, 0, 680, 230, 0x071529, 0.97).setStrokeStyle(3, 0xd6a84f, 0.65));
    c.add(this.add.text(0, -70, 'Missões do dia concluídas!', { fontFamily: 'system-ui, sans-serif', fontSize: '30px', fontStyle: '900', color: '#f3d58a' }).setOrigin(0.5));
    c.add(this.add.text(0, -12, 'Você já respondeu as 10 questões liberadas para hoje. Continue explorando a cidade e volte amanhã para novas missões.', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#ffffff', align: 'center', wordWrap: { width: 560 } }).setOrigin(0.5));
    const ok = this.add.rectangle(0, 78, 170, 46, 0xd6a84f, 1).setInteractive({ useHandCursor: true });
    const label = this.add.text(0, 78, 'Entendi', { fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#071529' }).setOrigin(0.5);
    ok.on('pointerdown', () => c.destroy());
    label.setInteractive({ useHandCursor: true }).on('pointerdown', () => c.destroy());
    c.add([ok, label]);
    this.lockedNotice = c;
  }
}
