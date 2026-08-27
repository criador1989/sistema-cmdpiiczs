# Axoriin Simulados V1.9.0 - Ausência por dia e descarte seguro

A V1.9.0 introduz uma separação explícita entre ausência, resposta em branco, resposta não importada e página descartada.

## Regras

- `presente`: a linha segue o fluxo normal de vínculo, idioma e revisão OMR;
- `ausente`: exige aluno vinculado, ignora OMR/idioma daquele dia e exclui as questões do dia do denominador diagnóstico;
- `descartada`: a página é ignorada no processamento e não bloqueia a confirmação;
- ausência e descarte são reversíveis enquanto a importação estiver em `analisada`;
- os dados OMR da linha são preservados durante a conferência para permitir restauração;
- `SimuladoResultado.diasAusentes` registra os dias não realizados;
- recalcular diagnóstico preserva `diasAusentes`;
- dashboard expõe `participacaoPorDia`, `alunosComAusencia` e `ausenciasConfirmadas`;
- relatório gerencial recebe alerta informativo de ausência, sem transformar a falta em dificuldade pedagógica.

## Compatibilidade

Importações criadas antes da V1.9.0 permanecem válidas. A ausência de `situacaoAplicacao` é interpretada como `presente`, portanto nenhum progresso existente é apagado ou reinterpretado automaticamente.
