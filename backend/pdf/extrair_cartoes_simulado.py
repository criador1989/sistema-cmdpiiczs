#!/usr/bin/env python3
"""Leitor OMR dos cartões-resposta usados pelo módulo de simulados.

O extrator trabalha somente com a geometria e com a tinta das marcações. Ele
não tenta adivinhar o nome manuscrito do estudante nem escolhe uma alternativa
quando a evidência é ambígua. O processo Node responsável pela importação liga
os números 1..80 aos códigos da matriz pedagógica do dia selecionado.
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import cv2
import fitz
import numpy as np


TARGET_WIDTH = 1360
RENDER_DPI = 170
OPTIONS = ("A", "B", "C", "D", "E")


class OmrError(RuntimeError):
    pass


@dataclass
class Circle:
    x: float
    y: float
    r: float


def _cluster(values: Iterable[float], tolerance: float) -> list[list[float]]:
    groups: list[list[float]] = []
    for value in sorted(float(item) for item in values):
        if not groups or abs(value - float(np.mean(groups[-1]))) > tolerance:
            groups.append([value])
        else:
            groups[-1].append(value)
    return groups


def _blue_mask(image: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    return cv2.inRange(hsv, np.array([75, 25, 35]), np.array([130, 255, 255]))


def _render(page: fitz.Page) -> np.ndarray:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(RENDER_DPI / 72, RENDER_DPI / 72), alpha=False)
    raw = np.frombuffer(pixmap.samples, dtype=np.uint8)
    rgb = raw.reshape(pixmap.height, pixmap.width, pixmap.n)[..., :3]
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    if bgr.shape[1] != TARGET_WIDTH:
        scale = TARGET_WIDTH / bgr.shape[1]
        bgr = cv2.resize(bgr, (TARGET_WIDTH, int(round(bgr.shape[0] * scale))), interpolation=cv2.INTER_AREA)
    # Alguns scanners gravam a rotação apenas nos metadados. O cartão correto
    # tem a faixa azul da grade na metade inferior da página.
    if _header_strength(bgr) < _header_strength(cv2.rotate(bgr, cv2.ROTATE_180)):
        bgr = cv2.rotate(bgr, cv2.ROTATE_180)
    return _deskew(bgr)


def _deskew(image: np.ndarray) -> np.ndarray:
    mask = _blue_mask(image)
    h, w = mask.shape
    y0, y1 = int(h * 0.45), int(h * 0.82)
    lines = cv2.HoughLinesP(mask[y0:y1], 1, np.pi / 1800, threshold=100,
                            minLineLength=int(w * 0.12), maxLineGap=35)
    angles: list[float] = []
    if lines is not None:
        for x1, local_y1, x2, local_y2 in lines[:, 0]:
            angle = math.degrees(math.atan2(float(local_y2 - local_y1), float(x2 - x1)))
            length = math.hypot(float(x2 - x1), float(local_y2 - local_y1))
            if abs(angle) <= 7:
                angles.extend([angle] * max(1, min(20, int(length / 80))))
    if not angles:
        return image
    angle = float(np.median(angles))
    if abs(angle) < 0.12:
        return image
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(image, matrix, (w, h), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))


def _header_strength(image: np.ndarray) -> float:
    mask = _blue_mask(image)
    h = image.shape[0]
    start, end = int(h * 0.45), int(h * 0.76)
    if end <= start:
        return 0.0
    return float(np.max(np.count_nonzero(mask[start:end], axis=1)))


def _find_header(image: np.ndarray) -> tuple[int, float]:
    mask = _blue_mask(image)
    h, w = image.shape[:2]
    start, end = int(h * 0.45), int(h * 0.76)
    raw_profile = np.count_nonzero(mask[start:end], axis=1).astype(np.float32)
    if not raw_profile.size:
        raise OmrError("Faixa da grade de respostas não localizada.")
    profile = cv2.GaussianBlur(raw_profile.reshape(-1, 1), (1, 9), 0).ravel()
    local = int(np.argmax(profile))
    strength = float(profile[local] / max(1, w))
    if strength < 0.13:
        raise OmrError("A faixa azul da grade está pouco legível.")
    # A referência geométrica é a borda superior da faixa, não o seu centro.
    # A diferença é relevante para localizar as bolhas de idioma no cabeçalho.
    threshold = max(70.0, float(raw_profile[local]) * 0.25)
    top = local
    misses = 0
    for index in range(local, max(-1, local - 60), -1):
        if raw_profile[index] >= threshold:
            top = index
            misses = 0
        else:
            misses += 1
            if misses >= 3:
                break
    return start + top, min(1.0, strength / 0.42)


def _detect_circles(image: np.ndarray, header_y: int) -> tuple[list[Circle], tuple[int, int]]:
    h, w = image.shape[:2]
    y0 = max(0, header_y + int(w * 0.012))
    y1 = min(h, header_y + int(w * 0.55))
    gray = cv2.cvtColor(image[y0:y1], cv2.COLOR_BGR2GRAY)
    blur = cv2.medianBlur(gray, 5)
    circles = cv2.HoughCircles(
        blur,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=12,
        param1=80,
        param2=16,
        minRadius=7,
        maxRadius=15,
    )
    if circles is None:
        raise OmrError("Os círculos da grade de respostas não foram localizados.")
    result = [Circle(float(x), float(y + y0), float(r)) for x, y, r in circles[0]]
    return result, (y0, y1)


def _select_axis_groups(circles: list[Circle], axis: str, expected: int, minimum: int) -> list[list[Circle]]:
    values = [getattr(circle, axis) for circle in circles]
    raw = _cluster(values, 8.0)
    groups: list[list[Circle]] = []
    for cluster_values in raw:
        center = float(np.mean(cluster_values))
        members = [circle for circle in circles if abs(getattr(circle, axis) - center) <= 8.5]
        if len(members) >= minimum:
            groups.append(members)
    # Remove duplicações ocasionais causadas pela reconstrução dos membros.
    unique: list[list[Circle]] = []
    for group in sorted(groups, key=lambda items: float(np.mean([getattr(item, axis) for item in items]))):
        center = float(np.mean([getattr(item, axis) for item in group]))
        if unique:
            previous = float(np.mean([getattr(item, axis) for item in unique[-1]]))
            if abs(center - previous) < 10:
                if len(group) > len(unique[-1]):
                    unique[-1] = group
                continue
        unique.append(group)
    if len(unique) != expected:
        raise OmrError(f"Geometria incompleta: esperados {expected} eixos, encontrados {len(unique)}.")
    return unique


def _linear_center(group: list[Circle], independent: str, dependent: str, value: float) -> float:
    xs = np.array([getattr(item, independent) for item in group], dtype=np.float64)
    ys = np.array([getattr(item, dependent) for item in group], dtype=np.float64)
    if len(group) < 3 or float(np.ptp(xs)) < 20:
        return float(np.median(ys))
    slope, intercept = np.polyfit(xs, ys, 1)
    return float(slope * value + intercept)


def _row_models(x_groups: list[list[Circle]]) -> tuple[list[tuple[float, float]], float]:
    """Reconstrói as 16 linhas mesmo quando o cartão está inclinado.

    Agrupar diretamente todos os valores Y divide uma mesma linha em duas em
    fotos com perspectiva. As colunas, por outro lado, continuam bem separadas.
    Usamos as colunas completas como pontos de controle e ajustamos uma reta Y(X)
    para cada linha.
    """
    controls: list[tuple[float, list[Circle]]] = []
    for group in x_groups:
        ordered = sorted(group, key=lambda item: item.y)
        if len(ordered) != 16:
            continue
        gaps = np.diff([item.y for item in ordered])
        if gaps.size and (float(np.min(gaps)) < 22 or float(np.max(gaps)) > 58):
            continue
        controls.append((float(np.median([item.x for item in ordered])), ordered))
    if len(controls) < 4:
        raise OmrError(f"Geometria incompleta: apenas {len(controls)} coluna(s) de controle legível(is).")
    models: list[tuple[float, float]] = []
    for row in range(16):
        xs = np.array([center for center, _items in controls], dtype=np.float64)
        ys = np.array([items[row].y for _center, items in controls], dtype=np.float64)
        slope, intercept = np.polyfit(xs, ys, 1)
        models.append((float(slope), float(intercept)))
    return models, min(1.0, len(controls) / 12.0)


def _circle_near(circles: list[Circle], x: float, y: float, max_distance: float = 13.0) -> Circle:
    candidate = min(circles, key=lambda item: math.hypot(item.x - x, item.y - y))
    if math.hypot(candidate.x - x, candidate.y - y) <= max_distance:
        return candidate
    return Circle(x, y, 10.0)


def _ink_score(image: np.ndarray, circle: Circle) -> float:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    radius = max(4, int(round(circle.r * 0.58)))
    x0, y0 = int(round(circle.x)), int(round(circle.y))
    y_min, y_max = max(0, y0 - radius), min(image.shape[0], y0 + radius + 1)
    x_min, x_max = max(0, x0 - radius), min(image.shape[1], x0 + radius + 1)
    if y_min >= y_max or x_min >= x_max:
        return 0.0
    yy, xx = np.ogrid[y_min:y_max, x_min:x_max]
    disk = (xx - x0) ** 2 + (yy - y0) ** 2 <= radius ** 2
    patch_gray = gray[y_min:y_max, x_min:x_max]
    patch_hsv = hsv[y_min:y_max, x_min:x_max]
    ink = (patch_gray < 145) | ((patch_hsv[..., 1] > 95) & (patch_hsv[..., 2] < 235))
    return float(np.count_nonzero(ink & disk) / max(1, np.count_nonzero(disk)))


def _confidence(primary: float, secondary: float, geometry: float) -> float:
    density = max(0.0, min(1.0, (primary - 0.16) / 0.46))
    margin = max(0.0, min(1.0, (primary - secondary - 0.08) / 0.42))
    return round(max(0.0, min(1.0, (density * 0.55 + margin * 0.45) * geometry)), 4)


def _classify(scores: list[float], geometry: float) -> dict:
    ranked = sorted(enumerate(scores), key=lambda item: item[1], reverse=True)
    best_index, best = ranked[0]
    second = ranked[1][1]
    if best >= 0.38 and second < 0.52 and best - second >= 0.12:
        return {
            "status": "marcada",
            "resposta": OPTIONS[best_index],
            "confianca": _confidence(best, second, geometry),
        }
    if second >= 0.52:
        return {"status": "multipla", "resposta": "", "confianca": 0.0}
    if best < 0.20:
        return {"status": "branco", "resposta": "BRANCO", "confianca": round(geometry, 4)}
    return {"status": "incerta", "resposta": "", "confianca": 0.0}


def _jpeg_data_uri(image: np.ndarray, width: int = 880, quality: int = 58) -> str:
    if image.size == 0:
        return ""
    if image.shape[1] > width:
        scale = width / image.shape[1]
        image = cv2.resize(image, (width, max(1, int(round(image.shape[0] * scale)))), interpolation=cv2.INTER_AREA)
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality, cv2.IMWRITE_JPEG_OPTIMIZE, 1])
    if not ok:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(encoded.tobytes()).decode("ascii")


def _language_centers(x_groups: list[list[Circle]], header_y: int) -> tuple[tuple[float, float], tuple[float, float]]:
    centers = [float(np.median([item.x for item in group])) for group in x_groups]
    left, right = centers[0], centers[-1]
    width = right - left
    y = header_y - 0.623 * width
    return (left + 0.388 * width, y), (left + 0.463 * width, y)


def _language(image: np.ndarray, x_groups: list[list[Circle]], header_y: int, geometry: float) -> dict:
    english, spanish = _language_centers(x_groups, header_y)
    expected_separation = spanish[0] - english[0]
    expected_midpoint = (spanish[0] + english[0]) / 2
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    search_x0 = max(0, int(english[0] - 45))
    search_x1 = min(image.shape[1], int(spanish[0] + 45))
    search_y0 = max(0, int(english[1] - 42))
    search_y1 = min(image.shape[0], int(english[1] + 43))
    roi = gray[search_y0:search_y1, search_x0:search_x1]
    local = cv2.HoughCircles(cv2.medianBlur(roi, 5), cv2.HOUGH_GRADIENT,
                             dp=1.0, minDist=10, param1=70, param2=8,
                             minRadius=5, maxRadius=12)
    if local is not None:
        candidates = [Circle(float(x + search_x0), float(y + search_y0), float(radius))
                      for x, y, radius in local[0]]
        pairs = []
        for first in candidates:
            for second in candidates:
                if second.x <= first.x:
                    continue
                separation = second.x - first.x
                if not expected_separation * 0.88 <= separation <= expected_separation * 1.12:
                    continue
                midpoint = (first.x + second.x) / 2
                cost = (
                    abs(separation - expected_separation) * 5.0
                    + abs(first.y - second.y) * 1.5
                    + abs(midpoint - expected_midpoint) * 0.30
                    + abs(((first.y + second.y) / 2) - english[1]) * 0.25
                )
                pairs.append((cost, first, second))
        if pairs:
            _cost, first, second = min(pairs, key=lambda item: item[0])
            english = (first.x, first.y)
            spanish = (second.x, second.y)

    values = []
    for x, y in (english, spanish):
        # A posição é refinada procurando um círculo no pequeno entorno. Caso a
        # bolha esteja totalmente coberta pela tinta, usa-se a posição prevista.
        x0, x1 = max(0, int(x - 18)), min(image.shape[1], int(x + 19))
        y0, y1 = max(0, int(y - 18)), min(image.shape[0], int(y + 19))
        local = cv2.HoughCircles(cv2.medianBlur(gray[y0:y1, x0:x1], 5), cv2.HOUGH_GRADIENT,
                                 dp=1.0, minDist=12, param1=70, param2=10,
                                 minRadius=7, maxRadius=14)
        circle = Circle(x, y, 10.0)
        if local is not None:
            cx, cy, radius = min(local[0], key=lambda item: math.hypot((item[0] + x0) - x, (item[1] + y0) - y))
            circle = Circle(float(cx + x0), float(cy + y0), float(radius))
        values.append(_ink_score(image, circle))
    classified = _classify(values, geometry)
    idioma = {"A": "INGLES", "B": "ESPANHOL"}.get(classified["resposta"], "NAO_INFORMADO")
    if classified["status"] not in {"marcada"}:
        idioma = "NAO_INFORMADO"
    return {
        "idioma": idioma,
        "status": classified["status"],
        "confianca": classified["confianca"],
        "scores": [round(value, 4) for value in values],
    }


def _analyze_page(page: fitz.Page, page_number: int, day: int) -> dict:
    image = _render(page)
    warnings: list[str] = []
    try:
        header_y, header_confidence = _find_header(image)
        circles, (roi_y0, roi_y1) = _detect_circles(image, header_y)
        x_groups = _select_axis_groups(circles, "x", 25, 8)
        row_models, row_confidence = _row_models(x_groups)
        detected_ratio = min(1.0, len(circles) / 400.0)
        geometry = round(min(header_confidence, detected_ratio, row_confidence), 4)

        markings = []
        answers: dict[str, str] = {}
        for row_index, (row_slope, row_intercept) in enumerate(row_models):
            for block in range(5):
                question_number = block * 16 + row_index + 1
                scores = []
                for option_index in range(5):
                    x_group = x_groups[block * 5 + option_index]
                    group_center = float(np.median([item.x for item in x_group]))
                    y = row_slope * group_center + row_intercept
                    x = _linear_center(x_group, "y", "x", y)
                    y = row_slope * x + row_intercept
                    circle = _circle_near(circles, x, y)
                    scores.append(_ink_score(image, circle))
                result = _classify(scores, geometry)
                marking = {
                    "numero": question_number,
                    **result,
                    "scores": [round(value, 4) for value in scores],
                }
                markings.append(marking)
                if result["resposta"]:
                    answers[str(question_number)] = result["resposta"]

        markings.sort(key=lambda item: item["numero"])
        pending = [item for item in markings if item["status"] in {"multipla", "incerta"}]
        language = _language(image, x_groups, header_y, geometry) if day == 1 else {
            "idioma": "NAO_APLICAVEL", "status": "nao_aplicavel", "confianca": 1.0, "scores": [],
        }
        if day == 1 and language["idioma"] == "NAO_INFORMADO":
            warnings.append("A marcação de Inglês/Espanhol precisa de conferência.")
        if pending:
            warnings.append(f"{len(pending)} resposta(s) exigem conferência visual.")

        header_crop = image[max(0, int(image.shape[0] * 0.12)):max(1, header_y - 12)]
        grid_crop = image[max(0, header_y - 8):min(image.shape[0], roi_y1 + 10)]
        return {
            "pagina": page_number,
            "dia": day,
            "status": "revisao" if pending or (day == 1 and language["idioma"] == "NAO_INFORMADO") else "pronto",
            "revisaoObrigatoria": bool(pending),
            "geometriaConfianca": geometry,
            "circulosDetectados": len(circles),
            "respostas": answers,
            "marcacoes": markings,
            "idioma": language,
            "avisos": warnings,
            "previewCabecalho": _jpeg_data_uri(header_crop, width=820, quality=55),
            "previewGrade": _jpeg_data_uri(grid_crop, width=920, quality=58),
        }
    except OmrError as error:
        warnings.append(str(error))
        return {
            "pagina": page_number,
            "dia": day,
            "status": "ilegivel",
            "revisaoObrigatoria": True,
            "geometriaConfianca": 0.0,
            "circulosDetectados": 0,
            "respostas": {},
            "marcacoes": [
                {"numero": number, "status": "incerta", "resposta": "", "confianca": 0.0, "scores": []}
                for number in range(1, 81)
            ],
            "idioma": {
                "idioma": "NAO_INFORMADO" if day == 1 else "NAO_APLICAVEL",
                "status": "incerta" if day == 1 else "nao_aplicavel",
                "confianca": 0.0 if day == 1 else 1.0,
                "scores": [],
            },
            "avisos": warnings,
            "previewCabecalho": _jpeg_data_uri(image[:int(image.shape[0] * 0.60)], width=820, quality=55),
            "previewGrade": _jpeg_data_uri(image[int(image.shape[0] * 0.45):], width=920, quality=58),
        }


def _emit_progress(processed: int, total: int, stage: str = "lendo") -> None:
    percent = round((processed / total) * 100, 1) if total else 0.0
    print(json.dumps({
        "tipo": "progresso",
        "etapa": stage,
        "pagina": processed,
        "total": total,
        "percentual": percent,
    }, ensure_ascii=False, separators=(",", ":")), flush=True)


def extract(pdf_path: Path, day: int) -> dict:
    if not pdf_path.is_file():
        raise OmrError("Arquivo PDF não encontrado.")
    document = fitz.open(pdf_path)
    try:
        if document.page_count < 1:
            raise OmrError("O PDF não possui páginas.")
        if document.page_count > 500:
            raise OmrError("O PDF possui mais de 500 páginas. Divida-o por turma.")
        total = document.page_count
        pages = []
        _emit_progress(0, total, "preparando")
        for index in range(total):
            pages.append(_analyze_page(document[index], index + 1, day))
            _emit_progress(index + 1, total, "lendo")
        _emit_progress(total, total, "finalizando")
    finally:
        document.close()
    return {
        "versao": "1.2.0",
        "motor": "OMR_LOCAL_OPENCV",
        "paginas": len(pages),
        "dia": day,
        "cartoes": pages,
        "resumo": {
            "prontos": sum(item["status"] == "pronto" for item in pages),
            "revisao": sum(item["status"] == "revisao" for item in pages),
            "ilegiveis": sum(item["status"] == "ilegivel" for item in pages),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Extrai marcações OMR de cartões-resposta escaneados.")
    parser.add_argument("pdf")
    parser.add_argument("saida")
    parser.add_argument("--dia", required=True, type=int, choices=(1, 2))
    args = parser.parse_args()
    try:
        payload = extract(Path(args.pdf), args.dia)
        Path(args.saida).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(json.dumps({"ok": True, "paginas": payload["paginas"], "resumo": payload["resumo"]}, ensure_ascii=False))
        return 0
    except Exception as error:  # noqa: BLE001 - fronteira de processo
        payload = {"erro": str(error), "tipo": error.__class__.__name__}
        try:
            Path(args.saida).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass
        print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
