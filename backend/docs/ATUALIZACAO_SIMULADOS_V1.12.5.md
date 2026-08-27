# Axoriin — Simulados V1.12.5

## Objetivo

Estabilizar a abertura do diagnóstico em produção após a V1.12.4, reduzindo rajadas de requisições HTTP e o custo da montagem do dashboard sem alterar respostas, vínculos, ausências, idiomas ou regras pedagógicas já consolidadas.

## Correções de estabilidade

- O frontend deixa de consultar separadamente importações `analisada` e `analisando`; usa uma única chamada `status=pendentes`.
- O dashboard passa a ter **single-flight no navegador**: duas solicitações simultâneas para o mesmo simulado/turma compartilham a mesma Promise.
- Um `429 Too Many Requests` no dashboard recebe apenas uma nova tentativa, após 2,4 segundos, evitando rajadas de retry.
- Uma falha transitória não é mais representada visualmente como zero participantes/zero desempenho; o painel anterior é preservado quando existir, e a ausência de resposta é mostrada como indisponibilidade temporária.
- O backend passa a ter **cache curto de 30 segundos + single-flight** por instituição/simulado/turma. Chamadas concorrentes compartilham a mesma agregação pesada.
- A leitura da tela do dashboard usa projeção MongoDB e não transfere os agregados redundantes por aluno que o próprio dashboard recalcula a partir das respostas.
- As exportações XLSX/PDF continuam usando os documentos completos, preservando o conteúdo dos relatórios.
- O cache é invalidado quando resultados, participação, idioma, mapeamento ENEM ou configuração relevante são alterados.
- A resposta do dashboard inclui `X-Axoriin-Dashboard-Cache: hit|miss|shared` para diagnóstico operacional.

## Integridade pedagógica

A V1.12.5 não muda as regras de desempenho, cobertura, participação parcial, ausência confirmada, língua estrangeira, habilidades ENEM ou grupos de intervenção. Também não apaga nem migra resultados existentes.

## Teste esperado em produção

1. Abrir `Simulados` e confirmar que o acervo mostra o simulado existente e suas participações.
2. Entrar no diagnóstico e confirmar que o painel carrega sem 429/502.
3. Atualizar a página e repetir a abertura; a segunda montagem tende a usar cache curto do backend.
4. Só depois testar o mesmo PDF grande usado na V1.12.4 para validar o fluxo OMR assíncrono.
