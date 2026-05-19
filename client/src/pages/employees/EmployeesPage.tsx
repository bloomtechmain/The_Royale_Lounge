import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase, Plus, ChevronLeft, ChevronRight,
  Check, X, Calendar, Users, ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { hrService } from '@/services/hrService';
import { useAuthStore } from '@/store/authStore';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Drawer from '@/components/common/Drawer';
import Badge from '@/components/common/Badge';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cn } from '@/utils/cn';

const LEAVE_TYPES = ['annual', 'sick', 'casual', 'unpaid'];
const LEAVE_COLORS: Record<string, string> = {
  annual:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  sick:    'bg-red-500/20 text-red-300 border-red-500/30',
  casual:  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  unpaid:  'bg-charcoal-500/50 text-charcoal-200 border-charcoal-400',
};
const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-amber-500/20 text-amber-300 border-amber-500/30',
  approved:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  rejected:  'bg-red-500/20 text-red-300 border-red-500/30',
  cancelled: 'bg-charcoal-500/40 text-charcoal-300 border-charcoal-400',
};
const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', manager: 'Manager', cashier: 'Cashier', inventory_staff: 'Staff',
};

function daysBetween(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
}

// ─── Compact Leave Calendar ───────────────────────────────────────────────────
function LeaveCalendar({ isManager }: { isManager: boolean }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [hoverDay, setHoverDay] = useState<string | null>(null);

  const { data: calData = [] } = useQuery({
    queryKey: ['leave-calendar', year, month],
    queryFn: () => hrService.getLeaveCalendar(year, month),
  });

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // Start on Monday: 0=Mon ... 6=Sun
  const startOffset = (firstDay.getDay() + 6) % 7;

  // Build a map: dateStr -> list of leaves
  const leaveMap: Record<string, any[]> = {};
  for (const leave of calData) {
    const s = new Date(leave.start_date);
    const e = new Date(leave.end_date);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      if (!leaveMap[key]) leaveMap[key] = [];
      leaveMap[key].push(leave);
    }
  }

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayStr = today.toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-charcoal-600 text-charcoal-200 transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="font-semibold text-charcoal-50">{monthName}</span>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-charcoal-600 text-charcoal-200 transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
          <div key={d} className="text-center text-xs text-charcoal-300 font-medium py-1">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const leaves = leaveMap[dateStr] || [];
          const isToday = dateStr === todayStr;
          return (
            <div
              key={dateStr}
              className={cn(
                'relative min-h-[52px] rounded-lg border p-1 transition-colors',
                isToday ? 'border-gold-600/50 bg-gold-700/10' : 'border-charcoal-600',
                leaves.length > 0 && 'cursor-pointer hover:border-charcoal-400'
              )}
              onMouseEnter={() => leaves.length && setHoverDay(dateStr)}
              onMouseLeave={() => setHoverDay(null)}
            >
              <span className={cn(
                'text-xs font-medium block text-center mb-1',
                isToday ? 'text-gold-400' : 'text-charcoal-200'
              )}>{day}</span>
              <div className="space-y-0.5">
                {leaves.slice(0, 2).map((l: any, li: number) => (
                  <div
                    key={li}
                    className={cn(
                      'text-[9px] font-medium px-1 py-0.5 rounded truncate border',
                      l.status === 'approved'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    )}
                  >
                    {isManager ? (l.employee_name?.split(' ')[0] || '?') : l.leave_type.slice(0,3).toUpperCase()}
                  </div>
                ))}
                {leaves.length > 2 && (
                  <div className="text-[9px] text-charcoal-300 text-center">+{leaves.length - 2}</div>
                )}
              </div>

              {/* Hover tooltip */}
              {hoverDay === dateStr && leaves.length > 0 && (
                <div className="absolute z-50 top-full left-0 mt-1 bg-charcoal-800 border border-charcoal-500 rounded-xl shadow-2xl p-2 min-w-[160px]">
                  {leaves.map((l: any, li: number) => (
                    <div key={li} className="text-xs py-1 border-b border-charcoal-600 last:border-0">
                      <p className="font-medium text-charcoal-50">{isManager ? l.employee_name : l.leave_type}</p>
                      <p className="text-charcoal-300">{l.leave_type} · <span className={l.status === 'approved' ? 'text-emerald-400' : 'text-amber-400'}>{l.status}</span></p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-charcoal-300">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/40 inline-block" /> Approved</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/40 inline-block" /> Pending</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EmployeesPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isMgr = user?.role === 'super_admin' || user?.role === 'manager';

  const tabs = isMgr
    ? [{ id: 'team', label: 'Team', icon: Users }, { id: 'leaves', label: 'Leaves', icon: ClipboardList }, { id: 'calendar', label: 'Calendar', icon: Calendar }]
    : [{ id: 'leaves', label: 'My Leaves', icon: ClipboardList }, { id: 'calendar', label: 'Calendar', icon: Calendar }];

  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const [profileDrawer, setProfileDrawer] = useState<any | null>(null);
  const [profileForm, setProfileForm] = useState<Record<string, string>>({});
  const [leaveDrawer, setLeaveDrawer] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveType: 'annual', startDate: '', endDate: '', reason: '' });
  const [reviewDrawer, setReviewDrawer] = useState<any | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Data queries
  const { data: employees, isLoading: empLoading } = useQuery({
    queryKey: ['hr-employees'],
    queryFn: () => hrService.getEmployees({ limit: 100 }),
    enabled: isMgr,
  });

  const { data: leaves, isLoading: leavesLoading } = useQuery({
    queryKey: ['hr-leaves', statusFilter],
    queryFn: () => hrService.getLeaves({ status: statusFilter || undefined, limit: 100 }),
  });

  // Mutations
  const upsertProfile = useMutation({
    mutationFn: ({ id, form }: any) => hrService.upsertProfile(id, form),
    onSuccess: () => { toast.success('Profile saved'); setProfileDrawer(null); qc.invalidateQueries({ queryKey: ['hr-employees'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const applyLeave = useMutation({
    mutationFn: hrService.applyLeave,
    onSuccess: () => { toast.success('Leave request submitted'); setLeaveDrawer(false); setLeaveForm({ leaveType: 'annual', startDate: '', endDate: '', reason: '' }); qc.invalidateQueries({ queryKey: ['hr-leaves'] }); qc.invalidateQueries({ queryKey: ['leave-calendar'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const reviewLeave = useMutation({
    mutationFn: ({ id, status }: any) => hrService.reviewLeave(id, { status, reviewNote }),
    onSuccess: () => { toast.success('Leave updated'); setReviewDrawer(null); setReviewNote(''); qc.invalidateQueries({ queryKey: ['hr-leaves'] }); qc.invalidateQueries({ queryKey: ['leave-calendar'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const cancelLeave = useMutation({
    mutationFn: hrService.cancelLeave,
    onSuccess: () => { toast.success('Leave cancelled'); qc.invalidateQueries({ queryKey: ['hr-leaves'] }); qc.invalidateQueries({ queryKey: ['leave-calendar'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const openProfileDrawer = (emp: any) => {
    setProfileDrawer(emp);
    setProfileForm({
      department: emp.department || '',
      designation: emp.designation || '',
      baseSalary: emp.base_salary || '',
      joinDate: emp.join_date?.split('T')[0] || '',
      address: emp.address || '',
      emergencyContact: emp.emergency_contact || '',
      notes: emp.notes || '',
    });
  };

  const leaveDays = leaveForm.startDate && leaveForm.endDate ? daysBetween(leaveForm.startDate, leaveForm.endDate) : 0;
  const pendingCount = (leaves?.data || []).filter((l: any) => l.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gold-700/20"><Briefcase size={22} className="text-gold-400" /></div>
          <div>
            <h1 className="page-title">Employees</h1>
            <p className="text-sm text-charcoal-200">{isMgr ? 'Team management, leaves & calendar' : 'Your leaves & calendar'}</p>
          </div>
        </div>
        {!isMgr && activeTab === 'leaves' && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setLeaveDrawer(true)}>Apply for Leave</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-charcoal-700/50 p-1 rounded-xl w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === id ? 'bg-charcoal-600 text-charcoal-50 shadow-sm' : 'text-charcoal-200 hover:text-charcoal-50'
            )}
          >
            <Icon size={15} />
            {label}
            {id === 'leaves' && pendingCount > 0 && (
              <span className="bg-amber-500 text-charcoal-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Team Tab ── */}
      {activeTab === 'team' && (
        <Card>
          {empLoading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-charcoal-600 rounded-xl animate-pulse" />)}</div>
          ) : (employees?.data || []).length === 0 ? (
            <p className="text-sm text-charcoal-200 text-center py-10">No employees yet. Users created in Settings will appear here.</p>
          ) : (
            <div className="space-y-2">
              {(employees?.data || []).map((emp: any) => (
                <motion.div
                  key={emp.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-4 p-3 rounded-xl bg-charcoal-700/50 hover:bg-charcoal-700 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-gold-700/30 border border-gold-700/50 flex items-center justify-center flex-shrink-0">
                    <span className="text-gold-400 font-semibold text-sm">{emp.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-charcoal-50">{emp.name}</p>
                      <span className="text-xs bg-charcoal-600 text-charcoal-200 px-2 py-0.5 rounded-full">{ROLE_LABELS[emp.role] || emp.role}</span>
                    </div>
                    <p className="text-xs text-charcoal-300">
                      {[emp.designation, emp.department].filter(Boolean).join(' · ') || 'No profile yet'}
                      {emp.join_date && <span className="ml-2 text-charcoal-400">Joined {formatDate(emp.join_date)}</span>}
                    </p>
                  </div>
                  {emp.base_salary && (
                    <span className="text-sm font-semibold text-gold-400 flex-shrink-0">{formatCurrency(parseFloat(emp.base_salary))}</span>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => openProfileDrawer(emp)}>Edit Profile</Button>
                </motion.div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Leaves Tab ── */}
      {activeTab === 'leaves' && (
        <div className="space-y-4">
          {/* Manager header + filters */}
          {isMgr ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1.5">
                {['', 'pending', 'approved', 'rejected'].map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      statusFilter === s
                        ? 'bg-gold-gradient text-charcoal-900'
                        : 'bg-charcoal-600 text-charcoal-200 hover:bg-charcoal-500'
                    )}
                  >
                    {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setLeaveDrawer(true)}>Apply for Leave</Button>
            </div>
          )}

          <Card>
            {leavesLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-charcoal-600 rounded-xl animate-pulse" />)}</div>
            ) : (leaves?.data || []).length === 0 ? (
              <p className="text-sm text-charcoal-200 text-center py-10">
                {isMgr ? 'No leave requests found' : 'No leave requests. Click "Apply for Leave" to submit one.'}
              </p>
            ) : (
              <div className="space-y-2">
                {(leaves?.data || []).map((leave: any) => (
                  <motion.div
                    key={leave.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-charcoal-700/50 hover:bg-charcoal-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      {isMgr && <p className="text-sm font-medium text-charcoal-50 mb-0.5">{leave.employee_name}</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', LEAVE_COLORS[leave.leave_type])}>
                          {leave.leave_type}
                        </span>
                        <span className="text-xs text-charcoal-200">
                          {formatDate(leave.start_date)} → {formatDate(leave.end_date)}
                          <span className="ml-1 text-charcoal-300">({daysBetween(leave.start_date, leave.end_date)}d)</span>
                        </span>
                      </div>
                      {leave.reason && <p className="text-xs text-charcoal-300 mt-0.5 truncate">{leave.reason}</p>}
                      {leave.review_note && <p className="text-xs text-charcoal-400 mt-0.5 italic">Note: {leave.review_note}</p>}
                    </div>
                    <span className={cn('text-xs px-2 py-1 rounded-full border font-medium flex-shrink-0', STATUS_COLORS[leave.status])}>
                      {leave.status}
                    </span>
                    {isMgr && leave.status === 'pending' && (
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => { setReviewDrawer({ ...leave, action: 'approved' }); }}
                          className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                          title="Approve"
                        ><Check size={14} /></button>
                        <button
                          onClick={() => { setReviewDrawer({ ...leave, action: 'rejected' }); }}
                          className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                          title="Reject"
                        ><X size={14} /></button>
                      </div>
                    )}
                    {!isMgr && leave.status === 'pending' && (
                      <button
                        onClick={() => cancelLeave.mutate(leave.id)}
                        className="text-xs text-charcoal-300 hover:text-red-400 transition-colors flex-shrink-0"
                      >Cancel</button>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Calendar Tab ── */}
      {activeTab === 'calendar' && (
        <Card><LeaveCalendar isManager={isMgr} /></Card>
      )}

      {/* ── Employee Profile Drawer ── */}
      <Drawer
        open={!!profileDrawer}
        onClose={() => setProfileDrawer(null)}
        title={`Edit Profile — ${profileDrawer?.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setProfileDrawer(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={upsertProfile.isPending}
              onClick={() => upsertProfile.mutate({ id: profileDrawer?.id, form: profileForm })}
            >Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Department" value={profileForm.department || ''} onChange={e => setProfileForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Sales" />
            <Input label="Designation" value={profileForm.designation || ''} onChange={e => setProfileForm(f => ({ ...f, designation: e.target.value }))} placeholder="e.g. Senior Cashier" />
            <Input label="Base Salary (LKR)" type="number" min="0" value={profileForm.baseSalary || ''} onChange={e => setProfileForm(f => ({ ...f, baseSalary: e.target.value }))} placeholder="0.00" />
            <Input label="Join Date" type="date" value={profileForm.joinDate || ''} onChange={e => setProfileForm(f => ({ ...f, joinDate: e.target.value }))} />
          </div>
          <Input label="Address" value={profileForm.address || ''} onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))} placeholder="Home address" />
          <Input label="Emergency Contact" value={profileForm.emergencyContact || ''} onChange={e => setProfileForm(f => ({ ...f, emergencyContact: e.target.value }))} placeholder="Name & phone" />
          <Input label="Notes" value={profileForm.notes || ''} onChange={e => setProfileForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes..." />
        </div>
      </Drawer>

      {/* ── Apply for Leave Drawer ── */}
      <Drawer
        open={leaveDrawer}
        onClose={() => setLeaveDrawer(false)}
        title="Apply for Leave"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaveDrawer(false)}>Cancel</Button>
            <Button variant="primary" loading={applyLeave.isPending} onClick={() => applyLeave.mutate(leaveForm as any)}>Submit Request</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-charcoal-200 mb-1.5">Leave Type</label>
            <select
              value={leaveForm.leaveType}
              onChange={e => setLeaveForm(f => ({ ...f, leaveType: e.target.value }))}
              className="w-full bg-charcoal-700 border border-charcoal-500 rounded-xl px-3 py-2.5 text-sm text-charcoal-100 focus:ring-2 focus:ring-gold-600 outline-none"
            >
              {LEAVE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)} Leave</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Start Date" type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, startDate: e.target.value }))} />
            <Input label="End Date" type="date" value={leaveForm.endDate} min={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, endDate: e.target.value }))} />
          </div>
          {leaveDays > 0 && (
            <p className="text-sm text-gold-400 font-medium">{leaveDays} day{leaveDays !== 1 ? 's' : ''} selected</p>
          )}
          <Input label="Reason (optional)" value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))} placeholder="Brief reason..." />
        </div>
      </Drawer>

      {/* ── Review Leave Drawer ── */}
      <Drawer
        open={!!reviewDrawer}
        onClose={() => { setReviewDrawer(null); setReviewNote(''); }}
        title={reviewDrawer?.action === 'approved' ? 'Approve Leave' : 'Reject Leave'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setReviewDrawer(null); setReviewNote(''); }}>Cancel</Button>
            <Button
              variant={reviewDrawer?.action === 'approved' ? 'primary' : 'secondary'}
              loading={reviewLeave.isPending}
              onClick={() => reviewLeave.mutate({ id: reviewDrawer?.id, status: reviewDrawer?.action })}
              className={reviewDrawer?.action === 'rejected' ? 'bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30' : ''}
            >
              {reviewDrawer?.action === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </>
        }
      >
        {reviewDrawer && (
          <div className="space-y-4">
            <div className="p-4 bg-charcoal-700/50 rounded-xl space-y-2 text-sm">
              <p><span className="text-charcoal-300">Employee:</span> <span className="text-charcoal-50 font-medium">{reviewDrawer.employee_name}</span></p>
              <p><span className="text-charcoal-300">Type:</span> <span className="text-charcoal-50 capitalize">{reviewDrawer.leave_type}</span></p>
              <p><span className="text-charcoal-300">Dates:</span> <span className="text-charcoal-50">{formatDate(reviewDrawer.start_date)} → {formatDate(reviewDrawer.end_date)} ({daysBetween(reviewDrawer.start_date, reviewDrawer.end_date)}d)</span></p>
              {reviewDrawer.reason && <p><span className="text-charcoal-300">Reason:</span> <span className="text-charcoal-50">{reviewDrawer.reason}</span></p>}
            </div>
            <Input
              label="Note (optional)"
              value={reviewNote}
              onChange={e => setReviewNote(e.target.value)}
              placeholder="Add a note for the employee..."
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}
