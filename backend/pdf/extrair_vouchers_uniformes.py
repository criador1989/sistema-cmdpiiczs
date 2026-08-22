# -*- coding: utf-8 -*-
"""Extrator de vouchers de uniformes para o Axoriin.

Uso:
    python extrair_vouchers_uniformes.py arquivo.pdf

Saída: JSON em stdout. O PDF não é persistido; apenas os dados estruturados são
retornados ao backend.
"""
from __future__ import annotations

import datetime as _dt
import json
import re
import sys
import unicodedata
from pathlib import Path

try:
    import fitz  # PyMuPDF
except Exception as exc:  # pragma: no cover
    print(json.dumps({
        "erro": "PyMuPDF não está instalado.",
        "detalhes": str(exc),
        "instrucao": "Execute: python -m pip install pymupdf",
    }, ensure_ascii=False))
    raise SystemExit(2)

MESES = {
    "janeiro": 1,
    "fevereiro": 2,
    "marco": 3,
    "abril": 4,
    "maio": 5,
    "junho": 6,
    "julho": 7,
    "agosto": 8,
    "setembro": 9,
    "outubro": 10,
    "novembro": 11,
    "dezembro": 12,
}


def _ascii(value: str) -> str:
    return unicodedata.normalize("NFD", str(value or "")).encode("ascii", "ignore").decode("ascii")


