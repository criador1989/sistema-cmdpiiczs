#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

import fitz


def progress(etapa, feitas, total):
    percentual = 0 if not total else round((feitas / total) * 100, 1)
    print(json.dumps({
        "tipo": "progresso",
        "etapa": etapa,
        "paginasProcessadas": feitas,
        "paginasTotal": total,
        "percentual": percentual,
    }, ensure_ascii=False), flush=True)


def normalizar_linha(texto):
    return " ".join(str(texto or "").split())


def linhas_da_pagina(page):
    resultado = []
    data = page.get_text("dict")
    for block in data.get("blocks", []):
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            texto = normalizar_linha(" ".join(str(span.get("text", "")) for span in spans))
            if not texto:
                continue
            bbox = line.get("bbox") or (0, 0, 0, 0)
            resultado.append({
                "texto": texto,
                "x0": float(bbox[0]),
                "y0": float(bbox[1]),
                "x1": float(bbox[2]),
                "y1": float(bbox[3]),
            })
    return resultado


def main():
    if len(sys.argv) < 4:
        raise RuntimeError("Uso: extrair_caderno_simulado.py entrada.pdf saida.json pasta_paginas")

    pdf_path = Path(sys.argv[1])
    json_path = Path(sys.argv[2])
    pages_dir = Path(sys.argv[3])
    pages_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    total = len(doc)
    if total < 2:
        raise RuntimeError("O caderno precisa ter pelo menos duas páginas.")

    paginas = []
    marcadores = []

    progress("extraindo", 0, total)

    for index, page in enumerate(doc):
        numero_pagina = index + 1
        rect = page.rect
        linhas = linhas_da_pagina(page)

        # A partir da V1.15.1 o cabeçalho QUESTÃO é localizado por linha,
        # não pelo bloco inteiro. Isso evita coordenadas contaminadas pelo
        # cabeçalho institucional quando o PDF une textos próximos no mesmo bloco.
        for line in linhas:
            match = re.match(r"^QUESTÃO\s+(\d{1,3})\b", line["texto"], flags=re.IGNORECASE)
            if not match:
                continue
            numero = int(match.group(1))
            marcadores.append({
                "numero": numero,
                "pagina": numero_pagina,
                "x": round(line["x0"], 2),
                "y": round(line["y0"], 2),
                "x1": round(line["x1"], 2),
                "y1": round(line["y1"], 2),
            })

        # Descobre onde termina o cabeçalho institucional. Esse limite permite
        # montar recortes de continuação sem repetir brasões/títulos da escola.
        header_bottom = 0.0
        for line in linhas:
            upper = line["texto"].upper()
            if "COLÉGIO MILITAR ESTADUAL DOM PEDRO II" in upper or "COLEGIO MILITAR ESTADUAL DOM PEDRO II" in upper:
                header_bottom = max(header_bottom, float(line["y1"]))
        corpo_topo = min(float(rect.height) - 40.0, max(8.0, header_bottom + 4.0 if header_bottom else 8.0))
        corpo_fundo = max(corpo_topo + 20.0, float(rect.height) - 12.0)

        # 144 dpi: leitura confortável no portal, inclusive com zoom, sem gerar
        # arquivos excessivamente pesados.
        pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
        nome = f"pagina-{numero_pagina:03d}.jpg"
        destino = pages_dir / nome
        try:
            pix.save(destino, jpg_quality=82)
        except TypeError:
            pix.save(destino)

        paginas.append({
            "numero": numero_pagina,
            "arquivo": nome,
            "largura": int(pix.width),
            "altura": int(pix.height),
            "pdfLargura": round(float(rect.width), 3),
            "pdfAltura": round(float(rect.height), 3),
            "corpoTopo": round(corpo_topo, 3),
            "corpoFundo": round(corpo_fundo, 3),
        })
        progress("renderizando", numero_pagina, total)

    payload = {
        "versaoIndice": 2,
        "paginasTotal": total,
        "paginas": paginas,
        "marcadores": marcadores,
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    progress("concluido", total, total)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"erro": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise
