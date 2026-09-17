import { useState } from 'react';
import {
  X, Calendar, Check, Loader2, ChevronLeft, RefreshCw,
  CircleHelp, ArrowRight,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { createShift, createWorkplace } from '../lib/db';
import { WORKPLACE_COLORS, SHIFT_TYPE_LABELS } from '../types';
import type { Workplace } from '../types';
import {
  parseEvents, demoEvents, type ParsedShift, type ParseResult,
} from '../lib/shiftParser';
import {
  isGoogleConfigured, connectGoogle, fetchCalendarEvents,
} from '../lib/googleCalendar';

type Phase = 'intro' | 'loading' | 'result' | 'guide' | 'done';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

/** Ícone do Google (G colorido) em SVG inline — cores oficiais da marca. */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/>
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>
    </svg>
  );
}

const GUIDE_STEPS = [
  { n: '1', title: 'Comece o título com "Plantão"', desc: 'Ex.: "Plantão UPA Leste". A palavra-chave é o sinal mais forte.' },
  { n: '2', title: 'Inclua o local', desc: 'No título ou no campo "Local" do evento: "Hospital Primavera", "UPA Centro".' },
  { n: '3', title: 'Defina horário de início e fim', desc: 'Evite "dia inteiro". Use o intervalo real, ex.: 07:00 às 19:00.' },
  { n: '4', title: 'Adicione o valor (opcional)', desc: 'Escreva "R$ 1.400" no título ou na descrição para importar a precificação.' },
  { n: '5', title: 'Sinalize o tipo', desc: 'Palavras como "noturno", "24h", "UTI" ou "sobreaviso" definem o tipo de escala.' },
];

const BENEFITS = [
  'Identifica plantões automaticamente',
  'Reconhece o valor e o local de cada um',
  'Você revisa antes de importar',
];

