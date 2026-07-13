/* global window */
(function () {
  'use strict';

  const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function isDateOnly(value) {
    return DATE_ONLY_RE.test(String(value || '').trim());
  }

  function dateOnlyHoje() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function dateToDateOnlyLocal(date) {
    if (typeof date === 'string' && isDateOnly(date)) return date;
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function dateOnlyParaBR(dateOnly) {
    const s = String(dateOnly || '').trim();
    if (!isDateOnly(s)) return s || '';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }

  function brParaDateOnly(value) {
    const s = String(value || '').trim();
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return '';
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  function addDias(dateOnly, dias) {
    const s = String(dateOnly || '').trim();
    if (!isDateOnly(s)) return '';
    const [y, m, d] = s.split('-').map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d + Number(dias || 0)));
    return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
  }

  function periodoPorPreset(preset) {
    const hoje = dateOnlyHoje();
    const [ano, mes] = hoje.split('-').map(Number);
    const p = String(preset || 'mes_atual');

    if (p === 'hoje') return { inicio: hoje, fim: hoje, rotulo: 'Hoje' };
    if (p === '7d') return { inicio: addDias(hoje, -6), fim: hoje, rotulo: 'Últimos 7 dias' };
    if (p === '30d') return { inicio: addDias(hoje, -29), fim: hoje, rotulo: 'Últimos 30 dias' };
    if (p === 'mes_atual') return { inicio: `${ano}-${pad2(mes)}-01`, fim: hoje, rotulo: 'Mês atual' };
    if (p === 'bimestre_atual') {
      const inicioMes = Math.floor((mes - 1) / 2) * 2 + 1;
      return { inicio: `${ano}-${pad2(inicioMes)}-01`, fim: hoje, rotulo: 'Bimestre atual' };
    }
    if (p === 'semestre_atual') {
      const inicioMes = mes <= 6 ? 1 : 7;
      return { inicio: `${ano}-${pad2(inicioMes)}-01`, fim: hoje, rotulo: 'Semestre atual' };
    }
    return { inicio: `${ano}-01-01`, fim: hoje, rotulo: 'Ano letivo' };
  }

  function periodoLabel(inicio, fim, modo = 'iso') {
    if (!inicio || !fim) return 'Período atual';
    if (modo === 'br') return `${dateOnlyParaBR(inicio)} a ${dateOnlyParaBR(fim)}`;
    return `${inicio} a ${fim}`;
  }

  window.AxDateOnly = Object.freeze({
    isDateOnly,
    dateOnlyHoje,
    dateToDateOnlyLocal,
    dateOnlyParaBR,
    brParaDateOnly,
    addDias,
    periodoPorPreset,
    periodoLabel,
  });
}());
