import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, Users, Store, Bell, DollarSign, Shield, Plus, Pencil, Trash2, RefreshCw, Check, Minus, MessageCircle, Zap, Cloud, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { settingsService } from '@/services/settingsService';
import { permissionsService } from '@/services/permissionsService';
import type { RolePermissionsMap } from '@/services/permissionsService';
import Card from '@/components/common/Card';
import WhatsAppQRCard from '@/components/settings/WhatsAppQRCard';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Select from '@/components/common/Select';
import Drawer from '@/components/common/Drawer';
import Badge from '@/components/common/Badge';
import { cn } from '@/utils/cn';
import { ROLE_LABELS } from '@/utils/formatters';
import type { User, UserRole } from '@/types';

const TABS = [
  { key: 'shop', label: 'Shop Info', icon: Store },
  { key: 'rental', label: 'Rental Rules', icon: SettingsIcon },
  { key: 'fines', label: 'Fine Rules', icon: DollarSign },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'permissions', label: 'Permissions', icon: Shield },
] as const;

type TabKey = typeof TABS[number]['key'];

// Utility: create controlled input props for settings
function useSetting(settings: Record<string, any> | undefined, key: string, defaultValue = '') {
  return settings?.[key]?.value ?? defaultValue;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('shop');
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsService.getAll(),
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, string>) => settingsService.update(updates),
    onSuccess: () => {
      toast.success('Settings saved!');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save settings'),
  });

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="text-charcoal-200 text-sm">Configure your shop preferences and rules</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Sidebar tabs */}
        <div className="lg:w-52 flex-shrink-0">
          <Card padding="none">
            <nav className="p-2 space-y-0.5">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left',
                      activeTab === tab.key
                        ? 'bg-gold-700/20 text-gold-400'
                        : 'text-charcoal-200 hover:bg-charcoal-600/40 hover:text-charcoal-50'
                    )}
                  >
                    <Icon size={16} className="flex-shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </Card>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-charcoal-600 rounded-2xl animate-pulse" />)}
            </div>
          ) : (
            <>
              {activeTab === 'shop' && <ShopSettings settings={settings} onSave={(u) => updateMutation.mutate(u)} saving={updateMutation.isPending} />}
              {activeTab === 'rental' && <RentalSettings settings={settings} onSave={(u) => updateMutation.mutate(u)} saving={updateMutation.isPending} />}
              {activeTab === 'fines' && <FineSettings settings={settings} onSave={(u) => updateMutation.mutate(u)} saving={updateMutation.isPending} />}
              {activeTab === 'notifications' && <NotificationSettings settings={settings} onSave={(u) => updateMutation.mutate(u)} saving={updateMutation.isPending} />}
              {activeTab === 'users' && <UserManagement />}
              {activeTab === 'permissions' && <RolePermissionsMatrix />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shop Info ──────────────────────────────────────────────────────────────
function ShopSettings({ settings, onSave, saving }: { settings: any; onSave: (u: Record<string, string>) => void; saving: boolean }) {
  const [form, setForm] = useState({
    shop_name: useSetting(settings, 'shop_name', 'The Outfit Lounge'),
    shop_phone: useSetting(settings, 'shop_phone', ''),
    shop_email: useSetting(settings, 'shop_email', ''),
    shop_address: useSetting(settings, 'shop_address', ''),
    shop_logo: useSetting(settings, 'shop_logo', ''),
    currency: useSetting(settings, 'currency', 'LKR'),
    currency_symbol: useSetting(settings, 'currency_symbol', 'LKR'),
    timezone: useSetting(settings, 'timezone', 'Asia/Colombo'),
    receipt_footer: useSetting(settings, 'receipt_footer', 'Thank you for your business!'),
  });

  // Update local state when settings load
  const s = (k: string, def = '') => settings?.[k]?.value ?? def;

  return (
    <Card>
      <h4 className="text-base font-semibold text-charcoal-50 mb-5">Shop Information</h4>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Shop Name" value={s('shop_name', 'The Outfit Lounge')} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} placeholder="The Outfit Lounge" />
          <Input label="Phone" value={s('shop_phone')} onChange={(e) => setForm({ ...form, shop_phone: e.target.value })} placeholder="+94123456789" />
          <Input label="Email" type="email" value={s('shop_email')} onChange={(e) => setForm({ ...form, shop_email: e.target.value })} placeholder="shop@example.com" />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-charcoal-100">Currency</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ value: 'LKR', label: 'LKR — Sri Lankan Rupee' }, { value: 'USD', label: 'USD — US Dollar' }, { value: 'EUR', label: 'EUR — Euro' }, { value: 'SGD', label: 'SGD — Singapore Dollar' }].map(o => (
                <button key={o.value} type="button" onClick={() => setForm({ ...form, currency: o.value })}
                  className={cn('px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-center',
                    s('currency','LKR') === o.value || form.currency === o.value ? 'border-gold-500 bg-gold-700/15 text-gold-400' : 'border-charcoal-500 text-charcoal-300 hover:border-charcoal-400 hover:text-charcoal-100'
                  )}>{o.label}</button>
              ))}
            </div>
          </div>
          <Input label="Currency Symbol" value={s('currency_symbol', 'LKR')} onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })} placeholder="LKR" />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-charcoal-100">Timezone</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ value: 'Asia/Colombo', label: 'Asia/Colombo (GMT+5:30)' }, { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala_Lumpur (GMT+8)' }, { value: 'Asia/Singapore', label: 'Asia/Singapore (GMT+8)' }, { value: 'UTC', label: 'UTC' }].map(o => (
                <button key={o.value} type="button" onClick={() => setForm({ ...form, timezone: o.value })}
                  className={cn('px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-center',
                    (form.timezone ?? s('timezone','Asia/Kuala_Lumpur')) === o.value ? 'border-gold-500 bg-gold-700/15 text-gold-400' : 'border-charcoal-500 text-charcoal-300 hover:border-charcoal-400 hover:text-charcoal-100'
                  )}>{o.label}</button>
              ))}
            </div>
          </div>
        </div>
        <Input label="Address" value={s('shop_address')} onChange={(e) => setForm({ ...form, shop_address: e.target.value })} placeholder="123 Main Street, Kuala Lumpur" />
        <Input
          label="Shop Logo URL"
          value={s('shop_logo')}
          onChange={(e) => setForm({ ...form, shop_logo: e.target.value })}
          placeholder="https://example.com/logo.png"
          hint="Used in PDF invoices sent via WhatsApp"
        />
        {s('shop_logo') && (
          <div className="flex items-center gap-3 p-3 bg-charcoal-600/40 rounded-xl">
            <img src={s('shop_logo')} alt="Logo preview" className="h-10 w-auto max-w-[120px] object-contain rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <p className="text-xs text-charcoal-300">Logo preview</p>
          </div>
        )}
        <Input label="Receipt Footer Message" value={s('receipt_footer', 'Thank you for your business!')} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} placeholder="Thank you for your business!" />
        <div className="flex justify-end pt-2">
          <Button variant="primary" onClick={() => onSave(form)} loading={saving}>Save Changes</Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Rental Rules ───────────────────────────────────────────────────────────
