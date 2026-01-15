"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type MyCharacter = {
  id: string;
  name: string;
  summary: string | null;
};

export default function NewAnnouncementPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [characters, setCharacters] = useState<MyCharacter[]>([]);
  const [characterId, setCharacterId] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genres, setGenres] = useState(""); // comma-separated
  const [writingStyle, setWritingStyle] = useState("");
  const [erpAllowed, setErpAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setError(null);
      setLoading(true);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        if (mounted) setError(userErr.message);
        setLoading(false);
        return;
      }
      if (!userRes.user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("characters")
        .select("id,name,summary")
        .eq("user_id", userRes.user.id)
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (error) setError(error.message);
      else {
        const list = (data ?? []) as MyCharacter[];
        setCharacters(list);
        if (list.length > 0) setCharacterId(list[0].id);
      }

      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  async function submit() {
    setError(null);

    if (!characterId) return setError("Pick a character");
    if (!title.trim()) return setError("Title is required");
    if (!description.trim()) return setError("Description is required");

    setSaving(true);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) {
      setSaving(false);
      window.location.href = "/login";
      return;
    }

    const genresArray =
      genres.trim() === ""
        ? []
        : genres
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean);

    const { data, error } = await supabase
      .from("roleplay_announcements")
      .insert({
        user_id: user.id,
        character_id: characterId,
        title,
        description,
        genres: genresArray,
        writing_style: writingStyle.trim() || null,
        erp_allowed: erpAllowed,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error) return setError(error.message);

    router.push(`/feed/${data.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New announcement</h1>
        <Link href="/feed" className="text-sm underline">
          Back
        </Link>
      </div>

      {loading && <p className="text-sm text-gray-600">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && characters.length === 0 && (
        <div className="border rounded p-4 space-y-2">
          <p className="text-sm">
            You need at least one character before posting.
          </p>
          <Link href="/characters/new" className="underline text-sm">
            Create a character
          </Link>
        </div>
      )}

      {!loading && characters.length > 0 && (
        <>
          <div className="space-y-1">
            <label className="text-sm font-medium">Character</label>
            <select
              className="w-full border p-2 rounded"
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
            >
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Title</label>
            <input
              className="w-full border p-2 rounded"
              placeholder='Example: "Enemies to allies in a dark fantasy city"'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <textarea
              className="w-full border p-2 rounded"
              rows={7}
              placeholder="What do you want to play? Setup, tone, boundaries, pace, etc."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Genres (comma separated)</label>
            <input
              className="w-full border p-2 rounded"
              placeholder="fantasy, medieval, romance, horror"
              value={genres}
              onChange={(e) => setGenres(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Writing style (optional)</label>
            <input
              className="w-full border p-2 rounded"
              placeholder="semi-lit / literate / novella..."
              value={writingStyle}
              onChange={(e) => setWritingStyle(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={erpAllowed}
              onChange={(e) => setErpAllowed(e.target.checked)}
            />
            ERP allowed
          </label>

          <button
            className="bg-black text-white px-4 py-2 rounded"
            onClick={submit}
            disabled={saving}
          >
            {saving ? "Posting…" : "Post announcement"}
          </button>
        </>
      )}
    </div>
  );
}
