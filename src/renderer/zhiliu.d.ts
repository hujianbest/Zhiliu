import type { ZhiliuApi } from '../shared/api';

declare global {
  interface Window {
    zhiliu: ZhiliuApi;
  }
}

export {};
