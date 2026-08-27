# Atualização de Simulados V1.3.0

## Objetivo

Esta versão corrige o fluxo de uma turma cujo PDF já foi processado, mas precisa gerar um novo diagnóstico após ajustes de vínculo, respostas ou língua estrangeira.

## Recuperar os nomes já vinculados

Quando o mesmo PDF é encontrado, o Axoriin identifica a importação processada pelo SHA-256 e oferece **Recuperar vínculos anteriores**.

- O reaproveitamento relaciona a mesma página ao mesmo aluno.
- O aluno ainda precisa existir e continuar na turma selecionada.
- Um vínculo já corrigido no novo rascunho não é sobrescrito.
- Não são copiados idioma, respostas nem escolhas OMR do diagnóstico antigo.
- Duplicidades continuam bloqueadas para conferência.

Assim, um rascunho que mostre 36 alunos não localizados pode recuperar esses vínculos sem exigir uma nova busca nome por nome.

## Substituir sem duplicar

Ao existir um diagnóstico anterior para o mesmo PDF, turma e dia, o botão final passa a mostrar **Substituir diagnóstico anterior**. A confirmação informa o impacto antes de processar.

O resultado continua único pela combinação instituição + simulado + aluno. Durante a substituição:

1. o Axoriin remove do cálculo anterior somente as questões do dia corrigido;
2. aplica as respostas e a língua da conferência atual;
3. preserva respostas já confirmadas do outro dia;
4. recalcula todos os indicadores do aluno;
5. marca a importação antiga como `substituida` para que permaneça apenas na auditoria.

Se um aluno constava exclusivamente no diagnóstico antigo daquele dia e não está na nova conferência, a contribuição antiga é retirada. Caso ele possua respostas de outro dia, essas respostas permanecem.

## Língua estrangeira

A regra da V1.2.1 permanece:

- `INGLES` e `ESPANHOL` são escolhas confirmadas;
- `NAO_MARCADO` significa que nenhuma língua foi assinalada e zera apenas as questões 1–4;
- `NAO_INFORMADO` é pendência e impede o processamento;
- o sistema nunca escolhe uma língua comparando respostas com o gabarito.

## Recuperação após falha

Se o processamento final falhar, a conferência volta para `analisada`, com os vínculos, idiomas e revisões OMR preservados para uma nova tentativa.
