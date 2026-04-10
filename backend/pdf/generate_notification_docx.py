import sys
import io
import os
import json
import requests
from io import BytesIO

from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELO_PADRAO = os.path.join(BASE_DIR, "modelo-notificacao-dinamico.docx")
SAIDA_PADRAO = os.path.join(BASE_DIR, "notificacao_preenchida.docx")


def to_s(v):
    return "" if v is None else str(v)


def as_float(x, default=0.0):
    try:
        if isinstance(x, str):
            x = x.replace(",", ".").strip()
        return float(x)
    except Exception:
        return default


def fmt2(x):
    return f"{as_float(x, 0):.2f}"


def clamp_nota(n):
    n = as_float(n, 0)
    return max(0.0, min(10.0, round(n, 2)))


def classificar(_nota, dados):
    return to_s(dados.get("classificacaoComportamental") or dados.get("comportamento")) or "—"


def aplicar_formatacao_paragrafo(paragraph):
    for run in paragraph.runs:
        run.font.name = "Times New Roman"
        run.font.size = Pt(12)


def substituir_tokens_no_texto(texto, replacements):
    for key, value in replacements.items():
        token = "{{" + key + "}}"
        texto = texto.replace(token, to_s(value))
    return texto


def substituir_no_paragrafo(paragraph, replacements):
    full_text = paragraph.text or ""
    novo_texto = substituir_tokens_no_texto(full_text, replacements)

    if novo_texto == full_text:
        aplicar_formatacao_paragrafo(paragraph)
        return

    paragraph.clear()
    run = paragraph.add_run(novo_texto)
    run.font.name = "Times New Roman"
    run.font.size = Pt(12)


def substituir_em_tabela(table, replacements):
    for row in table.rows:
        for cell in row.cells:
            for p in cell.paragraphs:
                substituir_no_paragrafo(p, replacements)
                aplicar_formatacao_paragrafo(p)
            for inner_table in cell.tables:
                substituir_em_tabela(inner_table, replacements)


def substituir_em_documento(doc, replacements):
    for p in doc.paragraphs:
        substituir_no_paragrafo(p, replacements)
        aplicar_formatacao_paragrafo(p)

    for table in doc.tables:
        substituir_em_tabela(table, replacements)

    for section in doc.sections:
        for p in section.header.paragraphs:
            substituir_no_paragrafo(p, replacements)
            aplicar_formatacao_paragrafo(p)
        for p in section.footer.paragraphs:
            substituir_no_paragrafo(p, replacements)
            aplicar_formatacao_paragrafo(p)


def inserir_logo_no_topo(doc, logo_url):
    if not logo_url:
        return

    try:
        response = requests.get(logo_url, timeout=8)
        response.raise_for_status()

        image_stream = BytesIO(response.content)

        # Insere no início do documento
        primeiro_paragrafo = doc.paragraphs[0] if doc.paragraphs else doc.add_paragraph()
        p = primeiro_paragrafo.insert_paragraph_before()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER

        run = p.add_run()
        run.add_picture(image_stream, width=Inches(1.3))

        # espaço após logo
        p2 = primeiro_paragrafo.insert_paragraph_before()
        p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p2.add_run("")

    except Exception as e:
        print(f"Erro ao carregar logo: {e}", file=sys.stderr)


def main():
    try:
        raw = sys.stdin.read()
        dados = json.loads(raw) if raw else {}
    except Exception as e:
        print(f"Erro ao ler JSON: {e}", file=sys.stderr)
        sys.exit(1)

    modelo_path = dados.get("modeloPath") or MODELO_PADRAO
    saida_path = dados.get("saidaPath") or SAIDA_PADRAO

    if not os.path.isabs(modelo_path):
        modelo_path = os.path.join(BASE_DIR, modelo_path)

    if not os.path.isabs(saida_path):
        saida_path = os.path.join(BASE_DIR, saida_path)

    if not os.path.exists(modelo_path):
        print(f"Modelo não encontrado: {modelo_path}", file=sys.stderr)
        sys.exit(1)

    aluno_nome = to_s(dados.get("alunoNome") or dados.get("aluno"))
    turma = to_s(dados.get("turma") or dados.get("alunoTurma"))
    numero = to_s(dados.get("numeroSequencial") or dados.get("numero"))
    data = to_s(dados.get("dataPorExtenso") or dados.get("dataHora"))
    descricao = to_s(dados.get("descricaoInfracao") or "—")
    observacao = to_s(dados.get("observacao") or "-")

    nota_anterior = clamp_nota(dados.get("notaAnterior"))
    nota_atual = clamp_nota(dados.get("notaAtual"))

    classificacao = classificar(nota_atual, dados)

    delta_raw = dados.get("valorNumerico", None)
    if delta_raw is None:
        delta = round(nota_atual - nota_anterior, 2)
    else:
        delta = round(as_float(delta_raw, 0), 2)

    natureza = to_s(dados.get("natureza")).strip().lower()
    if not natureza:
        natureza = "elogio" if delta > 0 else "indisciplina"

    texto_institucional = to_s(dados.get("textoInstitucional"))
    cabecalho = to_s(dados.get("cabecalho"))
    nome_regulamento = to_s(dados.get("regulamentoNome"))

    cidade = to_s(dados.get("cidade"))
    estado = to_s(dados.get("estado"))
    logo_url = to_s(dados.get("logoUrl"))

    if natureza == "elogio":
        titulo = "ELOGIO INDIVIDUAL"
        frase_resultado = (
            f"Este reconhecimento resultou em acréscimo de {abs(delta):.2f} pontos, "
            f"enquadrando o(a) aluno(a) no comportamento {classificacao}."
        )
        frase_final = "Parabenizamos pela postura e incentivamos a continuidade desse desempenho."
    else:
        titulo = "NOTIFICAÇÃO DISCIPLINAR"
        frase_resultado = (
            f"Esta ocorrência resultou em redução de {abs(delta):.2f} pontos, "
            f"enquadrando o(a) aluno(a) no comportamento {classificacao}."
        )
        frase_final = "Reforçamos a importância do cumprimento das normas institucionais."

    replacements = {
        "tituloDocumento": titulo,
        "titulo": titulo,
        "regulamentoNome": nome_regulamento,
        "cabecalho": cabecalho,
        "textoInstitucional": texto_institucional,
        "numeroSequencial": numero,
        "numero": numero,
        "aluno": aluno_nome,
        "alunoNome": aluno_nome,
        "turma": turma,
        "dataHora": data,
        "dataPorExtenso": data,
        "descricaoInfracao": descricao,
        "observacao": observacao,
        "notaAnterior": fmt2(nota_anterior),
        "notaAtual": fmt2(nota_atual),
        "notaFinal": fmt2(nota_atual),
        "comportamento": classificacao,
        "fraseResultado": frase_resultado,
        "fraseFinal": frase_final,
        "cidade": cidade,
        "estado": estado,
    }

    try:
        doc = Document(modelo_path)

        inserir_logo_no_topo(doc, logo_url)
        substituir_em_documento(doc, replacements)

        doc.save(saida_path)
    except Exception as e:
        print(f"Erro ao gerar DOCX: {e}", file=sys.stderr)
        sys.exit(1)

    print(saida_path)


if __name__ == "__main__":
    main()