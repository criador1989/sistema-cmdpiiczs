import { GAME_CONFIG } from './config.js?v=20260718-v5-46-8-joystick-touch-fix';
import { BootScene } from './scenes/BootScene.js?v=20260718-v5-46-8-joystick-touch-fix';
import { MenuScene } from './scenes/MenuScene.js?v=20260718-v5-46-8-joystick-touch-fix';
import { AvatarScene } from './scenes/AvatarScene.js?v=20260718-v5-46-8-joystick-touch-fix';
import { MapScene } from './scenes/MapScene.js?v=20260718-v5-46-8-joystick-touch-fix';
import { DialogueScene } from './scenes/DialogueScene.js?v=20260718-v5-46-8-joystick-touch-fix';
import { QuizScene } from './scenes/QuizScene.js?v=20260718-v5-46-8-joystick-touch-fix';
import { ResultScene } from './scenes/ResultScene.js?v=20260718-v5-46-8-joystick-touch-fix';

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

function isTouchDevice() {
  return Boolean(
    window.matchMedia?.('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0 ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  );
}

function ensureRotateOverlay() {
  let overlay = document.getElementById('arena-rotate-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'arena-rotate-overlay';
  overlay.className = 'arena-rotate-overlay';
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="arena-rotate-card">
      <div class="arena-rotate-phone" aria-hidden="true">↻</div>
      <strong>Gire o celular</strong>
      <span>Use a Arena na horizontal para jogar em tela cheia.</span>
    </div>`;

  const stage = document.querySelector('.arena-stage') || document.body;
  stage.appendChild(overlay);
  return overlay;
}

function refreshGameScale() {
  window.setTimeout(() => {
    try {
      window.axoriinArenaGame?.scale?.refresh?.();
    } catch (error) {
      console.warn('[Arena Axoriin] Não foi possível recalcular a tela.', error);
    }
  }, 120);
}

function updateRotateOverlay() {
  const overlay = ensureRotateOverlay();
  const mobilePlaying = document.documentElement.classList.contains('arena-mobile-playing');
  const portrait = window.innerHeight > window.innerWidth;
  overlay.classList.toggle('is-visible', isTouchDevice() && mobilePlaying && portrait);
}

async function requestMobileGameMode() {
  if (!isTouchDevice()) return false;

  const stage = document.querySelector('.arena-stage') || document.documentElement;
  document.documentElement.classList.add('arena-mobile-game-mode');
  document.body.classList.add('arena-mobile-game-mode');

  try {
    if (!document.fullscreenElement && stage.requestFullscreen) {
      await stage.requestFullscreen({ navigationUI: 'hide' });
    } else if (!document.fullscreenElement && stage.webkitRequestFullscreen) {
      stage.webkitRequestFullscreen();
    }
  } catch (error) {
    console.warn('[Arena Axoriin] Tela cheia não foi autorizada pelo navegador.', error);
  }

  try {
    if (screen.orientation?.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch (error) {
    console.warn('[Arena Axoriin] O navegador não permitiu travar a orientação.', error);
  }

  window.scrollTo?.(0, 1);
  refreshGameScale();
  updateRotateOverlay();
  return true;
}

function setMobilePlaying(active) {
  document.documentElement.classList.toggle('arena-mobile-playing', Boolean(active));
  document.body.classList.toggle('arena-mobile-playing', Boolean(active));
  updateRotateOverlay();
  refreshGameScale();
}

window.AxoriinMobile = {
  isTouchDevice,
  requestGameMode: requestMobileGameMode,
  setPlaying: setMobilePlaying,
  refresh: refreshGameScale
};

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
    input: { activePointers: 6, touch: { capture: true }, windowEvents: true },
    scene: [BootScene, MenuScene, AvatarScene, MapScene, DialogueScene, QuizScene, ResultScene]
  };

  window.axoriinArenaGame = new Phaser.Game(config);
  ensureRotateOverlay();
}

boot();

const fullscreen = document.getElementById('btn-fullscreen');
if (fullscreen) {
  fullscreen.addEventListener('click', async () => {
    const stage = document.querySelector('.arena-stage');
    try {
      if (!document.fullscreenElement) {
        await stage.requestFullscreen({ navigationUI: 'hide' });
        try { await screen.orientation?.lock?.('landscape'); } catch (_) { /* navegador sem suporte */ }
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.warn('Tela cheia indisponível.', error);
    }
    refreshGameScale();
  });
}

document.addEventListener('fullscreenchange', () => {
  refreshGameScale();
  updateRotateOverlay();
});
window.addEventListener('orientationchange', () => {
  refreshGameScale();
  updateRotateOverlay();
});
window.addEventListener('resize', updateRotateOverlay, { passive: true });
