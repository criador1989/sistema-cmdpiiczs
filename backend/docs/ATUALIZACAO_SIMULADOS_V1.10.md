# Axoriin Simulados V1.10.0 - Revisão pós-processamento da língua estrangeira

A V1.10.0 permite corrigir Inglês/Espanhol depois que uma turma já foi processada, sem reimportar cartões e sem perder o progresso.

## Problema resolvido

Em alguns casos o cartão-resposta foi processado como `NAO_MARCADO`, mas a escola posteriormente conferiu a prova física e confirmou que o estudante havia indicado Inglês ou Espanhol. Antes, a correção existia apenas dentro do diagnóstico individual, aluno por aluno, e era pouco visível para uma revisão de turma.

## Nova revisão por turma

Em **Diagnóstico > Resultados individuais**, a gestão passa a ter o botão **Revisar idiomas processados**.

A janela permite:

- escolher a turma;
- exibir apenas alunos com língua pendente/não marcada ou todos os resultados;
- alterar cada aluno para Inglês, Espanhol ou manter “não marcou”;
- registrar a fonte da correção, com `Prova conferida` como padrão;
- salvar várias correções de uma vez.

## Preservação de dados

A correção não recria o resultado e não muda o vínculo do aluno. O Axoriin preserva:

- `aluno` e snapshots do vínculo;
- respostas já marcadas em todas as questões;
- importação de origem;
- ausências confirmadas;
- matriz pedagógica e habilidades ENEM.

Somente o campo de idioma e os campos derivados do diagnóstico são recalculados. Nas questões de língua, a resposta A-E já armazenada passa a ser confrontada com o gabarito da variante confirmada.

## Segurança

Todas as alterações são validadas antes do `bulkWrite`. Se um dos resultados não existir, possuir valor de idioma inválido ou estiver marcado como ausente no dia que contém a língua estrangeira, o lote é interrompido antes da gravação.

A auditoria registra `CORRIGIR_IDIOMAS_LOTE`, incluindo idioma anterior, novo idioma, fonte, aluno e turma.

## Compatibilidade

A V1.10.0 é compatível com a V1.9.0 e não exige reimportar PDFs, reprocessar cartões, refazer vínculos ou importar novamente o mapeamento ENEM 164/164.
