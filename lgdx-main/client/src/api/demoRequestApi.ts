import api from './index';

export interface DemoRequestData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  message?: string;
}

export const submitDemoRequest = (data: DemoRequestData) =>
  api.post<{ message: string }>('/marketplace/demo-request', data);
