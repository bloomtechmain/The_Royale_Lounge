import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ShoppingBag, CalendarDays, Maximize2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { DisplayCartItem, DisplayRentalItem } from '@/services/customerDisplayChannel';

// ─── Types ────────────────────────────────────────────────────────────────────
type DisplayMsg =
  | { type: 'shop_info'; shopName: string; shopLogo: string }
  | { type: 'pos_cart'; items: DisplayCartItem[]; subtotal: number; discount: number; total: number; customerName: string | null }
  | { type: 'pos_checkout'; total: number; amountPaid: number; change: number; customerName: string | null }
  | { type: 'rental'; items: DisplayRentalItem[]; total: number; customerName: string; startDate: string; endDate: string }
  | { type: 'idle' };

function fmt(n: number) {
  return `LKR ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ─── Idle Screen ──────────────────────────────────────────────────────────────
function IdleScreen({ shopName, shopLogo }: { shopName: string; shopLogo: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.6 }}
      className="flex-1 flex flex-col items-center justify-center relative overflow-hidden"
    >
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0d0d14] via-[#111118] to-[#0a0a10]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,rgba(201,169,110,0.07)_0%,transparent_70%)]" />

      {/* Subtle animated ring */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full border border-gold-800/10"
        animate={{ scale: [1, 1.06, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[420px] h-[420px] rounded-full border border-gold-700/15"
        animate={{ scale: [1, 1.04, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', delay: 1 }}
      />

      <div className="relative z-10 flex flex-col items-center gap-10">
        {/* Logo / Icon */}
        {shopLogo ? (
          <motion.img
            src={shopLogo}
            alt={shopName}
            className="h-36 w-auto object-contain drop-shadow-2xl"
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
          />
        ) : (
          <motion.div
            className="w-32 h-32 rounded-full bg-gold-600/10 border border-gold-600/20 flex items-center justify-center shadow-2xl"
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
          >
            <ShoppingBag size={64} className="text-gold-500/70" strokeWidth={1} />
          </motion.div>
        )}

        {/* Shop name */}
        <div className="text-center">
          <h1 className="font-display text-6xl xl:text-8xl font-bold tracking-wide leading-none text-transparent bg-clip-text bg-gradient-to-b from-charcoal-50 to-charcoal-300">
            {shopName}
          </h1>
          <motion.p
            className="text-gold-400/80 text-lg mt-5 tracking-[0.35em] uppercase font-light"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          >
            Welcome
          </motion.p>
        </div>

        {/* Gold divider */}
        <motion.div
          className="h-px bg-gradient-to-r from-transparent via-gold-500/50 to-transparent w-72"
          animate={{ opacity: [0.3, 0.8, 0.3], scaleX: [0.8, 1, 0.8] }}
          transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
        />
      </div>

      {/* Footer */}
      <div className="absolute bottom-8 inset-x-0 text-center">
        <p className="text-charcoal-600 text-xs tracking-[0.3em] uppercase">{shopName}</p>
      </div>
    </motion.div>
  );
}

// ─── Cart Screen ──────────────────────────────────────────────────────────────
function CartScreen({ items, subtotal, discount, total, customerName, shopName }: {
  items: DisplayCartItem[];
  subtotal: number;
  discount: number;
  total: number;
  customerName: string | null;
  shopName: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      {/* Top bar */}
      <div className="flex-shrink-0 bg-charcoal-800 border-b border-charcoal-600/60 px-8 py-4 flex items-center justify-between">
        <span className="font-display text-xl font-semibold text-gold-400 tracking-wide">{shopName}</span>
        {customerName && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-charcoal-400">Customer:</span>
            <span className="text-charcoal-100 font-medium">{customerName}</span>
          </div>
        )}
      </div>

      {/* Two-column content */}
      <div className="flex-1 flex overflow-hidden">

        {/* Items table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-charcoal-800/90 border-b border-charcoal-600/60 backdrop-blur-sm">
                <th className="text-left px-6 py-3.5 text-charcoal-400 font-medium text-xs uppercase tracking-widest w-10">#</th>
                <th className="text-left px-6 py-3.5 text-charcoal-400 font-medium text-xs uppercase tracking-widest">Item</th>
                <th className="text-right px-6 py-3.5 text-charcoal-400 font-medium text-xs uppercase tracking-widest w-20">Qty</th>
                <th className="text-right px-6 py-3.5 text-charcoal-400 font-medium text-xs uppercase tracking-widest w-36">Unit Price</th>
                <th className="text-right px-6 py-3.5 text-charcoal-400 font-medium text-xs uppercase tracking-widest w-36">Amount</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-24 text-center text-charcoal-500 text-sm">
                      Waiting for items…
                    </td>
                  </tr>
                ) : items.map((item, i) => (
                  <motion.tr
                    key={item.variantSku}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="border-b border-charcoal-700/40 hover:bg-charcoal-800/30 transition-colors"
                  >
                    <td className="px-6 py-4 text-charcoal-500 text-sm">{i + 1}</td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-charcoal-50 text-base leading-tight">{item.productName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.variantLabel && (
                          <span className="text-charcoal-400 text-xs">{item.variantLabel}</span>
                        )}
                        {item.discount > 0 && (
                          <span className="text-amber-400 text-xs">– {fmt(item.discount)} off</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-charcoal-50 font-semibold text-lg">{item.quantity}</td>
                    <td className="px-6 py-4 text-right text-charcoal-300 text-sm">{fmt(item.unitPrice)}</td>
                    <td className="px-6 py-4 text-right text-charcoal-50 font-semibold">{fmt(item.subtotal)}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Totals sidebar */}
        <div className="w-80 xl:w-96 flex-shrink-0 bg-charcoal-800/50 border-l border-charcoal-600/60 flex flex-col justify-center gap-5 px-8 py-10">
          <div className="space-y-4">
            <div className="flex justify-between items-center text-charcoal-300">
              <span className="text-sm">Subtotal</span>
              <span className="text-sm font-medium">{fmt(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between items-center text-amber-400">
                <span className="text-sm">Discount</span>
                <span className="text-sm font-medium">− {fmt(discount)}</span>
              </div>
            )}
            <div className="h-px bg-charcoal-600/60 my-2" />
            <div className="flex justify-between items-center">
              <span className="text-charcoal-200 text-lg font-semibold">Total</span>
              <motion.span
                key={total}
                initial={{ scale: 1.12, color: '#c9a96e' }}
                animate={{ scale: 1, color: '#f5f0e8' }}
                transition={{ duration: 0.35 }}
                className="text-3xl font-bold text-charcoal-50"
              >
                {fmt(total)}
              </motion.span>
            </div>
          </div>

          <p className="text-charcoal-600 text-xs text-center mt-6">Please review your items</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Checkout Screen ──────────────────────────────────────────────────────────
function CheckoutScreen({ total, amountPaid, change, customerName }: {
  total: number;
  amountPaid: number;
  change: number;
  customerName: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center gap-10 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#111118] via-[#0d150f] to-[#111118]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(74,222,128,0.06)_0%,transparent_70%)]" />

      <div className="relative z-10 flex flex-col items-center gap-8">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 180, damping: 12 }}
        >
          <CheckCircle2 size={110} className="text-green-400" strokeWidth={1.2} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <h1 className="font-display text-7xl xl:text-8xl font-bold text-charcoal-50 leading-none">
            Thank You!
          </h1>
          {customerName && (
            <p className="text-gold-400 text-2xl mt-3 font-light">{customerName}</p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="flex items-stretch gap-8"
        >
          {[
            { label: 'Total',     value: fmt(total),      cls: 'text-charcoal-50' },
            null,
            { label: 'Paid',      value: fmt(amountPaid), cls: 'text-charcoal-50' },
            ...(change > 0 ? [null, { label: 'Change', value: fmt(change), cls: 'text-green-400' }] : []),
          ].map((item, i) =>
            item === null ? (
              <div key={i} className="w-px bg-charcoal-600/60 self-stretch" />
            ) : (
              <div key={i} className="text-center">
                <p className="text-charcoal-500 text-xs uppercase tracking-widest mb-2">{item.label}</p>
                <p className={cn('text-3xl font-bold', item.cls)}>{item.value}</p>
              </div>
            )
          )}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-charcoal-500 text-sm tracking-wide"
        >
          Please come again!
        </motion.p>
      </div>
    </motion.div>
  );
}

// ─── Rental Screen ────────────────────────────────────────────────────────────
function RentalScreen({ items, total, customerName, startDate, endDate, shopName }: {
  items: DisplayRentalItem[];
  total: number;
  customerName: string;
  startDate: string;
  endDate: string;
  shopName: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      {/* Top bar */}
      <div className="flex-shrink-0 bg-charcoal-800 border-b border-charcoal-600/60 px-8 py-4 flex items-center justify-between">
        <span className="font-display text-xl font-semibold text-gold-400 tracking-wide">{shopName}</span>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-charcoal-100 font-medium text-sm">{customerName}</p>
            {(startDate || endDate) && (
              <div className="flex items-center gap-1 text-charcoal-400 text-xs mt-0.5">
                <CalendarDays size={10} />
                <span>{startDate ? fmtDate(startDate) : '—'}</span>
                <span>→</span>
                <span>{endDate ? fmtDate(endDate) : '—'}</span>
              </div>
            )}
          </div>
          <div className="w-px h-8 bg-charcoal-600/60" />
          <div className="text-xs uppercase tracking-widest text-charcoal-500">Rental</div>
        </div>
      </div>

      {/* Items + totals */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-charcoal-800/90 border-b border-charcoal-600/60 backdrop-blur-sm">
                <th className="text-left px-6 py-3.5 text-charcoal-400 font-medium text-xs uppercase tracking-widest w-10">#</th>
                <th className="text-left px-6 py-3.5 text-charcoal-400 font-medium text-xs uppercase tracking-widest">Item</th>
                <th className="text-right px-6 py-3.5 text-charcoal-400 font-medium text-xs uppercase tracking-widest w-20">Qty</th>
                <th className="text-right px-6 py-3.5 text-charcoal-400 font-medium text-xs uppercase tracking-widest w-36">Per Day</th>
                <th className="text-right px-6 py-3.5 text-charcoal-400 font-medium text-xs uppercase tracking-widest w-36">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <motion.tr
                  key={item.variantSku}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="border-b border-charcoal-700/40"
                >
                  <td className="px-6 py-4 text-charcoal-500 text-sm">{i + 1}</td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-charcoal-50 text-base leading-tight">{item.productName}</p>
                    {item.variantLabel && (
                      <p className="text-charcoal-400 text-xs mt-0.5">{item.variantLabel}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-charcoal-50 font-semibold text-lg">{item.quantity}</td>
                  <td className="px-6 py-4 text-right text-charcoal-300 text-sm">{fmt(item.unitPrice)}</td>
                  <td className="px-6 py-4 text-right text-charcoal-50 font-semibold">{fmt(item.subtotal)}</td>
                </motion.tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-24 text-center text-charcoal-500 text-sm">
                    Adding items…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="w-80 xl:w-96 flex-shrink-0 bg-charcoal-800/50 border-l border-charcoal-600/60 flex flex-col justify-center px-8 py-10">
          <div className="space-y-4">
            <div className="h-px bg-charcoal-600/60" />
            <div className="flex justify-between items-center">
              <span className="text-charcoal-200 text-lg font-semibold">Total Rental</span>
              <motion.span
                key={total}
                initial={{ scale: 1.1, color: '#c9a96e' }}
                animate={{ scale: 1, color: '#c9a96e' }}
                className="text-3xl font-bold text-gold-400"
              >
                {fmt(total)}
              </motion.span>
            </div>
          </div>
          <p className="text-charcoal-600 text-xs text-center mt-8">Rental booking in progress</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Fullscreen overlay ───────────────────────────────────────────────────────
function FullscreenOverlay() {
  const handleClick = () => {
    document.documentElement.requestFullscreen().catch(() => {});
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
      style={{ background: 'rgba(10,10,16,0.97)' }}
      onClick={handleClick}
    >
      {/* Pulsing ring */}
      <motion.div
        className="absolute w-64 h-64 rounded-full border border-gold-600/20"
        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.7, 0.3] }}
        transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-48 h-48 rounded-full border border-gold-500/30"
        animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.8, 0.4] }}
        transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut', delay: 0.3 }}
      />

      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
        className="relative z-10 flex flex-col items-center gap-6"
      >
        <Maximize2 size={72} className="text-gold-400" strokeWidth={1.1} />
        <div className="text-center">
          <h2 className="font-display text-5xl font-bold text-charcoal-50 leading-none">
            Tap to Activate
          </h2>
          <p className="text-charcoal-400 text-base mt-3 tracking-wide">
            Touch anywhere to enter fullscreen
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CustomerDisplayPage() {
  const [shopName, setShopName] = useState('THE OUTFIT LOUNGE');
  const [shopLogo, setShopLogo] = useState('');
  const [screen, setScreen] = useState<DisplayMsg>({ type: 'idle' });
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    document.title = 'Customer Display';

    // Track fullscreen state
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);

    // Try auto-fullscreen — succeeds in Chrome when the window was opened via
    // window.open() from a user-gesture context on the POS window
    document.documentElement.requestFullscreen().catch(() => {});

    // BroadcastChannel for real-time POS updates
    const channel = new BroadcastChannel('pos-customer-display');
    channel.onmessage = (e: MessageEvent<DisplayMsg>) => {
      const msg = e.data;
      if (msg.type === 'shop_info') {
        setShopName(msg.shopName || 'THE OUTFIT LOUNGE');
        setShopLogo(msg.shopLogo || '');
        return;
      }
      setScreen(msg);
      if (msg.type === 'pos_checkout') {
        setTimeout(() => setScreen({ type: 'idle' }), 6000);
      }
    };

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      channel.close();
    };
  }, []);

  return (
    <div className="h-screen bg-[#111118] text-charcoal-50 flex flex-col overflow-hidden select-none relative"
         style={{ cursor: isFullscreen ? 'none' : 'default' }}>

      {/* Fullscreen activation overlay — shown until fullscreen is entered */}
      {!isFullscreen && <FullscreenOverlay />}

      <AnimatePresence mode="wait">
        {screen.type === 'idle' && (
          <IdleScreen key="idle" shopName={shopName} shopLogo={shopLogo} />
        )}
        {screen.type === 'pos_cart' && (
          <CartScreen key="cart" {...screen} shopName={shopName} />
        )}
        {screen.type === 'pos_checkout' && (
          <CheckoutScreen key="checkout" {...screen} />
        )}
        {screen.type === 'rental' && (
          <RentalScreen key="rental" {...screen} shopName={shopName} />
        )}
      </AnimatePresence>
    </div>
  );
}
