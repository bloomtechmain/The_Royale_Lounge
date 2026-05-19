import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Banknote, RefreshCw, CheckCircle, Users, TrendingUp, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { hrService } from '@/services/hrService';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import StatCard from '@/components/common/StatCard';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cn } from '@/utils/cn';

const STATUS_STYLES: Record<string, string> = {
  draft:     'bg-charcoal-500/40 text-charcoal-300 border-charcoal-400',
  processed: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  paid:      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Admin', manager: 'Manager', cashier: 'Cashier', inventory_staff: 'Staff',
};

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Inline editable cell
function EditableCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    setEditing(false);
    const num = parseFloat(val) || 0;
    if (num !== value) onSave(num);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        type="number"
        min="0"
        step="0.01"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-24 bg-charcoal-600 border border-gold-600 rounded-lg px-2 py-1 text-xs text-charcoal-100 focus:outline-none"
      />
    );
  }
  return (
    <button
      onClick={() => { setEditing(true); setVal(String(value)); }}
      className="text-sm text-charcoal-100 hover:text-gold-400 transition-colors underline decoration-dotted underline-offset-2"
      title="Click to edit"
    >
      {formatCurrency(value)}
    </button>
  );
}

export default function PayrollPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());

  const { data: payrollData, isLoading } = useQuery({
    queryKey: ['payroll', period],
    queryFn: () => hrService.getPayroll(period),
  });

  const generateMutation = useMutation({
    mutationFn: () => hrService.generatePayroll(period),
    onSuccess: (data) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['payroll'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: any) => hrService.updatePayrollRecord(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update'),
  });

  const markPaidMutation = useMutation({
    mutationFn: hrService.markPaid,
    onSuccess: () => { toast.success('Marked as paid'); qc.invalidateQueries({ queryKey: ['payroll'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const bulkPaidMutation = useMutation({
    mutationFn: () => hrService.bulkMarkPaid(period),
    onSuccess: (data) => { toast.success(data.message); qc.invalidateQueries({ queryKey: ['payroll'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const rows: any[] = payrollData?.data || [];
  const summary = payrollData?.summary || {};
  const hasRecords = rows.some((r: any) => r.payroll_id);
  const allPaid = hasRecords && rows.filter((r: any) => r.payroll_id).every((r: any) => r.status === 'paid');
  const outstanding = (summary.totalPayroll || 0) - (summary.totalPaid || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gold-700/20"><Banknote size={22} className="text-gold-400" /></div>
          <div>
            <h1 className="page-title">Payroll</h1>
            <p className="text-sm text-charcoal-200">Monthly salary management</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="bg-charcoal-700 border border-charcoal-500 rounded-xl px-3 py-2 text-sm text-charcoal-100 focus:ring-2 focus:ring-gold-600 outline-none"
          />
          {!hasRecords ? (
            <Button
              variant="primary"
              icon={<RefreshCw size={15} />}
              loading={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              Generate Payroll
            </Button>
          ) : !allPaid && (
            <Button
              variant="secondary"
              icon={<CheckCircle size={15} />}
              loading={bulkPaidMutation.isPending}
              onClick={() => { if (window.confirm('Mark all employees as paid for this period?')) bulkPaidMutation.mutate(); }}
            >
              Pay All
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Payroll" value={formatCurrency(summary.totalPayroll || 0)} icon={<TrendingUp size={20} />} color="gold" loading={isLoading} />
        <StatCard title="Total Paid" value={formatCurrency(summary.totalPaid || 0)} icon={<CheckCircle size={20} />} color="green" loading={isLoading} />
        <StatCard title="Outstanding" value={formatCurrency(outstanding)} icon={<Clock size={20} />} color={outstanding > 0 ? 'red' : 'green'} loading={isLoading} />
        <StatCard title="Employees" value={summary.employeeCount || 0} icon={<Users size={20} />} color="blue" loading={isLoading} />
      </div>

      {/* Payroll table */}
      <Card>
        {isLoading ? (
          <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-14 bg-charcoal-600 rounded-xl animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-charcoal-200 text-center py-10">No employees found. Add users in Settings first.</p>
        ) : !hasRecords ? (
          <div className="text-center py-10 space-y-3">
            <p className="text-charcoal-200 text-sm">No payroll generated for {period} yet.</p>
            <p className="text-charcoal-300 text-xs">Click "Generate Payroll" to create records for all {rows.length} employees.</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[1fr_120px_120px_120px_120px_100px_80px] gap-3 px-3 pb-2 border-b border-charcoal-600 text-xs text-charcoal-300 font-medium">
              <span>Employee</span>
              <span>Base Salary</span>
              <span>Bonuses</span>
              <span>Deductions</span>
              <span>Net Pay</span>
              <span>Status</span>
              <span></span>
            </div>

            <div className="space-y-1 mt-2">
              {rows.map((row: any) => (
                <motion.div
                  key={row.employee_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px_120px_120px_100px_80px] gap-3 items-center px-3 py-3 rounded-xl hover:bg-charcoal-700/50 transition-colors"
                >
                  {/* Employee */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gold-700/30 border border-gold-700/50 flex items-center justify-center flex-shrink-0">
                      <span className="text-gold-400 text-xs font-semibold">{row.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-charcoal-50">{row.name}</p>
                      <p className="text-xs text-charcoal-300">{[ROLE_LABELS[row.role], row.department].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>

                  {/* Base Salary */}
                  <div>
                    <span className="md:hidden text-xs text-charcoal-300 mr-1">Base:</span>
                    <span className="text-sm text-charcoal-100">{formatCurrency(parseFloat(row.base_salary || row.profile_salary || 0))}</span>
                  </div>

                  {/* Bonuses */}
                  <div>
                    <span className="md:hidden text-xs text-charcoal-300 mr-1">Bonuses:</span>
                    {row.payroll_id && row.status !== 'paid' ? (
                      <EditableCell
                        value={parseFloat(row.bonuses || 0)}
                        onSave={v => updateMutation.mutate({ id: row.payroll_id, payload: { bonuses: v } })}
                      />
                    ) : (
                      <span className="text-sm text-charcoal-100">{formatCurrency(parseFloat(row.bonuses || 0))}</span>
                    )}
                  </div>

                  {/* Deductions */}
                  <div>
                    <span className="md:hidden text-xs text-charcoal-300 mr-1">Deductions:</span>
                    {row.payroll_id && row.status !== 'paid' ? (
                      <EditableCell
                        value={parseFloat(row.deductions || 0)}
                        onSave={v => updateMutation.mutate({ id: row.payroll_id, payload: { deductions: v } })}
                      />
                    ) : (
                      <span className="text-sm text-charcoal-100">{formatCurrency(parseFloat(row.deductions || 0))}</span>
                    )}
                  </div>

                  {/* Net Pay */}
                  <div>
                    <span className="md:hidden text-xs text-charcoal-300 mr-1">Net Pay:</span>
                    <span className={cn('text-sm font-semibold', row.payroll_id ? 'text-gold-400' : 'text-charcoal-300')}>
                      {row.payroll_id ? formatCurrency(parseFloat(row.net_pay || 0)) : '—'}
                    </span>
                  </div>

                  {/* Status */}
                  <div>
                    {row.payroll_id ? (
                      <span className={cn('text-xs px-2 py-1 rounded-full border font-medium', STATUS_STYLES[row.status])}>
                        {row.status}
                      </span>
                    ) : (
                      <span className="text-xs text-charcoal-400">no record</span>
                    )}
                  </div>

                  {/* Action */}
                  <div>
                    {row.payroll_id && row.status !== 'paid' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={markPaidMutation.isPending}
                        onClick={() => markPaidMutation.mutate(row.payroll_id)}
                        icon={<CheckCircle size={12} />}
                      >
                        Pay
                      </Button>
                    )}
                    {row.status === 'paid' && row.paid_at && (
                      <span className="text-xs text-charcoal-400">{formatDate(row.paid_at)}</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
