import { GAME_CONFIG } from '../config.js?v=20260718-v5-46-7-joystick-mobile-landscape';
import { carregarContextoJogo } from '../api.js?v=20260718-v5-46-7-joystick-mobile-landscape';
import { GameState } from '../state.js?v=20260718-v5-46-7-joystick-mobile-landscape';

const DIRECTIONS = [
  'south', 'south_east', 'east', 'north_east',
  'north', 'north_west', 'west', 'south_west'
];
const WALK_FRAME_COUNT = 6;
const OFFICIAL_AVATARS = [
  { key: 'boy', base: './jogo/assets/avatars/boy' },
  { key: 'girl', base: './jogo/assets/avatars/girl' }
];

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    this.load.image('menu-axoriin-v5461', './jogo/assets/ui/menu/menu_axoriin_v5461.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('avatar-selection-v5461', './jogo/assets/ui/avatar/avatar_selection_v5461.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('hud-profile-plate-boy-v5462', './jogo/assets/ui/hud_separado/profile_plate_boy.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('hud-profile-plate-girl-v5462', './jogo/assets/ui/hud_separado/profile_plate_girl.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('hud-status-bar-v5461', './jogo/assets/ui/hud_separado/status_bar.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('hud-mission-banner-v5461', './jogo/assets/ui/hud_separado/mission_banner.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('hud-mini-map-v5461', './jogo/assets/ui/hud_separado/mini_map_frame.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('hud-guide-panel-v5461', './jogo/assets/ui/hud_separado/guide_panel.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('hud-place-label-v5461', './jogo/assets/ui/hud_separado/place_label.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('hud-interact-emblem-v5461', './jogo/assets/ui/hud_separado/interact_emblem.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('hud-frame-panel-v5461', './jogo/assets/ui/hud_separado/frame_panel.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('arena-ground-complete-v542', './jogo/assets/environment/base_map/arena_ground_complete_v542.png?v=20260718-v5-46-7-joystick-mobile-landscape');

    const plazaBase = './jogo/assets/environment/plaza';
    [
      ['plaza-unified-floor', 'plaza_floor.png'],
      ['plaza-unified-fountain', 'plaza_fountain.png'],
      ['plaza-unified-tree', 'plaza_tree.png'],
      ['plaza-unified-tree-pine', 'plaza_tree_pine.png'],
      ['plaza-unified-tree-flower', 'plaza_tree_flower.png'],
      ['plaza-unified-tree-old', 'plaza_tree_old.png'],
      ['plaza-unified-bench', 'plaza_bench.png'],
      ['plaza-unified-lamp', 'plaza_lamp.png'],
      ['plaza-unified-gazebo', 'plaza_gazebo.png'],
      ['plaza-unified-planter', 'plaza_planter.png']
    ].forEach(([key, file]) => this.load.image(key, `${plazaBase}/${file}?v=20260718-v5-46-7-joystick-mobile-landscape`));


    const centralV2Base = './jogo/assets/environment/central_v2';
    [
      ['central-v2-ground', 'central_ground_v2.png'],
      ['central-v2-library', 'library_v2.png'],
      ['central-v2-cityhall', 'cityhall_v2.png'],
      ['central-v2-museum', 'museum_v2.png'],
      ['central-v2-fountain-v5454', 'fountain_v5454.png'],
      ['central-v2-tree-round', 'tree_round_v2.png'],
      ['central-v2-tree-old', 'tree_old_v2.png'],
      ['central-v2-tree-flower', 'tree_flower_v2.png'],
      ['central-v2-tree-tall', 'tree_tall_v2.png'],
      ['central-v2-bench', 'bench_v2.png'],
      ['central-v2-lamp', 'lamp_v2.png'],
      ['central-v2-planter', 'planter_v2.png']
    ].forEach(([key, file]) => this.load.image(key, `${centralV2Base}/${file}?v=20260718-v5-46-7-joystick-mobile-landscape`));

    const vegetationBase = './jogo/assets/environment/vegetation';
    [
      ['arena-grass-01', 'grass_seamless_01.png'],
      ['arena-grass-02', 'grass_seamless_02.png'],
      ['arena-groundcover-01', 'groundcover_01.png'],
      ['arena-groundcover-02', 'groundcover_02.png'],
      ['arena-groundcover-03', 'groundcover_03.png']
    ].forEach(([key, file]) => this.load.image(
      key,
      `${vegetationBase}/${file}?v=20260718-v5-46-7-joystick-mobile-landscape`
    ));

    this.load.image('arena-river-water', './jogo/assets/environment/water/river_surface_01.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('arena-river-flow-overlay', './jogo/assets/environment/water/river_flow_overlay_tile_512.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('arena-river-highlights-overlay', './jogo/assets/environment/water/river_highlights_overlay_tile_512.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.image('arena-river-mask', './jogo/assets/environment/water/river_mask_v5446.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    this.load.spritesheet('arena-river-sparkle-sheet', './jogo/assets/environment/water/river_sparkle_sheet_4x128.png?v=20260718-v5-46-7-joystick-mobile-landscape', {
      frameWidth: 128,
      frameHeight: 128
    });


    const cloudsBase = './jogo/assets/environment/clouds';
    [
      ['arena-cloud-01', 'cloud_soft_01.png'],
      ['arena-cloud-02', 'cloud_soft_02.png'],
      ['arena-cloud-03', 'cloud_soft_03.png'],
      ['arena-cloud-04', 'cloud_soft_04.png'],
      ['arena-cloud-05', 'cloud_soft_05.png']
    ].forEach(([key, file]) => this.load.image(key, `${cloudsBase}/${file}?v=20260718-v5-46-7-joystick-mobile-landscape`));

    const birdsBase = './jogo/assets/environment/birds';
    this.load.spritesheet('bird-swallow-sheet', `${birdsBase}/bird_swallow_sheet.png?v=20260718-v5-46-7-joystick-mobile-landscape`, {
      frameWidth: 384,
      frameHeight: 384
    });
    this.load.spritesheet('bird-sparrow-sheet', `${birdsBase}/bird_sparrow_sheet.png?v=20260718-v5-46-7-joystick-mobile-landscape`, {
      frameWidth: 384,
      frameHeight: 384
    });

    const fishBase = './jogo/assets/environment/fish';
    this.load.spritesheet('fish-swim-blue-sheet', `${fishBase}/fish_swim_blue_sheet.png?v=20260718-v5-46-7-joystick-mobile-landscape`, {
      frameWidth: 128,
      frameHeight: 128
    });
    this.load.spritesheet('fish-swim-orange-sheet', `${fishBase}/fish_swim_orange_sheet.png?v=20260718-v5-46-7-joystick-mobile-landscape`, {
      frameWidth: 128,
      frameHeight: 128
    });
    this.load.spritesheet('fish-swim-teal-sheet', `${fishBase}/fish_swim_teal_sheet.png?v=20260718-v5-46-7-joystick-mobile-landscape`, {
      frameWidth: 128,
      frameHeight: 128
    });
    this.load.spritesheet('fish-jump-trout-sheet', `${fishBase}/fish_jump_trout_sheet.png?v=20260718-v5-46-7-joystick-mobile-landscape`, {
      frameWidth: 192,
      frameHeight: 192
    });


    const treesV537Base = './jogo/assets/environment/trees_v537';
    [
      ['tree-v537-round', 'tree_round_v537.png'],
      ['tree-v537-ancient', 'tree_ancient_v537.png'],
      ['tree-v537-columnar', 'tree_columnar_v537.png'],
      ['tree-v537-blossom', 'tree_blossom_v537.png'],
      ['tree-v537-pine', 'tree_pine_v537.png']
    ].forEach(([key, file]) => this.load.image(key, `${treesV537Base}/${file}?v=20260718-v5-46-7-joystick-mobile-landscape`));

    this.load.image('military-school-final', './jogo/assets/environment/landmarks/military_school_final.png?v=20260718-v5-46-7-joystick-mobile-landscape');
    [
      ['landmark-library', 'library_refined.png'],
      ['landmark-laboratory', 'laboratory_refined.png'],
      ['landmark-cityhall', 'cityhall_refined.png'],
      ['landmark-museum', 'museum_refined.png'],
      ['landmark-zoo', 'zoo_refined.png']
    ].forEach(([key, file]) => this.load.image(key, `./jogo/assets/environment/landmarks/${file}?v=20260718-v5-46-7-joystick-mobile-landscape`));

    const animalsBase = './jogo/assets/environment/animals';
    [
      ['zoo-horse-sheet', 'horse_sheet.png'],
      ['zoo-lion-sheet', 'lion_sheet.png'],
      ['zoo-giraffe-sheet', 'giraffe_sheet.png'],
      ['zoo-monkey-sheet', 'monkey_sheet.png'],
      ['zoo-zebra-sheet', 'zebra_sheet.png']
    ].forEach(([key, file]) => this.load.spritesheet(key, `${animalsBase}/${file}?v=20260718-v5-46-7-joystick-mobile-landscape`, { frameWidth: 512, frameHeight: 512 }));

    OFFICIAL_AVATARS.forEach((avatar) => {
      DIRECTIONS.forEach((direction) => {
        this.load.image(
          `avatar-${avatar.key}-${direction}`,
          `${avatar.base}/idle_${direction}.png?v=20260718-v5-46-7-joystick-mobile-landscape`
        );

        for (let i = 0; i < WALK_FRAME_COUNT; i++) {
          this.load.image(
            `avatar-${avatar.key}-walk-${direction}-${i}`,
            `${avatar.base}/walk/${direction}_${i}.png?v=20260718-v5-46-7-joystick-mobile-landscape`
          );
        }
      });
    });
  }

  create() {
    this.cameras.main.setBackgroundColor('#071529');
    this.drawLoadingScreen();
    this.carregar();
  }

  drawLoadingScreen() {
    const { colors } = GAME_CONFIG;
    this.add.rectangle(640, 360, 1280, 720, colors.navy);
    this.add.circle(640, 284, 116, colors.blue, 0.16);
    this.add.circle(640, 284, 74, colors.gold, 0.13);
    this.add.text(640, 270, 'A', {
      fontFamily: 'system-ui, sans-serif', fontSize: '70px', fontStyle: '900', color: '#f3d58a'
    }).setOrigin(0.5);
    this.add.text(640, 360, 'Carregando Colégio Virtual Axoriin...', {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', fontStyle: 'bold', color: '#ffffff'
    }).setOrigin(0.5);
    this.add.text(640, 404, 'Preparando os avatares masculino e feminino', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#a9bdd4'
    }).setOrigin(0.5);

    const g = this.add.graphics();
    g.lineStyle(2, colors.gold, 0.35);
    g.strokeRoundedRect(440, 455, 400, 18, 9);
    const bar = this.add.rectangle(450, 464, 10, 10, colors.goldLight, 1).setOrigin(0, 0.5);
    this.tweens.add({ targets: bar, displayWidth: 380, duration: 650, ease: 'Sine.easeInOut' });
  }

  async carregar() {
    try {
      const contexto = await carregarContextoJogo();
      GameState.setContexto(contexto);
    } catch (error) {
      console.error(error);
    }
    this.time.delayedCall(720, () => this.scene.start('MenuScene'));
  }
}
