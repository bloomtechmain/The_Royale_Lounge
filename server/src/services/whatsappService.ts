import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';

const AUTH_DIR = process.env.WA_AUTH_DIR
  || path.join(process.cwd(), 'wa_auth');

// ─── State ────────────────────────────────────────────────────────────────────
export type WAStatus = 'disconnected' | 'qr_ready' | 'connecting' | 'connected';

let sock: ReturnType<typeof makeWASocket> | null = null;
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

// ─── Connect ──────────────────────────────────────────────────────────────────
export async function connectWhatsApp(): Promise<void> {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const logger = pino({ level: 'silent' });

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ['Royale Lounge POS', 'Chrome', '1.0'],
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
  });

  status = 'connecting';
  emit();

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
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
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      qrDataUrl = null;

      if (code === DisconnectReason.loggedOut) {
        console.log('[WA] Logged out — clearing auth');
        status = 'disconnected';
        connectedPhone = null;
        sock = null;
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
      } else {
        console.log('[WA] Connection closed, reconnecting in 3s (code:', code, ')');
        status = 'connecting';
        sock = null;
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
  // Strip all non-digits, append @s.whatsapp.net
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
