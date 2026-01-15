"use client";

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMsg = "Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file. Make sure to restart the dev server after adding/updating environment variables.";
  console.error(errorMsg);
  console.error("Current env values:", {
    url: supabaseUrl || "NOT SET",
    key: supabaseAnonKey ? "SET (length: " + supabaseAnonKey.length + ")" : "NOT SET"
  });
  throw new Error(errorMsg);
}

// Create browser client - @supabase/ssr handles cookies automatically in the browser
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);