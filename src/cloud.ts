import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeSave, type SaveData } from './game/save';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

const client: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

let session: Session | null = null;

export const cloud = {
  enabled: !!client,
  get session() { return session; },

  /** Fires once with the stored session, then on every login/logout. */
  onAuth(cb: (s: Session | null) => void) {
    if (!client) { cb(null); return; }
    client.auth.onAuthStateChange((_event, s) => {
      session = s;
      // Supabase advises against awaiting its own calls inside this callback.
      setTimeout(() => cb(s), 0);
    });
  },

  async sendCode(email: string) {
    if (!client) throw new Error('cloud disabled');
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
  },

  async verifyCode(email: string, token: string) {
    if (!client) throw new Error('cloud disabled');
    const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
  },

  async signOut() {
    await client?.auth.signOut();
  },

  async pull(): Promise<SaveData | null> {
    if (!client || !session) return null;
    const { data, error } = await client.from('saves').select('data').maybeSingle();
    if (error) throw error;
    return normalizeSave(data?.data);
  },

  async push(save: SaveData) {
    if (!client || !session) return;
    const { error } = await client.from('saves').upsert({
      user_id: session.user.id,
      data: save,
      updated_at: new Date(save.updatedAt).toISOString(),
    });
    if (error) throw error;
  },
};
