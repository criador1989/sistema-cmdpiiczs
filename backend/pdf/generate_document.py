import sys
import io
import os
import json
import hashlib
import requests

from io import BytesIO
from datetime import datetime

from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DEFAULT_TEMPLATE = os.path.join(
    BASE_DIR,
    "templates",
    "termo_ciencia.docx"
)

DEFAULT_OUTPUT = os.path.join(
    BASE_DIR,
    "output",
    "documento_gerado.docx"
)


# =========================================================
# HELPERS
# =========================================================

def to_s(v):
    return "" if v is None else str(v)


def now_br():
    return datetime.now().strftime("%d/%m/%Y %H:%M")


def gerar_hash(dados):
    try:
        raw = json.dumps(dados, ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()
    except Exception:
        return ""


def aplicar_formatacao_paragrafo(paragraph):
    for run in paragraph.runs:
        run.font.name = "Times New Roman"
        run.font.size = Pt(12)


def substituir_tokens(texto, replacements):
    for key, value in replacements.items():
        token = "{{" + key + "}}"
        texto = texto.replace(token, to_s(value))
    return texto


def substituir_paragrafo(paragraph, replacements):
    texto_original = paragraph.text or ""
    texto_novo = substituir_tokens(texto_original, replacements)

    if texto_original == texto_novo:
        aplicar_formatacao_paragrafo(paragraph)
        return

    paragraph.clear()

    run = paragraph.add_run(texto_novo)
    run.font.name = "Times New Roman"
    run.font.size = Pt(12)


def substituir_tabela(table, replacements):
    for row in table.rows:
        for cell in row.cells:

            for p in cell.paragraphs:
                substituir_paragrafo(p, replacements)
                aplicar_formatacao_paragrafo(p)

            for inner in cell.tables:
                substituir_tabela(inner, replacements)


def substituir_documento(doc, replacements):
    for p in doc.paragraphs:
        substituir_paragrafo(p, replacements)
        aplicar_formatacao_paragrafo(p)

    for table in doc.tables:
        substituir_tabela(table, replacements)

    for section in doc.sections:

        for p in section.header.paragraphs:
            substituir_paragrafo(p, replacements)
            aplicar_formatacao_paragrafo(p)

        for p in section.footer.paragraphs:
            substituir_paragrafo(p, replacements)
            aplicar_formatacao_paragrafo(p)


def inserir_logo(doc, logo_url):
    if not logo_url:
        return

    try:
        response = requests.get(logo_url, timeout=10)
        response.raise_for_status()

        img_stream = BytesIO(response.content)

        primeiro = doc.paragraphs[0] if doc.paragraphs else doc.add_paragraph()

        p = primeiro.insert_paragraph_before()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER

        run = p.add_run()
        run.add_picture(img_stream, width=Inches(1.25))

        espaco = primeiro.insert_paragraph_before()
        espaco.add_run("")

    except Exception as e:
        print(f"Erro logo: {e}", file=sys.stderr)


# =========================================================
# MAIN
# =========================================================

def main():

    try:
        raw = sys.stdin.read()
        dados = json.loads(raw) if raw else {}
    except Exception as e:
        print(f"Erro JSON: {e}", file=sys.stderr)
        sys.exit(1)

    template_path = dados.get("templatePath") or DEFAULT_TEMPLATE
    output_path = dados.get("outputPath") or DEFAULT_OUTPUT

    if not os.path.isabs(template_path):
        template_path = os.path.join(BASE_DIR, template_path)

    if not os.path.isabs(output_path):
        output_path = os.path.join(BASE_DIR, output_path)

    output_dir = os.path.dirname(output_path)
    os.makedirs(output_dir, exist_ok=True)

    if not os.path.exists(template_path):
        print(f"Template não encontrado: {template_path}", file=sys.stderr)
        sys.exit(1)

    hash_documento = gerar_hash(dados)

    replacements = {
        "instituicaoNome":
            to_s(dados.get("instituicaoNome")),

        "cabecalho":
            to_s(dados.get("cabecalho")),

        "cidade":
            to_s(dados.get("cidade")),

        "estado":
            to_s(dados.get("estado")),

        "numeroProcesso":
            to_s(dados.get("numeroProcesso")),

        "alunoNome":
            to_s(dados.get("alunoNome")),

        "turma":
            to_s(dados.get("turma")),

        "responsavelNome":
            to_s(dados.get("responsavelNome")),

        "responsavelParentesco":
            to_s(dados.get("responsavelParentesco")),

        "descricaoFato":
            to_s(dados.get("descricaoFato")),

        "providencias":
            to_s(dados.get("providencias")),

        "dataFato":
            to_s(dados.get("dataFato")),

        "localFato":
            to_s(dados.get("localFato")),
                    "naturezaProcedimento":
            to_s(dados.get("naturezaProcedimento")),

        "classificacaoOcorrencia":
            to_s(dados.get("classificacaoOcorrencia")),

        "gravidade":
            to_s(dados.get("gravidade")),

        "statusProcesso":
            to_s(dados.get("statusProcesso")),

        "dataCiencia":
            to_s(dados.get("dataCiencia")),

        "ipCiencia":
            to_s(dados.get("ipCiencia")),

        "respostaResponsavel":
            to_s(dados.get("respostaResponsavel")),

        "resultadoAcompanhamento":
            to_s(dados.get("resultadoAcompanhamento")),

        "parecerFinal":
            to_s(dados.get("parecerFinal")),

        "dataGeracao":
            now_br(),

        "hashDocumento":
            hash_documento,

        "usuarioGerador":
            to_s(dados.get("usuarioGerador")),

        "assinaturaDigital":
            f"Documento gerado digitalmente pelo Axoriin em {now_br()}",

        "textoRodape":
            (
                "Documento institucional gerado eletronicamente "
                "pela plataforma Axoriin."
            )
    }

    try:

        doc = Document(template_path)

        inserir_logo(doc, dados.get("logoUrl"))

        substituir_documento(doc, replacements)

        doc.save(output_path)

    except Exception as e:
        print(f"Erro ao gerar documento: {e}", file=sys.stderr)
        sys.exit(1)

    print(output_path)


if __name__ == "__main__":
    main()