export default function GoogleCalendarSync({ onClose, onImported }: Props) {
  const { user, workplaces, refreshShifts, refreshWorkplaces } = useApp();
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [importedCount, setImportedCount] = useState(0);
  const [isDemo, setIsDemo] = useState(false);

  // Inicia seleção: confiança alta marcada, média desmarcada
  function primeSelection(res: ParseResult) {
    const sel: Record<string, boolean> = {};
    res.shifts.forEach(s => { sel[s.sourceEventId] = true; });
    res.lowConfidence.forEach(s => { sel[s.sourceEventId] = false; });
    setSelected(sel);
  }

  async function handleConnectReal() {
    setError('');
    setPhase('loading');
    try {
      const token = await connectGoogle();
      const events = await fetchCalendarEvents(token);
      const res = parseEvents(events, workplaces);
      setResult(res);
      setIsDemo(false);
      primeSelection(res);
      setPhase(res.shifts.length + res.lowConfidence.length === 0 ? 'guide' : 'result');
    } catch (e) {
      setError((e as Error).message || 'Não foi possível conectar.');
      setPhase('intro');
    }
  }

  function handleDemo() {
    setError('');
    setPhase('loading');
    setIsDemo(true);
    // pequeno delay para sensação de processamento
    setTimeout(() => {
      const res = parseEvents(demoEvents(), workplaces);
      setResult(res);
      primeSelection(res);
      setPhase('result');
    }, 600);
  }

  function toggle(id: string) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  }

  /** Resolve o local de destino do plantão; cria um novo se necessário. */
  function resolveWorkplaceId(ps: ParsedShift, cache: Map<string, string>): string {
    if (ps.matchedWorkplaceId) return ps.matchedWorkplaceId;
    const name = (ps.suggestedWorkplaceName || 'Local importado').trim();
    const key = name.toLowerCase();
    if (cache.has(key)) return cache.get(key)!;
    // procura existente por nome exato antes de criar
    const existing = workplaces.find(w => w.name.toLowerCase() === key);
    if (existing) { cache.set(key, existing.id); return existing.id; }
    const colorIdx = cache.size % WORKPLACE_COLORS.length;
    const created: Workplace = createWorkplace({
      user_id: user!.id,
      name,
      type: 'outro',
      color: WORKPLACE_COLORS[colorIdx],
      default_shift_value: ps.expectedValue ?? 0,
      default_duration_hours: ps.durationHours || 12,
      payment_day: 10,
      payment_method: 'PJ',
      active: true,
    });
    cache.set(key, created.id);
    return created.id;
  }

  function handleImport() {
    if (!user) return;
    const all = [...(result?.shifts || []), ...(result?.lowConfidence || [])];
    const chosen = all.filter(s => selected[s.sourceEventId]);
    const wpCache = new Map<string, string>();
    let count = 0;
    for (const ps of chosen) {
      const workplaceId = resolveWorkplaceId(ps, wpCache);
      createShift({
        user_id: user.id,
        workplace_id: workplaceId,
        title: ps.title,
        date: ps.date,
        start_datetime: ps.startDatetime,
        end_datetime: ps.endDatetime,
        duration_hours: ps.durationHours || 12,
        expected_value: ps.expectedValue ?? 0,
        status: 'previsto',
        notes: `Importado do Google Agendas${isDemo ? ' (demonstração)' : ''} · ${SHIFT_TYPE_LABELS[ps.shiftType]}`,
      });
      count++;
    }
    refreshWorkplaces();
    refreshShifts();
    setImportedCount(count);
    setPhase('done');
    if (count > 0) onImported();
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="bottom-sheet-overlay animate-fade-in" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm rounded-3xl overflow-hidden animate-scale-in flex flex-col"
        style={{ maxHeight: '88vh', boxShadow: '0 40px 80px -30px rgba(7,56,45,.5)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-2 shrink-0">
          <div className="min-w-0">
            <p className="text-[12.5px] text-slate-500">Integração</p>
            <h3 className="mt-1 text-[22px] font-light leading-tight tracking-[-0.03em] text-slate-900">Google Agendas</h3>
          </div>
          <button
            onClick={onClose}
            className="icon-btn w-10 h-10 -mr-2 -mt-1 flex items-center justify-center shrink-0"
            aria-label="Fechar"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto hide-scrollbar px-6 pt-4 pb-6">
          {/* ---------- FASE: INTRO ---------- */}
          {phase === 'intro' && (
            <div>
              {/* Aviso: recurso em desenvolvimento, exclusivo do plano Max — filete jade, sem ícone */}
              <div className="notice">
                <p className="min-w-0">
                  <span className="block text-[14.5px] font-semibold tracking-[-0.01em] text-slate-900">Em breve no plano Max</span>
                  <span className="block mt-[3px] text-[12.5px] leading-[1.5] text-slate-500">
                    Recurso em desenvolvimento. A prévia abaixo é uma demonstração.
                  </span>
                </p>
              </div>

              <p className="mt-5 text-[13.5px] leading-[1.6] text-slate-600">
                Conecte sua agenda do Google e o Plantão Pro <span className="font-semibold text-slate-900">lê automaticamente</span> os eventos que são plantões —
                identificando <span className="font-semibold text-slate-900">local, horário, valor e tipo de escala</span> — e ignora reuniões, consultas e compromissos pessoais.
              </p>

              {/* Benefícios: linhas de filete, check jade */}
              <div className="mt-3">
                {BENEFITS.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 py-3"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    <Check size={16} strokeWidth={1.8} className="shrink-0 mt-0.5 text-blue-600" />
                    <span className="text-[14px] leading-[1.45] text-slate-700">{b}</span>
                  </div>
                ))}
              </div>

              {error && (
                <div className="notice notice-warn mt-5" role="alert">
                  <p className="min-w-0 text-[13px] leading-[1.5] text-slate-900">{error}</p>
                </div>
              )}

              {isGoogleConfigured ? (
                <button onClick={handleConnectReal} className="btn-secondary mt-5 flex items-center justify-center gap-2">
                  <GoogleG size={17} /> Conectar com o Google
                </button>
              ) : (
                <>
                  {/* Informativo (não é erro): filete jade, sem ícone */}
                  <div className="notice mt-5">
                    <p className="min-w-0">
                      <span className="block text-[14.5px] font-semibold tracking-[-0.01em] text-slate-900">Conexão ainda não configurada</span>
                      <span className="block mt-[3px] text-[12.5px] leading-[1.5] text-slate-500">
                        Experimente a demonstração para ver a leitura inteligente em ação.
                      </span>
                    </p>
                  </div>
                  <button onClick={handleDemo} className="btn-primary mt-4">
                    Ver demonstração da leitura
                  </button>
                </>
              )}

              <button
                onClick={() => setPhase('guide')}
                className="w-full h-11 mt-2 flex items-center justify-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-900 transition"
              >
                <CircleHelp size={15} strokeWidth={1.5} /> Como cadastrar plantões que o app reconhece
              </button>
            </div>
          )}

          {/* ---------- FASE: LOADING ---------- */}
          {phase === 'loading' && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <Loader2 size={28} strokeWidth={1.5} className="text-blue-600 animate-spin" />
              <p className="mt-4 text-[15px] font-medium text-slate-900">Lendo sua agenda…</p>
              <p className="mt-1 text-[13px] text-slate-500">Identificando o que é plantão</p>
            </div>
          )}

          {/* ---------- FASE: RESULT ---------- */}
          {phase === 'result' && result && (
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-slate-500">
                  <span className="font-semibold text-slate-900 tabular-nums">{result.shifts.length + result.lowConfidence.length}</span> plantões detectados ·{' '}
                  <span className="tabular-nums">{result.ignored}</span> ignorados
                </p>
                {isDemo && <span className="status-badge status-previsto shrink-0">Demo</span>}
              </div>

              {/* Eventos detectados: linhas de filete, seleção jade */}
              <div
                className="mt-3 max-h-[42vh] overflow-y-auto hide-scrollbar"
                style={{ borderTop: '1px solid var(--color-border)' }}
              >
                {[...result.shifts, ...result.lowConfidence].map(ps => {
                  const isSel = !!selected[ps.sourceEventId];
                  const wpName = ps.matchedWorkplaceId
                    ? (workplaces.find(w => w.id === ps.matchedWorkplaceId)?.name ?? 'Local')
                    : (ps.suggestedWorkplaceName || 'Novo local');
                  const review = ps.confidence < 0.6;
                  const start = new Date(ps.startDatetime);
                  const end = new Date(ps.endDatetime);
                  const hh = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                  return (
                    <button
                      key={ps.sourceEventId}
                      onClick={() => toggle(ps.sourceEventId)}
                      aria-pressed={isSel}
                      className="list-row w-full text-left items-start !justify-start !gap-3.5"
                    >
                      {/* Caixa de seleção jade */}
                      <span
                        className={`mt-0.5 w-[18px] h-[18px] rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                          isSel ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'
                        }`}
                      >
                        {isSel && <Check size={12} strokeWidth={2.2} className="text-white" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`text-[14.5px] text-slate-900 truncate ${isSel ? 'font-semibold' : 'font-medium'}`}>{ps.title}</span>
                          {review && <span className="status-badge status-atrasado shrink-0">Revisar</span>}
                        </span>
                        <span className="block mt-0.5 text-[12.5px] text-slate-500 tabular-nums">
                          {start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {hh(start)}–{hh(end)} · {SHIFT_TYPE_LABELS[ps.shiftType]}
                        </span>
                        <span className="mt-1.5 flex items-baseline justify-between gap-3">
                          <span className="text-[12.5px] text-slate-600 truncate">
                            {wpName}{!ps.matchedWorkplaceId && ' (novo)'}
                          </span>
                          <span className={`shrink-0 tabular-nums ${ps.expectedValue != null ? 'text-[14px] text-slate-900' : 'text-[12.5px] text-slate-500'}`}>
                            {ps.expectedValue != null ? `R$ ${ps.expectedValue.toLocaleString('pt-BR')}` : 'Valor a definir'}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setPhase('guide')}
                className="w-full h-11 mt-1 flex items-center justify-center gap-1.5 text-[12.5px] text-slate-500 hover:text-slate-900 transition"
              >
                <CircleHelp size={14} strokeWidth={1.5} /> Faltou algum plantão? Veja como cadastrar
              </button>

              <button
                onClick={handleImport}
                disabled={selectedCount === 0}
                className="btn-primary mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={17} strokeWidth={1.6} />
                Importar {selectedCount > 0 ? `${selectedCount} ` : ''}{selectedCount === 1 ? 'plantão' : 'plantões'}
              </button>
            </div>
          )}

          {/* ---------- FASE: GUIDE (passo-a-passo) ---------- */}
          {phase === 'guide' && (
            <div>
              <p className="text-[13.5px] leading-[1.6] text-slate-600">
                Para o Plantão Pro reconhecer seus plantões no Google Agendas, cadastre os eventos seguindo este padrão.
                Quanto mais sinais, mais preciso fica:
              </p>

              {/* Passos numerados — número jade leve, linhas de filete */}
              <ol className="mt-3">
                {GUIDE_STEPS.map(step => (
                  <li
                    key={step.n}
                    className="flex items-start gap-4 py-3"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    <span className="w-4 shrink-0 text-[20px] font-light leading-none text-blue-600 tabular-nums">{step.n}</span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium leading-snug text-slate-900">{step.title}</p>
                      <p className="mt-0.5 text-[12.5px] leading-[1.5] text-slate-500">{step.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {/* Exemplo modelo */}
              <div className="notice mt-5 flex-col !gap-1.5">
                <p className="text-[12.5px] text-slate-500">Exemplo ideal</p>
                <p className="flex items-start gap-2 text-[14px] font-medium text-slate-900">
                  <Calendar size={15} strokeWidth={1.5} className="shrink-0 mt-0.5 text-blue-600" />
                  <span>Plantão Hospital Primavera — R$ 2.000</span>
                </p>
                <p className="flex items-start gap-2 text-[12.5px] text-slate-600">
                  <ArrowRight size={13} strokeWidth={1.5} className="shrink-0 mt-0.5 text-slate-400" />
                  <span>Sáb, 07:00 – 19:00 · Local: Hospital Primavera · noturno</span>
                </p>
              </div>

              <button onClick={() => setPhase('intro')} className="btn-secondary mt-5 flex items-center justify-center gap-1.5">
                <ChevronLeft size={15} strokeWidth={1.6} /> Voltar
              </button>
            </div>
          )}

          {/* ---------- FASE: DONE ---------- */}
          {phase === 'done' && (
            <div className="pt-4 flex flex-col items-center text-center">
              <Check size={28} strokeWidth={1.5} className="text-blue-600" />
              <h4 className="mt-4 text-[22px] font-light leading-tight tracking-[-0.03em] text-slate-900">
                <span className="tabular-nums">{importedCount}</span> {importedCount === 1 ? 'plantão importado' : 'plantões importados'}!
              </h4>
              <p className="mt-2 px-2 text-[13px] leading-[1.55] text-slate-500">
                Já estão no seu calendário com status <span className="font-semibold text-slate-700">Agendado</span>. Ajuste o que precisar tocando em cada um.
              </p>
              <div className="mt-6 flex gap-2 w-full">
                <button
                  onClick={() => { setPhase('intro'); setResult(null); }}
                  className="btn-secondary flex-1 px-3 flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={14} strokeWidth={1.6} /> Importar mais
                </button>
                <button onClick={onClose} className="btn-primary flex-[1.5] !h-12 px-3">
                  Concluir
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
