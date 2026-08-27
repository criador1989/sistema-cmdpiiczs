# Diagnóstico Pedagógico de Simulados — V1.3.0

## Objetivo

O módulo transforma respostas de simulados em diagnóstico por aluno, turma, série, área, componente, conteúdo, habilidade, competência e questão. Ele foi criado como um domínio separado dos questionários on-line já existentes no Axoriin, preservando o histórico de provas externas ou aplicadas em papel.

## Fluxo de trabalho

1. A gestão cadastra o simulado e seleciona as turmas.
2. A gestão baixa, preenche e importa a matriz pedagógica das questões.
3. A gestão escolhe uma das entradas: planilha estruturada ou PDF escaneado dos cartões-resposta.
4. No PDF, seleciona turma e dia; o Axoriin lê as 80 bolhas e a opção de língua estrangeira.
5. O sistema analisa vínculos, duplicidades, respostas inválidas e língua estrangeira, sem gravar resultados.
6. A gestão resolve as pendências e confirma a importação.
7. O Axoriin calcula os diagnósticos e disponibiliza painel e relatório XLSX.

## Progresso recuperável

- Toda correção de vínculo, língua e resposta OMR é gravada na importação ainda não confirmada.
- Ajustes individuais na grade OMR são salvos continuamente; o botão final confirma as 80 respostas da página.
- Ao entrar novamente, o Axoriin lista as conferências `analisada` e recupera a mais recente, inclusive depois de logout ou reinício do backend.
- Reenviar o mesmo arquivo enquanto a conferência estiver aberta recupera o registro existente pelo SHA-256, sem criar uma cópia vazia.
- Um trabalho interrompido pode ser removido por **Excluir**. A operação exige confirmação, retira a conferência da lista, elimina as linhas ainda não processadas e mantém somente os metadados mínimos de auditoria com o estado `cancelada`.
- O navegador conserva somente os identificadores do último simulado e da última importação. Nomes e respostas permanecem no banco da instituição, não no armazenamento local.

## Correção e substituição de diagnóstico

- Ao reenviar exatamente o mesmo PDF depois de um processamento, o SHA-256 localiza a importação anterior.
- Os vínculos aluno–página podem ser recuperados automaticamente; a língua, as respostas e a leitura OMR da nova conferência nunca são substituídas pelos dados antigos.
- Um rascunho criado antes da V1.3.0 oferece o botão **Recuperar vínculos anteriores**, permitindo aproveitar os nomes já conferidos sem reenviar o PDF.
- A confirmação passa a se chamar **Substituir diagnóstico anterior** quando existe resultado para o mesmo PDF, turma e dia.
- O resultado é único por simulado e aluno. Na substituição, as questões do dia corrigido são retiradas do cálculo anterior e recebem os dados da nova conferência; respostas de outro dia são preservadas.
- A importação antiga recebe o estado `substituida` e sai do diagnóstico ativo, mas seus metadados permanecem na auditoria.
- Uma falha durante o processamento devolve a conferência ao estado `analisada`, preservando o trabalho para nova tentativa.

## Regra de Inglês e Espanhol

- A língua é registrada explicitamente por aluno.
- O sistema nunca tenta deduzi-la comparando respostas com gabaritos.
- Cada questão de língua usa o mesmo código e duas variantes na matriz: `INGLES` e `ESPANHOL`.
- Enquanto a língua estiver pendente, essas questões recebem o estado `IDIOMA_PENDENTE` e ficam fora da pontuação e dos indicadores pedagógicos.
- Quando o cartão comprova que nenhuma opção foi marcada, a gestão escolhe `NAO_MARCADO`. As questões de língua recebem zero com o estado `IDIOMA_NAO_MARCADO`, mas o restante da prova continua válido.
- O zero por língua não marcada entra no desempenho geral, do dia e da área; não é atribuído artificialmente ao componente, conteúdo ou habilidade de Inglês ou Espanhol.
- A gestão pode confirmar a língua posteriormente, indicando como fonte uma lista, o cartão-resposta ou a prova respondida; o resultado é então recalculado.
- No cartão escaneado do 1º dia, a bolha é lida diretamente. Ausência, dupla marcação ou baixa confiança bloqueia o processamento para conferência; o gabarito nunca é usado para tentar descobrir a língua.

## Cartões escaneados (OMR)

