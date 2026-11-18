import React from 'react';
import { DialogError } from './DialogError';

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  busyLabel: string;
  isBusy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation dialog for destructive actions. Uses the same overlay/card styling as the other dialogs. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel,
  busyLabel,
  isBusy,
  error,
  onConfirm,
  onCancel,
}) => (
  <div
    className="auth-wrapper"
    role="dialog"
    aria-label={title}
    style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100 }}
  >
    <div className="auth-card" style={{ maxWidth: 450 }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>{title}</h2>
      <DialogError message={error} />
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>{message}</p>
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
        <button type="button" onClick={onCancel} className="btn btn-outline" style={{ flex: 1 }} disabled={isBusy}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className="btn btn-danger" style={{ flex: 1 }} disabled={isBusy}>
          {isBusy ? busyLabel : confirmLabel}
        </button>
      </div>
    </div>
  </div>
);
