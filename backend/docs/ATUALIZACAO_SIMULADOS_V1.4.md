# Atualização Simulados V1.4.0

A V1.4.0 acrescenta exportação PDF gerencial e pedagógica ao diagnóstico, preservando a mesma fonte de dados e os mesmos cálculos usados na tela e no XLSX.

## Exportar PDF

Na Etapa 3 - Diagnóstico, o botão **Exportar PDF** respeita o filtro de turma selecionado. O arquivo é produzido no backend com ReportLab e contém:

- resumo executivo com participantes, desempenho confirmado, precisão e cobertura;
- alertas de qualidade da base, incluindo respostas não importadas, língua pendente e ausência de opção de língua;
- ações priorizadas para a gestão, com justificativa e base de evidência;
- distribuição dos estudantes por faixa e comparação entre turmas;
- habilidades, conteúdos e áreas prioritárias com desempenho, cobertura, questões, estudantes e evidências separados;
- questões prioritárias, erros, brancos e distrator dominante;
- grupos de intervenção, estudantes prioritários, baixa cobertura e maiores desempenhos do recorte;
- evolução contra o simulado de referência, quando configurado;
- anexos com todas as questões, todos os estudantes e a metodologia aplicada.

## Princípios de segurança do diagnóstico

O PDF não recalcula resultados. Ele recebe o objeto já produzido por `agregarDashboard`, evitando divergência entre tela, XLSX e PDF.

O relatório também deixa explícito que:

- dado ausente não vira erro; ele reduz a cobertura;
- branco é resposta confirmada e vale zero no desempenho;
- se o estudante não marcou Inglês nem Espanhol, somente as questões de língua recebem zero, sem atribuição fictícia de idioma;
- prioridade pedagógica só é apresentada como sustentada quando os critérios de evidência configurados são atendidos;
- percentuais do módulo são acertos/pontos brutos para diagnóstico pedagógico e não correspondem à TRI oficial do ENEM.

## Melhoria de leitura para gestão

O relatório evita criar um índice sintético oculto de "prioridade". Severidade (desempenho), abrangência (estudantes/questões/evidências) e cobertura permanecem visíveis em colunas separadas. Isso permite que a gestão reaja a dados verificáveis sem misturar dimensões diferentes em uma pontuação opaca.

A lista de maiores desempenhos é apresentada como relativa ao recorte e não como sinônimo automático de consolidação.
