import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  footer?: React.ReactNode;
  closeOnOverlay?: boolean;
  variant?: 'drawer' | 'dialog';
}

const DRAWER_WIDTH: Record<string, number> = {
  sm: 400,
  md: 480,
  lg: 560,
  xl: 640,
  full: 720,
};

export default function Modal({
  open, onClose, title, children, size = 'md', footer, closeOnOverlay = true, variant = 'drawer',
}: ModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (variant === 'dialog') {
    return (
      <AnimatePresence>
        {open && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
              onClick={closeOnOverlay ? onClose : undefined}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{ position: 'relative', zIndex: 10, background: '#1a1a26', border: '1px solid #2a2a38', borderRadius: 16, width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
            >
              {title && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: '1px solid #2a2a38', flexShrink: 0 }}>
                  <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 18, fontWeight: 600, color: '#c8c8d8', margin: 0 }}>{title}</h2>
                  <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b80', padding: 4 }}>
                    <X size={18} />
                  </button>
                </div>
              )}
              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>{children}</div>
              {footer && (
                <div style={{ flexShrink: 0, borderTop: '1px solid #2a2a38', padding: 16, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  // Drawer — slides in from the right side
  const width = Math.min(DRAWER_WIDTH[size] ?? 480, window.innerWidth);

  return (
    <AnimatePresence>
      {open && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
            onClick={closeOnOverlay ? onClose : undefined}
          />

          {/* Drawer panel — pinned to right edge */}
          <motion.div
            initial={{ x: width }}
            animate={{ x: 0 }}
            exit={{ x: width }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width,
              background: '#1a1a26',
              borderLeft: '1px solid #2a2a38',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 10,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #21212f', flexShrink: 0 }}>
              <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 18, fontWeight: 600, color: '#c8c8d8', margin: 0 }}>
                {title ?? ''}
              </h2>
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b80', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div style={{ flexShrink: 0, borderTop: '1px solid #21212f', padding: 16, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
