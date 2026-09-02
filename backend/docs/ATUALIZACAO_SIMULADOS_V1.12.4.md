# Axoriin — Simulados V1.12.4

## Objetivo

Corrigir o gargalo observado em produção quando a leitura OMR de um PDF grande permanecia presa à requisição HTTP e era encerrada após oito minutos.

## O que mudou

- o upload do PDF passa a usar arquivo temporário em disco, reduzindo pressão de memória no Node;
- a API responde com HTTP 202 assim que o PDF é aceito e a leitura continua em segundo plano;
- o OMR é executado em fila, com um processo pesado por instância do backend;
- o extrator informa progresso por página (`preparando`, `lendo`, `finalizando`);
- o MongoDB guarda apenas o estado/progresso da leitura, nunca o PDF original;
- ao concluir, a mesma importação muda de `analisando` para `analisada` e abre a conferência já existente;
- se o backend reiniciar e o arquivo temporário for perdido, a importação parada é marcada como erro após período de inatividade, sem inventar respostas parciais;
- o dashboard é protegido enquanto houver OMR ativo para evitar competir por recursos com a leitura óptica;
- o limite de segurança do processo OMR deixa de ser oito minutos e passa a 45 minutos por padrão, configurável por `SIMULADOS_OMR_MAX_MINUTOS` (10 a 120 minutos).

## Preservações

Nenhuma regra pedagógica da V1.12.3 foi alterada. Permanecem preservados: ausência confirmada, idioma, participação parcial, base incompleta, habilidades ENEM, substituição sem duplicidade, relatórios e respostas já processadas.

## Fluxo esperado

1. selecionar turma, dia e PDF;
2. o servidor devolve rapidamente “PDF recebido”;
3. a tela mostra `Lendo cartões: X de Y páginas`;
4. ao finalizar, a conferência dos alunos e das marcações aparece normalmente;
5. fechar ou recarregar a página não exige manter a requisição de upload aberta; o acompanhamento pode ser retomado enquanto o processo do servidor continuar ativo.
