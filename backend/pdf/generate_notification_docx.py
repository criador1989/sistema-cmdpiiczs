# pdf/generate_notification_docx.py
import sys, io, json, os
from docx import Document
from docx.shared import Pt

sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')

BASE_DIR = os.path.dirname(__file__)
modelo_path = os.path.abspath(os.path.join(BASE_DIR, "modelo-notificacao-dinamico.docx"))
saida_path  = os.path.join(BASE_DIR, "notificacao_preenchida.docx")

def to_s(v): return '' if v is None else str(v)

def is_number(x):
    try:
        if isinstance(x, str): x = x.replace(',', '.')
        float(x); return True
    except Exception:
        return False

def as_float(x, default=None):
    try:
        if isinstance(x, str): x = x.replace(',', '.')
        return float(x)
    except Exception:
        return default

def fmt2(x, default=''):
    if x is None: return default
    if is_number(x):
        n = as_float(x, None)
        return default if n is None else f"{n:.2f}"
    s = to_s(x).strip()
    return s if s else default

def get_nested(d, path, default=None):
    cur = d
    for p in path.split('.'):
        if not isinstance(cur, dict) or p not in cur: return default
        cur = cur[p]
    return cur

# ---------- lê JSON ----------
try:
    raw = sys.stdin.read()
    dados = json.loads(raw) if raw else {}
except Exception as e:
    print(f"Erro ao ler os dados: {e}", file=sys.stderr); sys.exit(1)

# ---------- derivação e fallbacks ----------
aluno_nome  = to_s(dados.get("alunoNome") or (dados.get("aluno") if isinstance(dados.get("aluno"), str) else "") or get_nested(dados, "aluno.nome") or "")
aluno_turma = to_s(dados.get("turma") or dados.get("alunoTurma") or get_nested(dados, "aluno.turma") or "")

valor_num       = fmt2(dados.get("valorNumerico", dados.get("Valor")))
nota_publicavel = None
for chave in ["notaPublicavel", "notaFinal", "notaAtual", "notaNoDia", "nota", "comportamento"]:
    v = dados.get(chave, None)
    if v is not None and is_number(v):
        nota_publicavel = fmt2(v); break

nota_anterior = fmt2(dados.get("notaAnterior"))
nota_atual_in = fmt2(dados.get("notaAtual"))  # o que veio do Node (se vier)
data_por_extenso = to_s(dados.get("dataPorExtenso", dados.get("dataHora", "")))
descricao_inciso  = to_s(dados.get("descricaoInciso") or dados.get("inciso"))
tipo_medida       = to_s(dados.get("tipoMedida") or dados.get("tipo"))
observacao        = to_s(dados.get("observacao", "-"))
numero_seq        = to_s(dados.get("numeroSequencial") or dados.get("numero"))
artigo            = to_s(dados.get("artigo", ""))
classificacao_reg = to_s(dados.get("classificacaoRegulamento", ""))
descricao_infracao= to_s(dados.get("descricaoInfracao") or dados.get("motivo"))

# comportamento textual
comp_text = to_s(dados.get("classificacaoComportamental") or "")
if not comp_text:
    c = dados.get("comportamento")
    if c is not None and not is_number(c):
        comp_text = to_s(c)

# nota final (numérica, 2 casas)
nota_final = nota_publicavel  # já formatada em 2 casas

# ---------- mapa de placeholders ----------
mapa = {
  "numeroSequencial": numero_seq,
  "numero": numero_seq,
  "aluno": aluno_nome,
  "turma": aluno_turma,
  "artigo": artigo,
  "descricaoInciso": descricao_inciso,
  "inciso": descricao_inciso,
  "classificacaoRegulamento": classificacao_reg,
  "tipoMedida": tipo_medida,
  "observacao": observacao,
  "valorNumerico": valor_num,
  "Valor": valor_num,
  "notaAnterior": nota_anterior,
  # 👇 FORÇA a Nota Atual a ser a nota final do dia, se existir
  "notaAtual": (nota_final or nota_atual_in or ""),
  "comportamento": comp_text or "",
  "notaFinal": (nota_final or ""),
  "notaPublicavel": (nota_final or ""),
  "dataPorExtenso": data_por_extenso,
  "dataHora": data_por_extenso,
  "descricaoInfracao": descricao_infracao,
  "cargoAssinatura": to_s(dados.get("cargoAssinatura") or "Coordenador do Corpo de Alunos"),
  "assinaturaNome": to_s(dados.get("assinaturaNome") or ""),
  "assinaturaCargo": to_s(dados.get("assinaturaCargo") or to_s(dados.get("cargoAssinatura") or "Coordenador do Corpo de Alunos")),
}

HARDCODED_NAME_VARIATIONS = [
  "3º SGT BM HELDER","3º SGT BM Helder","3º Sgt BM Helder","SGT BM Helder","Sgt BM Helder","Helder",
  "3º FREIRE DA SILVA","3º Freire da Silva","3º FREIRE","3º Freire","Freire da Silva","Freire",
]

def aplicar_formatacao_paragrafo(p):
    for run in p.runs:
        run.font.name = 'Times New Roman'; run.font.size = Pt(12)

def substituir_no_paragrafo(p, dct):
    if not p.runs: return
    full_text = "".join(run.text for run in p.runs); changed = False
    for chave, valor in dct.items():
        token = "{{" + chave + "}}"
        if token in full_text:
            full_text = full_text.replace(token, valor); changed = True
    for bad in HARDCODED_NAME_VARIATIONS:
        if bad and bad in full_text:
            full_text = full_text.replace(bad, ""); changed = True
    if changed:
        p.clear()
        run = p.add_run(full_text); run.font.name = 'Times New Roman'; run.font.size = Pt(12)

def substituir_em_tabela(tb, dct):
    for row in tb.rows:
        for cell in row.cells:
            for p in cell.paragraphs:
                substituir_no_paragrafo(p, dct); aplicar_formatacao_paragrafo(p)

def substituir_em_header_footer(hf, dct):
    for p in hf.paragraphs:
        substituir_no_paragrafo(p, dct); aplicar_formatacao_paragrafo(p)
    for tb in hf.tables: substituir_em_tabela(tb, dct)

def substituir_em_doc(doc, dct):
    for p in doc.paragraphs:
        substituir_no_paragrafo(p, dct); aplicar_formatacao_paragrafo(p)
    for tb in doc.tables: substituir_em_tabela(tb, dct)
    for section in doc.sections:
        substituir_em_header_footer(section.header, dct)
        substituir_em_header_footer(section.footer, dct)

doc = Document(modelo_path)
substituir_em_doc(doc, mapa)
doc.save(saida_path)
print(saida_path)
