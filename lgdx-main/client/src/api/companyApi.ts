import { CompanyRole } from '../types';
import api from '../api';

export const updateCompanyRoles = (data: {
  companyId: string;
  roles: CompanyRole[];
}) =>
  api.put(`/company/${data.companyId}/roles`, { roles: data.roles }).then(({ data }) => data)