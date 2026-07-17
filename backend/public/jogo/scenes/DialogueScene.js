import { GAME_CONFIG } from '../config.js?v=20260717-v5-46-6-mobile-touch-corrigido';
import { GameState } from '../state.js?v=20260717-v5-46-6-mobile-touch-corrigido';
import { createStudentPortrait, createNpcPortrait } from '../ui/PortraitFactory.js?v=20260717-v5-46-6-mobile-touch-corrigido';

const DIALOGUES = {
  'escola-militar': {
    npc: 'Cadete, sua jornada começa com atenção, responsabilidade e coragem para aprender.',
    aluno: 'Professor Guardião, estou preparado para cumprir a missão de hoje!'
  },
  laboratorio: {
    npc: 'No laboratório, cada problema é uma pista. Vamos investigar a Matemática do 6º ano?',
    aluno: 'Vou observar os dados, calcular com calma e escolher a melhor resposta.'
  },
  biblioteca: {
    npc: 'Os livros guardam pistas importantes. Leia com cuidado antes de responder.',
    aluno: 'Vou procurar a ideia principal e prestar atenção às palavras do texto.'
  },
  zoologico: {
    npc: 'Observe os animais e seus ambientes. A natureza sempre tem algo para ensinar.',
    aluno: 'Estou pronto para descobrir como os seres vivos se relacionam.'
  },
  prefeitura: {
    npc: 'Uma cidade funciona melhor quando todos conhecem seus direitos e deveres.',
    aluno: 'Vou pensar em atitudes que ajudam a convivência e o bem comum.'
  },
  museu: {
    npc: 'Cada objeto conta uma parte da história. Vamos investigar o passado?',
    aluno: 'Vou observar as pistas e relacionar passado, presente e patrimônio.'
  },
  floresta: {
    npc: 'A floresta depende do equilíbrio entre pessoas, animais, água e vegetação.',
    aluno: 'Vou pensar em como podemos usar os recursos naturais com responsabilidade.'
  },
  praca: {
    npc: 'A praça reúne desafios rápidos de diferentes áreas do conhecimento.',
    aluno: 'Estou pronto para testar o que aprendi e avançar mais um pouco.'
  }
};

export class DialogueScene extends Phaser.Scene {
  constructor() { super('DialogueScene'); }

  init(data) {
    this.local = GameState.getLocationById(data?.localId || GameState.localAtual?.id);
    this.step = 0;
  }

  create() {
    this.cameras.main.setBackgroundColor('#071529');
    this.drawBackdrop();
    this.drawLocationCard();
    this.renderStep();

    this.input.keyboard.on('keydown-ESC', () => this.scene.start('MapScene'));
    this.input.keyboard.on('keydown-ENTER', () => this.advance());
    this.input.keyboard.on('keydown-SPACE', () => this.advance());
  }

  drawBackdrop() {
    const color = this.local?.color || GAME_CONFIG.colors.blue;
    this.add.rectangle(640, 360, 1280, 720, GAME_CONFIG.colors.navy);
    this.add.circle(185, 180, 250, color, 0.15);
    this.add.circle(1100, 590, 270, GAME_CONFIG.colors.gold, 0.09);
    const grid = this.add.graphics();
    grid.lineStyle(1, 0xffffff, 0.035);
    for (let x = 0; x <= 1280; x += 55) grid.lineBetween(x, 0, x, 720);
    for (let y = 0; y <= 720; y += 55) grid.lineBetween(0, y, 1280, y);
  }

  drawLocationCard() {
    this.add.rectangle(640, 70, 960, 94, 0x0b1f3a, 0.94).setStrokeStyle(2, 0xd6a84f, 0.45);
    this.add.text(640, 48, `${this.local.icon} ${this.local.nome}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '31px', fontStyle: '900', color: '#ffffff'
    }).setOrigin(0.5);
    this.add.text(640, 88, `${this.local.area} • ${this.local.district || 'Cidade do Conhecimento'}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#f3d58a'
    }).setOrigin(0.5);
  }

  renderStep() {
    if (this.dialogueObjects) this.dialogueObjects.forEach((obj) => obj.destroy());
    this.dialogueObjects = [];

    const lines = DIALOGUES[this.local.id] || DIALOGUES.praca;
    const npcSpeaking = this.step === 0;
    const npcPortrait = createNpcPortrait(this, 270, 325, this.local, { scale: npcSpeaking ? 1.16 : 1.0 });
    const studentPortrait = createStudentPortrait(this, 1010, 325, {
      pose: npcSpeaking ? 'neutral' : 'talk',
      facing: 'left',
      scale: npcSpeaking ? 1.0 : 1.16
    });
    npcPortrait.setAlpha(npcSpeaking ? 1 : 0.48);
    studentPortrait.setAlpha(npcSpeaking ? 0.48 : 1);
    this.dialogueObjects.push(npcPortrait, studentPortrait);

    const panel = this.add.rectangle(640, 520, 940, 205, 0x0b1f3a, 0.96).setStrokeStyle(3, 0xd6a84f, 0.58);
    const speaker = npcSpeaking ? (this.local.npc || 'Mentor') : (GameState.contexto?.aluno?.nome || 'Aluno');
    const text = npcSpeaking ? lines.npc : lines.aluno;
    const speakerText = this.add.text(210, 447, speaker, {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', fontStyle: '900', color: '#f3d58a'
    });
    const dialogueText = this.add.text(210, 485, text, {
      fontFamily: 'system-ui, sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#ffffff',
      wordWrap: { width: 850 }, lineSpacing: 6
    });
    this.dialogueObjects.push(panel, speakerText, dialogueText);

    if (npcSpeaking) {
      this.createButton(640, 624, 'Responder', () => this.advance(), 220, false);
      const instruction = this.add.text(640, 675, 'ENTER ou ESPAÇO para continuar', {
        fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#a9bdd4'
      }).setOrigin(0.5);
      this.dialogueObjects.push(instruction);
    } else {
      this.createButton(495, 624, 'Aceitar missão', () => this.scene.start('QuizScene'), 240, false);
      this.createButton(785, 624, 'Voltar à cidade', () => this.scene.start('MapScene'), 240, true);
    }
  }

  advance() {
    if (this.step === 0) {
      this.step = 1;
      this.renderStep();
    } else {
      this.scene.start('QuizScene');
    }
  }

  createButton(x, y, text, callback, width = 220, secondary = false) {
    const bg = this.add.rectangle(x, y, width, 50, secondary ? 0x10355f : 0xd6a84f, 1)
      .setStrokeStyle(2, secondary ? 0x64b5ff : 0xf3d58a, 0.82)
      .setInteractive({ useHandCursor: true });
    const label = this.add.text(x, y, text, {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: secondary ? '#ffffff' : '#071529'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setScale(1.03));
    bg.on('pointerout', () => bg.setScale(1));
    bg.on('pointerdown', callback);
    label.on('pointerdown', callback);
    this.dialogueObjects.push(bg, label);
  }
}
