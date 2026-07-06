import { useState } from 'react';
import {
  X, Calendar, Check, AlertCircle, Loader2, ChevronRight, RefreshCw,
  CircleHelp, Sparkles, ArrowRight, Crown,
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

/** Ícone do Google (G colorido) em SVG inline. */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/>
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>
    </svg>
  );
}

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
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              <GoogleG size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Integração</p>
              <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">Google Agendas</h3>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all active:scale-95 shrink-0 ml-3">
            <X size={16} />
          </button>
        </div>

        {/* ---------- FASE: INTRO ---------- */}
        {phase === 'intro' && (
          <div>
            {/* Aviso: recurso em desenvolvimento, exclusivo do plano Max */}
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-3">
              <Crown size={15} className="text-amber-500 shrink-0" strokeWidth={2.5} />
              <p className="text-[11.5px] text-amber-800 leading-snug">
                <strong>Em breve</strong> — recurso em desenvolvimento, exclusivo do plano <strong>Max</strong>. A prévia abaixo é uma demonstração.
              </p>
            </div>

            <p className="text-[13px] text-slate-600 leading-relaxed mb-3">
              Conecte sua agenda do Google e o Plantão Pro <strong>lê automaticamente</strong> os eventos que são plantões —
              identificando <strong>local, horário, valor e tipo de escala</strong> — e ignora reuniões, consultas e compromissos pessoais.
            </p>

            <div className="bg-slate-50 rounded-2xl p-3 mb-3 space-y-2">
              {[
                'Identifica plantões automaticamente',
                'Reconhece o valor e o local de cada um',
                'Você revisa antes de importar',
              ].map((b, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                    <Check size={11} className="text-blue-600" strokeWidth={3} />
                  </div>
                  <span className="text-[12.5px] text-slate-700">{b}</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="flex items-start gap-2 text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {isGoogleConfigured ? (
              <button onClick={handleConnectReal}
                className="w-full py-3 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50 transition active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm">
                <GoogleG size={17} /> Conectar com o Google
              </button>
            ) : (
              <>
                <div className="flex items-start gap-2 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-2">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>Conexão com o Google ainda não configurada neste ambiente. Experimente a <strong>demonstração</strong> para ver a leitura inteligente em ação.</span>
                </div>
                <button onClick={handleDemo}
                  className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm shadow-blue-600/20">
                  <Sparkles size={16} strokeWidth={2.5} /> Ver demonstração da leitura
                </button>
              </>
            )}

            <button onClick={() => setPhase('guide')}
              className="w-full mt-2 py-2 text-slate-500 hover:text-slate-800 transition text-[12.5px] font-medium flex items-center justify-center gap-1.5">
              <CircleHelp size={14} /> Como cadastrar plantões que o app reconhece
            </button>
          </div>
        )}

        {/* ---------- FASE: LOADING ---------- */}
        {phase === 'loading' && (
          <div className="py-10 flex flex-col items-center justify-center text-center">
            <Loader2 size={32} className="text-blue-600 animate-spin mb-3" />
            <p className="text-[14px] font-bold text-slate-800">Lendo sua agenda…</p>
            <p className="text-[12px] text-slate-500 mt-1">Identificando o que é plantão</p>
          </div>
        )}

        {/* ---------- FASE: RESULT ---------- */}
        {phase === 'result' && result && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] text-slate-500">
                <strong className="text-slate-800">{result.shifts.length + result.lowConfidence.length}</strong> plantões detectados ·{' '}
                <span className="text-slate-400">{result.ignored} ignorados</span>
              </p>
              {isDemo && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wider">Demo</span>}
            </div>

            <div className="space-y-2 max-h-[42vh] overflow-y-auto hide-scrollbar -mx-1 px-1">
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
                  <button key={ps.sourceEventId} onClick={() => toggle(ps.sourceEventId)}
                    className={`w-full text-left rounded-2xl border p-3 transition active:scale-[0.99] ${isSel ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-start gap-2.5">
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition ${isSel ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                        {isSel && <Check size={12} strokeWidth={3} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-slate-900 text-[13px] truncate">{ps.title}</p>
                          {review && <span className="text-[8.5px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">Revisar</span>}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {hh(start)}–{hh(end)} · {SHIFT_TYPE_LABELS[ps.shiftType]}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{wpName}{!ps.matchedWorkplaceId && ' (novo)'}</span>
                          <span className="text-[11px] font-bold text-slate-900">
                            {ps.expectedValue != null ? `R$ ${ps.expectedValue.toLocaleString('pt-BR')}` : 'Valor a definir'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <button onClick={() => setPhase('guide')}
              className="w-full mt-2 py-1.5 text-slate-400 hover:text-slate-700 transition text-[11.5px] font-medium flex items-center justify-center gap-1.5">
              <CircleHelp size={12} /> Faltou algum plantão? Veja como cadastrar
            </button>

            <button onClick={handleImport} disabled={selectedCount === 0}
              className="w-full mt-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition active:scale-[0.98] shadow-sm shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              <Check size={15} strokeWidth={3} />
              Importar {selectedCount > 0 ? `${selectedCount} ` : ''}{selectedCount === 1 ? 'plantão' : 'plantões'}
            </button>
          </div>
        )}

        {/* ---------- FASE: GUIDE (passo-a-passo) ---------- */}
        {phase === 'guide' && (
          <div>
            <p className="text-[13px] text-slate-600 leading-relaxed mb-3">
              Para o Plantão Pro reconhecer seus plantões no Google Agendas, cadastre os eventos seguindo este padrão.
              Quanto mais sinais, mais preciso fica:
            </p>

            <div className="space-y-2.5 mb-3">
              {[
                { n: '1', title: 'Comece o título com "Plantão"', desc: 'Ex.: "Plantão UPA Leste". A palavra-chave é o sinal mais forte.' },
                { n: '2', title: 'Inclua o local', desc: 'No título ou no campo "Local" do evento: "Hospital Primavera", "UPA Centro".' },
                { n: '3', title: 'Defina horário de início e fim', desc: 'Evite "dia inteiro". Use o intervalo real, ex.: 07:00 às 19:00.' },
                { n: '4', title: 'Adicione o valor (opcional)', desc: 'Escreva "R$ 1.400" no título ou na descrição para importar a precificação.' },
                { n: '5', title: 'Sinalize o tipo', desc: 'Palavras como "noturno", "24h", "UTI" ou "sobreaviso" definem o tipo de escala.' },
              ].map(step => (
                <div key={step.n} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 text-[11px] font-bold">{step.n}</div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-slate-900 leading-tight">{step.title}</p>
                    <p className="text-[12px] text-slate-500 leading-snug mt-0.5">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Exemplo modelo */}
            <div className="bg-slate-900 rounded-2xl p-3 mb-3">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Exemplo ideal</p>
              <div className="flex items-center gap-2 text-white">
                <Calendar size={14} className="text-blue-400 shrink-0" />
                <span className="text-[13px] font-bold">Plantão Hospital Primavera — R$ 2.000</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300 mt-1.5 text-[11px]">
                <ArrowRight size={12} className="text-slate-500 shrink-0" />
                <span>Sáb, 07:00 – 19:00 · Local: Hospital Primavera · noturno</span>
              </div>
            </div>

            <button onClick={() => setPhase('intro')}
              className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98] flex items-center justify-center gap-1.5">
              <ChevronRight size={14} className="rotate-180" /> Voltar
            </button>
          </div>
        )}

        {/* ---------- FASE: DONE ---------- */}
        {phase === 'done' && (
          <div className="py-8 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
              <Check size={26} className="text-emerald-600" strokeWidth={3} />
            </div>
            <h4 className="text-[16px] font-black text-slate-900">{importedCount} {importedCount === 1 ? 'plantão importado' : 'plantões importados'}!</h4>
            <p className="text-[12.5px] text-slate-500 mt-1 mb-4 px-4">
              Já estão no seu calendário com status <strong>Agendado</strong>. Ajuste o que precisar tocando em cada um.
            </p>
            <div className="flex gap-2 w-full">
              <button onClick={() => { setPhase('intro'); setResult(null); }}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98] flex items-center justify-center gap-1.5">
                <RefreshCw size={13} /> Importar mais
              </button>
              <button onClick={onClose}
                className="flex-[1.5] py-2.5 rounded-xl bg-blue-600 text-white text-[13px] font-bold hover:bg-blue-700 transition active:scale-[0.98]">
                Concluir
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