def _limpar_linha(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\u00a0", " ")).strip()


def _data_pt(value: str):
    texto = _limpar_linha(value)
    match = re.search(
        r"(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ]+)\s+de\s+(\d{4})\s+(?:às|as)\s+(\d{1,2}):(\d{2})",
        texto,
        re.I,
    )
    if not match:
        return None
    dia, mes, ano, hora, minuto = match.groups()
    mes_num = MESES.get(_ascii(mes).lower())
    if not mes_num:
        return None
    try:
        return _dt.datetime(int(ano), mes_num, int(dia), int(hora), int(minuto)).isoformat()
    except ValueError:
        return None


def _campo(texto: str, padrao: str) -> str:
    match = re.search(padrao, texto, re.I | re.M)
    return _limpar_linha(match.group(1)) if match else ""


def _inferir_turno(turma: str) -> str:
    texto = _ascii(turma).lower()
    if "vespertino" in texto or "tarde" in texto:
        return "vespertino"
    if "matutino" in texto or "manha" in texto:
        return "matutino"
    if "noturno" in texto or "noite" in texto:
        return "noturno"
    return ""


def _inferir_genero(descricao: str) -> str:
    texto = _ascii(descricao).lower()
    if "feminino" in texto:
        return "feminino"
    if "masculino" in texto:
        return "masculino"
    if "unissex" in texto:
        return "unissex"
    return "nao_aplicavel"


def _inferir_etapa(descricao: str, turma: str) -> str:
    texto = _ascii(descricao).lower()
    if "ensino medio" in texto:
        return "Ensino Médio"
    if "ensino fundamental" in texto or "fundamental" in texto:
        return "Ensino Fundamental"
    t = _ascii(turma).lower()
    numero = re.search(r"\b(\d{1,2})\b", t)
    if numero and int(numero.group(1)) in (6, 7, 8, 9):
        return "Ensino Fundamental"
    if numero and int(numero.group(1)) in (1, 2, 3) and "serie" in t:
        return "Ensino Médio"
    return ""


def _sugerir_nome_item(codigo: str, descricao: str) -> str:
    texto_ascii = _ascii(descricao).lower()
    etapa = "Ensino Médio" if "ensino medio" in texto_ascii else ("Ensino Fundamental" if "fundamental" in texto_ascii else "")
    genero = "Feminino" if "feminino" in texto_ascii else ("Masculino" if "masculino" in texto_ascii else ("Unissex" if "unissex" in texto_ascii else ""))

    if "agasalho" in texto_ascii:
        base = "Kit Agasalho"
    elif "canicula" in texto_ascii and "calca tipo social" in texto_ascii:
        base = "Kit Social"
    elif "canicula" in texto_ascii:
        base = "Canícula"
    elif "blusa" in texto_ascii:
        base = "Blusa"
    elif texto_ascii.startswith("kit "):
        base = "Kit de Uniforme"
    else:
        base = "Item de Uniforme"

    partes = [base]
    if etapa:
        partes.append(etapa)
    if genero:
        partes.append(genero)
    nome = " - ".join(partes)
    if codigo:
        nome = f"{nome} (Item {codigo})"
    return nome[:220]


def _quantidade_pecas(descricao: str) -> int:
    # Os vouchers normalmente indicam cada peça como "01". Para evitar
    # supercontagem, considera no máximo 20 peças e, na dúvida, mantém 1.
    texto = _limpar_linha(descricao)
    ocorrencias = re.findall(r"(?:^|\s|-)0?1\s+(?=[A-Za-zÀ-ÿ])", texto)
    return max(1, min(20, len(ocorrencias)))


def _parse_segmento(segmento: str, pagina: int, indice_pagina: int):
    linhas = [_limpar_linha(x) for x in str(segmento or "").splitlines()]
    linhas = [x for x in linhas if x and not re.fullmatch(r"[-\s]+", x)]
    texto = "\n".join(linhas)

    aluno = _campo(texto, r"^Aluno:\s*(.+)$")
    turma = _campo(texto, r"^Turma:\s*(.+)$")
    codigo_match = re.search(r"\b([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4})\b", texto, re.I)
    codigo = codigo_match.group(1).upper() if codigo_match else ""
    lote = _campo(texto, r"^Lote:\s*(.+)$")
    item_codigo = _campo(texto, r"^Item:\s*(.+)$")
    criado_por = _campo(texto, r"^Voucher criado por:\s*(.+)$")
    gerado_texto = _campo(texto, r"^Voucher gerado em\s+(.+)$")
    validade_texto = _campo(texto, r"^Voucher expira em\s+(.+)$")

    instituicao_origem = ""
    for linha in linhas[:6]:
        if linha.upper().startswith("ESC "):
            instituicao_origem = linha
            break

    fornecedor = ""
    endereco_fornecedor = ""
    try:
        idx_local = next(i for i, linha in enumerate(linhas) if linha.upper() == "LOCAL DE RETIRADA")
        idx_lote = next(i for i, linha in enumerate(linhas[idx_local + 1 :], idx_local + 1) if linha.lower().startswith("lote:"))
        bloco = linhas[idx_local + 1 : idx_lote]
        if bloco:
            fornecedor = bloco[0]
            endereco_fornecedor = " ".join(bloco[1:]).strip()
    except StopIteration:
        pass

    descricao = ""
    try:
        idx_item = next(i for i, linha in enumerate(linhas) if linha.lower().startswith("item:"))
        descricao = " ".join(linhas[idx_item + 1 :]).strip()
    except StopIteration:
        pass

    erros = []
    if not aluno:
        erros.append("Aluno não identificado no voucher.")
    if not turma:
        erros.append("Turma não identificada no voucher.")
    if not codigo:
        erros.append("Código do voucher não identificado.")
    if not fornecedor:
        erros.append("Fornecedor não identificado.")
    if not item_codigo:
        erros.append("Código do item não identificado.")

    return {
        "pagina": pagina,
        "ordemNaPagina": indice_pagina,
        "aluno": aluno,
        "turma": turma,
        "turno": _inferir_turno(turma),
        "codigo": codigo,
        "fornecedor": fornecedor,
        "enderecoFornecedor": endereco_fornecedor,
        "lote": lote,
        "itemCodigo": item_codigo,
        "itemNomeSugerido": _sugerir_nome_item(item_codigo, descricao),
        "descricao": descricao,
        "genero": _inferir_genero(descricao),
        "etapa": _inferir_etapa(descricao, turma),
        "quantidadePecas": _quantidade_pecas(descricao),
        "geradoEm": _data_pt(gerado_texto),
        "validade": _data_pt(validade_texto),
        "criadoPor": criado_por,
        "instituicaoOrigem": instituicao_origem,
        "errosExtracao": erros,
    }


def extrair(pdf_path: str):
    caminho = Path(pdf_path)
    if not caminho.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {caminho}")
    if caminho.suffix.lower() != ".pdf":
        raise ValueError("O arquivo informado não é PDF.")

    documento = fitz.open(str(caminho))
    vouchers = []
    paginas_sem_texto = []

    try:
        for pagina_idx in range(documento.page_count):
            pagina = documento.load_page(pagina_idx)
            texto = pagina.get_text("text") or ""
            if not texto.strip():
                paginas_sem_texto.append(pagina_idx + 1)
                continue

            segmentos = re.split(r"(?mi)^\s*VOUCHER\s*$", texto)
            ordem = 0
            for segmento in segmentos[1:]:
                ordem += 1
                registro = _parse_segmento(segmento, pagina_idx + 1, ordem)
                if registro["codigo"] or registro["aluno"] or registro["fornecedor"]:
                    vouchers.append(registro)
    finally:
        documento.close()

    codigos = [v["codigo"] for v in vouchers if v["codigo"]]
    duplicados_no_arquivo = sorted({codigo for codigo in codigos if codigos.count(codigo) > 1})

    return {
        "arquivo": caminho.name,
        "paginas": pagina_idx + 1 if 'pagina_idx' in locals() else 0,
        "paginasSemTexto": paginas_sem_texto,
        "totalVouchers": len(vouchers),
        "duplicadosNoArquivo": duplicados_no_arquivo,
        "vouchers": vouchers,
    }


def _emitir_payload(payload, output_path=None):
    # ensure_ascii=True deixa o arquivo de intercâmbio estritamente ASCII e
    # elimina diferenças de code page/terminal no Windows. Ao decodificar o
    # JSON, os acentos são restaurados normalmente.
    conteudo = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    if output_path:
        Path(output_path).write_text(conteudo, encoding="utf-8")
    else:
        sys.stdout.write(conteudo)
        sys.stdout.flush()


def main():
    if len(sys.argv) not in (2, 3):
        _emitir_payload({"erro": "Uso: extrair_vouchers_uniformes.py arquivo.pdf [saida.json]"})
        raise SystemExit(2)

    output_path = sys.argv[2] if len(sys.argv) == 3 else None
    try:
        payload = extrair(sys.argv[1])
        _emitir_payload(payload, output_path)
    except Exception as exc:
        try:
            _emitir_payload({"erro": str(exc)}, output_path)
        finally:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
