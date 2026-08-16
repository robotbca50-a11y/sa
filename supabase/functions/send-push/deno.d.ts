/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
    function set(key: string, value: string): void;
  }
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module 'npm:@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: Record<string, unknown>): any;
}

declare module 'npm:web-push@3.6.7' {
  export interface PushSubscriptionLike {
    endpoint: string;
    keys?: { p256dh?: string; auth?: string } | null;
  }
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  export function sendNotification(
    subscription: PushSubscriptionLike,
    payload?: string | Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}
