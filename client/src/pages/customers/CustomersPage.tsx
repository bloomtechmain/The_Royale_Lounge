import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useListKeyNav } from '@/hooks/useListKeyNav';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Users, Phone, Mail, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { customerService } from '@/services/customerService';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import SearchInput from '@/components/common/SearchInput';
import Table from '@/components/common/Table';
import Pagination from '@/components/common/Pagination';
import Drawer from '@/components/common/Drawer';
import Input from '@/components/common/Input';
import Textarea from '@/components/common/Textarea';
import EmptyState from '@/components/common/EmptyState';
import { formatDate, formatCurrency } from '@/utils/formatters';
import type { Customer } from '@/types';

export default function CustomersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', whatsapp: '', email: '', address: '', notes: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['customers', { search, page }],
    queryFn: () => customerService.getAll({ search: search || undefined, page, limit: 20 }),
  });

  const customers = (data?.data as Customer[]) || [];
  const { searchRef, focusedIndex, handleSearchKeyDown, handleRowKeyDown, setRowRef } = useListKeyNav({
    items: customers,
    onEnter: useCallback((c: Customer) => navigate(`/customers/${c.id}`), [navigate]),
  });

  const createMutation = useMutation({
    mutationFn: customerService.create,
    onSuccess: () => { toast.success('Customer added!'); setShowModal(false); qc.invalidateQueries({ queryKey: ['customers'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to save'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => customerService.update(id, payload),
    onSuccess: () => { toast.success('Customer updated!'); setShowModal(false); qc.invalidateQueries({ queryKey: ['customers'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update'),
  });

  const openAdd = () => {
    setEditCustomer(null);
    setForm({ name: '', phone: '', whatsapp: '', email: '', address: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (c: Customer) => {
    setEditCustomer(c);
    setForm({ name: c.name, phone: c.phone || '', whatsapp: c.whatsapp || '', email: c.email || '', address: c.address || '', notes: c.notes || '' });
    setShowModal(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (editCustomer) {
      updateMutation.mutate({ id: editCustomer.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Customer',
      render: (c: Customer) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gold-700/20 border border-gold-700/30 flex items-center justify-center flex-shrink-0">
            <span className="text-gold-400 text-sm font-semibold">{c.name.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <p className="font-medium text-charcoal-50">{c.name}</p>
            {c.email && <p className="text-xs text-charcoal-200">{c.email}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Contact',
      render: (c: Customer) => (
        <div>
          {c.phone && <p className="text-sm text-charcoal-100">{c.phone}</p>}
          {c.whatsapp && c.whatsapp !== c.phone && <p className="text-xs text-green-400">WA: {c.whatsapp}</p>}
        </div>
      ),
    },
    {
      key: 'totalRentals',
      header: 'Rentals',
      render: (c: Customer) => (
        <div>
          <span className="text-charcoal-50 font-medium">{c.total_rentals || 0}</span>
          {(c.active_rentals || 0) > 0 && (
            <span className="ml-1 text-xs text-amber-400">({c.active_rentals} active)</span>
          )}
        </div>
      ),
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      render: (c: Customer) => (
        <span className={(c.outstanding_fines || 0) > 0 ? 'text-red-400 font-medium' : 'text-charcoal-200'}>
          {(c.outstanding_fines || 0) > 0 ? formatCurrency(c.outstanding_fines) : '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Joined',
      render: (c: Customer) => <span className="text-charcoal-200 text-xs">{formatDate(c.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (c: Customer) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="text-xs text-charcoal-200 hover:text-gold-400 px-2 py-1 rounded transition-colors">Edit</button>
          <ChevronRight size={14} className="text-charcoal-300" />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">Customers</h2>
          <p className="text-charcoal-200 text-sm">{data?.pagination?.total || 0} total customers</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={openAdd}>Add Customer</Button>
      </div>

      <Card>
        <SearchInput
          ref={searchRef}
          autoFocus
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search by name, phone, or email..."
        />
      </Card>

      <Card padding="none">
        <Table
          columns={columns}
          data={customers}
          loading={isLoading}
          rowKey={(c) => c.id}
          onRowClick={(c) => navigate(`/customers/${c.id}`)}
          emptyMessage="No customers found"
          focusedIndex={focusedIndex}
          onRowKeyDown={handleRowKeyDown}
          setRowRef={setRowRef}
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

      <Drawer
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editCustomer ? 'Edit Customer' : 'Add Customer'}
       
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit} loading={createMutation.isPending || updateMutation.isPending}>
              {editCustomer ? 'Save Changes' : 'Add Customer'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Customer name" required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+60123456789" />
            <Input label="WhatsApp" type="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+60123456789" />
          </div>
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="customer@email.com" />
          <Textarea label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full address..." rows={2} />
          <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes..." rows={2} />
        </div>
      </Drawer>
    </div>
  );
}
