Arena do Conhecimento — Kit de desenvolvimento do efeito do rio V1

Arquivos:
- river_flow_overlay_tile_512.png
  Textura translúcida de correnteza para usar como tileSprite animado.
- river_highlights_overlay_tile_512.png
  Textura de reflexos/linhas de brilho para sobrepor à correnteza.
- river_sparkle_sheet_4x128.png
  Spritesheet com 4 frames de brilho pontual.
- river_mask_reference_preview.png
  Prévia visual de como a máscara do rio deve funcionar.
- river_effect_preview.png
  Prévia visual do resultado esperado.

Plano para aplicação no projeto:
1. Carregar as texturas no BootScene.
2. Criar dois tileSprites sobre o mapa, com baixa opacidade.
3. Criar máscara em Graphics no formato do rio.
4. Aplicar a máscara aos tileSprites.
5. Animar tilePositionX/Y no update.
6. Adicionar pequenos brilhos pontuais em posições aleatórias dentro da máscara.

Observação:
A máscara final deve ser ajustada ao curso real do rio no mapa-base, para não invadir ponte, terra ou margens.
