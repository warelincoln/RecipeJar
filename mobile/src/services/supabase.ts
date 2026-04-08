import "react-native-url-polyfill/auto";
import "react-native-get-random-values";
import { createClient } from "@supabase/supabase-js";
import * as Keychain from "react-native-keychain";

const SUPABASE_URL = "https://ttpgamwmjtrdnsfmdkec.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_5MtAOYkHnILB0W6pw6RQpg_BicQm1b2";

const KEYCHAIN_SERVICE = "app.orzo.session";

const keychainStorage = {
  async getItem(key: string): Promise<string | null> {
    const result = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
    if (!result) return null;
    if (result.username !== key) return null;
    return result.password;
  },
  async setItem(key: string, value: string): Promise<void> {
    await Keychain.setGenericPassword(key, value, { service: KEYCHAIN_SERVICE });
  },
  async removeItem(_key: string): Promise<void> {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: keychainStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
