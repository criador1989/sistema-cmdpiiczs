import { GAME_CONFIG } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { MapScene } from './scenes/MapScene.js';
import { QuizScene } from './scenes/QuizScene.js';
import { ResultScene } from './scenes/ResultScene.js';

function boot() {
  if (!window.Phaser) {
    const container = document.getElementById('game-container');
    container.innerHTML = '<div style="padding:24px;color:white;font-family:system-ui">Não foi possível carregar o Phaser. Verifique sua internet ou baixe o Phaser localmente.</div>';
    return;
  }

  const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: '#071529',
    width: GAME_CONFIG.world.width,
    height: GAME_CONFIG.world.height,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    render: {
      antialias: true,
      pixelArt: false
    },
    scene: [BootScene, MenuScene, MapScene, QuizScene, ResultScene]
  };

  window.axoriinArenaGame = new Phaser.Game(config);
}

boot();

const fullscreen = document.getElementById('btn-fullscreen');
if (fullscreen) {
  fullscreen.addEventListener('click', async () => {
    const stage = document.querySelector('.arena-stage');
    try {
      if (!document.fullscreenElement) await stage.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      console.warn('Tela cheia indisponível.', error);
    }
  });
}
