#!/usr/bin/env python3
"""Teste de regressão do leitor OMR sem usar dados reais de estudantes."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import cv2
import fitz
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pdf"))

from extrair_cartoes_simulado import extract  # noqa: E402


def criar_cartao(path: Path) -> dict[int, str]:
    image = np.full((1923, 1360, 3), 255, dtype=np.uint8)
    blue = (205, 165, 70)
    header_y = 1145
    cv2.rectangle(image, (88, header_y), (1322, header_y + 34), blue, thickness=-1)

    blocks = [
        [160, 197, 234, 271, 308],
        [430, 467, 504, 541, 578],
        [683, 718, 753, 788, 823],
        [922, 955, 988, 1021, 1054],
        [1144, 1181, 1218, 1255, 1292],
    ]
    centers = [value for block in blocks for value in block]
    rows = [1206 + index * 38 for index in range(16)]
    expected = {}
    for row_index, y in enumerate(rows):
        for block_index in range(5):
            number = block_index * 16 + row_index + 1
            selected = (number * 3) % 5
            expected[number] = "ABCDE"[selected]
            for option in range(5):
                x = centers[block_index * 5 + option]
                cv2.circle(image, (x, y), 10, blue, thickness=2)
                if option == selected:
                    cv2.circle(image, (x, y), 7, (15, 15, 15), thickness=-1)

    left, right = centers[0], centers[-1]
    width = right - left
    language_y = int(round(header_y - 0.623 * width))
    english_x = int(round(left + 0.388 * width))
    spanish_x = int(round(left + 0.463 * width))
    cv2.circle(image, (english_x, language_y), 9, blue, thickness=2)
    cv2.circle(image, (spanish_x, language_y), 9, blue, thickness=2)
    cv2.circle(image, (english_x, language_y), 6, (10, 10, 10), thickness=-1)

    png = path.with_suffix(".png")
    if not cv2.imwrite(str(png), image):
        raise RuntimeError("Não foi possível criar a imagem sintética.")
    document = fitz.open()
    page = document.new_page(width=595, height=842)
    page.insert_image(page.rect, filename=str(png))
    document.save(path)
    document.close()
    return expected


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="axoriin-omr-test-") as temp:
        pdf = Path(temp) / "cartao-sintetico.pdf"
        expected = criar_cartao(pdf)
        payload = extract(pdf, 1)
        card = payload["cartoes"][0]
        assert card["status"] == "pronto", card["avisos"]
        assert card["idioma"]["idioma"] == "INGLES", card["idioma"]
        assert len(card["respostas"]) == 80, len(card["respostas"])
        for number, answer in expected.items():
            assert card["respostas"][str(number)] == answer, (number, card["respostas"].get(str(number)), answer)
    print("OMR de simulados: 80 respostas e idioma reconhecidos corretamente.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
