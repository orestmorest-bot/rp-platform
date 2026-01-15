"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Writer = {
  id: string;
  name: string;
  portrait_url: string | null;
};

export default function GlobalHeader() {
  const router = useRouter();
  const [currentWriter, setCurrentWriter] = useState<Writer | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        // Not logged in, don't show header
        if (mounted) {
          setCurrentWriter(null);
          setCurrentUserId(null);
        }
        return;
      }

      if (mounted) {
        setCurrentUserId(userRes.user.id);
      }

      // Load current user's writer info
      const { data: writerData } = await supabase
        .from("writers")
        .select("id, name, portrait_url")
        .eq("user_id", userRes.user.id)
        .maybeSingle();

      if (writerData && mounted) {
        setCurrentWriter(writerData as Writer);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // Don't render header if user is not logged in
  if (!currentUserId || !currentWriter) {
    return null;
  }

  return (
    <div style={{ background: "var(--bg1)", borderBottom: "1px solid var(--borderSoft)" }}>
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="text-title hover:opacity-80 transition-opacity">
          RP Platform
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href={`/profile/${currentUserId}`}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            {(() => {
              const portraitUrl = currentWriter?.portrait_url;
              const hasPortrait = portraitUrl && portraitUrl.trim() !== "";

              return hasPortrait ? (
                <img
                  src={portraitUrl}
                  alt={currentWriter?.name || "Profile"}
                  className="w-8 h-8 rounded-full object-cover border border-gray-200"
                  onError={(e) => {
                    console.error("Image failed to load:", portraitUrl);
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-sm text-gray-600 border border-gray-200">
                  {currentWriter?.name?.charAt(0).toUpperCase() || "U"}
                </div>
              );
            })()}
            {currentWriter?.name && (
              <span className="text-sm font-medium">{currentWriter.name}</span>
            )}
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}




