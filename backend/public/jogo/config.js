export const GAME_CONFIG = {
  title: 'Arena do Conhecimento',
  subtitle: 'Missões educacionais do Portal do Aluno',
  version: '0.1.0-mvp',
  portalUrl: window.AXORIIN_ARENA?.portalUrl || './painel-aluno.html',
  apiBase: window.AXORIIN_ARENA?.apiBase || '/api/aluno/jogo',
  colors: {
    navy: 0x071529,
    blueDark: 0x0b1f3a,
    blue: 0x1f6fb5,
    blueLight: 0x64b5ff,
    gold: 0xd6a84f,
    goldLight: 0xf3d58a,
    white: 0xffffff,
    muted: 0xa9bdd4,
    green: 0x48c78e,
    red: 0xff6b6b,
    panel: 0x10233f
  },
  world: {
    width: 1280,
    height: 720
  }
};

export const UI = {
  font: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  titleStyle: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    fontSize: '42px',
    fontStyle: 'bold',
    color: '#ffffff'
  },
  smallStyle: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    fontSize: '16px',
    color: '#a9bdd4'
  }
};
