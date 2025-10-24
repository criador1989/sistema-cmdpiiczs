# pdf/generate_notification_docx.py
import sys
import io
import json
import os
from docx import Document
from docx.shared import Pt

sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')

BASE_DIR = os.path.dirname(__file__)
modelo_path = os.path.abspath(os.path.join(BASE_DIR, "modelo-notificacao-dinamico.docx"))
saida_path  = os.path.join(BASE_DIR, "notificacao_preenchida.docx")

# lê json do Node
try:
    raw = sys.stdin.read()
    dados = json.loads(raw) if raw else {}
except Exception as e:
    print(f"Erro ao ler os dados: {e}", file=sys.stderr)
    sys.exit(1)

def to_s(v):
    if v is None:
        return ''
    return str(v)

# mapa de placeholders (compat + novos)
mapa = {}
mapa["numeroSequencial"]          = to_s(dados.get("numeroSequencial","")) or to_s(dados.get("numero",""))
mapa["numero"]                    = mapa["numeroSequencial"]               # compat
mapa["aluno"]                     = to_s(dados.get("aluno",""))
mapa["turma"]                     = to_s(dados.get("turma",""))
mapa["artigo"]                    = to_s(dados.get("artigo",""))
mapa["descricaoInciso"]           = to_s(dados.get("descricaoInciso","")) or to_s(dados.get("inciso",""))
mapa["inciso"]                    = mapa["descricaoInciso"]                # compat
mapa["classificacaoRegulamento"]  = to_s(dados.get("classificacaoRegulamento",""))
mapa["tipoMedida"]                = to_s(dados.get("tipoMedida","")) or to_s(dados.get("tipo",""))
mapa["observacao"]                = to_s(dados.get("observacao","-"))
mapa["valorNumerico"]             = to_s(dados.get("valorNumerico","")) or to_s(dados.get("Valor",""))
mapa["Valor"]                     = mapa["valorNumerico"]                  # compat
mapa["notaAnterior"]              = to_s(dados.get("notaAnterior",""))
mapa["notaAtual"]                 = to_s(dados.get("notaAtual",""))
mapa["comportamento"]             = to_s(dados.get("comportamento",""))
mapa["dataPorExtenso"]            = to_s(dados.get("dataPorExtenso",""))
mapa["dataHora"]                  = mapa["dataPorExtenso"]                 # compat com modelos antigos
mapa["descricaoInfracao"]         = to_s(dados.get("descricaoInfracao",""))

# assinatura
mapa["cargoAssinatura"] = "Coordenador do Corpo de Alunos"
mapa["assinaturaNome"]  = ""                         # vazio para não imprimir nome
mapa["assinaturaCargo"] = mapa["cargoAssinatura"]

# nomes a remover, se estiverem fixos no DOCX (sem placeholders)
HARDCODED_NAME_VARIATIONS = [
    # Helder (todas as formas comuns)
    "3º SGT BM HELDER",
    "3º SGT BM Helder",
    "3º Sgt BM Helder",
    "SGT BM Helder",
    "Sgt BM Helder",
    "Helder",
    # Freire da Silva (todas as formas comuns)
    "3º FREIRE DA SILVA",
    "3º Freire da Silva",
    "3º FREIRE",
    "3º Freire",
    "Freire da Silva",
    "Freire",
]

def aplicar_formatacao_paragrafo(p):
    for run in p.runs:
        run.font.name = 'Times New Roman'
        run.font.size = Pt(12)

def substituir_no_paragrafo(p, dct):
    if not p.runs:
        return
    full_text = "".join(run.text for run in p.runs)
    changed = False
    # placeholders
    for chave, valor in dct.items():
        token = "{{" + chave + "}}"
        if token in full_text:
            full_text = full_text.replace(token, valor)
            changed = True
    # remoção de nomes fixos
    for bad in HARDCODED_NAME_VARIATIONS:
        if bad and bad in full_text:
            full_text = full_text.replace(bad, "")
            changed = True
    if changed:
        p.clear()
        run = p.add_run(full_text)
        run.font.name = 'Times New Roman'
        run.font.size = Pt(12)

def substituir_em_tabela(tb, dct):
    for row in tb.rows:
        for cell in row.cells:
            for p in cell.paragraphs:
                substituir_no_paragrafo(p, dct)
                aplicar_formatacao_paragrafo(p)

def substituir_em_header_footer(hf, dct):
    for p in hf.paragraphs:
        substituir_no_paragrafo(p, dct)
        aplicar_formatacao_paragrafo(p)
    for tb in hf.tables:
        substituir_em_tabela(tb, dct)

def substituir_em_doc(doc, dct):
    for p in doc.paragraphs:
        substituir_no_paragrafo(p, dct)
        aplicar_formatacao_paragrafo(p)
    for tb in doc.tables:
        substituir_em_tabela(tb, dct)
    for section in doc.sections:
        substituir_em_header_footer(section.header, dct)
        substituir_em_header_footer(section.footer, dct)

doc = Document(modelo_path)
substituir_em_doc(doc, mapa)
doc.save(saida_path)
print(saida_path)
