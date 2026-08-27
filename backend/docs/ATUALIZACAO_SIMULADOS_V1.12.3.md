# Axoriin - Simulados V1.12.3

## Consistência entre participação, cobertura e evidência

Esta versão corrige a leitura global dos estudantes com ausência confirmada sem alterar nenhum resultado bruto já gravado.

### Regra principal

- **Participação completa + base adequada**: estudante sem ausência confirmada, sem língua pendente e com cobertura mínima atendida. Pode receber classificação global.
- **Participação parcial confirmada**: estudante com ausência confirmada em pelo menos um dia. Não recebe faixa global comparável, mas as áreas e habilidades dos dias realizados continuam válidas.
- **Base realmente incompleta**: estudante com participação completa, porém com cobertura/evidência insuficiente ou pendência que impede conclusão global.

Ausência confirmada deixa de ser contabilizada como `evidencia_insuficiente` no quadro global. O status próprio é `participacao_parcial`.

### Relatórios

PDF gerencial, PDF visual e XLSX passam a separar explicitamente:
1. participação completa com base adequada;
2. participação parcial confirmada;
3. base realmente incompleta.

### Evolução longitudinal

A comparação global entre simulados exclui participação parcial para evitar comparar um dia de prova com uma aplicação completa. Comparações por área/habilidade comum continuam possíveis quando existe evidência válida nos dois simulados.

### Preservação

Não há migração destrutiva nem reprocessamento automático. Respostas, vínculos, idiomas conferidos, ausências, Matriz ENEM 164/164 e histórico permanecem intactos. A correção atua na agregação, classificação e apresentação dos dados já existentes.
