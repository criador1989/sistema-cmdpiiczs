# Assets previstos para a Arena do Conhecimento

A V5.18 define a escala técnica antes da produção artística: tela de 1280 × 720 e cidade contínua de 3600 × 2600. A câmera mostra somente uma parte do mundo e acompanha o estudante.

## Referência de escala

- personagem provisório: aproximadamente 55 × 100 px;
- personagem definitivo recomendado: 96 × 128 px por quadro, com área útil menor dentro do frame;
- prédios principais: aproximadamente 220 × 180 até 420 × 320 px;
- casas decorativas: aproximadamente 110 × 110 px;
- árvores: aproximadamente 90 × 120 px;
- tiles futuros: 64 × 32 px para isométrico ou 64 × 64 px para semi-isométrico.

As dimensões finais devem ser testadas na câmera atual antes da produção em lote.

## Avatares

Cada avatar deverá possuir sprites para oito direções:

- north
- north-east
- east
- south-east
- south
- south-west
- west
- north-west

Estados previstos:

- idle
- walk
- talk
- think
- celebrate
- jump
- uncertain

Sugestão de organização futura:

```text
assets/avatars/cadete-azul/walk-south.png
assets/avatars/cadete-azul/walk-north-east.png
assets/avatars/cadete-azul/idle-west.png
assets/portraits/cadete-azul/think.png
assets/portraits/cadete-azul/celebrate.png
```

## Cenários e prédios

```text
assets/maps/cidade-base.png
assets/tiles/grama.png
assets/tiles/ruas.png
assets/tiles/agua.png
assets/buildings/escola-militar.png
assets/buildings/laboratorio.png
assets/buildings/biblioteca.png
assets/buildings/zoologico.png
assets/buildings/prefeitura.png
assets/buildings/museu.png
assets/buildings/floresta.png
assets/props/arvores.png
assets/props/postes.png
assets/props/bancos.png
assets/props/placas.png
assets/ui/
assets/effects/
```

## Regra para a próxima fase

Criar primeiro um kit-piloto com um avatar, Escola Militar, Laboratório, Biblioteca, árvores, rua e interface básica. Depois testar no mapa contínuo antes de gerar todos os demais assets.
