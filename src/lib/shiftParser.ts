import type { Workplace, ShiftType } from '../types';

/**
 * ============================================================================
 * Sistema intermediador de identificação de plantões
 * ============================================================================
 * Recebe eventos genéricos de agenda (formato Google Calendar normalizado) e
 * decide, com base em "lastros" (heurísticas ponderadas), o que é um plantão
 * e o que é outra atividade qualquer. Para cada plantão identificado, extrai
 * local, horário, valor e tipo de escala.
 *
 * É determinístico e 100% testável — não depende de rede nem de IA.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export interface CalendarEventInput {
  id: string;
  title: string;            // summary do evento
  description?: string;
  location?: string;        // campo "local" do evento
  start: string;            // ISO datetime
  end: string;              // ISO datetime
  allDay?: boolean;
}

export interface ParsedShift {
  sourceEventId: string;
  title: string;
  date: string;                       // yyyy-MM-dd
  startDatetime: string;              // ISO
  endDatetime: string;                // ISO
  durationHours: number;
  expectedValue: number | null;       // null = não detectado (usar default do local)
  shiftType: ShiftType;
  matchedWorkplaceId: string | null;  // local já cadastrado, se houver match
  suggestedWorkplaceName: string | null; // sugestão quando não há match
  confidence: number;                 // 0..1
  reasons: string[];                  // explicação dos sinais detectados
}

export interface ParseResult {
  /** Confiança alta (>= HIGH) — pré-selecionados para importar. */
  shifts: ParsedShift[];
  /** Confiança média (REVIEW..HIGH) — detectados, mas pedem revisão manual. */
  lowConfidence: ParsedShift[];
  /** Quantidade de eventos descartados (claramente não-plantão). */
  ignored: number;
  /** Total de eventos analisados. */
  total: number;
}

// Limiares de confiança
const HIGH_CONFIDENCE = 0.6;
const REVIEW_CONFIDENCE = 0.35;

// ---------------------------------------------------------------------------
// Dicionários de lastros
// ---------------------------------------------------------------------------

/** Palavras que indicam fortemente um plantão. */
const STRONG_SHIFT_KEYWORDS = [
  'plantao', 'plantão', 'guarda', 'guardia', 'shift', 'sobreaviso', 'sobre aviso',
];

/** Termos de contexto clínico/escala — reforçam a hipótese de plantão. */
const CONTEXT_KEYWORDS = [
  'upa', 'pronto socorro', 'pronto-socorro', 'ps ', 'pa ', 'hospital', 'clinica', 'clínica',
  'uti', 'cti', 'emergencia', 'emergência', 'sala vermelha', 'sala amarela',
  '12x36', '24x72', '24h', '12h', '6h', 'noturno', 'diurno', 'matutino', 'vespertino',
  'maternidade', 'enfermaria', 'ambulatorio', 'ambulatório', 'anestesia', 'cirurgia',
];

