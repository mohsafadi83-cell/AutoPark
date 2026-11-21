import { Alert, Snackbar, type AlertColor } from '@mui/material';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface ToastItem {
  id: number;
  message: string;
  severity: AlertColor;
}

interface ToastContextValue {
  notify: (message: string, severity?: AlertColor) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastItem | null>(null);

  const notify = useCallback((message: string, severity: AlertColor = 'info') => {
    setToast({ id: Date.now(), message, severity });
  }, []);

  const handleClose = () => setToast(null);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        key={toast?.id}
        open={!!toast}
        autoHideDuration={5000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert onClose={handleClose} severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
