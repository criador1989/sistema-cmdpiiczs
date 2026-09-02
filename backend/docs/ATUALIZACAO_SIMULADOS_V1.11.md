# Axoriin Simulados V1.11.0 - participação pós-processamento e intervenção por alcance

A V1.11.0 evolui o tratamento de ausência e a organização das intervenções pedagógicas sem exigir reimportação de cartões ou perda do que já foi processado.

## 1. Revisão de participação depois do processamento

O Diagnóstico passa a oferecer **Revisar participação/ausências**. A gestão pode abrir uma turma já processada e, por estudante, informar em cada dia de aplicação:

- **Realizado / aplicável**;
- **Ausência confirmada**.

O filtro padrão destaca estudantes com cobertura parcial ou ausência já registrada, facilitando localizar casos de 50%/51,3% quando o aluno realmente realizou somente um dia.

### O que acontece ao confirmar uma ausência

- as respostas do dia ausente deixam de entrar no denominador, na cobertura e no diagnóstico;
- ausência não vira erro, branco nem resposta não importada;
- vínculo do estudante é preservado;
- respostas A-E eventualmente existentes naquele dia são guardadas internamente para restauração;
- as áreas e habilidades dos dias efetivamente realizados continuam válidas;
- a cobertura passa a representar apenas o universo aplicável do que foi realizado;
- o resultado global do simulado continua como **participação parcial / diagnóstico global provisório**, para não comparar um estudante de um único dia com quem realizou o simulado completo.

### Restauração reversível

Se uma ausência for marcada por engano, basta mudar o dia novamente para **Realizado / aplicável**. O Axoriin restaura as respostas preservadas e recalcula o diagnóstico. Se não havia respostas naquele dia, ele volta naturalmente a aparecer como base não importada até que os dados sejam disponibilizados.

## 2. Revisão individual ou em lote

A participação pode ser corrigida:

- na ficha individual do resultado;
- em lote, pela tela **Revisar participação/ausências**, com filtro por turma.

Toda alteração é registrada na auditoria (`CORRIGIR_PARTICIPACAO_LOTE`) com dias anteriores, dias novos e informação de preservação das respostas.

## 3. Intervenção: turma → ampla → pequeno grupo → individual

A regra de alcance foi refinada porque um conjunto como 66 de 114 estudantes não deve ser chamado de “pequeno grupo”.

A V1.11.0 usa quatro níveis operacionais:

1. **Turma / retomada coletiva**: necessidade compartilhada por 60% ou mais do recorte;
2. **Intervenção ampla organizada por turma**: necessidade abaixo de 60%, mas envolvendo mais de 15 estudantes;
3. **Pequeno grupo**: subconjunto focal de até 15 estudantes, respeitando o mínimo configurado pela escola;
4. **Individual**: casos críticos com base suficiente.

O PDF geral, o PDF específico de Habilidades ENEM e o XLSX passam a separar intervenção ampla de pequeno grupo.

## 4. Preservação e compatibilidade

A atualização parte da V1.10.1 corrigida e preserva:

- resultados já processados;
- respostas A-E;
- vínculos aluno × cartão;
- correções de Inglês/Espanhol;
- ausências já registradas;
- matriz pedagógica e mapeamento ENEM 164/164;
- relatórios e regras de diagnóstico já existentes.

Não é necessário reimportar PDFs, refazer vínculos ou importar novamente a Matriz ENEM.
