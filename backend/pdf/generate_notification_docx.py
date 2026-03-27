import sys
import io
import os
import json
from docx import Document
from docx.shared import Pt

# Leitura UTF-8 do stdin
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


def classificar(nota):
    n = as_float(nota, 0)
    if n >= 9.5:
        return "Excepcional"
    if n >= 8.5:
        return "Ótimo"
    if n >= 7.0:
        return "Bom"
    if n >= 5.0:
        return "Regular"
    if n >= 3.0:
        return "Insuficiente"
    return "Incompatível"


def get_nested(d, path, default=None):
    cur = d
    for p in path.split("."):
        if not isinstance(cur, dict) or p not in cur:
            return default
        cur = cur[p]
    return cur


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
    if not paragraph.runs:
        return

    full_text = "".join(run.text for run in paragraph.runs)
    original_text = full_text

    # Substitui placeholders
    full_text = substituir_tokens_no_texto(full_text, replacements)

    # Compatibilidade com modelos antigos
    if "NOTIFICAÇÃO DE MEDIDA DISCIPLINAR" in full_text and replacements.get("tituloDocumento"):
        full_text = full_text.replace(
            "NOTIFICAÇÃO DE MEDIDA DISCIPLINAR",
            to_s(replacements["tituloDocumento"])
        )

    frase_antiga = (
        "Esta medida acarreta perda de sua nota disciplinar em {{Valor}} pontos, "
        "enquadrando-se no comportamento {{comportamento}}."
    )
    if frase_antiga in full_text and replacements.get("fraseResultado"):
        full_text = full_text.replace(frase_antiga, to_s(replacements["fraseResultado"]))

    if "{{Valor}}" in full_text:
        full_text = full_text.replace("{{Valor}}", to_s(replacements.get("valorNumerico", "0.00")))

    if full_text != original_text:
        paragraph.clear()
        run = paragraph.add_run(full_text)
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


def main():
    try:
        raw = sys.stdin.read()
        dados = json.loads(raw) if raw else {}
    except Exception as e:
        print(f"Erro ao ler JSON de entrada: {e}", file=sys.stderr)
        sys.exit(1)

    modelo_path = dados.get("modeloPath") or MODELO_PADRAO
    saida_path = dados.get("saidaPath") or SAIDA_PADRAO

    if not os.path.isabs(modelo_path):
        modelo_path = os.path.join(BASE_DIR, modelo_path)
    if not os.path.isabs(saida_path):
        saida_path = os.path.join(BASE_DIR, saida_path)

    if not os.path.exists(modelo_path):
        print(f"Modelo DOCX não encontrado: {modelo_path}", file=sys.stderr)
        sys.exit(1)

    aluno_nome = to_s(
        dados.get("alunoNome")
        or get_nested(dados, "aluno.nome")
        or dados.get("aluno")
        or ""
    )
    aluno_turma = to_s(
        dados.get("turma")
        or get_nested(dados, "aluno.turma")
        or ""
    )
    numero_seq = to_s(dados.get("numeroSequencial") or dados.get("numero") or "")
    data_por_extenso = to_s(
        dados.get("dataPorExtenso")
        or dados.get("dataHora")
        or dados.get("data")
        or ""
    )
    observacao = to_s(dados.get("observacao") or "-")
    descricao_infracao = to_s(
        dados.get("descricaoInfracao")
        or dados.get("motivo")
        or "—"
    )
    artigo = to_s(dados.get("artigo") or "")
    paragrafo = to_s(dados.get("paragrafo") or "")
    inciso = to_s(dados.get("descricaoInciso") or dados.get("inciso") or "")
    assinatura_cargo = to_s(
        dados.get("assinaturaCargo")
        or "Coordenador do Corpo de Alunos do CMDP II - CZS"
    )

    natureza = to_s(dados.get("natureza") or "").strip().lower()
    nota_anterior = clamp_nota(dados.get("notaAnterior", 0))
    nota_atual = clamp_nota(dados.get("notaAtual", nota_anterior))

    delta_informado = dados.get("deltaNota", dados.get("valorNumerico", None))
    if delta_informado is None:
        delta = round(nota_atual - nota_anterior, 2)
    else:
        delta = round(as_float(delta_informado, 0), 2)

    # Decide natureza automaticamente se não vier
    if not natureza:
        natureza = "elogio" if nota_atual > nota_anterior else "indisciplina"

    if natureza == "elogio":
        delta = abs(delta) if delta != 0 else abs(round(nota_atual - nota_anterior, 2))
        titulo_documento = "ELOGIO INDIVIDUAL"
        frase_resultado = (
            f"Este elogio acarreta acréscimo de {abs(delta):.2f} pontos em sua nota disciplinar, "
            f"enquadrando o(a) aluno(a) no comportamento {classificar(nota_atual)}."
        )
        frase_final = (
            "Que esse espírito de disciplina, responsabilidade e dedicação à vida escolar "
            "continue prevalecendo em sua trajetória acadêmica."
        )
    else:
        delta = -abs(delta) if delta != 0 else -abs(round(nota_atual - nota_anterior, 2))
        titulo_documento = "NOTIFICAÇÃO DE MEDIDA DISCIPLINAR"
        frase_resultado = (
            f"Esta medida acarreta perda de {abs(delta):.2f} pontos em sua nota disciplinar, "
            f"enquadrando o(a) aluno(a) no comportamento {classificar(nota_atual)}."
        )
        frase_final = (
            "Ressaltamos a importância da reflexão sobre a conduta apresentada, "
            "visando o desenvolvimento disciplinar e o cumprimento das normas institucionais."
        )

    classificacao_anterior = to_s(
        dados.get("classificacaoAnterior") or classificar(nota_anterior)
    )
    classificacao_atual = to_s(
        dados.get("classificacaoAtual") or classificar(nota_atual)
    )

    replacements = {
        "tituloDocumento": titulo_documento,
        "titulo": titulo_documento,
        "numeroSequencial": numero_seq,
        "numero": numero_seq,
        "aluno": aluno_nome,
        "alunoNome": aluno_nome,
        "turma": aluno_turma,
        "dataHora": data_por_extenso,
        "dataPorExtenso": data_por_extenso,
        "descricaoInfracao": descricao_infracao,
        "motivo": descricao_infracao,
        "observacao": observacao,
        "artigo": artigo,
        "paragrafo": paragrafo,
        "inciso": inciso,
        "descricaoInciso": inciso,
        "valorNumerico": f"{abs(delta):.2f}",
        "Valor": f"{abs(delta):.2f}",
        "deltaNota": f"{delta:.2f}",
        "notaAnterior": fmt2(nota_anterior),
        "notaAtual": fmt2(nota_atual),
        "notaFinal": fmt2(nota_atual),
        "notaPublicavel": fmt2(nota_atual),
        "classificacaoAnterior": classificacao_anterior,
        "classificacaoAtual": classificacao_atual,
        "comportamento": classificacao_atual,
        "fraseResultado": frase_resultado,
        "frase": frase_resultado,
        "fraseFinal": frase_final,
        "assinaturaCargo": assinatura_cargo,
    }

    try:
        doc = Document(modelo_path)
        substituir_em_documento(doc, replacements)
        doc.save(saida_path)
    except Exception as e:
        print(f"Erro ao gerar DOCX: {e}", file=sys.stderr)
        sys.exit(1)

    print(saida_path)


if __name__ == "__main__":
    main()