# Axoriin - Simulados V1.12.2

## Idioma não aplicável quando há ausência confirmada no dia de língua

Esta versão corrige a apresentação e o fluxo de revisão de língua estrangeira para estudantes ausentes em todo o dia que contém Inglês/Espanhol.

- Ausência confirmada no dia de idioma passa a ser exibida como **Não aplicável — ausência confirmada**.
- Esses estudantes deixam de aparecer como pendência de língua.
- A conferência original já armazenada (`INGLES`, `ESPANHOL`, `NAO_MARCADO` ou `NAO_INFORMADO`) **não é apagada nem regravada**. Ela permanece preservada no resultado.
- Se a ausência for desfeita, a informação original volta a ser efetiva automaticamente.
- Respostas A-E, vínculos de alunos, matriz pedagógica, habilidades ENEM, resultados dos demais dias e idiomas já conferidos permanecem intactos.
- PDF gerencial e XLSX usam o idioma efetivo para apresentação, sem alterar o dado bruto preservado no banco.

A mudança é retrocompatível com resultados já processados: não exige reimportação de cartões nem novo processamento das turmas.