- O PDF deve reunir cartões de uma única turma e de um único dia, com uma página por cartão.
- A leitura é local, usando PyMuPDF, OpenCV e NumPy; nenhum cartão é enviado a um serviço externo.
- O motor localiza a faixa da grade, corrige inclinação, reconstrói as 25 colunas e 16 linhas e mede a tinta dentro de cada bolha.
- Resposta única inequívoca e branco inequívoco podem ser aceitos automaticamente.
- Marca múltipla, tinta fraca, círculo fora da geometria ou página ilegível ficam com revisão obrigatória.
- O cabeçalho e a grade reduzidos permanecem apenas na prévia da importação. O PDF original não é armazenado.
- A identificação manuscrita não atribui nota automaticamente: a gestão confere o aluno da turma usando a imagem do cabeçalho.
- A confirmação de um PDF é bloqueada enquanto existir aluno não vinculado, resposta OMR ambígua ou língua pendente no dia que contém Inglês/Espanhol.
- PDFs do 1º e do 2º dia são combinados no mesmo resultado do aluno; a segunda importação não apaga as respostas já processadas do outro dia.

## Qualidade da evidência

O módulo mantém separados:

- `ACERTO`: alternativa A–E igual ao gabarito aplicável;
- `ERRO`: alternativa A–E diferente do gabarito;
- `BRANCO`: o arquivo informa expressamente `BRANCO`;
- `NAO_INFORMADA`: a célula está vazia ou a coluna não existe;
- `IDIOMA_PENDENTE`: a questão depende da língua ainda não confirmada;
- `IDIOMA_NAO_MARCADO`: o aluno não assinalou Inglês nem Espanhol; a questão vale zero sem receber uma variante fictícia;
- `ANULADA`: questão anulada na matriz;
- `GABARITO_PENDENTE`: não existe gabarito aplicável.

Por isso, o painel mostra três medidas diferentes e informa a fórmula de cada uma:

- **desempenho confirmado**: pontos obtidos ÷ pontos possíveis nas respostas confirmadas. Alternativa errada, branco explícito e língua não marcada valem zero; dado ausente não entra nessa divisão;
- **taxa de acerto nas respostas marcadas**: acertos ÷ respostas A–E. Ajuda a distinguir erro de um cartão deixado em branco;
- **cobertura dos dados**: respostas confirmadas, inclusive brancos e língua não marcada, ÷ questões aplicáveis. Mostra quanto da prova realmente sustenta o diagnóstico.

Os indicadores coletivos exigem simultaneamente o mínimo configurado de questões e de estudantes com evidência. Cada prioridade exibe a sua base: questões, estudantes e respostas observadas. O painel também separa pontos consolidados, conteúdos e habilidades prioritários, questões críticas e distrator dominante, desempenho por dia, comparação entre turmas, grupos de intervenção, alunos prioritários e ações sugeridas à gestão.

## Classificação padrão

Para indicadores coletivos, a leitura curricular permanece simples: consolidado a partir de 70%, em desenvolvimento de 50% a menos de 70% e prioritário abaixo de 50%, sempre condicionada à evidência mínima configurada.

Para estudantes, o Diagnóstico V3 subdivide a faixa inferior para tornar a intervenção executável, com os parâmetros padrão: crítico abaixo de 25%, prioridade alta de 25% a menos de 40%, em atenção de 40% a menos de 50%, em desenvolvimento de 50% a menos de 70%, consolidado a partir de 70% e evidência insuficiente quando a cobertura individual ou a evidência mínima não é atendida.

Essas faixas são parâmetros operacionais escolhidos pela escola. Não são cortes oficiais do ENEM. Os critérios são configuráveis e ficam protegidos depois do processamento para evitar mudança silenciosa do histórico.

## Segurança e permissões

- `admin`, `master` e `superadmin`: cadastro, matriz, importação, correções e relatórios;
- `professor`: leitura dos simulados e resultados apenas das turmas vinculadas ao seu perfil;
- demais perfis: sem acesso ao módulo;
- todas as consultas utilizam a instituição da sessão;
- o arquivo importado não é armazenado; ficam o hash SHA-256, os dados estruturados e a auditoria;
- arquivos estruturados de até 10 MB e no máximo 1.000 alunos por importação;
- PDFs escaneados de até 120 MB e 500 páginas, sempre separados por turma e dia;
- o PDF original é descartado após a extração local e o hash SHA-256 permite sinalizar reenvios.

