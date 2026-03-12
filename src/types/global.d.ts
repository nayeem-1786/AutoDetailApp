export {};
declare global {
  interface Window {
    __fetchIntercepted?: string;
    __supabase_browser_client?: ReturnType<typeof import('@supabase/ssr').createBrowserClient>;
  }
}
