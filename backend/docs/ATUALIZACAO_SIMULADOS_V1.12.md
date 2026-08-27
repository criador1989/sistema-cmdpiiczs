# Axoriin Simulados V1.12.2 - Painel Visual

A V1.12.2 adiciona uma camada visual ao diagnóstico existente, sem duplicar regras de cálculo. Todos os gráficos consomem o mesmo `dashboard` já utilizado pelo relatório gerencial e pelo XLSX.

## Painel Visual

A tela de Diagnóstico passa a apresentar:

- barras por área com referências internas de atenção/consolidação;
- distribuição das faixas operacionais dos estudantes;
- histograma de desempenho somente com base individual adequada e participação completa;
- comparação entre turmas: desempenho x cobertura;
- presença/ausência por dia;
- heatmap de habilidades ENEM;
- distribuição de dificuldade dos itens;
- evolução contra o simulado de referência.

## Evolução

`compararResultados()` passa a detalhar a evolução dos mesmos estudantes por área e, quando houver correspondência, por habilidade ENEM. A comparação usa pontos obtidos/pontos possíveis acumulados, evitando média simples de percentuais heterogêneos.

## PDF Visual

Nova rota `GET /api/simulados/:simuladoId/exportar-visual.pdf`. O PDF traz os principais gráficos, turmas, participação, habilidades prioritárias/potencialidades, evolução e um quadro final de decisões.

## Limite metodológico

O relatório visual não estima TRI e não reproduz benchmarks externos sem base oficial. Comparações nacionais/estaduais/municipais devem ser implementadas em módulo separado com dados públicos do INEP e fonte explícita.
