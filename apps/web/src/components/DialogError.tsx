import React from 'react';
import { AlertCircle } from 'lucide-react';

/** Error banner rendered INSIDE a dialog, so it is never hidden behind the modal overlay. */
export const DialogError: React.FC<{ message: string | null }> = ({ message }) => {
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.6rem 0.85rem',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        color: '#f87171',
        fontSize: '0.85rem',
      }}
    >
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{message}</span>
    </div>
  );
};
