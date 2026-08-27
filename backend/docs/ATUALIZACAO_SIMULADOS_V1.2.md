# Atualização de Simulados V1.2.1

## O que muda para a gestão

1. O vínculo de cada cartão, a língua confirmada e cada ajuste OMR são salvos antes do processamento final.
2. Conferências incompletas aparecem em **Conferências salvas em andamento** e podem ser retomadas depois de fechar, deslogar ou reiniciar o sistema.
3. O botão **Excluir** descarta uma conferência interrompida ou duplicada, depois de confirmação, sem alterar resultados já processados.
4. O diagnóstico separa **desempenho confirmado**, **precisão nas alternativas marcadas** e **cobertura dos dados**, sempre com as fórmulas visíveis.
5. Prioridades passam a mostrar a base da conclusão e ações sugeridas por conteúdo, habilidade, questão, turma, grupo e aluno.
6. Resultados antigos podem ser atualizados pelo botão **Atualizar cálculos**, preservando respostas, alunos e gabaritos.

## Língua não marcada

Quando as bolhas de Inglês e Espanhol estiverem vazias, selecione:

`Não marcou nenhuma língua — zerar questões de língua`

O Axoriin então:

- registra `NAO_MARCADO`, sem escolher uma língua;
- atribui zero somente às questões de língua estrangeira;
- mantém as demais respostas do aluno;
- inclui esse zero no desempenho geral, no dia e na área;
- não atribui os erros a Inglês nem a Espanhol;
- cria uma ação de gestão sobre o procedimento de preenchimento do cartão.

`NAO_INFORMADO` continua significando uma pendência ainda não conferida e bloqueia o processamento. `NAO_MARCADO` é uma conclusão confirmada pela leitura humana do cartão e permite processar o resultado.

## Fórmulas

- **Desempenho confirmado** = pontos obtidos ÷ pontos possíveis nas respostas confirmadas. Branco explícito e língua não marcada valem zero. Dado ausente fica fora e reduz a cobertura.
- **Precisão nas marcadas** = acertos ÷ alternativas A–E registradas.
- **Cobertura** = respostas confirmadas ÷ questões aplicáveis.

As faixas padrão — consolidado a partir de 70%, em desenvolvimento de 50% a 69,9% e prioritário abaixo de 50% — são parâmetros pedagógicos configuráveis da escola. Não representam nota TRI nem cortes oficiais do ENEM.
