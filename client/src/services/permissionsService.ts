import api from './api';

export type RolePermissionsMap = Record<string, Record<string, { can_read: boolean; can_write: boolean }>>;

export const permissionsService = {
  getAll: async (): Promise<RolePermissionsMap> => {
    const { data } = await api.get('/permissions');
    return data;
  },
  update: async (updates: { role: string; module: string; can_read: boolean; can_write: boolean }[]) => {
    const { data } = await api.put('/permissions', updates);
    return data;
  },
};
