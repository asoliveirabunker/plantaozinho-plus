import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

interface ConfirmDialogProps {
  open: boolean;
  icon: LucideIcon;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estilo do ícone/botão de confirmar. 'danger' = terracota (excluir/sair), 'default' = jade. */
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal de confirmação central e customizado — NUNCA usar `window.confirm()`:
 * o diálogo nativo é bloqueado/auto-dismissado (retorna `false` sempre) dentro
 * de iframes e webviews como o painel de preview, fazendo o botão "não funcionar".
 *
 * Sistema Jade: cartão centrado (raio 28, sombra elevada), ícone solto de traço
 * 1.5 — sem círculo pastel — e botões lado a lado com as classes do sistema:
 * `.btn-secondary` para cancelar e `.btn-danger` (terracota com borda, nunca
 * bloco vermelho) ou `.btn-primary` (jade) para confirmar.
 */
export default function ConfirmDialog({
  open, icon: Icon, title, description, confirmLabel, cancelLabel, tone = 'danger', onConfirm, onCancel,
}: ConfirmDialogProps) {
  const { t } = useLanguage();
  if (!open) return null;

  const isDanger = tone === 'danger';

  return (
    <div className="modal-overlay z-[400] animate-fade-in" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="bg-white w-full max-w-sm rounded-3xl overflow-hidden p-6 animate-scale-in"
        style={{ boxShadow: '0 40px 80px -30px rgba(7,56,45,.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <Icon
          size={20}
          strokeWidth={1.5}
          aria-hidden="true"
          className={isDanger ? 'text-red-600' : 'text-blue-600'}
        />
        <h4
          id="confirm-dialog-title"
          className="mt-4 text-[22px] font-light leading-[1.15] tracking-[-0.03em] text-slate-900"
        >
          {title}
        </h4>
        {description && (
          <p className="mt-2 text-[13.5px] leading-[1.55] text-slate-500">{description}</p>
        )}

        <div className="flex gap-2.5 mt-6">
          <button type="button" onClick={onCancel} className="btn-secondary flex-1 !px-3">
            {cancelLabel || t('Cancelar')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`${isDanger ? 'btn-danger' : 'btn-primary !h-12'} flex-1 !px-3`}
          >
            {confirmLabel || t('Confirmar')}
          </button>
        </div>
      </div>
    </div>
  );
}
