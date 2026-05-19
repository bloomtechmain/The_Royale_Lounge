import api from './api';

export const hrService = {
  // Employees
  getEmployees: async (params?: Record<string, any>) => {
    const { data } = await api.get('/hr/employees', { params });
    return data;
  },
  getEmployee: async (id: string) => {
    const { data } = await api.get(`/hr/employees/${id}`);
    return data;
  },
  upsertProfile: async (userId: string, payload: Record<string, any>) => {
    const { data } = await api.put(`/hr/employees/${userId}/profile`, payload);
    return data;
  },

  // Leaves
  getLeaves: async (params?: Record<string, any>) => {
    const { data } = await api.get('/hr/leaves', { params });
    return data;
  },
  applyLeave: async (payload: { leaveType: string; startDate: string; endDate: string; reason?: string }) => {
    const { data } = await api.post('/hr/leaves', payload);
    return data;
  },
  reviewLeave: async (id: string, payload: { status: 'approved' | 'rejected'; reviewNote?: string }) => {
    const { data } = await api.patch(`/hr/leaves/${id}/review`, payload);
    return data;
  },
  cancelLeave: async (id: string) => {
    const { data } = await api.patch(`/hr/leaves/${id}/cancel`);
    return data;
  },
  getLeaveCalendar: async (year: number, month: number) => {
    const { data } = await api.get('/hr/leaves/calendar', { params: { year, month } });
    return data as any[];
  },

  // Payroll
  getPayroll: async (period?: string) => {
    const { data } = await api.get('/hr/payroll', { params: { period } });
    return data;
  },
  generatePayroll: async (period: string) => {
    const { data } = await api.post(`/hr/payroll/generate/${period}`);
    return data;
  },
  updatePayrollRecord: async (id: string, payload: { bonuses?: number; deductions?: number; notes?: string }) => {
    const { data } = await api.patch(`/hr/payroll/${id}`, payload);
    return data;
  },
  markPaid: async (id: string) => {
    const { data } = await api.patch(`/hr/payroll/${id}/pay`);
    return data;
  },
  bulkMarkPaid: async (period: string) => {
    const { data } = await api.post(`/hr/payroll/pay-all/${period}`);
    return data;
  },
};
