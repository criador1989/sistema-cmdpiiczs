# Atualização Simulados V1.6.0 - Diagnóstico V4 / Matriz ENEM

A V1.6.0 incorpora ao Diagnóstico de Simulados uma camada explícita de **competências e habilidades da Matriz de Referência ENEM**. A referência embarcada é a publicação **Matrizes de Referência ENEM**, INEP/MEC, 2026 (publicada on-line em abril de 2026).

## Princípio de segurança pedagógica

O Axoriin **não infere** H1-H30 apenas pelo assunto, conteúdo, componente ou padrão de respostas. Cada variante de questão possui o campo opcional `HABILIDADE_ENEM`. Quando esse campo é preenchido com H1 a H30, o backend valida a combinação com a área do conhecimento e resolve automaticamente a competência e o texto oficial da habilidade.

Se a habilidade não estiver mapeada, a questão continua normalmente no diagnóstico por área, conteúdo, eixo e item, mas é apresentada como **não mapeada na Matriz ENEM**. A lacuna é visível no relatório; não há preenchimento fictício.

## Estrutura oficial incorporada

O catálogo local contém as quatro matrizes das provas objetivas:

- Linguagens, Códigos e suas Tecnologias: competências de área 1 a 9 e H1-H30;
- Matemática e suas Tecnologias: competências de área 1 a 7 e H1-H30;
- Ciências da Natureza e suas Tecnologias: competências de área 1 a 8 e H1-H30;
- Ciências Humanas e suas Tecnologias: competências de área 1 a 6 e H1-H30.

O código `H16`, por exemplo, é resolvido dentro da área. Isso é necessário porque a numeração H1-H30 se repete em cada área com significados diferentes.

## Como mapear um simulado já processado

A tela **Matriz** ganha o bloco **Matriz de Referência ENEM** para simulados do tipo ENEM.

1. Clique em **Baixar mapeamento ENEM**.
2. A planilha `MAPEAMENTO_ENEM` traz código, variante, área, componente, conteúdo, habilidade pedagógica atual e a coluna editável `HABILIDADE_ENEM`.
3. A aba `REFERENCIA_ENEM` contém o catálogo oficial incorporado ao sistema.
4. Preencha somente `HABILIDADE_ENEM` com H1 a H30 onde houver segurança pedagógica.
5. Importe a planilha em **Validar e aplicar**.

Essa operação pode ser feita mesmo depois de existirem resultados. Ela não substitui gabarito nem respostas. O sistema atualiza somente o metadado pedagógico da variante, incrementa a versão da matriz e recalcula o Diagnóstico V4 a partir das respostas estruturadas que já estavam armazenadas.

## Regra de evidência das habilidades

O mapeamento de uma questão para uma habilidade não significa que a habilidade inteira esteja diagnosticada.

- Com o padrão de 2 questões por indicador, uma habilidade precisa aparecer em pelo menos duas questões e atingir o mínimo configurado de estudantes para receber classificação pedagógica sustentada.
- Uma habilidade observada em apenas um item é mostrada como **indicativa - 1 item**.
- Habilidades com base menor que os mínimos permanecem como **evidência insuficiente**.

Assim o relatório evita chamar uma habilidade de consolidada ou deficitária com base em uma única questão.

## PDF Diagnóstico V4

O PDF passa a incluir uma seção própria **Diagnóstico das competências e habilidades da Matriz ENEM**, contendo:

- fonte oficial e percentual de variantes mapeadas;
- cobertura das habilidades trabalhadas por área;
- número de habilidades diferentes trabalhadas em relação às 30 da área;
- competências de área trabalhadas;
- diagnóstico por competência;
- habilidades com diagnóstico sustentado;
- habilidades observadas em apenas um item, marcadas como indicativas;
- questões ainda sem `HABILIDADE_ENEM`;
- códigos H/competência no anexo de todas as questões.

A intervenção mantém a hierarquia **turma -> grupo -> individual**, mas passa a preferir habilidades ENEM oficialmente mapeadas quando elas possuem evidência suficiente.

## XLSX

O relatório XLSX ganha as abas:

- `HABILIDADES ENEM`;
- `COMPETÊNCIAS ENEM`;
- `COBERTURA ENEM`;
- `ENEM NÃO MAPEADO`.

A aba `QUESTÕES` também passa a expor habilidade e competência ENEM.

## Procedimento continua separado da aprendizagem

A ausência de marcação de Inglês/Espanhol continua valendo zero nas questões de língua conforme a regra do simulado, porém a variante `SEM_OPCAO` limpa os campos ENEM. Portanto, esse evento não pode gerar H1-H30, competência de área ou prioridade curricular fictícia.

## Versão diagnóstica

`versaoDiagnostico` passa para **4**. Resultados anteriores são sinalizados para recálculo. O recálculo usa as respostas já persistidas; não exige nova leitura dos cartões.
