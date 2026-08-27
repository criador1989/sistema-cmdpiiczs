# Validação do leitor OMR — Simulados V1.1

## Amostra usada

O motor foi executado localmente nos seis PDFs escaneados da aplicação real:

- três turmas;
- 1º e 2º dia;
- 224 páginas, uma por cartão;
- 17.920 posições de resposta (224 × 80).

Os PDFs e as imagens dos estudantes não fazem parte do código nem do pacote de instalação.

## Resultado técnico

- 224/224 páginas tiveram a geometria completa localizada após correção de inclinação;
- 184 cartões não apresentaram ambiguidade nas 80 respostas;
- 40 cartões tiveram ao menos uma resposta encaminhada para revisão;
- 17.361 bolhas foram classificadas como marca única;
- 249 posições foram classificadas como branco inequívoco;
- 294 posições ficaram como tinta/marca incerta;
- 16 posições apresentaram evidência de múltipla marcação.

No 1º dia, em 110 cartões:

- 38 marcações de Inglês foram reconhecidas;
- 51 marcações de Espanhol foram reconhecidas;
- 21 cartões ficaram com língua pendente porque a bolha não estava inequívoca ou não havia marca visível.

## Interpretação correta

Esta validação comprova que o layout é localizado e que o mecanismo separa automaticamente os casos seguros dos casos que exigem decisão humana. Ela não transforma marca ambígua em resposta: os 310 casos incertos ou múltiplos permanecem bloqueados até a conferência visual.

A inspeção visual de cartões representativos foi usada durante a calibração. Uma homologação operacional deve ainda comparar uma amostra conferida por duas pessoas com a prévia do sistema antes do primeiro processamento oficial.

## Teste sem dados pessoais

O comando abaixo gera um cartão sintético e exige o reconhecimento das 80 respostas e de Inglês:

```bash
python scripts/testar-omr-simulados.py
```
