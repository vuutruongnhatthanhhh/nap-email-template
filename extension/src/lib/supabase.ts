import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// Supabase persists the auth session through this adapter. chrome.storage.local
// (not .session) so the user stays logged in across browser restarts — this is
// template/recipient text, not a secrets vault, so a plain session token is fine.
const chromeStorageAdapter = {
  async getItem(key: string) {
    const result = await chrome.storage.local.get(key);
    return (result[key] as string | undefined) ?? null;
  },
  async setItem(key: string, value: string) {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string) {
    await chrome.storage.local.remove(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
