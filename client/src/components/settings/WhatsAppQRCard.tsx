import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, QrCode, Smartphone, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/services/api';
import Button from '@/components/common/Button';
import { cn } from '@/utils/cn';

type WAStatus = 'disconnected' | 'qr_ready' | 'connecting' | 'connected';

interface WAState {
  status: WAStatus;
  qr: string | null;
  phone: string | null;
}

export default function WhatsAppQRCard() {
  const [state, setState] = useState<WAState>({ status: 'disconnected', qr: null, phone: null });
  const [loading, setLoading] = useState(false);

  // Poll status on mount, then switch to SSE
  useEffect(() => {
    // Fetch initial state via REST
    api.get('/whatsapp/status')
      .then(r => setState(r.data))
      .catch(() => {});

    // Open SSE stream for real-time updates
    const baseUrl = (api.defaults.baseURL || '').replace(/\/$/, '');
    const token = localStorage.getItem('auth-store')
      ? JSON.parse(localStorage.getItem('auth-store')!).state?.token
      : null;

    // Use polling instead of raw EventSource since we need auth header
    const interval = setInterval(() => {
      api.get('/whatsapp/status')
        .then(r => setState(r.data))
        .catch(() => {});
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    try {
      await api.post('/whatsapp/connect');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to start connection');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect WhatsApp? You will need to scan the QR code again to reconnect.')) return;
    setLoading(true);
    try {
      await api.post('/whatsapp/disconnect');
      toast.success('WhatsApp disconnected');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={cn(
        'flex items-center justify-between p-4 rounded-xl border-2',
        state.status === 'connected'
          ? 'border-emerald-500/40 bg-emerald-500/10'
          : state.status === 'qr_ready' || state.status === 'connecting'
          ? 'border-amber-500/40 bg-amber-500/10'
          : 'border-charcoal-500 bg-charcoal-600/30',
      )}>
        <div className="flex items-center gap-3">
          {state.status === 'connected' && (
            <CheckCircle size={20} className="text-emerald-400 flex-shrink-0" />
          )}
          {(state.status === 'connecting' || state.status === 'qr_ready') && (
            <Loader2 size={20} className="text-amber-400 animate-spin flex-shrink-0" />
          )}
          {state.status === 'disconnected' && (
            <XCircle size={20} className="text-charcoal-400 flex-shrink-0" />
          )}
          <div>
            <p className={cn(
              'text-sm font-semibold',
              state.status === 'connected' ? 'text-emerald-300'
                : state.status === 'qr_ready' || state.status === 'connecting' ? 'text-amber-300'
                : 'text-charcoal-200',
            )}>
              {state.status === 'connected' && `Connected · +${state.phone}`}
              {state.status === 'qr_ready' && 'Waiting for QR scan…'}
              {state.status === 'connecting' && 'Connecting…'}
              {state.status === 'disconnected' && 'Not connected'}
            </p>
            {state.status === 'connected' && (
              <p className="text-xs text-charcoal-300 mt-0.5">Invoices will be sent automatically</p>
            )}
          </div>
        </div>

        {state.status === 'connected' ? (
          <Button variant="ghost" onClick={handleDisconnect} loading={loading}
            className="text-red-400 hover:text-red-300 text-xs">
            Disconnect
          </Button>
        ) : state.status === 'disconnected' ? (
          <Button variant="primary" onClick={handleConnect} loading={loading}
            icon={<Smartphone size={14} />}>
            Connect WhatsApp
          </Button>
        ) : null}
      </div>

      {/* QR Code panel */}
      {state.status === 'qr_ready' && state.qr && (
        <div className="flex gap-6 p-5 bg-charcoal-600/30 rounded-xl border border-charcoal-500">
          <div className="flex-shrink-0">
            <img
              src={state.qr}
              alt="WhatsApp QR Code"
              className="w-44 h-44 rounded-xl bg-white p-2"
            />
          </div>
          <div className="flex flex-col justify-center space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <QrCode size={16} className="text-gold-400" />
              <p className="text-sm font-semibold text-charcoal-50">Scan with WhatsApp</p>
            </div>
            {[
              'Open WhatsApp on your phone',
              'Tap the menu (⋮) → Linked Devices',
              'Tap "Link a Device"',
              'Point your phone camera at this QR code',
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-gold-700/30 text-gold-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-charcoal-200">{step}</p>
              </div>
            ))}
            <p className="text-xs text-charcoal-400 mt-2">
              QR code refreshes automatically if it expires.
            </p>
          </div>
        </div>
      )}

      {/* Connecting panel */}
      {state.status === 'connecting' && !state.qr && (
        <div className="flex items-center gap-3 p-4 bg-charcoal-600/30 rounded-xl border border-charcoal-500">
          <Loader2 size={16} className="text-amber-400 animate-spin" />
          <p className="text-sm text-charcoal-200">Establishing connection… QR code will appear shortly.</p>
        </div>
      )}
    </div>
  );
}
