import sys
import io
import json
import os
from docx import Document
from docx.shared import Pt

# Forçar leitura em UTF-8
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')

# Caminhos
modelo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "modelo-notificacao-dinamico.docx"))
saida_path = os.path.join(os.path.dirname(__file__), "notificacao_preenchida.docx")

# Leitura dos dados
try:
    input_data = sys.stdin.read()
    dados = json.loads(input_data)
except Exception as e:
    print(f"Erro ao ler os dados: {e}", file=sys.stderr)
    sys.exit(1)

# Garantir que tudo seja string
dados = {k: str(v) for k, v in dados.items()}

# Substituição de campos
def aplicar_formatacao_paragrafo(paragrafo):
    for run in paragrafo.runs:
        run.font.name = 'Times New Roman'
        run.font.size = Pt(12)

def aplicar_formatacao_tabela(tabela):
    for row in tabela.rows:
        for cell in row.cells:
            for p in cell.paragraphs:
                aplicar_formatacao_paragrafo(p)

def substituir_campos(doc, dados):
    for p in doc.paragraphs:
        for chave, valor in dados.items():
            if f"{{{{{chave}}}}}" in p.text:
                for run in p.runs:
                    run.text = run.text.replace(f"{{{{{chave}}}}}", valor)
        aplicar_formatacao_paragrafo(p)

    for tabela in doc.tables:
        for row in tabela.rows:
            for cell in row.cells:
                for chave, valor in dados.items():
                    if f"{{{{{chave}}}}}" in cell.text:
                        for par in cell.paragraphs:
                            for run in par.runs:
                                run.text = run.text.replace(f"{{{{{chave}}}}}", valor)
        aplicar_formatacao_tabela(tabela)

# Gerar documento
doc = Document(modelo_path)
substituir_campos(doc, dados)
doc.save(saida_path)
print(saida_path)