/** Palavras que indicam que NÃO é um plantão (atividades pessoais/administrativas). */
const NEGATIVE_KEYWORDS = [
  'reuniao', 'reunião', 'consulta médica', 'consulta medica', 'aniversario', 'aniversário',
  'almoço', 'almoco', 'jantar', 'dentista', 'férias', 'ferias', 'folga', 'descanso',
  'congresso', 'aula', 'curso', 'prova', 'estudo', 'academia', 'viagem', 'feriado',
  'pagamento', 'vencimento', 'lembrete', 'compromisso pessoal', 'happy hour', 'cinema',
];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Remove acentos e baixa caixa para comparação robusta. */
function normalize(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Extrai um valor monetário (R$) de um texto. Aceita "R$ 1.400,00", "1400", "1.400". */
export function extractMoney(text: string): number | null {
  if (!text) return null;
  // Procura padrões com R$ primeiro (mais confiável)
  const reMoney = /r\$\s*([\d.]+(?:,\d{1,2})?)/i;
  const m = text.match(reMoney);
  if (m) return parseBrNumber(m[1]);

  // Sem R$: procura número "isolado" plausível de valor de plantão (3-5 dígitos)
  const reLoose = /(?:^|\s)(\d{3,5}(?:[.,]\d{1,2})?)(?:\s|$|,00|reais)/i;
  const m2 = text.match(reLoose);
  if (m2) {
    const v = parseBrNumber(m2[1]);
    // só aceita se estiver numa faixa realista de plantão (R$ 200 a R$ 20.000)
    if (v !== null && v >= 200 && v <= 20000) return v;
  }
  return null;
}

/** Converte string numérica pt-BR ("1.400,00") em number. */
function parseBrNumber(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim();
  // "1.400,00" → remove pontos de milhar, vírgula vira ponto
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    // múltiplos pontos = separadores de milhar ("1.400")
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Detecta o tipo de escala a partir do texto e da duração. */
export function detectShiftType(text: string, durationHours: number): ShiftType {
  const n = normalize(text);
  if (/\bsobreaviso\b|sobre aviso|on.?call/.test(n)) return 'sobreaviso';
  if (/\buti\b|\bcti\b|terapia intensiva/.test(n)) return 'UTI';
  if (/sala vermelha|\bsv\b/.test(n)) return 'sala_vermelha';
  if (/anestesia|anestesi/.test(n)) return 'anestesia';
  if (/cirurgia|cirurgico|cirúrgico|bloco/.test(n)) return 'cirurgia';
  if (/ambulator/.test(n)) return 'ambulatorio';
  if (/24\s*h|24x|24 horas/.test(n) || durationHours >= 20) return '24h';
  if (/noturn|noite|night/.test(n)) return 'noite';
  if (/diurn|matutin|manha|manhã|vespertin|tarde|\bdia\b/.test(n)) return 'dia';
  // Heurística por horário: começa à noite → noite
  return 'dia';
}

/** Tenta casar o evento com um local já cadastrado. */
function matchWorkplace(haystack: string, workplaces: Workplace[]): Workplace | null {
  const n = normalize(haystack);
  // 1) match pelo nome completo
  for (const wp of workplaces) {
    if (normalize(wp.name).length >= 3 && n.includes(normalize(wp.name))) return wp;
  }
  // 2) match por palavra significativa do nome (ex.: "Primavera" de "Hospital Primavera")
  for (const wp of workplaces) {
    const words = normalize(wp.name).split(/\s+/).filter(w => w.length >= 4 && !['hospital', 'clinica', 'upa'].includes(w));
    if (words.some(w => n.includes(w))) return wp;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Análise de um único evento
// ---------------------------------------------------------------------------
function analyzeEvent(ev: CalendarEventInput, workplaces: Workplace[]): ParsedShift | null {
  const haystack = `${ev.title} ${ev.location || ''} ${ev.description || ''}`;
  const n = normalize(haystack);
  const reasons: string[] = [];
  let score = 0;

  // duração
  const startMs = new Date(ev.start).getTime();
  const endMs = new Date(ev.end).getTime();
  let durationHours = (endMs - startMs) / 3_600_000;
  if (isNaN(durationHours) || durationHours <= 0) durationHours = 0;

  // --- Sinais positivos ---
  const hasStrong = STRONG_SHIFT_KEYWORDS.some(k => n.includes(normalize(k)));
  if (hasStrong) { score += 0.5; reasons.push('Título contém "plantão/guarda"'); }

  const contextHits = CONTEXT_KEYWORDS.filter(k => n.includes(normalize(k)));
  if (contextHits.length > 0) {
    score += Math.min(0.3, 0.15 * contextHits.length);
    reasons.push(`Termos clínicos: ${contextHits.slice(0, 3).join(', ')}`);
  }

  const matchedWp = matchWorkplace(haystack, workplaces);
  if (matchedWp) { score += 0.4; reasons.push(`Local reconhecido: ${matchedWp.name}`); }

  const money = extractMoney(haystack);
  if (money !== null) { score += 0.2; reasons.push(`Valor detectado: R$ ${money.toLocaleString('pt-BR')}`); }

  // duração típica de plantão
  if (durationHours >= 4) {
    score += 0.15;
    reasons.push(`Duração de ${durationHours % 1 === 0 ? durationHours : durationHours.toFixed(1)}h`);
  }

  // --- Sinais negativos ---
  const negHits = NEGATIVE_KEYWORDS.filter(k => n.includes(normalize(k)));
  if (negHits.length > 0) { score -= 0.5; reasons.push(`Indício de não-plantão: ${negHits[0]}`); }

  // evento de dia inteiro raramente é plantão (a menos que keyword forte)
  if (ev.allDay && !hasStrong) { score -= 0.4; }

  // evento muito curto (< 2h) provavelmente é consulta/reunião
  if (durationHours > 0 && durationHours < 2 && !hasStrong) { score -= 0.25; }

  // Clampa
  const confidence = Math.max(0, Math.min(1, score));
  if (confidence < REVIEW_CONFIDENCE) return null; // descartado

  // --- Extração de dados ---
  const startDate = new Date(ev.start);
  const yyyy = startDate.getFullYear();
  const mm = String(startDate.getMonth() + 1).padStart(2, '0');
  const dd = String(startDate.getDate()).padStart(2, '0');

  const shiftType = detectShiftType(haystack, durationHours);
  const expectedValue = money ?? (matchedWp ? matchedWp.default_shift_value : null);

  return {
    sourceEventId: ev.id,
    title: ev.title?.trim() || 'Plantão importado',
    date: `${yyyy}-${mm}-${dd}`,
    startDatetime: ev.start,
    endDatetime: ev.end,
    durationHours: Math.round(durationHours * 10) / 10,
    expectedValue,
    shiftType,
    matchedWorkplaceId: matchedWp?.id ?? null,
    suggestedWorkplaceName: matchedWp ? null : guessWorkplaceName(ev),
    confidence: Math.round(confidence * 100) / 100,
    reasons,
  };
}

/** Tenta extrair um nome de local quando não há match (campo location ou parte do título). */
function guessWorkplaceName(ev: CalendarEventInput): string | null {
  if (ev.location && ev.location.trim().length >= 3) {
    // pega só a primeira parte do endereço (antes da vírgula)
    return ev.location.split(',')[0].trim();
  }
  // tenta "Plantão X" → X
  const m = ev.title?.match(/plant[ãa]o\s+(?:no?\s+|d[eo]\s+)?(.{3,40})/i);
  if (m) return m[1].trim();
  return null;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------
export function parseEvents(events: CalendarEventInput[], workplaces: Workplace[]): ParseResult {
  const high: ParsedShift[] = [];
  const review: ParsedShift[] = [];
  let ignored = 0;

  for (const ev of events) {
    const parsed = analyzeEvent(ev, workplaces);
    if (!parsed) { ignored++; continue; }
    if (parsed.confidence >= HIGH_CONFIDENCE) high.push(parsed);
    else review.push(parsed);
  }

  // ordena por data
  const byDate = (a: ParsedShift, b: ParsedShift) => a.startDatetime.localeCompare(b.startDatetime);
  high.sort(byDate);
  review.sort(byDate);

  return { shifts: high, lowConfidence: review, ignored, total: events.length };
}

// ---------------------------------------------------------------------------
// Conjunto de demonstração — usado quando não há credenciais Google
// para o usuário ver o parser em ação.
// ---------------------------------------------------------------------------
export function demoEvents(): CalendarEventInput[] {
  const today = new Date();
  const iso = (daysAhead: number, h: number, durH: number) => {
    const s = new Date(today); s.setDate(s.getDate() + daysAhead); s.setHours(h, 0, 0, 0);
    const e = new Date(s); e.setHours(s.getHours() + durH);
    return { start: s.toISOString(), end: e.toISOString() };
  };
  return [
    { id: 'd1', title: 'Plantão UPA Leste 12h', location: 'UPA Leste', description: 'R$ 1.400,00', ...iso(1, 7, 12) },
    { id: 'd2', title: 'Plantão noturno Hospital Primavera', location: 'Hospital Primavera', description: 'Valor 2000', ...iso(2, 19, 12) },
    { id: 'd3', title: 'Sobreaviso UTI', location: '', ...iso(3, 7, 24) },
    { id: 'd4', title: 'Reunião de equipe', location: 'Sala 3', ...iso(1, 14, 1) },
    { id: 'd5', title: 'Consulta dentista', location: 'Clínica Sorrir', ...iso(4, 10, 1) },
    { id: 'd6', title: 'Aniversário da Ana', allDay: true, ...iso(5, 0, 24) },
  ];
}
