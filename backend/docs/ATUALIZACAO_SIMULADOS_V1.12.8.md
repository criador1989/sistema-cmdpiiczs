# Axoriin Simulados V1.12.8 - PDFs guiados + metodologia explicada

A V1.12.8 substitui a prévia V1.12.7 e consolida as proteções de memória da V1.12.6. O foco é tornar os três PDFs autoexplicativos para direção, coordenação e professores.

## Principais mudanças

- O PDF Visual passa a explicar, em cada gráfico/tabela, **o que está sendo medido, quem entra no universo, como interpretar e quais limites não podem ser inferidos**.
- A nomenclatura estudantil `Crítico` é apresentada como **Intervenção imediata**, reduzindo caráter de rótulo e reforçando ação pedagógica.
- As faixas individuais exibem intervalo percentual, quantidade e significado pedagógico.
- A média das turmas é identificada como **média geral do recorte**, com aviso explícito de que não é média do ENEM/Brasil/Acre/município.
- Participação por dia explica por que o universo pode ser 114, mesmo com 110 presentes no 1º dia e 109 no 2º.
- As faixas das questões mostram os intervalos <20, 20-<40, 40-<60, 60-<80 e >=80, separadas da classificação de alunos.
- Habilidades ENEM passam a trazer glossário de `indicativa`, `sustentada`, `prioritária`, `em desenvolvimento` e `consolidada`.
- O PDF Visual ganha uma seção final **Como o Axoriin interpreta os resultados**, documentando os parâmetros configuráveis e o motivo de cada trava.
- O PDF Gerencial e o PDF Habilidades ENEM recebem a mesma camada de explicação e rastreabilidade metodológica.

## Origem dos parâmetros

Os valores 50%, 70%, mínimo de 2 questões, mínimo de 5 respondentes, mínimo de 2 alunos por grupo e cobertura individual mínima de 80% são **critérios internos de gestão pedagógica**, não cortes oficiais do INEP/ENEM nem parâmetros TRI. O relatório agora explica a finalidade operacional de cada um.

As subfaixas abaixo de 50% são derivações internas do limiar de prioridade: abaixo de 25% = intervenção imediata; 25% a <40% = prioridade alta; 40% a <50% = em atenção. Elas servem para ordenar a intervenção, não para rotular estudantes.

## Memória e exportação

Continuam preservadas as proteções de memória herdadas da V1.12.6: payloads compactos para PDF Visual/Habilidades, resultados compactos no Gerencial, liberação de dados grandes antes do Python, envio por arquivo/stream e uma geração pesada por processo.

## Segurança dos dados

A V1.12.8 não altera respostas, vínculos, idiomas, ausências, classificações calculadas ou dados persistidos. As mudanças são de apresentação, explicação metodológica, versionamento e proteção da exportação.
