# Axoriin Simulados V1.6.1 — Hotfix de compatibilidade ENEM

## Problema corrigido
Simulados criados antes da V1.6.0 podem estar salvos como `tipo: interno`, mesmo quando o título/código identifica claramente um Simulado ENEM. Nessa situação, o painel de Matriz de Referência ENEM ficava oculto.

## Solução
- O frontend detecta simulados antigos cujo título/código contém “ENEM”.
- A Matriz pedagógica exibe **Ativar Matriz ENEM**.
- A confirmação altera somente o metadado `tipo` para `enem`.
- Respostas, gabaritos, importações e resultados armazenados são preservados.
- Após a ativação, o bloco **Matriz de Referência ENEM** é liberado para download/importação do mapeamento H1–H30.
- O cache do módulo foi renovado para evitar que o navegador mantenha a interface anterior.
