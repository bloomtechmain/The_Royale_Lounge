import QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = process.env.WA_AUTH_DIR
  || path.join(process.cwd(), 'wa_auth');

// ─── State ────────────────────────────────────────────────────────────────────
export type WAStatus = 'disconnected' | 'qr_ready' | 'connecting' | 'connected';

let sock: any = null;
let status: WAStatus = 'disconnected';
let qrDataUrl: string | null = null;
let connectedPhone: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// ─── SSE Listener Registry ────────────────────────────────────────────────────
const listeners = new Set<(data: object) => void>();

export function subscribe(fn: (data: object) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  const state = getWAState();
  listeners.forEach(fn => fn(state));
}

// ─── Public State ─────────────────────────────────────────────────────────────
export function getWAState() {
  return { status, qr: qrDataUrl, phone: connectedPhone };
}

export function isConnected(): boolean {
  return status === 'connected';
}

// ─── ESM loader helper ────────────────────────────────────────────────────────
// TypeScript compiles import() to require() in CommonJS output.
// Using new Function prevents that transformation so the runtime gets a
// real dynamic import() capable of loading ESM-only packages.
const esmImport = new Function('specifier', 'return import(specifier)') as
  (s: string) => Promise<any>;

// ─── Connect ──────────────────────────────────────────────────────────────────
export async function connectWhatsApp(): Promise<void> {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const baileys = await esmImport('@whiskeysockets/baileys');
  const makeWASocket            = baileys.default ?? baileys.makeWASocket;
  const useMultiFileAuthState   = baileys.useMultiFileAuthState;
  const DisconnectReason        = baileys.DisconnectReason;
  const fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;

  const pino = (await esmImport('pino')).default;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['Royale Lounge POS', 'Chrome', '1.0'],
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
  });

  status = 'connecting';
  emit();

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }: any) => {
    if (qr) {
      try {
        qrDataUrl = await QRCode.toDataURL(qr, { width: 256 });
        status = 'qr_ready';
        emit();
      } catch (e) {
        console.error('[WA] QR generation failed:', e);
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      qrDataUrl = null;
      sock = null;

      if (code === DisconnectReason.loggedOut) {
        console.log('[WA] Logged out — clearing auth');
        status = 'disconnected';
        connectedPhone = null;
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
      } else {
        console.log('[WA] Connection closed, reconnecting in 3s (code:', code, ')');
        status = 'connecting';
        reconnectTimer = setTimeout(() => connectWhatsApp(), 3000);
      }
      emit();
    }

    if (connection === 'open') {
      qrDataUrl = null;
      status = 'connected';
      connectedPhone = sock?.user?.id?.split(':')[0] ?? null;
      console.log('[WA] Connected as', connectedPhone);
      emit();
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// ─── Disconnect ───────────────────────────────────────────────────────────────
export async function disconnectWhatsApp(): Promise<void> {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  try { await sock?.logout(); } catch {}
  sock = null;
  status = 'disconnected';
  qrDataUrl = null;
  connectedPhone = null;
  try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
  emit();
}

// ─── Send Helpers ─────────────────────────────────────────────────────────────
function toJID(phone: string): string {
  return phone.replace(/\D/g, '') + '@s.whatsapp.net';
}

export async function sendWAText(phone: string, message: string): Promise<void> {
  if (!sock || status !== 'connected') throw new Error('WhatsApp not connected');
  await sock.sendMessage(toJID(phone), { text: message });
}

export async function sendWADocument(
  phone: string,
  buffer: Buffer,
  filename: string,
  caption: string,
): Promise<void> {
  if (!sock || status !== 'connected') throw new Error('WhatsApp not connected');
  await sock.sendMessage(toJID(phone), {
    document: buffer,
    mimetype: 'application/pdf',
    fileName: filename,
    caption,
  });
}
