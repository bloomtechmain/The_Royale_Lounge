import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Bell, Send, CheckCircle, XCircle, Clock, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/services/api';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import Drawer from '@/components/common/Drawer';
import Input from '@/components/common/Input';
import Select from '@/components/common/Select';
import Textarea from '@/components/common/Textarea';
import Table from '@/components/common/Table';
import Pagination from '@/components/common/Pagination';
import SearchInput from '@/components/common/SearchInput';
import { formatDateTime } from '@/utils/formatters';
import { cn } from '@/utils/cn';

const notificationService = {
  getLogs: async (params?: Record<string, any>) => {
    const { data } = await api.get('/notifications/logs', { params });
    return data;
  },
  send: async (payload: any) => {
    const { data } = await api.post('/notifications/send', payload);
    return data;
  },
};

const customerService = {
  list: async () => {
    const { data } = await api.get('/customers', { params: { limit: 200 } });
    return data;
  },
};

const CHANNEL_ICONS: Record<string, any> = {
  sms: MessageSquare,
  whatsapp: MessageSquare,
  email: Bell,
  system: Bell,
};

const CHANNEL_COLORS: Record<string, string> = {
  sms: 'text-blue-400',
  whatsapp: 'text-green-400',
  email: 'text-purple-400',
  system: 'text-charcoal-200',
};

const STATUS_ICONS: Record<string, any> = {
  sent: CheckCircle,
  failed: XCircle,
  pending: Clock,
};

const STATUS_COLORS: Record<string, string> = {
  sent: 'text-emerald-400',
  failed: 'text-red-400',
  pending: 'text-amber-400',
};

const NOTIFICATION_TYPES = [
  'booking_confirmed',
  'pickup_reminder',
  'return_reminder',
  'late_warning',
  'payment_confirmation',
  'custom',
];