## Formatos

- matriz: XLSX, CSV ou JSON;
- respostas: XLSX, CSV ou JSON;
- cartões-resposta: PDF escaneado (imagem), no modelo de 80 questões validado para esta aplicação;
- exportação: XLSX com abas de resumo, alunos, turmas, séries, dias, áreas, componentes, eixos pedagógicos, conteúdos, habilidades, competências, descritores, dificuldade, questões, grupos de intervenção, alertas de integridade, prioridades pedagógicas, alunos prioritários e evolução, quando houver referência; PDF com leitura executiva, plano de intervenção e anexos técnicos.

## Endpoints principais

- `GET /api/simulados/bootstrap`
- `GET|POST /api/simulados`
- `GET|PATCH /api/simulados/:simuladoId`
- `GET /api/simulados/:simuladoId/modelo-matriz.xlsx`
- `POST /api/simulados/:simuladoId/matriz/importar`
- `GET /api/simulados/:simuladoId/modelo-respostas.xlsx`
- `POST /api/simulados/:simuladoId/importacoes/analisar`
- `POST /api/simulados/:simuladoId/cartoes/analisar`
- `GET /api/simulados/:simuladoId/importacoes`
- `GET /api/simulados/:simuladoId/importacoes/:importacaoId`
- `POST /api/simulados/:simuladoId/importacoes/:importacaoId/recuperar-vinculos`
- `DELETE /api/simulados/:simuladoId/importacoes/:importacaoId`
- `PATCH /api/simulados/:simuladoId/importacoes/:importacaoId/linhas/:numeroLinha`
- `POST /api/simulados/:simuladoId/importacoes/:importacaoId/confirmar`
- `POST /api/simulados/:simuladoId/resultados/recalcular`
- `GET /api/simulados/:simuladoId/dashboard`
- `GET /api/simulados/:simuladoId/resultados`
- `PATCH /api/simulados/:simuladoId/resultados/:resultadoId/idioma`
- `GET /api/simulados/:simuladoId/exportar.xlsx`
- `GET /api/simulados/:simuladoId/exportar.pdf`

## Testes

```bash
node scripts/testar-simulados-v1.js
node scripts/testar-simulados-integracao-v1.js
node scripts/testar-simulados-http-v1.js
python scripts/testar-omr-simulados.py
```

O primeiro script testa cálculo, língua não marcada, branco versus dado ausente, cobertura, recuperação de vínculos e substituição seletiva de um dia. O segundo testa modelos Mongoose, estados de substituição, geração/leitura de XLSX, importação, relatório e carregamento da rota Express. O terceiro valida autenticação, perfis, descoberta de conferências salvas e restrição de professor às turmas vinculadas. O teste OMR gera um cartão sintético sem dados pessoais e exige o reconhecimento correto das 80 respostas e da língua.

## Limites conscientes da V1

- O desempenho é calculado por acertos e pesos da matriz; não é uma implementação da TRI oficial do ENEM.
- O OMR V1.1 é calibrado para o cartão de 80 questões desta aplicação. Outro desenho de cartão deve ganhar um perfil próprio e ser validado antes do uso.
- O módulo não usa OCR de caligrafia para vincular automaticamente estudantes; essa decisão permanece humana para evitar atribuição de respostas ao aluno errado.
- A relação com currículo oficial pode ser informada nos campos de habilidade, competência e descritor. Uma vinculação automática com o banco curricular do Axoriin deve exigir revisão humana antes de ser confirmada.


## Exportação PDF - V1.4.0

O PDF gerencial é produzido a partir do mesmo dashboard já filtrado pelas permissões e pela turma. O gerador Python usa ReportLab e não altera a metodologia de cálculo. A saída combina leitura executiva, prioridades, ações da gestão, questões, grupos, estudantes e anexos técnicos.

## Diagnóstico V3 - V1.5.0

A V1.5.0 separa formalmente **integridade/procedimento** de **prioridade pedagógica**. Ausência de opção de língua, idioma pendente, resposta não importada e cobertura individual insuficiente permanecem visíveis como alertas, sem serem convertidos em conteúdos ou habilidades não aprendidos.

