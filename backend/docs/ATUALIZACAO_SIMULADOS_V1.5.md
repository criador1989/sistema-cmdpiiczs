# Atualização Simulados V1.5.0 - Diagnóstico V3

A V1.5.0 evolui o relatório gerencial criado na V1.4.0 depois da validação com dados reais. O objetivo é impedir que pendências de procedimento sejam confundidas com dificuldades de aprendizagem e transformar o diagnóstico em uma sequência operacional de decisão: **turma -> grupo -> individual**.

## 1. Integridade separada de aprendizagem

Os seguintes eventos continuam afetando a pontuação quando a regra do simulado assim determina, mas aparecem em **Alertas de integridade e procedimento**, fora das prioridades curriculares:

- língua estrangeira não marcada;
- língua pendente;
- respostas não importadas;
- cobertura individual insuficiente.

A ausência de opção de Inglês/Espanhol continua registrando zero apenas nas questões de língua. Entretanto, `SEM_OPCAO` não alimenta componente, eixo, conteúdo, habilidade nem a lista de questões acadêmicas prioritárias.

## 2. Diagnóstico individual condicionado à cobertura

Foi adicionado `minimoCoberturaIndividual`, com padrão de **80%**. A cobertura geral pode ser alta e ainda esconder estudantes com parte significativa da prova ausente. Por isso o dashboard informa separadamente:

- base individual completa;
- base individual adequada;
- diagnóstico individual provisório.

Um estudante abaixo da cobertura mínima ou com língua pendente não recebe conclusão operacional individual, mesmo que o percentual observado seja baixo.

## 3. Faixas operacionais dos estudantes

A antiga faixa única "prioritário" foi subdividida para tornar a reação da gestão executável. Com o parâmetro padrão de atenção em 50%:

- crítico: abaixo de 25%;
- prioridade alta: de 25% a menos de 40%;
- em atenção: de 40% a menos de 50%;
- em desenvolvimento: de 50% a menos de 70%;
- consolidado: a partir de 70%;
- evidência insuficiente: cobertura individual ou evidência mínima não atendida.

Essas faixas são critérios internos e configuráveis. Não são cortes oficiais do ENEM.

## 4. Eixos pedagógicos e evidência em múltiplos itens

A matriz passa a aceitar a coluna opcional `MACROCONTEUDO`. Ela serve para agrupar várias questões que avaliam um mesmo eixo pedagógico. Quando o campo estiver vazio, o sistema usa o **componente** como agrupador transparente, sem inventar uma taxonomia curricular.

Conteúdos e habilidades somente se tornam prioridade coletiva quando atingem o mínimo configurado de questões e estudantes. Uma questão isolada pode ser sinalizada como item de baixo acerto, mas não prova sozinha que uma habilidade está consolidada ou não aprendida.

## 5. Questões individuais: faixa de acerto e triagem de discriminação

Questões individuais agora usam faixas próprias de acerto:

- muito baixo;
- baixo;
- intermediário;
- alto;
- muito alto.

Quando existem pelo menos 10 estudantes com cobertura individual adequada, o sistema calcula uma **triagem simples de discriminação**, comparando os 27% de maior e menor desempenho no recorte. Índice negativo é apenas um sinal técnico de revisão: não prova erro de gabarito.

O funcionamento dos distratores também permanece visível. Concentração elevada em uma alternativa errada orienta investigação de concepção alternativa, leitura do enunciado, pré-requisito ou qualidade do próprio item.

## 6. Plano de intervenção em três níveis

O diagnóstico passa a organizar a resposta da escola em ordem operacional:

1. **Turma / planejamento coletivo** - quando a dificuldade é ampla por área ou eixo;
2. **Grupos com dificuldade comum** - estudantes que compartilham o mesmo alvo com evidência suficiente;
3. **Individual** - reservado a casos críticos com cobertura suficiente e sempre sujeito à confirmação com outras evidências de sala.

Isso evita transformar uma dificuldade generalizada da turma em dezenas de planos individuais simultâneos.

## 7. Tela, XLSX e PDF

As três saídas continuam usando o mesmo `dashboard` do backend. A V1.5.0 acrescenta:

- painel separado de alertas de integridade;
- prioridades pedagógicas independentes;
- eixos pedagógicos;
- faixas operacionais dos estudantes;
- casos críticos individuais separados de acompanhamento amplo;
- faixa de acerto e discriminação por item;
- XLSX com abas `EIXOS PEDAGÓGICOS`, `ALERTAS DE INTEGRIDADE` e `PRIORIDADES PEDAGÓGICAS`;
- PDF Diagnóstico V3 com leitura executiva, plano turma/grupo/individual e anexos técnicos atualizados.

## 8. Reprocessamento controlado

`versaoDiagnostico` passa para **3**. Resultados anteriores são sinalizados pela interface como necessitando atualização dos cálculos. O reprocessamento usa as respostas estruturadas já armazenadas; não exige reimportar o PDF do cartão-resposta.

## Limites metodológicos

- Os percentuais continuam sendo acertos/pontos brutos para diagnóstico pedagógico; não são TRI oficial do ENEM.
- A triagem de discriminação é descritiva e não substitui análise psicométrica completa.
- A interpretação de uma prioridade deve ser combinada com avaliações formativas, produções, observação docente e o currículo efetivamente ensinado.
- O Axoriin não atribui causalidade automática a um erro de item ou a uma queda de desempenho.
