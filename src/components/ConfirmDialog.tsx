import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

interface ConfirmDialogProps {
  open: boolean;
  icon: LucideIcon;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estilo do ícone/botão de confirmar. 'danger' = vermelho (excluir/sair), 'default' = azul. */
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal de confirmação central e customizado — NUNCA usar `window.confirm()`:
 * o diálogo nativo é bloqueado/auto-dismissado (retorna `false` sempre) dentro
 * de iframes e webviews como o painel de preview, fazendo o botão "não funcionar".
 * Este componente segue o padrão visual já usado em EditShiftSheet/LocaisScreen.
 */
export default function ConfirmDialog({
  open, icon: Icon, title, description, confirmLabel, cancelLabel, tone = 'danger', onConfirm, onCancel,
}: ConfirmDialogProps) {
  const { t } = useLanguage();
  if (!open) return null;

  const iconBg = tone === 'danger' ? 'bg-red-50' : 'bg-blue-50';
  const iconColor = tone === 'danger' ? 'text-red-600' : 'text-blue-600';
  const confirmBtn = tone === 'danger'
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="fixed inset-0 z-[400] bg-slate-900/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white w-full max-w-xs rounded-2xl p-5 shadow-xl animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className={`w-12 h-12 rounded-full ${iconBg} flex items-center justify-center mx-auto mb-3`}>
          <Icon size={20} className={iconColor} />
        </div>
        <h4 className="text-center font-bold text-slate-900 text-[15px] mb-1">{title}</h4>
        {description && <p className="text-center text-slate-500 text-[12px] mb-4">{description}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 transition active:scale-[0.98]">
            {cancelLabel || t('Cancelar')}
          </button>
          <button onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold transition active:scale-[0.98] ${confirmBtn}`}>
            {confirmLabel || t('Confirmar')}
          </button>
        </div>
      </div>
    </div>
  );
}
