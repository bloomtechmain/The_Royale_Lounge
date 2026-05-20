import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Receipt, Plus, Trash2, ChevronDown, FileDown, Download, Filter,
  Wallet, TrendingDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { analyticsService } from '@/services/analyticsService';
import { reportService } from '@/services/reportService';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import {
  createDoc, loadLogo, addHeader, addFooter,
  addSectionTitle, addStatCards, addTable, captureChart, addChartImage,
} from '@/utils/reportPDF';

// ── Categories ────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  stock_purchase: 'Stock Purchase',
  equipment:      'Equipment',
  rent:           'Rent',
  utilities:      'Utilities',
  salaries:       'Salaries',
  other:          'Other',
};

const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  stock_purchase: '#60a5fa',
  equipment:      '#a78bfa',
  rent:           '#fb923c',
  utilities:      '#facc15',
  salaries:       '#f472b6',
  other:          '#94a3b8',
};

const OWNER_COLOR = '#c9a96e'; // gold

const customTooltipStyle = {
  backgroundColor: '#1a1a26',
  border: '1px solid #2a2a38',
  borderRadius: 8,
  color: '#f4f4f6',
};

function monthLabel(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(parseInt(y), parseInt(mo) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── Shared filter bar ─────────────────────────────────────────────────────────

interface FilterBarProps {
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  category?: string;
  setCategory?: (v: string) => void;
}

function FilterBar({ dateFrom, dateTo, setDateFrom, setDateTo, category, setCategory }: FilterBarProps) {
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-4">
        <Filter size={14} className="text-charcoal-300 mt-auto mb-2.5" />
        <div>
          <label className="block text-xs text-charcoal-200 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="input-dark h-9 px-3 text-sm rounded-xl" />
        </div>
        <div>
          <label className="block text-xs text-charcoal-200 mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="input-dark h-9 px-3 text-sm rounded-xl" />
        </div>
        {setCategory && (
          <div>
            <label className="block text-xs text-charcoal-200 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-charcoal-700 border border-charcoal-500 rounded-xl px-3 h-9 text-sm text-charcoal-100 focus:ring-2 focus:ring-gold-600 outline-none"
            >
              <option value="all">All Categories</option>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Expenses Tab ──────────────────────────────────────────────────────────────

function ExpensesTab() {
  const qc = useQueryClient();
  const thisYear = new Date().getFullYear();
  const [dateFrom, setDateFrom] = useState(`${thisYear}-01-01`);
  const [dateTo,   setDateTo]   = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('all');
  const [showAdd,  setShowAdd]  = useState(false);
  const [addForm,  setAddForm]  = useState({
    amount: '', category: 'stock_purchase', note: '',
    investedAt: new Date().toISOString().split('T')[0],
  });
  const [pdfLoading, setPdfLoading] = useState(false);
  const pieRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const params = {
    fromDate: dateFrom, toDate: dateTo, mode: 'expenses',
    ...(category !== 'all' && { category }),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['expenses-report', 'expenses', dateFrom, dateTo, category],
    queryFn: () => reportService.getExpensesReport(params),
    staleTime: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: analyticsService.addCapital,
    onSuccess: () => {
      toast.success('Expense recorded');
      setShowAdd(false);
      setAddForm({ amount: '', category: 'stock_purchase', note: '', investedAt: new Date().toISOString().split('T')[0] });
      qc.invalidateQueries({ queryKey: ['expenses-report'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: analyticsService.deleteCapital,
    onSuccess: () => {
      toast.success('Expense deleted');
      qc.invalidateQueries({ queryKey: ['expenses-report'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete'),
  });

  const handleAdd = () => {
    if (!addForm.amount || parseFloat(addForm.amount) <= 0) {
      toast.error('Enter a valid amount'); return;
    }
    addMutation.mutate({
      amount: parseFloat(addForm.amount),
      category: addForm.category,
      note: addForm.note || undefined,
      investedAt: addForm.investedAt,
    });
  };

  const exportCSV = () => {
    const list = data?.list;
    if (!list?.length) return;
    const rows = list.map((r: any) => ({
      date: r.invested_at,
      category: EXPENSE_CATEGORY_LABELS[r.category] || r.category,
      note: r.note || '',
      amount: r.amount,
      added_by: r.created_by_name || '',
    }));
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(','), ...rows.map((row: any) => keys.map((k) => `"${row[k] ?? ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `expenses_${dateFrom}_to_${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = async () => {
    setPdfLoading(true);
    try {
      const doc  = createDoc();
      const logo = await loadLogo();
      let y = await addHeader(doc, logo, 'Business Expenses Report', `${dateFrom} — ${dateTo}`);
      const s = data?.summary;
      y = addSectionTitle(doc, 'Summary', y);
      y = addStatCards(doc, [
        { label: 'Total Expenses',  value: formatCurrency(s?.total     ?? 0) },
        { label: 'This Month',      value: formatCurrency(s?.thisMonth ?? 0) },
        { label: 'Total Entries',   value: String(s?.count ?? 0) },
        { label: 'Top Category',    value: s?.topCategory ? (EXPENSE_CATEGORY_LABELS[s.topCategory] || s.topCategory) : '—' },
      ], y);
      if (pieRef.current) {
        y = addSectionTitle(doc, 'Expenses by Category', y);
        const img = await captureChart(pieRef.current);
        if (img) y = await addChartImage(doc, img, y, 60);
      }
      if (data?.byCategory?.length) {
        y = addTable(doc,
          ['Category', 'Total (LKR)', 'Entries'],
          data.byCategory.map((r: any) => [
            EXPENSE_CATEGORY_LABELS[r.category] || r.category,
            formatCurrency(r.total),
            String(r.count),
          ]), y);
      }
      if (barRef.current) {
        y = addSectionTitle(doc, 'Monthly Trend', y);
        const img = await captureChart(barRef.current);
        if (img) y = await addChartImage(doc, img, y, 60);
      }
      if (data?.list?.length) {
        y = addSectionTitle(doc, 'Expense Entries', y);
        addTable(doc,
          ['Date', 'Category', 'Note', 'Amount (LKR)', 'Added By'],
          data.list.slice(0, 100).map((r: any) => [
            formatDate(r.invested_at),
            EXPENSE_CATEGORY_LABELS[r.category] || r.category,
            r.note || '',
            formatCurrency(parseFloat(r.amount)),
            r.created_by_name || '',
          ]), y);
      }
      addFooter(doc);
      doc.save(`expenses_${dateFrom}_to_${dateTo}.pdf`);
    } catch (err: any) {
      toast.error('Failed to generate PDF: ' + err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  const byMonth  = (data?.byMonth ?? []).map((r: any) => ({ ...r, label: monthLabel(r.month) }));
  const summary  = data?.summary;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" icon={<Download size={14} />} onClick={exportCSV}>CSV</Button>
        <Button variant="secondary" size="sm" icon={<FileDown size={14} />} onClick={downloadPDF} loading={pdfLoading}>PDF</Button>
        <Button
          variant="primary" size="sm"
          icon={showAdd ? <ChevronDown size={14} /> : <Plus size={14} />}
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? 'Cancel' : 'Add Expense'}
        </Button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card>
              <h3 className="font-semibold text-charcoal-50 mb-4">New Expense Entry</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Input label="Amount (LKR)" type="number" min="0" step="0.01"
                  value={addForm.amount} onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                  placeholder="e.g. 50000" />
                <div>
                  <label className="block text-xs font-medium text-charcoal-200 mb-1.5">Category</label>
                  <select value={addForm.category} onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                    className="w-full bg-charcoal-700 border border-charcoal-500 rounded-xl px-3 py-2.5 text-sm text-charcoal-100 focus:ring-2 focus:ring-gold-600 focus:border-gold-600 outline-none">
                    {Object.entries(EXPENSE_CATEGORY_LABELS).map(([val, lbl]) => (
                      <option key={val} value={val}>{lbl}</option>
                    ))}
                  </select>
                </div>
                <Input label="Note (optional)" value={addForm.note}
                  onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  placeholder="e.g. Monthly rent payment" />
                <Input label="Date" type="date" value={addForm.investedAt}
                  onChange={(e) => setAddForm({ ...addForm, investedAt: e.target.value })} />
              </div>
              <div className="flex justify-end mt-3">
                <Button variant="primary" onClick={handleAdd} loading={addMutation.isPending}>Save Expense</Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <FilterBar dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
        category={category} setCategory={setCategory} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Expenses', value: formatCurrency(summary?.total     ?? 0), color: 'text-blue-400' },
          { label: 'This Month',     value: formatCurrency(summary?.thisMonth ?? 0), color: 'text-amber-400' },
          { label: 'Total Entries',  value: String(summary?.count ?? 0),              color: 'text-charcoal-50' },
          { label: 'Top Category',   value: summary?.topCategory ? (EXPENSE_CATEGORY_LABELS[summary.topCategory] || summary.topCategory) : '—', color: 'text-charcoal-50' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            {isLoading ? <div className="h-10 bg-charcoal-600 rounded-xl animate-pulse" /> : (
              <>
                <p className="text-xs text-charcoal-200">{label}</p>
                <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
              </>
            )}
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div ref={pieRef}>
          <Card>
            <h3 className="font-semibold text-charcoal-50 mb-4">By Category</h3>
            {isLoading ? <div className="h-48 bg-charcoal-600 rounded-xl animate-pulse" /> :
              data?.byCategory?.length ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie data={data.byCategory} dataKey="total" nameKey="category"
                        cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
                        {data.byCategory.map((entry: any) => (
                          <Cell key={entry.category} fill={EXPENSE_CATEGORY_COLORS[entry.category] || '#94a3b8'} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={customTooltipStyle}
                        formatter={(v: number, name: string) => [formatCurrency(v), EXPENSE_CATEGORY_LABELS[name] || name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {data.byCategory.map((entry: any) => (
                      <div key={entry.category} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ background: EXPENSE_CATEGORY_COLORS[entry.category] || '#94a3b8' }} />
                          <span className="text-charcoal-200 text-xs">{EXPENSE_CATEGORY_LABELS[entry.category] || entry.category}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium text-charcoal-50">{formatCurrency(entry.total)}</p>
                          <p className="text-xs text-charcoal-300">{entry.count} entries</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div className="h-40 flex items-center justify-center text-charcoal-200 text-sm">No data</div>
            }
          </Card>
        </div>

        <div ref={barRef}>
          <Card>
            <h3 className="font-semibold text-charcoal-50 mb-4">Monthly Trend</h3>
            {isLoading ? <div className="h-48 bg-charcoal-600 rounded-xl animate-pulse" /> :
              byMonth.length ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={byMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#7a7a8c', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#7a7a8c', fontSize: 11 }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                    <Tooltip contentStyle={customTooltipStyle} formatter={(v: number) => [formatCurrency(v), 'Expenses']} />
                    <Bar dataKey="total" fill="#60a5fa" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-40 flex items-center justify-center text-charcoal-200 text-sm">No data</div>
            }
          </Card>
        </div>
      </div>

      {/* List */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-charcoal-50">
            Expense Entries
            {summary?.count ? <span className="ml-2 text-xs text-charcoal-300 font-normal">({summary.count} total)</span> : null}
          </h3>
        </div>
        {isLoading ? (
          <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-14 bg-charcoal-600 rounded-xl animate-pulse" />)}</div>
        ) : data?.list?.length ? (
          <div className="space-y-2">
            {data.list.map((inv: any) => (
              <motion.div key={inv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-charcoal-700/50 hover:bg-charcoal-700 transition-colors">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: EXPENSE_CATEGORY_COLORS[inv.category] || '#94a3b8' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: `${EXPENSE_CATEGORY_COLORS[inv.category] || '#94a3b8'}22`, color: EXPENSE_CATEGORY_COLORS[inv.category] || '#94a3b8' }}>
                      {EXPENSE_CATEGORY_LABELS[inv.category] || inv.category}
                    </span>
                    {inv.note && <span className="text-xs text-charcoal-200 truncate">{inv.note}</span>}
                  </div>
                  <p className="text-xs text-charcoal-300 mt-0.5">
                    {formatDate(inv.invested_at)}
                    {inv.created_by_name && <span className="ml-2">by {inv.created_by_name}</span>}
                  </p>
                </div>
                <span className="text-sm font-semibold text-blue-400 flex-shrink-0">{formatCurrency(parseFloat(inv.amount))}</span>
                <button onClick={() => { if (window.confirm('Delete this expense?')) deleteMutation.mutate(inv.id); }}
                  className="text-charcoal-300 hover:text-red-400 transition-colors flex-shrink-0 p-1">
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-charcoal-200 text-center py-12">
            No expenses recorded for this period.
            <br /><span className="text-xs text-charcoal-300">Add an expense using the button above.</span>
          </p>
        )}
      </Card>
    </div>
  );
}

// ── Owner Contributions Tab ───────────────────────────────────────────────────

function OwnerContributionsTab() {
  const qc = useQueryClient();
  const thisYear = new Date().getFullYear();
  const [dateFrom, setDateFrom] = useState(`${thisYear}-01-01`);
  const [dateTo,   setDateTo]   = useState(new Date().toISOString().split('T')[0]);
  const [showAdd,  setShowAdd]  = useState(false);
  const [addForm,  setAddForm]  = useState({
    amount: '', note: '', investedAt: new Date().toISOString().split('T')[0],
  });
  const [pdfLoading, setPdfLoading] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const params = { fromDate: dateFrom, toDate: dateTo, mode: 'owner' };

  const { data, isLoading } = useQuery({
    queryKey: ['expenses-report', 'owner', dateFrom, dateTo],
    queryFn: () => reportService.getExpensesReport(params),
    staleTime: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: analyticsService.addCapital,
    onSuccess: () => {
      toast.success('Contribution recorded');
      setShowAdd(false);
      setAddForm({ amount: '', note: '', investedAt: new Date().toISOString().split('T')[0] });
      qc.invalidateQueries({ queryKey: ['expenses-report'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: analyticsService.deleteCapital,
    onSuccess: () => {
      toast.success('Contribution deleted');
      qc.invalidateQueries({ queryKey: ['expenses-report'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete'),
  });

  const handleAdd = () => {
    if (!addForm.amount || parseFloat(addForm.amount) <= 0) {
      toast.error('Enter a valid amount'); return;
    }
    addMutation.mutate({
      amount: parseFloat(addForm.amount),
      category: 'owner_contribution',
      note: addForm.note || undefined,
      investedAt: addForm.investedAt,
    });
  };

  const exportCSV = () => {
    const list = data?.list;
    if (!list?.length) return;
    const rows = list.map((r: any) => ({
      date: r.invested_at,
      note: r.note || '',
      amount: r.amount,
      added_by: r.created_by_name || '',
    }));
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(','), ...rows.map((row: any) => keys.map((k) => `"${row[k] ?? ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `owner_contributions_${dateFrom}_to_${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = async () => {
    setPdfLoading(true);
    try {
      const doc  = createDoc();
      const logo = await loadLogo();
      let y = await addHeader(doc, logo, 'Owner Capital Contributions', `${dateFrom} — ${dateTo}`);
      const s = data?.summary;
      y = addSectionTitle(doc, 'Summary', y);
      y = addStatCards(doc, [
        { label: 'Total Contributed', value: formatCurrency(s?.total     ?? 0) },
        { label: 'This Month',        value: formatCurrency(s?.thisMonth ?? 0) },
        { label: 'Total Entries',     value: String(s?.count ?? 0) },
      ], y);
      if (barRef.current) {
        y = addSectionTitle(doc, 'Monthly Trend', y);
        const img = await captureChart(barRef.current);
        if (img) y = await addChartImage(doc, img, y, 60);
      }
      if (data?.list?.length) {
        y = addSectionTitle(doc, 'Contribution Entries', y);
        addTable(doc,
          ['Date', 'Note', 'Amount (LKR)', 'Recorded By'],
          data.list.slice(0, 100).map((r: any) => [
            formatDate(r.invested_at),
            r.note || '',
            formatCurrency(parseFloat(r.amount)),
            r.created_by_name || '',
          ]), y);
      }
      addFooter(doc);
      doc.save(`owner_contributions_${dateFrom}_to_${dateTo}.pdf`);
    } catch (err: any) {
      toast.error('Failed to generate PDF: ' + err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  const byMonth  = (data?.byMonth ?? []).map((r: any) => ({ ...r, label: monthLabel(r.month) }));
  const summary  = data?.summary;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" icon={<Download size={14} />} onClick={exportCSV}>CSV</Button>
        <Button variant="secondary" size="sm" icon={<FileDown size={14} />} onClick={downloadPDF} loading={pdfLoading}>PDF</Button>
        <Button
          variant="primary" size="sm"
          icon={showAdd ? <ChevronDown size={14} /> : <Plus size={14} />}
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? 'Cancel' : 'Add Contribution'}
        </Button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card className="border border-gold-700/30">
              <div className="flex items-center gap-2 mb-4">
                <Wallet size={16} className="text-gold-400" />
                <h3 className="font-semibold text-charcoal-50">New Owner Capital Contribution</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input label="Amount (LKR)" type="number" min="0" step="0.01"
                  value={addForm.amount} onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                  placeholder="e.g. 500000" />
                <Input label="Note (optional)" value={addForm.note}
                  onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  placeholder="e.g. Initial capital injection" />
                <Input label="Date" type="date" value={addForm.investedAt}
                  onChange={(e) => setAddForm({ ...addForm, investedAt: e.target.value })} />
              </div>
              <div className="flex justify-end mt-3">
                <Button variant="primary" onClick={handleAdd} loading={addMutation.isPending}>Save Contribution</Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <FilterBar dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Contributed', value: formatCurrency(summary?.total     ?? 0), color: 'text-gold-400' },
          { label: 'This Month',        value: formatCurrency(summary?.thisMonth ?? 0), color: 'text-amber-400' },
          { label: 'Total Entries',     value: String(summary?.count ?? 0),              color: 'text-charcoal-50' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            {isLoading ? <div className="h-10 bg-charcoal-600 rounded-xl animate-pulse" /> : (
              <>
                <p className="text-xs text-charcoal-200">{label}</p>
                <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
              </>
            )}
          </Card>
        ))}
      </div>

      {/* Monthly Bar */}
      <div ref={barRef}>
        <Card>
          <h3 className="font-semibold text-charcoal-50 mb-4">Monthly Contributions</h3>
          {isLoading ? <div className="h-48 bg-charcoal-600 rounded-xl animate-pulse" /> :
            byMonth.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#7a7a8c', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#7a7a8c', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip contentStyle={customTooltipStyle} formatter={(v: number) => [formatCurrency(v), 'Contribution']} />
                  <Bar dataKey="total" fill={OWNER_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-40 flex items-center justify-center text-charcoal-200 text-sm">No contributions recorded for this period</div>
          }
        </Card>
      </div>

      {/* List */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-charcoal-50">
            Contribution Entries
            {summary?.count ? <span className="ml-2 text-xs text-charcoal-300 font-normal">({summary.count} total)</span> : null}
          </h3>
        </div>
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 bg-charcoal-600 rounded-xl animate-pulse" />)}</div>
        ) : data?.list?.length ? (
          <div className="space-y-2">
            {data.list.map((inv: any) => (
              <motion.div key={inv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-charcoal-700/50 hover:bg-charcoal-700 transition-colors">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: OWNER_COLOR }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: `${OWNER_COLOR}22`, color: OWNER_COLOR }}>
                      Owner Contribution
                    </span>
                    {inv.note && <span className="text-xs text-charcoal-200 truncate">{inv.note}</span>}
                  </div>
                  <p className="text-xs text-charcoal-300 mt-0.5">
                    {formatDate(inv.invested_at)}
                    {inv.created_by_name && <span className="ml-2">by {inv.created_by_name}</span>}
                  </p>
                </div>
                <span className="text-sm font-semibold text-gold-400 flex-shrink-0">{formatCurrency(parseFloat(inv.amount))}</span>
                <button onClick={() => { if (window.confirm('Delete this contribution?')) deleteMutation.mutate(inv.id); }}
                  className="text-charcoal-300 hover:text-red-400 transition-colors flex-shrink-0 p-1">
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-charcoal-200 text-center py-12">
            No contributions recorded for this period.
            <br /><span className="text-xs text-charcoal-300">Add a contribution using the button above.</span>
          </p>
        )}
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'expenses',     label: 'Business Expenses',     icon: TrendingDown },
  { key: 'owner',        label: 'Owner Contributions',   icon: Wallet },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function ExpensesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('expenses');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/20">
            <Receipt size={22} className="text-blue-400" />
          </div>
          <div>
            <h1 className="page-title">Expenses</h1>
            <p className="text-sm text-charcoal-200">Track business expenses and owner capital contributions</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-charcoal-800 rounded-2xl w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
              activeTab === key
                ? 'bg-charcoal-600 text-charcoal-50 shadow'
                : 'text-charcoal-300 hover:text-charcoal-100',
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'expenses' && <ExpensesTab />}
          {activeTab === 'owner'    && <OwnerContributionsTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
