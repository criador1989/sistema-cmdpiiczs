#!/usr/bin/env python3
"""Extrai notas de relatórios PDF "Relação de Notas e Conceitos" do SIMAED.

Saída: JSON UTF-8 no stdout. Erros são enviados ao stderr e retornam código 1.
O extrator foi desenhado para PDFs digitais gerados pelo próprio SIMAED; PDFs
escaneados, sem camada de texto/tabela, são recusados com mensagem clara.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any
from concurrent.futures import ProcessPoolExecutor

try:
    import pdfplumber
except Exception as exc:  # pragma: no cover - mensagem usada no ambiente real
    print(
        json.dumps(
            {
                "erro": "Dependência pdfplumber não instalada.",
                "detalhes": str(exc),
            },
            ensure_ascii=False,
        ),
        file=sys.stderr,
    )
    raise SystemExit(1)


DISCIPLINAS_CANONICAS = {
    "LINGUA PORTUGUESA": "Língua Portuguesa",
    "ARTE": "Arte",
    "EDUCACAO FISICA": "Educação Física",
    "LINGUA INGLESA": "Língua Inglesa",
    "LINGUA ESPANHOLA": "Língua Espanhola",
    "MATEMATICA": "Matemática",
    "CIENCIAS": "Ciências",
    "GEOGRAFIA": "Geografia",
    "HISTORIA": "História",
    "ENSINO RELIGIOSO": "Ensino Religioso",
    "FILOSOFIA": "Filosofia",
    "SOCIOLOGIA": "Sociologia",
    "BIOLOGIA": "Biologia",
    "FISICA": "Física",
    "QUIMICA": "Química",
}


def canonizar_disciplina(chave: str) -> str | None:
    chave = normalizar_chave(chave)
    if chave in DISCIPLINAS_CANONICAS:
        return DISCIPLINAS_CANONICAS[chave]

    palavras = set(chave.split())
    regras = [
        ({"LINGUA", "PORTUGUESA", "SUAS", "LITERATURAS"}, "Língua Portuguesa e suas Literaturas"),
        ({"LINGUAGENS", "SUAS", "TECNOLOGIAS"}, "Linguagens e suas Tecnologias"),
        ({"MATEMATICA", "SUAS", "TECNOLOGIAS"}, "Matemática e suas Tecnologias"),
        ({"CIENCIAS", "NATUREZA", "SUAS", "TECNOLOGIAS"}, "Ciências da Natureza e suas Tecnologias"),
        ({"CIENCIAS", "HUMANAS", "SOCIAIS", "APLICADAS"}, "Ciências Humanas e Sociais Aplicadas"),
        ({"FORMACAO", "TECNICA", "PROFISSIONAL"}, "Formação Técnica e Profissional"),
    ]
    for obrigatorias, nome in regras:
        if obrigatorias.issubset(palavras):
            return nome
    return None


def sem_acentos(texto: str) -> str:
    import unicodedata

    return "".join(
        caractere
        for caractere in unicodedata.normalize("NFD", texto)
        if unicodedata.category(caractere) != "Mn"
    )


def normalizar_chave(texto: Any) -> str:
    valor = sem_acentos(str(texto or "")).upper()
    valor = re.sub(r"[^A-Z0-9]+", " ", valor)
    return re.sub(r"\s+", " ", valor).strip()


def limpar_nome(texto: Any) -> str:
    return re.sub(r"\s+", " ", str(texto or "").replace("\n", " ")).strip()


def normalizar_turma(texto: Any) -> str:
    turma = limpar_nome(texto).upper()
    turma = re.sub(r"\b(ANO|SERIE|SÉRIE|ETAPA)\b", "", turma)
    turma = re.sub(r"\s+", " ", turma).strip(" -")

    match = re.search(r"(\d+)\s*[º°OªA]?\s*([A-Z])\b", turma)
    if match:
        numero = match.group(1)
        letra = match.group(2)
        # O Axoriin usa normalmente 6º A, 7º B, 1º A etc.
        return f"{numero}º {letra}"

    return turma.title() if turma else ""


def decodificar_titulo_vertical(texto: Any) -> str:
    bruto = limpar_nome(texto)
    if not bruto or bruto == "-":
        return ""

    partes_originais = [parte.strip() for parte in str(texto).splitlines() if parte.strip()]
    if not partes_originais:
        return ""

    # O pdfplumber recebe os cabeçalhos verticais do SIMAED invertidos.
    invertido = " ".join(parte[::-1] for parte in reversed(partes_originais))
    chave_invertida = normalizar_chave(invertido)
    chave_original = normalizar_chave(" ".join(partes_originais))

    canonica = canonizar_disciplina(chave_invertida) or canonizar_disciplina(chave_original)
    if canonica:
        return canonica

    candidato = invertido if len(chave_invertida) >= len(chave_original) else bruto
    candidato = limpar_nome(candidato).title()
    return candidato


def numero_decimal(valor: Any) -> float | None:
    texto = limpar_nome(valor)
    if not texto or texto == "-":
        return None
    texto = texto.replace(".", "").replace(",", ".")
    try:
        numero = float(texto)
    except ValueError:
        return None
    if numero < 0 or numero > 10:
        return None
    return round(numero, 2)


def detectar_metadados(texto: str, nome_arquivo: str) -> tuple[int | None, str]:
    bimestre = None
    match_bimestre = re.search(
        r"Divis[aã]o\s+do\s+per[ií]odo\s+letivo\s*:\s*([1-4])\s*[º°oª]?\s*BIMESTRE",
        texto,
        flags=re.IGNORECASE,
    )
    if match_bimestre:
        bimestre = int(match_bimestre.group(1))
    else:
        match_nome = re.search(r"(?:^|\D)([1-4])\s*[º°oª]?\s*(?:BIM|BIME|BIMESTRE)", nome_arquivo, re.IGNORECASE)
        if match_nome:
            bimestre = int(match_nome.group(1))

    turma = ""
    match_turma = re.search(r"Turma\s*:\s*([^\r\n]+)", texto, flags=re.IGNORECASE)
    if match_turma:
        turma = normalizar_turma(match_turma.group(1))

    return bimestre, turma


def encontrar_linha_cabecalho(tabela: list[list[Any]]) -> int | None:
    for indice, linha in enumerate(tabela):
        chaves = [normalizar_chave(celula) for celula in linha]
        if any(chave in {"N", "NO", "Nº"} or chave.startswith("N ") for chave in chaves[:2]) and any(
            "NOME DO ALUNO" in chave for chave in chaves
        ):
            return indice
        if len(chaves) >= 2 and chaves[0] in {"N", "NO"} and "NOME" in chaves[1]:
            return indice
    return None


def mapear_disciplinas(tabela: list[list[Any]], cabecalho_idx: int) -> list[tuple[int, str]]:
    cabecalho = tabela[cabecalho_idx]
    titulos = tabela[cabecalho_idx - 1] if cabecalho_idx > 0 else []
    resultado: list[tuple[int, str]] = []
    usados: set[str] = set()

    for coluna, celula in enumerate(cabecalho):
        if normalizar_chave(celula) != "NOTA":
            continue
        titulo = titulos[coluna] if coluna < len(titulos) else ""
        disciplina = decodificar_titulo_vertical(titulo)
        chave = normalizar_chave(disciplina)
        if not chave or chave == "-" or chave in usados:
            continue
        usados.add(chave)
        resultado.append((coluna, disciplina))

    return resultado


def extrair_pdf(caminho: Path) -> dict[str, Any]:
    avisos: list[str] = []
    alunos: list[dict[str, Any]] = []
    paginas_com_tabela = 0
    texto_primeira_pagina = ""

    try:
        with pdfplumber.open(caminho) as pdf:
            if not pdf.pages:
                raise ValueError("O PDF não possui páginas.")

            texto_primeira_pagina = pdf.pages[0].extract_text() or ""
            bimestre, turma = detectar_metadados(texto_primeira_pagina, caminho.name)

            for numero_pagina, pagina in enumerate(pdf.pages, start=1):
                tabelas = pagina.extract_tables() or []
                encontrou_na_pagina = False

                for tabela in tabelas:
                    if not tabela:
                        continue
                    cabecalho_idx = encontrar_linha_cabecalho(tabela)
                    if cabecalho_idx is None:
                        continue

                    disciplinas = mapear_disciplinas(tabela, cabecalho_idx)
                    if not disciplinas:
                        continue

                    encontrou_na_pagina = True
                    paginas_com_tabela += 1

                    for linha_idx, linha in enumerate(tabela[cabecalho_idx + 1 :], start=cabecalho_idx + 2):
                        if not linha or len(linha) < 2:
                            continue
                        numero_texto = limpar_nome(linha[0])
                        nome = limpar_nome(linha[1])
                        if not re.fullmatch(r"\d+", numero_texto) or not nome:
                            continue

                        notas = {}
                        for coluna, disciplina in disciplinas:
                            valor = linha[coluna] if coluna < len(linha) else None
                            notas[disciplina] = numero_decimal(valor)

                        situacao = limpar_nome(linha[-2]) if len(linha) >= 2 else ""
                        data_situacao = limpar_nome(linha[-1]) if len(linha) >= 1 else ""
                        alunos.append(
                            {
                                "numero": int(numero_texto),
                                "nome": nome,
                                "turma": turma,
                                "situacao": situacao,
                                "dataSituacao": data_situacao,
                                "notas": notas,
                                "pagina": numero_pagina,
                                "linhaTabela": linha_idx,
                            }
                        )

                if not encontrou_na_pagina and numero_pagina == 1:
                    avisos.append("A primeira página não apresentou uma tabela reconhecível.")

    except Exception as exc:
        raise ValueError(f"Falha ao ler {caminho.name}: {exc}") from exc

    if "RELAÇÃO DE NOTAS E CONCEITOS" not in texto_primeira_pagina.upper():
        raise ValueError(
            f"O arquivo {caminho.name} não parece ser o relatório 'Relação de Notas e Conceitos' do SIMAED."
        )
    if bimestre is None:
        raise ValueError(f"Não foi possível identificar o bimestre no arquivo {caminho.name}.")
    if not turma:
        raise ValueError(f"Não foi possível identificar a turma no arquivo {caminho.name}.")
    if not alunos:
        raise ValueError(
            f"Nenhuma nota foi encontrada em {caminho.name}. Use o PDF digital exportado pelo SIMAED, não uma imagem escaneada."
        )

    disciplinas_encontradas: list[str] = []
    vistos: set[str] = set()
    for aluno in alunos:
        for disciplina in aluno["notas"].keys():
            chave = normalizar_chave(disciplina)
            if chave not in vistos:
                vistos.add(chave)
                disciplinas_encontradas.append(disciplina)

    return {
        "nomeArquivo": caminho.name,
        "bimestre": bimestre,
        "turma": turma,
        "paginasComTabela": paginas_com_tabela,
        "disciplinas": disciplinas_encontradas,
        "alunos": alunos,
        "avisos": avisos,
    }


def self_test() -> None:
    assert decodificar_titulo_vertical("ASEUGUTROP\nAUGNÍL") == "Língua Portuguesa"
    assert decodificar_titulo_vertical("ACITÁMETAM") == "Matemática"
    assert canonizar_disciplina("SUAS LINGUA PORTUGUESA E LITERATURAS") == "Língua Portuguesa e suas Literaturas"
    assert canonizar_disciplina("LINGUAGENS TECNOLOGIAS E SUAS") == "Linguagens e suas Tecnologias"
    assert canonizar_disciplina("SUAS MATEMATICA E TECNOLOGIAS") == "Matemática e suas Tecnologias"
    assert canonizar_disciplina("CIENCIAS NATUREZA E DA TECNOLOGIAS SUAS") == "Ciências da Natureza e suas Tecnologias"
    assert canonizar_disciplina("E SOCIAIS CIENCIAS APLICADAS HUMANAS") == "Ciências Humanas e Sociais Aplicadas"
    assert normalizar_turma("6º ANO A") == "6º A"
    assert numero_decimal("8,7") == 8.7
    print(json.dumps({"ok": True, "mensagem": "Autoteste do extrator PDF concluído."}, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("arquivos", nargs="*")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0
    if not args.arquivos:
        raise ValueError("Nenhum PDF foi informado.")

    caminhos = [Path(arquivo) for arquivo in args.arquivos]
    if len(caminhos) >= 4:
        trabalhadores = min(4, len(caminhos))
        with ProcessPoolExecutor(max_workers=trabalhadores) as executor:
            relatorios = list(executor.map(extrair_pdf, caminhos))
    else:
        relatorios = [extrair_pdf(caminho) for caminho in caminhos]
    print(
        json.dumps(
            {
                "formato": "pdf_simaed_relacao_notas",
                "relatorios": relatorios,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"erro": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
