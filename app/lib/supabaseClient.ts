import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function createBrowserSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "Supabase n'est pas encore configure. Renseigne NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );

    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}
