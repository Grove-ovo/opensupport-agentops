import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useLocale } from '../locales/index.js';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  detail: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  children?: React.ReactNode;
  onCancel(): void;
  onConfirm(): void;
}

export function ConfirmDialog({
  open,
  title,
  detail,
  confirmLabel,
  danger = false,
  busy = false,
  children,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useLocale();
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [busy, onCancel, open]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => !busy && onCancel()}>
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">{t('common.confirm')}</span>
            <h2 id="confirm-title">{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} disabled={busy} title={t('common.close')}>
            <X size={18} />
          </button>
        </header>
        <p>{detail}</p>
        {children}
        <footer>
          <button className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            className={`button ${danger ? 'button-danger' : 'button-primary'}`}
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? t('common.applying') : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
