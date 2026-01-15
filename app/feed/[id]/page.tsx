"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type DetailRow = {
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
    description: string | null;
    sex: string;
    age: number | null;
    portrait_url: string | null;
  };
};

export default function FeedDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<DetailRow | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("roleplay_announcements")
        .select(
          `
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
            description,
            sex,
            age,
            portrait_url
          )
        `
        )
        .eq("id", id)
        .single();

      if (!mounted) return;

      if (error) {
        setError(error.message);
      } else if (data) {
        const row = data as DetailRow & {
          character: DetailRow["character"] | DetailRow["character"][];
        };
        const character = Array.isArray(row.character) ? row.character[0] : row.character;
        if (!character) {
          setError("Character not found.");
        } else {
          setPost({
            ...row,
            character,
          });
        }
      }

      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) return <div className="p-6 text-sm text-gray-600">Loading…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!post) return <div className="p-6 text-sm">Not found</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm underline">
          Back to feed
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Character Portrait (Full Size) */}
        <div className="lg:col-span-1">
          <div className="border rounded-lg overflow-hidden bg-gray-50">
            {post.character.portrait_url && post.character.portrait_url.trim() !== "" ? (
              <img
                src={post.character.portrait_url}
                alt={post.character.name}
                className="w-full h-auto object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
            ) : null}
            <div 
              className={`w-full aspect-square flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300 ${
                post.character.portrait_url && post.character.portrait_url.trim() !== "" ? "hidden" : ""
              }`}
            >
              <div className="text-6xl font-bold text-gray-400">
                {post.character.name.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Announcement Details */}
        <div className="lg:col-span-2 space-y-4">
          <h1 className="text-2xl font-semibold">{post.title}</h1>

          <div className="text-sm text-gray-700 whitespace-pre-line">
            {post.description}
          </div>

          <div className="border-t pt-4">
            <h2 className="text-lg font-semibold mb-2">Character: {post.character.name}</h2>
            <div className="text-xs text-gray-500 mb-3">
              {post.character.age ? `Age: ${post.character.age}` : ""}
              {post.character.age && " · "}
              {post.character.sex}
            </div>
            {post.character.description && (
              <div className="text-sm text-gray-700 whitespace-pre-line mb-3">
                {post.character.description}
              </div>
            )}
            {post.character.summary && (
              <div className="text-sm text-gray-600 italic">
                {post.character.summary}
              </div>
            )}
          </div>

          {post.genres && post.genres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {post.genres.map((g) => (
                <span key={g} className="text-xs border px-2 py-0.5 rounded">
                  {g}
                </span>
              ))}
            </div>
          )}

          <div className="text-sm text-gray-600">
            {post.writing_style ? `Writing style: ${post.writing_style}` : ""}
            {post.writing_style && " · "}
            {post.erp_allowed ? "ERP allowed" : "ERP not specified"}
          </div>

          <div className="pt-2">
            <button
              className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition-colors"
              onClick={async () => {
                try {
                  const { openDmWith } = await import("@/lib/dm");
                  const threadId = await openDmWith(post.user_id);
                  window.location.href = `/dm/${threadId}`;
                } catch (e: any) {
                  alert(e?.message ?? "Failed to open DM");
                }
              }}
            >
              Write to author
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