const EMPTY_FORM = {
  customerId: '',
  channel: 'sms' as string,
  type: 'custom',
  message: '',
};

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showSendModal, setShowSendModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notification-logs', page, search, channelFilter, statusFilter],
    queryFn: () => notificationService.getLogs({
      page,
      limit: 20,
      search: search || undefined,
      channel: channelFilter || undefined,
      status: statusFilter || undefined,
    }),
  });

  const { data: customersData } = useQuery({
    queryKey: ['customers-for-notification'],
    queryFn: customerService.list,
    enabled: showSendModal,
  });

  const customers: any[] = customersData?.data || customersData || [];

  const selectedCustomer = customers.find((c: any) => c.id === form.customerId);

  const sendMutation = useMutation({
    mutationFn: notificationService.send,
    onSuccess: () => {
      toast.success('Notification sent!');
      setShowSendModal(false);
      setForm(EMPTY_FORM);
      refetch();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to send notification'),
  });

  const logs = data?.data || [];
  const stats = data?.stats || {};

  const recipientDisplay = selectedCustomer
    ? form.channel === 'email' ? selectedCustomer.email
    : form.channel === 'whatsapp' ? (selectedCustomer.whatsapp || selectedCustomer.phone)
    : selectedCustomer.phone
    : '';

  const canSend = !!form.customerId && !!form.message && !!recipientDisplay;

  const columns = [
    {
      key: 'type',
      header: 'Type',
      render: (log: any) => (
        <div>
          <p className="text-sm font-medium text-charcoal-50 capitalize">{log.type?.replace(/_/g, ' ')}</p>
          <p className="text-xs text-charcoal-300">{formatDateTime(log.created_at)}</p>
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (log: any) => {
        const Icon = CHANNEL_ICONS[log.channel] || Bell;
        return (
          <div className={cn('flex items-center gap-1.5 text-sm font-medium', CHANNEL_COLORS[log.channel])}>
            <Icon size={14} />
            <span className="capitalize">{log.channel}</span>
          </div>
        );
      },
    },
    {
      key: 'customer',
      header: 'Recipient',
      render: (log: any) => (
        <div>
          {log.customer_name && <p className="text-sm text-charcoal-50">{log.customer_name}</p>}
          {log.recipient && <p className="text-xs text-charcoal-200">{log.recipient}</p>}
          {log.booking_number && <p className="text-xs text-gold-500">{log.booking_number}</p>}
        </div>
      ),
    },
    {
      key: 'message',
      header: 'Message',
      render: (log: any) => (
        <p className="text-sm text-charcoal-200 max-w-xs truncate">{log.message}</p>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (log: any) => {
        const Icon = STATUS_ICONS[log.status] || Clock;
        return (
          <div>
            <div className={cn('flex items-center gap-1.5 text-sm font-medium', STATUS_COLORS[log.status])}>
              <Icon size={14} />
              <span className="capitalize">{log.status}</span>
            </div>
            {log.status === 'failed' && log.error_message && (
              <p className="text-xs text-red-400/80 mt-0.5 max-w-[200px]">{log.error_message}</p>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">Notifications</h2>
          <p className="text-charcoal-200 text-sm">SMS, WhatsApp and email notification logs</p>
        </div>
        <Button variant="primary" icon={<Send size={15} />} onClick={() => setShowSendModal(true)}>
          Send Manual
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Sent', value: stats.totalSent ?? 0, color: 'text-emerald-400' },
          { label: 'Pending', value: stats.totalPending ?? 0, color: 'text-amber-400' },
          { label: 'Failed', value: stats.totalFailed ?? 0, color: 'text-red-400' },
          { label: 'Total Logs', value: data?.pagination?.total ?? 0, color: 'text-charcoal-50' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="flex items-center gap-3">
            <div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-charcoal-200">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search customer, booking..."
            className="flex-1 min-w-48"
          />
          <Select
            options={[
              { value: '', label: 'All Channels' },
              { value: 'sms', label: 'SMS' },
              { value: 'whatsapp', label: 'WhatsApp' },
              { value: 'email', label: 'Email' },
              { value: 'system', label: 'System' },
            ]}
            value={channelFilter}
            onChange={(e) => { setChannelFilter(e.target.value); setPage(1); }}
            className="w-40"
          />
          <Select
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'sent', label: 'Sent' },
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
            ]}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="w-40"
          />
        </div>
      </Card>

      <Card padding="none">
        <Table
          columns={columns}
          data={logs}
          loading={isLoading}
          rowKey={(l) => l.id}
          emptyMessage="No notification logs yet"
        />
        {data?.pagination && (
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            limit={data.pagination.limit}
            onPageChange={setPage}
          />
        )}
      </Card>

      {/* Send Notification Modal */}
      <Drawer
        open={showSendModal}
        onClose={() => { setShowSendModal(false); setForm(EMPTY_FORM); }}
        title="Send Manual Notification"
       
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowSendModal(false); setForm(EMPTY_FORM); }}>Cancel</Button>
            <Button
              variant="primary"
              icon={<Send size={15} />}
              onClick={() => sendMutation.mutate({ customerId: form.customerId, channel: form.channel, type: form.type, message: form.message })}
              loading={sendMutation.isPending}
              disabled={!canSend}
            >
              Send
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Customer"
            options={[
              { value: '', label: 'Select customer...' },
              ...customers.map((c: any) => ({ value: c.id, label: `${c.name} — ${c.phone || c.email || ''}` })),
            ]}
            value={form.customerId}
            onChange={(e) => setForm({ ...form, customerId: e.target.value })}
          />

          <Select
            label="Channel"
            options={[
              { value: 'sms', label: 'SMS' },
              { value: 'whatsapp', label: 'WhatsApp' },
              { value: 'email', label: 'Email' },
            ]}
            value={form.channel}
            onChange={(e) => setForm({ ...form, channel: e.target.value })}
          />

          {selectedCustomer && recipientDisplay && (
            <Input
              label="Recipient"
              value={recipientDisplay}
              readOnly
              className="bg-charcoal-700/50"
            />
          )}
          {selectedCustomer && !recipientDisplay && (
            <p className="text-xs text-red-400">
              This customer has no {form.channel} contact on record.
            </p>
          )}

          <Select
            label="Notification Type"
            options={NOTIFICATION_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }))}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          />

          <Textarea
            label="Message"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="Type your message..."
            rows={4}
          />
        </div>
      </Drawer>
    </div>
  );
}
