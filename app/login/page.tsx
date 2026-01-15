"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Convert username to email format for Supabase (which requires email)
  function usernameToEmail(username: string): string {
    // Remove any spaces and convert to lowercase
    const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '');
    return `${cleanUsername}@temp.local`;
  }

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "auth_failed") {
      setError("Authentication failed. Please try again.");
    }
  }, [searchParams]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setLoading(true);

    try {
      if (!username.trim()) {
        setError("Username is required");
        setLoading(false);
        return;
      }

      const emailForSupabase = usernameToEmail(username);

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: emailForSupabase,
          password,
        });
        
        if (error) {
          if (error.message.includes("Signups not allowed") || error.message.includes("signups are disabled")) {
            setError("Signups are currently disabled. Please contact the administrator or enable signups in Supabase dashboard: Authentication → Settings → Enable email signup");
          } else {
            setError(error.message);
          }
          setLoading(false);
        } else {
          // Wait a moment for session to be established
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Verify we have a user session
          const { data: userRes, error: userError } = await supabase.auth.getUser();
          if (userError) {
            console.error("Error getting user after signup:", userError);
            setError("Account created, but unable to verify session. Please try logging in.");
            setLoading(false);
            return;
          }
          if (userRes.user) {
            // Account created! Redirect to profile creation
            router.push("/profile/create");
            router.refresh();
          } else {
            setError("Account created, but session not established. Please try logging in.");
            setLoading(false);
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailForSupabase,
          password,
        });
        
        if (error) {
          setError(error.message);
          setLoading(false);
        } else {
          // Check if profile exists, if not redirect to creation
          const { data: userRes, error: userError } = await supabase.auth.getUser();
          if (userError) {
            console.error("Error getting user after login:", userError);
            setError(userError.message || "Failed to verify session. Please try again.");
            setLoading(false);
            return;
          }
          if (userRes.user) {
            const { data: profile, error: profileError } = await supabase
              .from("writers")
              .select("id")
              .eq("user_id", userRes.user.id)
              .maybeSingle();
            
            if (profileError) {
              console.error("Error checking profile:", profileError);
              // Continue anyway - might be a network issue, let them proceed
            }
            
            if (!profile) {
              router.push("/profile/create");
            } else {
              // Success! Redirect to dashboard
              router.push("/dashboard");
              router.refresh(); // Refresh to ensure session is recognized
            }
          } else {
            setError("Login successful but session not established. Please try again.");
            setLoading(false);
          }
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to ${mode}. Please try again.`
      );
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg0)", color: "var(--text)" }}>
      <div className="w-full max-w-sm space-y-4 card">
        <h1 className="text-title">
          {mode === "login" ? "Login" : "Create account"}
        </h1>

        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full input"
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={loading}
            autoComplete="username"
          />
          <input
            className="w-full input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            autoComplete="current-password"
          />
          <button
            type="submit"
            className="w-full button-primary disabled:opacity-50"
            disabled={loading}
          >
            {loading
              ? mode === "login"
                ? "Logging in..."
                : "Creating account..."
              : mode === "login"
              ? "Login"
              : "Sign up"}
          </button>
        </form>

        <button
          type="button"
          className="w-full button-ghost"
          onClick={() => {
            setError(null);
            setOk(null);
            setMode(mode === "login" ? "signup" : "login");
          }}
          disabled={loading}
        >
          Switch to {mode === "login" ? "Sign up" : "Login"}
        </button>

        {ok && <p className="text-sm" style={{ color: "var(--accent)" }}>{ok}</p>}
        {error && <p className="text-sm" style={{ color: "var(--accent)" }}>{error}</p>}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg0)", color: "var(--text)" }}>
        <div className="w-full max-w-sm space-y-4 card">
          <h1 className="text-title">Login</h1>
          <p className="text-secondary">Loading...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
