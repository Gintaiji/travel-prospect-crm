import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

function isValidSupabaseUrl(url: string) {
  return (
    url.startsWith("https://") &&
    url.includes(".supabase.co") &&
    !url.includes("/dashboard") &&
    !url.includes("/auth/v1") &&
    !url.includes("/rest/v1")
  );
}

export function isSupabaseConfigured() {
  return Boolean(supabaseAnonKey && isValidSupabaseUrl(supabaseUrl));
}

export function createBrowserSupabaseClient() {
  if (!isValidSupabaseUrl(supabaseUrl)) {
    console.warn("Configuration Supabase invalide. Vérifie NEXT_PUBLIC_SUPABASE_URL.");

    return null;
  }

  if (!supabaseAnonKey) {
    console.warn(
      "Supabase n'est pas encore configure. Renseigne NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );

    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}
