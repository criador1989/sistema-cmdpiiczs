# Axoriin Simulados V1.10.1 - Hotfix de performance na listagem de resultados

A V1.10.1 corrige o erro MongoDB `QueryExceededMemoryLimitNoDiskUseAllowed` (código 292) observado ao abrir o Diagnóstico quando a listagem paginada de estudantes precisava ordenar uma base maior de resultados.

## Problema corrigido

A rota `GET /api/simulados/:simuladoId/resultados` ordenava por turma e nome do estudante. Em bases maiores, o MongoDB podia ultrapassar o limite de 32 MB para ordenação em memória e abortar a consulta com a mensagem `Sort exceeded memory limit ... Pass allowDiskUse:true`.

## Correções

- a consulta paginada agora habilita `allowDiskUse(true)` como rede de segurança para ordenações externas;
- o modelo `SimuladoResultado` ganhou índice composto `{ instituicao, simulado, alunoTurmaSnapshot, alunoNomeSnapshot }`, alinhado ao filtro e à ordenação da listagem;
- nenhuma regra pedagógica, resposta, vínculo, idioma, ausência ou habilidade ENEM é alterada.

## Preservação

O hotfix não exige reimportar cartões, recalcular resultados, refazer vínculos ou importar novamente a Matriz ENEM. Os resultados já gravados permanecem intactos.

## Observação operacional

O `allowDiskUse(true)` elimina a falha mesmo quando o MongoDB ainda precisa ordenar externamente. O índice composto reduz o custo da consulta depois que estiver disponível no banco, melhorando a escalabilidade conforme novas turmas são processadas.
