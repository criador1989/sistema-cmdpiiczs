# Axoriin Simulados V1.7.0 - Diagnóstico V5 / Habilidades ENEM operacionais

## Objetivo
A V1.7.0 transforma o diagnóstico de habilidades ENEM já calculado na V1.6.x em uma ferramenta operacional mais coerente na tela, no PDF, no XLSX e no plano de intervenção.

## Principais evoluções
- O card **Habilidades prioritárias** da tela usa as prioridades oficiais ENEM quando o simulado é ENEM.
- Códigos de habilidade são qualificados pela área para eliminar ambiguidade: `LC-H5`, `MAT-H5`, `CN-H5`, `CH-H5`.
- Necessidades que atingem **60% ou mais dos participantes** são tratadas como **retomada coletiva da turma**, e não como pequeno grupo.
- **Grupos sugeridos** ficam reservados a subconjuntos abaixo desse limiar e acima do mínimo de alunos configurado.
- O diagnóstico individual prioriza habilidades ENEM antes de habilidades pedagógicas genéricas.
- A matriz passa a aceitar `CONFIANCA_ENEM`: `DIRETA` ou `APROXIMADA`.
- PDF e XLSX exibem quantos vínculos são diretos e quantos são aproximações pedagógicas.
- O anexo técnico do PDF identifica a confiança do vínculo ENEM questão por questão.
- `versaoDiagnostico = 5`; resultados anteriores podem ser recalculados a partir das respostas já persistidas.

## Mapeamento completo das 164 variantes
O mapeamento complementar fornecido com esta versão contém **164 de 164 variantes**:
- 162 vínculos diretos;
- 2 vínculos aproximados, identificados explicitamente como aproximação pedagógica.

As duas aproximações são:
- `D1Q45 / PADRAO -> CH-H1` - questão filosófica sobre idealismo/realidade externa;
- `D1Q61 / PADRAO -> CH-H1` - questão filosófica sobre autonomia do sujeito pensante em Descartes.

A Matriz de Referência ENEM não apresenta uma habilidade específica de epistemologia/teoria do conhecimento. Por isso esses dois itens recebem o melhor encaixe disponível em Ciências Humanas, **sem ocultar a natureza aproximada do vínculo**.

## Segurança
A importação do mapeamento continua alterando somente metadados pedagógicos. Respostas, gabaritos, língua marcada, vínculos de alunos e cartões processados são preservados.
