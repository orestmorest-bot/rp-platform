"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type FeedRow = {
  id: string;
  title: string;
  description: string;
  genres: string[] | null;
  writing_style: string | null;
  erp_allowed: boolean;
  created_at: string;
  user_id: string;
  character: {
    id: string;
    name: string;
    summary: string | null;
    sex: string;
    age: number | null;
  };
};

export default function FeedPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<FeedRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      // Get current user
      const { data: userRes } = await supabase.auth.getUser();
      if (userRes.user && mounted) {
        setCurrentUserId(userRes.user.id);
      }

      const { data, error } = await supabase
        .from("roleplay_announcements")
        .select(`
          id,
          title,
          description,
          genres,
          writing_style,
          erp_allowed,
          created_at,
          user_id,
          character:characters (
            id,
            name,
            summary,
            sex,
            age
          )
        `)
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        setError(error.message);
      } else {
        // Transform data to ensure correct typing
        const transformed = (data ?? []).map((item: any) => ({
          ...item,
          character: Array.isArray(item.character) 
            ? item.character[0] 
            : item.character,
        })) as FeedRow[];
        setPosts(transformed);
      }

      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Roleplay feed</h1>
        <div className="flex gap-2">
          <Link href="/dashboard" className="border px-3 py-1 rounded">
            Dashboard
          </Link>
          <Link href="/dm" className="border px-3 py-1 rounded">
            Messages
          </Link>
          <Link href="/feed/new" className="bg-fuchsia-500 text-white px-3 py-1 rounded font-semibold hover:bg-fuchsia-600 transition-colors">
            + New announcement
          </Link>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-600">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && posts.length === 0 && (
        <p className="text-sm text-gray-600">No announcements yet.</p>
      )}

      {!loading && !error && posts.length > 0 && (
        <ul className="space-y-4">
          {posts.map((p) => (
            <li key={p.id} className="border rounded p-4 space-y-2">
              <div className="text-lg font-medium">{p.title}</div>

              <div className="text-sm text-gray-700 whitespace-pre-line">
                {p.description}
              </div>

              <div className="text-xs text-gray-500">
                Playing as <strong>{p.character.name}</strong>
                {p.character.age ? `, ${p.character.age}` : ""}
                {" · "}
                {p.character.sex}
              </div>

              {p.genres && p.genres.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {p.genres.map((g) => (
                    <span
                      key={g}
                      className="text-xs border px-2 py-0.5 rounded"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-4 pt-2">
                <Link
                  href={`/feed/${p.id}`}
                  className="text-sm underline"
                >
                  Open
                </Link>

                {currentUserId && currentUserId !== p.user_id && (
                  <button
                    className="text-sm underline"
                    onClick={async () => {
                      try {
                        const { openDmWith } = await import("@/lib/dm");
                        const threadId = await openDmWith(p.user_id);
                        window.location.href = `/dm/${threadId}`;
                      } catch (e: any) {
                        alert(e?.message ?? "Failed to open DM");
                      }
                    }}
                  >
                    Write
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