A matriz aceita `MACROCONTEUDO` para agrupar múltiplas questões em eixos pedagógicos. Na ausência desse campo, o componente é usado como agrupador explícito. Conteúdos e habilidades continuam sujeitos ao mínimo configurado de questões e estudantes.

A classificação individual passa a considerar cobertura mínima, por padrão 80%, e usa as faixas operacionalmente mais úteis: crítico, prioridade alta, em atenção, em desenvolvimento, consolidado e evidência insuficiente. A resposta à dificuldade é estruturada em turma -> grupos -> individual.

Questões individuais usam faixas de acerto próprias e podem receber uma triagem simples de discriminação entre os 27% de maior e menor desempenho quando houver amostra adequada. Essa triagem é um sinal de revisão do item, não uma análise TRI ou psicométrica oficial.

O XLSX e o PDF foram atualizados para expor essas dimensões sem criar um índice sintético oculto. Resultados persistidos usam `versaoDiagnostico = 3` e podem ser recalculados a partir das respostas estruturadas já registradas.

## Diagnóstico V4 - V1.6.0 - Matriz de Referência ENEM

A V1.6.0 acrescenta uma camada explícita de competências e habilidades oficiais do ENEM. Variantes de questões de simulados do tipo `enem` podem informar `habilidadeEnem` (H1-H30). O sistema valida o código dentro da área do conhecimento, resolve a competência de área e usa o texto da referência INEP/MEC 2026 incorporada ao backend.

Não há inferência automática de H1-H30 pelo conteúdo. Uma habilidade sem mapeamento permanece fora do diagnóstico oficial, ainda que a questão continue sendo analisada normalmente por área, componente, eixo, conteúdo e item.

O relatório diferencia habilidade com evidência sustentada de habilidade observada em um único item. Com a configuração padrão, são exigidas pelo menos 2 questões e 5 estudantes no indicador coletivo. Um único item produz leitura indicativa, nunca conclusão de domínio da habilidade.

A tela Matriz oferece uma planilha de mapeamento que pode ser aplicada após existirem resultados. A operação altera apenas `habilidadeEnem`, incrementa `versaoMatriz` e recalcula `versaoDiagnostico = 4` usando as respostas já persistidas. Gabarito e respostas não são substituídos.


## Diagnóstico V5 - V1.7.0 - Habilidades ENEM operacionais

A V1.7.0 conecta o diagnóstico oficial ENEM à decisão pedagógica: o card de habilidades usa a matriz ENEM, códigos H1-H30 são qualificados pela área, necessidades que atingem 60% ou mais do recorte sobem para intervenção coletiva e pequenos grupos ficam reservados a subconjuntos.

A matriz aceita `CONFIANCA_ENEM` (`DIRETA` ou `APROXIMADA`). O PDF/XLSX mantém a rastreabilidade e identifica vínculos aproximados. A versão de diagnóstico passa a 5 e pode ser recalculada sem reler cartões.


## Relatório específico de habilidades ENEM - V1.8.0

Para simulados ENEM, a tela Diagnóstico oferece um segundo exportador PDF exclusivo para competências e habilidades trabalhadas. O relatório geral permanece inalterado. O novo documento usa o mesmo filtro de turma e a mesma base diagnóstica, mostrando cobertura da matriz, competências avaliadas, todas as habilidades trabalhadas, prioridades, potencialidades, força da evidência e intervenção por habilidade.

## Ausência por dia de aplicação - V1.9.0

A conferência de cartões distingue presença, ausência confirmada e página descartada. Quando um aluno é marcado como ausente em um dia, as questões desse dia são excluídas do denominador, da cobertura e das inferências pedagógicas do estudante. A ausência permanece registrada em `diasAusentes` e pode ser exibida nos alertas de integridade e na participação por dia. Páginas descartadas não bloqueiam o processamento e podem ser restauradas enquanto a conferência ainda não foi confirmada.

## Revisão pós-processamento da língua estrangeira - V1.10.0

Resultados já processados podem ter a opção de língua corrigida posteriormente sem recriar o diagnóstico. A gestão usa **Revisar idiomas processados**, seleciona a turma e confirma Inglês/Espanhol com a fonte documental. As respostas A-E já armazenadas são preservadas e reavaliadas com a variante correta; vínculos, ausências e importação permanecem inalterados. A ação em lote é auditada.