function RentalSettings({ settings, onSave, saving }: { settings: any; onSave: (u: Record<string, string>) => void; saving: boolean }) {
  const s = (k: string, def = '') => settings?.[k]?.value ?? def;
  const [form, setForm] = useState<Record<string, string>>({});
  const get = (k: string, def = '') => form[k] !== undefined ? form[k] : s(k, def);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card>
      <h4 className="text-base font-semibold text-charcoal-50 mb-5">Rental Rules</h4>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Minimum Rental Days" type="number" min="1" value={get('min_rental_days', '1')} onChange={(e) => set('min_rental_days', e.target.value)} />
          <Input label="Maximum Rental Days" type="number" min="1" value={get('max_rental_days', '30')} onChange={(e) => set('max_rental_days', e.target.value)} />
          <Input label="Default Advance Payment (%)" type="number" min="0" max="100" value={get('default_advance_percent', '30')} onChange={(e) => set('default_advance_percent', e.target.value)} hint="Percentage of total rental cost" />
          <Input label="Booking Number Prefix" value={get('booking_prefix', 'TS')} onChange={(e) => set('booking_prefix', e.target.value)} placeholder="TS" />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-charcoal-100">Booking Number Year Format</label>
            <div className="grid grid-cols-3 gap-2">
              {[{ value: 'full', label: 'Full year' }, { value: 'short', label: 'Short year' }, { value: 'none', label: 'No year' }].map(o => (
                <button key={o.value} type="button" onClick={() => set('booking_year_format', o.value)}
                  className={cn('px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-center',
                    get('booking_year_format','full') === o.value ? 'border-gold-500 bg-gold-700/15 text-gold-400' : 'border-charcoal-500 text-charcoal-300 hover:border-charcoal-400 hover:text-charcoal-100'
                  )}>{o.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="primary" onClick={() => onSave({ ...form })} loading={saving}>Save Changes</Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Fine Rules ─────────────────────────────────────────────────────────────
function FineSettings({ settings, onSave, saving }: { settings: any; onSave: (u: Record<string, string>) => void; saving: boolean }) {
  const s = (k: string, def = '') => settings?.[k]?.value ?? def;
  const [form, setForm] = useState<Record<string, string>>({});
  const get = (k: string, def = '') => form[k] !== undefined ? form[k] : s(k, def);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card>
      <h4 className="text-base font-semibold text-charcoal-50 mb-5">Fine & Late Return Rules</h4>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Grace Period (days)"
            type="number"
            min="0"
            value={get('grace_period_days', '0')}
            onChange={(e) => set('grace_period_days', e.target.value)}
            hint="Days after due date before fine starts"
          />
          <Input
            label="Default Fine Per Day (LKR)"
            type="number"
            min="0"
            step="0.50"
            value={get('default_fine_per_day', '10')}
            onChange={(e) => set('default_fine_per_day', e.target.value)}
            hint="Used if product has no fine set"
          />
          <Input
            label="Maximum Fine Cap (LKR)"
            type="number"
            min="0"
            value={get('max_fine_amount', '0')}
            onChange={(e) => set('max_fine_amount', e.target.value)}
            hint="0 = no cap"
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-charcoal-100">Fine Multiplier for Damage</label>
            <div className="grid grid-cols-4 gap-2">
              {[{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '3', label: '3×' }, { value: '5', label: '5×' }].map(o => (
                <button key={o.value} type="button" onClick={() => set('damage_fine_multiplier', o.value)}
                  className={cn('px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-center',
                    get('damage_fine_multiplier','2') === o.value ? 'border-gold-500 bg-gold-700/15 text-gold-400' : 'border-charcoal-500 text-charcoal-300 hover:border-charcoal-400 hover:text-charcoal-100'
                  )}>{o.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 bg-charcoal-600/40 rounded-xl">
          <p className="text-sm font-medium text-charcoal-100 mb-1">Fine Calculation Formula</p>
          <p className="text-xs text-charcoal-200">
            Fine = max(0, days_late − grace_period) × fine_per_day
            <br />
            If product has a custom fine rate, that overrides the default.
          </p>
        </div>

        <div className="pt-2 border-t border-charcoal-500">
          <p className="text-sm font-semibold text-charcoal-100 mb-4">Damage Charges</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-charcoal-100">Damage Charge Type</label>
              <div className="grid grid-cols-3 gap-2">
                {[{ value: 'none', label: 'No charge' }, { value: 'flat', label: 'Flat amount' }, { value: 'percentage_of_rental', label: '% of rental' }].map(o => (
                  <button key={o.value} type="button" onClick={() => set('damage_charge_type', o.value)}
                    className={cn('px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-center',
                      get('damage_charge_type','none') === o.value ? 'border-gold-500 bg-gold-700/15 text-gold-400' : 'border-charcoal-500 text-charcoal-300 hover:border-charcoal-400 hover:text-charcoal-100'
                    )}>{o.label}</button>
                ))}
              </div>
            </div>
            {get('damage_charge_type', 'none') === 'flat' && (
              <Input
                label="Flat Charge per Damaged Item (LKR)"
                type="number"
                min="0"
                step="0.50"
                value={get('damage_flat_charge', '0')}
                onChange={(e) => set('damage_flat_charge', e.target.value)}
                hint="Fixed amount charged for each damaged item"
              />
            )}
            {get('damage_charge_type', 'none') === 'percentage_of_rental' && (
              <Input
                label="Damage Charge (%)"
                type="number"
                min="0"
                max="500"
                step="1"
                value={get('damage_charge_percent', '50')}
                onChange={(e) => set('damage_charge_percent', e.target.value)}
                hint="% of the item's total rental cost (price/day × qty × days)"
              />
            )}
          </div>
          {get('damage_charge_type', 'none') !== 'none' && (
            <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <p className="text-xs text-amber-300">
                {get('damage_charge_type') === 'flat'
                  ? `Each damaged item adds a flat charge of LKR ${get('damage_flat_charge', '0')} during return.`
                  : `Each damaged item adds ${get('damage_charge_percent', '50')}% of its rental cost as a damage charge during return.`}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="primary" onClick={() => onSave({ ...form })} loading={saving}>Save Changes</Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Notification Settings ───────────────────────────────────────────────────
function NotificationSettings({ settings, onSave, saving }: { settings: any; onSave: (u: Record<string, string>) => void; saving: boolean }) {
  const s = (k: string, def = '') => settings?.[k]?.value ?? def;
  const [form, setForm] = useState<Record<string, string>>({});
  const get = (k: string, def = '') => form[k] !== undefined ? form[k] : s(k, def);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const toggleBool = (k: string, def = 'false') => {
    const current = get(k, def);
    set(k, current === 'true' ? 'false' : 'true');
  };

  return (
    <div className="space-y-4">
      <Card>
        <h4 className="text-base font-semibold text-charcoal-50 mb-5">Notification Channels</h4>
        <div className="space-y-3">
          {[
            { key: 'sms_enabled', label: 'SMS Notifications', desc: 'Send SMS for bookings, reminders, and alerts' },
            { key: 'whatsapp_enabled', label: 'WhatsApp Notifications', desc: 'Send WhatsApp messages (requires Twilio)' },
            { key: 'email_enabled', label: 'Email Notifications', desc: 'Send emails (requires SMTP config)' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3.5 bg-charcoal-600/40 rounded-xl">
              <div>
                <p className="text-sm font-medium text-charcoal-50">{label}</p>
                <p className="text-xs text-charcoal-200">{desc}</p>
              </div>
              <button
                onClick={() => toggleBool(key, 'false')}
                className={cn(
                  'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors',
                  get(key, 'false') === 'true' ? 'bg-gold-600' : 'bg-charcoal-500'
                )}
              >
                <span className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5',
                  get(key, 'false') === 'true' ? 'translate-x-5' : 'translate-x-0.5'
                )} />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h4 className="text-base font-semibold text-charcoal-50 mb-5">Automated Reminders</h4>
        <div className="space-y-3">
          {[
            { key: 'pickup_reminder_enabled', label: 'Pickup Reminders', desc: 'Remind customers 1 day before pickup date' },
            { key: 'return_reminder_enabled', label: 'Return Reminders', desc: 'Remind customers on the due return date' },
            { key: 'late_warning_enabled', label: 'Late Return Warnings', desc: 'Alert customers when rental is overdue' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3.5 bg-charcoal-600/40 rounded-xl">
              <div>
                <p className="text-sm font-medium text-charcoal-50">{label}</p>
                <p className="text-xs text-charcoal-200">{desc}</p>
              </div>
              <button
                onClick={() => toggleBool(key, 'true')}
                className={cn(
                  'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors',
                  get(key, 'true') === 'true' ? 'bg-gold-600' : 'bg-charcoal-500'
                )}
              >
                <span className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5',
                  get(key, 'true') === 'true' ? 'translate-x-5' : 'translate-x-0.5'
                )} />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h4 className="text-base font-semibold text-charcoal-50 mb-1">WhatsApp Integration</h4>
        <p className="text-xs text-charcoal-200 mb-5">
          Connect your WhatsApp by scanning a QR code — invoices are sent automatically in the background.
        </p>
        <div className="space-y-5">
          {/* QR Connection Card — always visible */}
          <WhatsAppQRCard />

          <div className="border-t border-charcoal-600 pt-4">
            <p className="text-sm font-medium text-charcoal-100 mb-3">Invoice Sending Mode</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  value: 'qr_scan',
                  icon: Smartphone,
                  label: 'QR Scan — Auto',
                  desc: 'Connect via QR code above. Invoices sent automatically after every sale and return.',
                },
                {
                  value: 'wame',
                  icon: MessageCircle,
                  label: 'Open WhatsApp',
                  desc: 'Opens WhatsApp app with pre-filled message. Manual — no session needed.',
                },
                {
                  value: 'fitsms',
                  icon: Zap,
                  label: 'Auto Send (FitSMS)',
                  desc: 'Sends automatically via FitSMS API. Requires FitSMS WhatsApp configured.',
                },
                {
                  value: 'cloud_api',
                  icon: Cloud,
                  label: 'Cloud API',
                  desc: 'Meta WhatsApp Cloud API with PDF. Requires Meta Business verification.',
                },
              ].map(({ value, icon: Icon, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('whatsapp_mode', value)}
                  className={cn(
                    'flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all',
                    get('whatsapp_mode', 'qr_scan') === value
                      ? 'border-gold-500 bg-gold-700/15'
                      : 'border-charcoal-500 hover:border-charcoal-400'
                  )}
                >
                  <Icon size={18} className={get('whatsapp_mode', 'qr_scan') === value ? 'text-gold-400' : 'text-charcoal-300'} />
                  <p className={cn('text-sm font-medium', get('whatsapp_mode', 'qr_scan') === value ? 'text-gold-400' : 'text-charcoal-100')}>{label}</p>
                  <p className="text-xs text-charcoal-300 leading-relaxed">{desc}</p>
                </button>
              ))}
            </div>

            {get('whatsapp_mode', 'qr_scan') === 'qr_scan' && (
              <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <p className="text-xs text-emerald-300">
                  Invoices are sent automatically — no buttons required in POS or Returns.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-charcoal-600 pt-4 space-y-4">
            <Input
              label="App Base URL"
              value={get('app_base_url')}
              onChange={(e) => set('app_base_url', e.target.value)}
              placeholder="https://yourapp.up.railway.app"
              hint="Public URL of this app — used to generate PDF download links (wame mode)"
            />
            {get('whatsapp_mode', 'qr_scan') === 'cloud_api' && (
              <div className="space-y-3 p-4 bg-charcoal-600/30 rounded-xl border border-charcoal-500">
                <p className="text-xs font-semibold text-gold-400 uppercase tracking-wide">Cloud API Credentials</p>
                <Input
                  label="Phone Number ID"
                  value={get('whatsapp_cloud_phone_number_id')}
                  onChange={(e) => set('whatsapp_cloud_phone_number_id', e.target.value)}
                  placeholder="1234567890123456"
                  hint="From Meta Business Manager → WhatsApp → API Setup"
                />
                <Input
                  label="Access Token"
                  type="password"
                  value={get('whatsapp_cloud_access_token')}
                  onChange={(e) => set('whatsapp_cloud_access_token', e.target.value)}
                  placeholder="EAAxxxxxxxx..."
                  hint="Permanent system user token or temporary test token"
                />
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <h4 className="text-base font-semibold text-charcoal-50 mb-1">FitSMS Configuration</h4>
        <p className="text-xs text-charcoal-200 mb-5">
          SMS gateway via <span className="text-gold-400">app.fitsms.lk</span>. Get your API token from the FitSMS dashboard.
        </p>
        <div className="space-y-4">
          <Input
            label="FitSMS API Token"
            type="password"
            value={get('fitsms_api_token')}
            onChange={(e) => set('fitsms_api_token', e.target.value)}
            placeholder="492|xxxxxxxxxxxxxxxxxxxx"
            hint="Bearer token from your FitSMS account"
          />
          <Input
            label="Sender ID"
            value={get('fitsms_sender_id', 'OutfitLnge')}
            onChange={(e) => set('fitsms_sender_id', e.target.value.substring(0, 11))}
            placeholder="OutfitLnge"
            hint="Alphanumeric, max 11 characters — shown as sender on customer's phone"
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" onClick={() => onSave({ ...form })} loading={saving}>Save All Settings</Button>
      </div>
    </div>
  );
}

// ─── User Management ─────────────────────────────────────────────────────────
function UserManagement() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetUserId, setResetUserId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier' as UserRole, phone: '' });

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => settingsService.getUsers(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => settingsService.createUser(payload),
    onSuccess: () => {
      toast.success('User created!');
      setShowModal(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => settingsService.updateUser(id, payload),
    onSuccess: () => {
      toast.success('User updated!');
      setShowModal(false);
      setEditingUser(null);
      resetForm();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update user'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => settingsService.deactivateUser(id),
    onSuccess: () => {
      toast.success('User deactivated');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to deactivate user'),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => settingsService.resetPassword(id, password),
    onSuccess: () => {
      toast.success('Password reset!');
      setShowResetModal(false);
      setNewPassword('');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to reset password'),
  });

  const resetForm = () => setForm({ name: '', email: '', password: '', role: 'cashier', phone: '' });

  const openEdit = (user: User) => {
    setEditingUser(user);
    setForm({ name: user.name, email: user.email, password: '', role: user.role, phone: user.phone || '' });
    setShowModal(true);
  };

  const openResetPassword = (userId: string) => {
    setResetUserId(userId);
    setNewPassword('');
    setShowResetModal(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-base font-semibold text-charcoal-50">User Accounts</h4>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => { setEditingUser(null); resetForm(); setShowModal(true); }}>
          Add User
        </Button>
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-charcoal-600 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="divide-y divide-charcoal-600">
            {(users || []).map((user: any) => (
              <div key={user.id} className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-full bg-gold-700/20 border border-gold-700/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-gold-400 font-semibold text-sm">{user.name?.charAt(0)}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-charcoal-50">{user.name}</p>
                    {!user.is_active && <Badge variant="error">Inactive</Badge>}
                  </div>
                  <p className="text-xs text-charcoal-200">{user.email}</p>
                </div>
                <Badge variant={user.role === 'super_admin' ? 'warning' : 'neutral'}>
                  {ROLE_LABELS[user.role as UserRole] || user.role}
                </Badge>
                <div className="flex gap-1">
                  <Button variant="ghost" icon={<Pencil size={13} />} onClick={() => openEdit(user)} />
                  <Button variant="ghost" icon={<RefreshCw size={13} />} onClick={() => openResetPassword(user.id)} />
                  {user.is_active && (
                    <Button
                      variant="ghost"
                     
                      icon={<Trash2 size={13} />}
                      className="text-red-400 hover:text-red-300"
                      onClick={() => deactivateMutation.mutate(user.id)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add/Edit Modal */}
      <Drawer
        open={showModal}
        onClose={() => { setShowModal(false); setEditingUser(null); }}
        title={editingUser ? 'Edit User' : 'Add New User'}
       
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (editingUser) {
                  const payload: any = { name: form.name, role: form.role, phone: form.phone };
                  if (form.password) payload.password = form.password;
                  updateMutation.mutate({ id: editingUser.id, payload });
                } else {
                  createMutation.mutate(form);
                }
              }}
              loading={createMutation.isPending || updateMutation.isPending}
              disabled={!form.name || !form.email || (!editingUser && !form.password)}
            >
              {editingUser ? 'Save Changes' : 'Create User'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" required />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" required disabled={!!editingUser} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+60123456789" />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-charcoal-100">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ value: 'cashier', label: 'Cashier' }, { value: 'inventory_staff', label: 'Inventory Staff' }, { value: 'manager', label: 'Manager' }, { value: 'super_admin', label: 'Super Admin' }].map(o => (
                <button key={o.value} type="button" onClick={() => setForm({ ...form, role: o.value as UserRole })}
                  className={cn('px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-center',
                    form.role === o.value ? 'border-gold-500 bg-gold-700/15 text-gold-400' : 'border-charcoal-500 text-charcoal-300 hover:border-charcoal-400 hover:text-charcoal-100'
                  )}>{o.label}</button>
              ))}
            </div>
          </div>
          <Input
            label={editingUser ? 'New Password (leave blank to keep)' : 'Password'}
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={editingUser ? 'Leave blank to keep current' : 'Min 8 characters'}
            required={!editingUser}
          />
        </div>
      </Drawer>

      {/* Reset Password Modal */}
      <Drawer
        open={showResetModal}
        onClose={() => setShowResetModal(false)}
        title="Reset Password"
       
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowResetModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => resetMutation.mutate({ id: resetUserId, password: newPassword })}
              loading={resetMutation.isPending}
              disabled={newPassword.length < 8}
            >
              Reset Password
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-charcoal-200">Enter a new password for this user.</p>
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 characters"
            hint="Must be at least 8 characters"
          />
        </div>
      </Drawer>
    </div>
  );
}

// ─── Role Permissions Matrix ─────────────────────────────────────────────────
const MODULES = [
  { key: 'dashboard',     label: 'Dashboard' },
  { key: 'pos',           label: 'POS' },
  { key: 'rentals',       label: 'Rentals' },
  { key: 'returns',       label: 'Returns' },
  { key: 'promotions',    label: 'Promotions' },
  { key: 'products',      label: 'Products' },
  { key: 'customers',     label: 'Customers' },
  { key: 'employees',     label: 'Employees' },
  { key: 'payroll',       label: 'Payroll' },
  { key: 'inventory',     label: 'Inventory' },
  { key: 'analytics',     label: 'Expenses & Analytics' },
  { key: 'reports',       label: 'Reports' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'settings',      label: 'Settings' },
];

const CONFIGURABLE_ROLES: { key: string; label: string; color: string }[] = [
  { key: 'manager',         label: 'Manager',         color: 'text-purple-400' },
  { key: 'cashier',         label: 'Cashier',         color: 'text-blue-400' },
  { key: 'inventory_staff', label: 'Inventory Staff', color: 'text-green-400' },
];

type LocalPerms = Record<string, Record<string, { can_read: boolean; can_write: boolean }>>;

function RolePermissionsMatrix() {
  const qc = useQueryClient();
  const [local, setLocal] = useState<LocalPerms | null>(null);

  const { data: serverPerms, isLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: permissionsService.getAll,
  });

  // Merge server data into local on first load (don't overwrite user edits)
  const perms: LocalPerms = local ?? (serverPerms as LocalPerms) ?? {};

  const toggle = (role: string, module: string, access: 'can_read' | 'can_write') => {
    setLocal((prev) => {
      const base: LocalPerms = prev ?? (serverPerms as LocalPerms) ?? {};
      const rolePerms = base[role] ?? {};
      const modPerms = rolePerms[module] ?? { can_read: false, can_write: false };
      let next = { ...modPerms, [access]: !modPerms[access] };
      // Write requires Read; unchecking Read also unchecks Write
      if (access === 'can_write' && next.can_write) next.can_read = true;
      if (access === 'can_read' && !next.can_read) next.can_write = false;
      return { ...base, [role]: { ...rolePerms, [module]: next } };
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const updates: { role: string; module: string; can_read: boolean; can_write: boolean }[] = [];
      for (const role of CONFIGURABLE_ROLES.map((r) => r.key)) {
        for (const mod of MODULES.map((m) => m.key)) {
          const p = perms[role]?.[mod] ?? { can_read: false, can_write: false };
          updates.push({ role, module: mod, can_read: p.can_read, can_write: p.can_write });
        }
      }
      return permissionsService.update(updates);
    },
    onSuccess: () => {
      toast.success('Permissions saved!');
      setLocal(null);
      qc.invalidateQueries({ queryKey: ['permissions'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save permissions'),
  });

  const isDirty = local !== null;

  if (isLoading) {
    return (
      <Card>
        <div className="space-y-3">{[1,2,3,4].map((i) => <div key={i} className="h-10 bg-charcoal-600 rounded-xl animate-pulse" />)}</div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="none">
        <div className="p-5 border-b border-charcoal-600 flex items-center justify-between">
          <div>
            <h4 className="text-base font-semibold text-charcoal-50">Role Permissions</h4>
            <p className="text-xs text-charcoal-200 mt-0.5">Control which modules each role can access. Super Admin always has full access.</p>
          </div>
          <Button
            variant="primary"
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={!isDirty}
          >
            Save Permissions
          </Button>
        </div>

        {/* Super admin badge */}
        <div className="mx-5 mt-4 mb-2 flex items-center gap-2 px-4 py-2.5 bg-gold-700/10 border border-gold-700/30 rounded-xl">
          <Shield size={14} className="text-gold-400 flex-shrink-0" />
          <p className="text-xs text-gold-300">
            <span className="font-semibold">Super Admin</span> — unrestricted access to all modules, not configurable.
          </p>
        </div>

        {/* Matrix table */}
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full min-w-[600px] mt-3">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-charcoal-200 pb-3 pr-4 w-36">Module</th>
                {CONFIGURABLE_ROLES.map((role) => (
                  <th key={role.key} colSpan={2} className={cn('text-center text-xs font-semibold pb-3 px-2', role.color)}>
                    {role.label}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="pb-2" />
                {CONFIGURABLE_ROLES.map((role) => (
                  <>
                    <th key={`${role.key}-r`} className="text-center text-xs text-charcoal-300 pb-2 w-14">Read</th>
                    <th key={`${role.key}-w`} className="text-center text-xs text-charcoal-300 pb-2 w-14">Write</th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal-600/50">
              {MODULES.map((mod) => (
                <tr key={mod.key} className="hover:bg-charcoal-600/20 transition-colors">
                  <td className="py-3 pr-4 text-sm font-medium text-charcoal-100">{mod.label}</td>
                  {CONFIGURABLE_ROLES.map((role) => {
                    const p = perms[role.key]?.[mod.key] ?? { can_read: false, can_write: false };
                    return (
                      <>
                        <td key={`${role.key}-${mod.key}-r`} className="py-3 text-center">
                          <PermToggle
                            checked={p.can_read}
                            onChange={() => toggle(role.key, mod.key, 'can_read')}
                          />
                        </td>
                        <td key={`${role.key}-${mod.key}-w`} className="py-3 text-center">
                          <PermToggle
                            checked={p.can_write}
                            onChange={() => toggle(role.key, mod.key, 'can_write')}
                            disabled={!p.can_read}
                          />
                        </td>
                      </>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-charcoal-300 px-1">
        Write access requires Read access. Changes take effect when users next load a page.
      </p>
    </div>
  );
}

function PermToggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      className={cn(
        'w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all duration-150 mx-auto',
        disabled
          ? 'border-charcoal-600 bg-charcoal-700/30 cursor-not-allowed opacity-40'
          : checked
          ? 'border-gold-600 bg-gold-700/20 text-gold-400 hover:bg-gold-700/30'
          : 'border-charcoal-500 bg-charcoal-600/30 text-transparent hover:border-charcoal-300 hover:text-charcoal-400'
      )}
    >
      {checked ? <Check size={13} strokeWidth={2.5} /> : <Minus size={13} strokeWidth={2} />}
    </button>
  );
}
