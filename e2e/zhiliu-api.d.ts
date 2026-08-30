import type { ZhiliuApi } from '../src/shared/api.ts';

declare global {
  interface Window {
    zhiliu: ZhiliuApi;
  }
}

export {};
