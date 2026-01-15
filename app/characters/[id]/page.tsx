"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Character = {
  id: string;
  name: string;
  summary: string | null;
  description: string | null;
  portrait_url: string | null;
  sex: string;
  age: number | null;
  role_tags: string[] | null;
  style: string | null;
  user_id: string;
  created_at: string;
  updated_at: string | null;
};

export default function CharacterViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const [loading, setLoading] = useState(true);
  const [character, setCharacter] = useState<Character | null>(null);
  const [writer, setWriter] = useState<{ name: string; portrait_url: string | null } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!id) return;

      setLoading(true);
      setError(null);

      const { data: userRes } = await supabase.auth.getUser();
      if (userRes.user) {
        setCurrentUserId(userRes.user.id);
      }

      const { data, error: charError } = await supabase
        .from("characters")
        .select("*")
        .eq("id", id)
        .single();

      if (charError) {
        setError(charError.message);
        setLoading(false);
        return;
      }

      if (data) {
        setCharacter(data as Character);

        // Load writer info
        const { data: writerData } = await supabase
          .from("writers")
          .select("name, portrait_url")
          .eq("user_id", data.user_id)
          .single();

        if (writerData) {
          setWriter(writerData);
        }
      }

      setLoading(false);
    }

    load();
  }, [id]);

  const isOwnCharacter = currentUserId === character?.user_id;

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg0)", color: "var(--text)" }}>
        <div className="p-6">Loading...</div>
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg0)", color: "var(--text)" }}>
        <div className="max-w-4xl mx-auto p-6">
          <p className="text-red-600">{error || "Character not found"}</p>
          <Link href="/dashboard" className="text-sm underline mt-4 inline-block">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Subtle color system for style-specific UI chips
  const styleColors: Record<string, { bg: string; border: string; text: string }> = {
    fantasy: { bg: "bg-purple-900/20", border: "border-purple-400/40", text: "text-purple-100" },
    "sci-fi": { bg: "bg-cyan-500/10", border: "border-cyan-300/40", text: "text-cyan-100" },
    gothic: { bg: "bg-red-900/25", border: "border-red-700/40", text: "text-red-100" },
    egypt: { bg: "bg-amber-700/15", border: "border-amber-400/40", text: "text-amber-50" },
    modern: { bg: "bg-slate-800/25", border: "border-slate-500/40", text: "text-slate-100" },
    medieval: { bg: "bg-amber-800/20", border: "border-amber-500/40", text: "text-amber-50" },
    steampunk: { bg: "bg-orange-800/20", border: "border-amber-500/40", text: "text-amber-50" },
    cyberpunk: { bg: "bg-fuchsia-800/20", border: "border-fuchsia-500/40", text: "text-fuchsia-100" },
  };

  // Heavier style frames + layout shells so each style feels like its own mini UI
  const styleFrames: Record<
    string,
    {
      portrait: string;
      shell: string;
      headerAccent: string;
      chrome: string;
    }
  > = {
    fantasy: {
      portrait:
        "bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-900 border-purple-400 shadow-[0_0_28px_rgba(168,85,247,0.5)]",
      shell:
        "bg-gradient-to-br from-purple-950 via-slate-950 to-indigo-950 border-purple-500/40 shadow-[0_0_40px_rgba(147,51,234,0.4)]",
      headerAccent:
        "text-purple-100 border-b border-purple-400/60 pb-2 flex items-center gap-2",
      chrome: "before:absolute before:inset-0 before:border-2 before:border-purple-400/40 before:rounded-[28px] before:pointer-events-none",
    },
    "sci-fi": {
      portrait:
        "bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-900 border-cyan-400 shadow-[0_0_28px_rgba(34,211,238,0.5)]",
      shell:
        "bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 border-cyan-400/40 shadow-[0_0_40px_rgba(56,189,248,0.4)]",
      headerAccent:
        "text-cyan-100 border-b border-cyan-400/60 pb-2 flex items-center gap-2 tracking-[0.12em] uppercase text-xs",
      chrome: "before:absolute before:inset-0 before:border before:border-cyan-400/40 before:rounded-[22px] before:pointer-events-none",
    },
    gothic: {
      portrait:
        "bg-gradient-to-br from-black via-gray-900 to-gray-800 border-red-700 shadow-[0_0_26px_rgba(248,113,113,0.45)]",
      shell:
        "bg-gradient-to-br from-black via-gray-950 to-red-950 border-red-800/40 shadow-[0_0_40px_rgba(220,38,38,0.35)]",
      headerAccent:
        "text-red-100 border-b border-red-700/70 pb-2 flex items-center gap-2",
      chrome: "before:absolute before:inset-2 before:border before:border-red-700/40 before:rounded-[24px] before:pointer-events-none",
    },
    egypt: {
      portrait:
        "bg-gradient-to-br from-yellow-950 via-amber-900 to-yellow-800 border-amber-400 shadow-[0_0_26px_rgba(251,191,36,0.5)]",
      shell:
        "bg-gradient-to-br from-amber-950 via-yellow-900 to-stone-900 border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.4)]",
      headerAccent:
        "text-amber-100 border-b border-amber-400/70 pb-2 flex items-center gap-2",
      chrome: "before:absolute before:inset-1 before:border-2 before:border-amber-500/40 before:rounded-[26px] before:pointer-events-none",
    },
    modern: {
      portrait:
        "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-slate-400 shadow-[0_0_24px_rgba(148,163,184,0.5)]",
      shell:
        "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-slate-500/40 shadow-[0_0_35px_rgba(148,163,184,0.35)]",
      headerAccent:
        "text-slate-100 border-b border-slate-500/60 pb-2 flex items-center gap-2",
      chrome: "before:absolute before:inset-[3px] before:border before:border-slate-500/40 before:rounded-[24px] before:pointer-events-none",
    },
    medieval: {
      portrait:
        "bg-gradient-to-br from-amber-950 via-amber-900 to-stone-900 border-amber-500 shadow-[0_0_28px_rgba(245,158,11,0.5)]",
      shell:
        "bg-gradient-to-br from-stone-950 via-amber-900 to-stone-900 border-amber-600/40 shadow-[0_0_40px_rgba(245,158,11,0.4)]",
      headerAccent:
        "text-amber-100 border-b border-amber-500/70 pb-2 flex items-center gap-2",
      chrome: "before:absolute before:inset-1.5 before:border before:border-amber-500/50 before:rounded-[26px] before:pointer-events-none",
    },
    steampunk: {
      portrait:
        "bg-gradient-to-br from-stone-950 via-amber-900 to-orange-900 border-amber-600 shadow-[0_0_28px_rgba(251,146,60,0.5)]",
      shell:
        "bg-gradient-to-br from-stone-950 via-stone-900 to-amber-900 border-amber-700/40 shadow-[0_0_40px_rgba(251,146,60,0.4)]",
      headerAccent:
        "text-amber-100 border-b border-amber-600/70 pb-2 flex items-center gap-2",
      chrome: "before:absolute before:inset-2 before:border-[1.5px] before:border-amber-600/50 before:rounded-[26px] before:pointer-events-none",
    },
    cyberpunk: {
      portrait:
        "bg-gradient-to-br from-slate-950 via-fuchsia-900 to-cyan-900 border-fuchsia-500 shadow-[0_0_30px_rgba(217,70,239,0.7)]",
      shell:
        "bg-gradient-to-br from-slate-950 via-fuchsia-950 to-black border-fuchsia-600/40 shadow-[0_0_45px_rgba(217,70,239,0.5)]",
      headerAccent:
        "text-fuchsia-100 border-b border-fuchsia-500/70 pb-2 flex items-center gap-2 tracking-[0.18em] uppercase text-[11px]",
      chrome: "before:absolute before:inset-[3px] before:border before:border-fuchsia-500/60 before:rounded-[24px] before:pointer-events-none",
    },
  };

  const styleInfo = character.style ? styleColors[character.style] : null;
  const frameInfo = character.style ? styleFrames[character.style] : null;

  // Lore per style to make the UI feel like a window into that world (subtle, no hard rules)
  const styleLore: Record<
    string,
    {
      worldName: string;
      tagline: string;
      blurb: string;
    }
  > = {
    fantasy: {
      worldName: "High Fantasy Realm",
      tagline: "Ancient magic, living myths, and fragile kingdoms.",
      blurb:
        "Forests whisper prophecies, old gods still meddle in mortal affairs, and steel and spell decide the fate of empires.",
    },
    "sci-fi": {
      worldName: "Outer Rim Future",
      tagline: "Neon starports and quiet voids between galaxies.",
      blurb:
        "Corporations own planets, AIs bargain for bodies, and faster‑than‑light travel has made the universe crowded—and lonely.",
    },
    gothic: {
      worldName: "Gothic Dusk",
      tagline: "Cracked cathedrals and things that hunt the night.",
      blurb:
        "Candlelit manors loom over fog‑choked streets while secrets, curses, and old bloodlines refuse to die.",
    },
    egypt: {
      worldName: "Sun‑Scorched Dynasties",
      tagline: "Desert winds, buried gods, and golden tombs.",
      blurb:
        "Rivers carve life through endless dunes while pharaohs, priests, and forgotten spirits bargain over eternity.",
    },
    modern: {
      worldName: "Modern Day",
      tagline: "Familiar streets, secret stories.",
      blurb:
        "Skyscrapers, group chats, and late‑night diners; the magic here lives in relationships, ambition, and small rebellions.",
    },
    medieval: {
      worldName: "Low Fantasy Frontier",
      tagline: "Stone keeps, muddy roads, and hard choices.",
      blurb:
        "Farmers whisper about monsters in the woods while lords scheme over borders and mercenaries sell their steel.",
    },
    steampunk: {
      worldName: "Clockwork Metropolis",
      tagline: "Steam, brass, and daring inventors.",
      blurb:
        "Airships crowd the smog‑stained sky while tinkerers, thieves, and nobles all chase the next great machine.",
    },
    cyberpunk: {
      worldName: "Neon Undercity",
      tagline: "High tech, low life, endless night.",
      blurb:
        "Neon bleeds into puddles while corporations rewrite laws and hackers, fixers, and outcasts carve out their own freedom.",
    },
  };

  const lore = character.style ? styleLore[character.style] : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg0)", color: "var(--text)" }}>
      {/* Header */}
      <div style={{ background: "var(--bg1)", borderBottom: "1px solid var(--borderSoft)" }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href={character.user_id ? `/profile/${character.user_id}` : "/dashboard"} className="text-sm underline">
            ← Back
          </Link>
          {isOwnCharacter && (
            <Link
              href={`/characters/${id}/edit`}
              className="text-sm button-primary"
            >
              Edit Character
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Large Portrait with style-specific frame */}
          <div className="lg:col-span-1">
            <div className="panel p-4" style={{ background: "var(--bg2)", border: "1px solid var(--borderSoft)" }}>
              <div
                className={`aspect-square rounded-xl overflow-hidden mb-4 flex items-center justify-center border-4 ${
                  frameInfo
                    ? frameInfo.portrait
                    : "bg-gray-100 border-gray-200 shadow-inner"
                }`}
              >
                {character.portrait_url ? (
                  <img
                    src={character.portrait_url}
                    alt={character.name}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300">
                    <div className="text-6xl font-bold text-gray-400">
                      {character.name.charAt(0).toUpperCase()}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Writer Info */}
              {writer && (
                <div className="flex items-center gap-2 p-2 rounded" style={{ background: "var(--bg1)" }}>
                  {writer.portrait_url ? (
                    <img
                      src={writer.portrait_url}
                      alt={writer.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs">
                      {writer.name.charAt(0)}
                    </div>
                  )}
                  <Link href={`/profile/${character.user_id}`} className="text-sm text-primary hover:underline">
                    {writer.name}
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Right: Character Details with style-themed shell */}
          <div className="lg:col-span-2">
            <div
              className={`relative rounded-3xl overflow-hidden p-[1px] ${
                frameInfo
                  ? frameInfo.shell
                  : "bg-gradient-to-br from-slate-900 via-slate-950 to-black border border-slate-800 shadow-lg"
              }`}
            >
              <div
                className={`relative rounded-[22px] p-6 lg:p-8 backdrop-blur ${
                  frameInfo ? "bg-black/40" : "bg-slate-950/70"
                } ${frameInfo?.chrome ?? ""}`}
              >
                {/* Decorative corner orbs */}
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -top-6 -right-4 w-20 h-20 rounded-full bg-gradient-to-br from-white/10 to-transparent blur-2xl opacity-40" />
                  <div className="absolute -bottom-10 -left-6 w-28 h-28 rounded-full bg-gradient-to-tr from-white/5 to-transparent blur-3xl opacity-40" />
                </div>

                {/* Header / basic info */}
                <div className="relative space-y-4">
                  <div className={frameInfo ? frameInfo.headerAccent : "flex items-center gap-2 pb-2 border-b border-slate-700 text-slate-100"}>
                    {character.style && (
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase ${
                          styleInfo
                            ? `${styleInfo.bg} ${styleInfo.border} ${styleInfo.text}`
                            : "bg-slate-800/70 border border-slate-600 text-slate-100"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_10px_currentColor]" />
                        {character.style} realm
                      </span>
                    )}
                    <span className="ml-auto text-[11px] uppercase tracking-[0.24em] opacity-70">
                      Character Profile
                    </span>
                  </div>

                  <div className="space-y-3">
                    <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
                      {character.name}
                    </h1>
                    <div className="flex flex-wrap items-center gap-3 text-xs lg:text-sm text-slate-200/80">
                      <span>{character.sex}</span>
                      {character.age && <span>• {character.age} years</span>}
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/40 border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em]">
                        World:{" "}
                        <span className="font-semibold">
                          {lore?.worldName || character.style || "Unspecified"}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* World lore block (subtle, single column) */}
                  {lore && (
                    <div className="mt-2 rounded-2xl bg-black/30 border border-white/5 p-4 lg:p-5 space-y-1">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        World Overview
                      </div>
                      <div className="text-sm font-semibold text-slate-100">
                        {lore.tagline}
                      </div>
                      <p className="text-xs lg:text-sm text-slate-200/90 leading-relaxed">
                        {lore.blurb}
                      </p>
                    </div>
                  )}

                  {character.summary && (
                    <p className="text-base lg:text-lg text-slate-100/90 leading-relaxed">
                      {character.summary}
                    </p>
                  )}

                  {character.description && (
                    <div className="mt-2 rounded-2xl bg-black/30 border border-white/5 p-4 lg:p-5">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-2">
                        Story
                      </div>
                      <p className="text-sm lg:text-base text-slate-100 whitespace-pre-wrap leading-relaxed">
                        {character.description}
                      </p>
                    </div>
                  )}

                  {/* Role Tags */}
                  {character.role_tags && character.role_tags.length > 0 && (
                    <div className="mt-4 rounded-2xl bg-black/25 border border-white/5 p-4 lg:p-5">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-2">
                        Role Tags
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {character.role_tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1 rounded-full text-xs lg:text-sm bg-white/5 border border-white/10 text-slate-100 backdrop-blur-sm"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


