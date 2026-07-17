import { GAME_CONFIG } from './config.js?v=20260717-v5-46-5-menu-sem-avatar-duplicado';
import { BootScene } from './scenes/BootScene.js?v=20260717-v5-46-5-menu-sem-avatar-duplicado';
import { MenuScene } from './scenes/MenuScene.js?v=20260717-v5-46-5-menu-sem-avatar-duplicado';
import { AvatarScene } from './scenes/AvatarScene.js?v=20260717-v5-46-5-menu-sem-avatar-duplicado';
import { MapScene } from './scenes/MapScene.js?v=20260717-v5-46-5-menu-sem-avatar-duplicado';
import { DialogueScene } from './scenes/DialogueScene.js?v=20260717-v5-46-5-menu-sem-avatar-duplicado';
import { QuizScene } from './scenes/QuizScene.js?v=20260717-v5-46-5-menu-sem-avatar-duplicado';
import { ResultScene } from './scenes/ResultScene.js?v=20260717-v5-46-5-menu-sem-avatar-duplicado';

function showFatalError(error) {
  const container = document.getElementById('game-container');
  if (!container || container.querySelector('[data-arena-error]')) return;
  const message = error?.message || error?.reason?.message || String(error?.reason || error || 'Erro desconhecido');
  const panel = document.createElement('div');
  panel.dataset.arenaError = 'true';
  panel.style.cssText = 'position:absolute;inset:20px;z-index:99999;padding:24px;border:2px solid rgba(214,168,79,.7);border-radius:18px;background:#071529;color:#fff;font-family:system-ui;overflow:auto';
  panel.innerHTML = `<h2 style="color:#f3d58a;margin-top:0">A Arena encontrou um erro</h2><p>Recarregue a página. Se o problema continuar, copie a mensagem abaixo:</p><pre style="white-space:pre-wrap;color:#ffb4b4;background:#0b1f3a;padding:14px;border-radius:10px">${escapeHtml(message)}</pre>`;
  container.style.position = 'relative';
  container.appendChild(panel);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

window.addEventListener('error', (event) => showFatalError(event.error || event.message));
window.addEventListener('unhandledrejection', (event) => showFatalError(event.reason));

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
    width: GAME_CONFIG.viewport.width,
    height: GAME_CONFIG.viewport.height,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, pixelArt: false },
    scene: [BootScene, MenuScene, AvatarScene, MapScene, DialogueScene, QuizScene, ResultScene]
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
