"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { feedbackTags } from "@/lib/feedbackTags";

type Feedback = {
  id: string;
  feedback: string | null;
  tags: string[];
  is_approved: boolean;
  created_at: string;
  session_id: string;
  user_id: string;
  reviewer_name: string;
  reviewer_portrait: string | null;
};

export default function ProfilePage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const userId = params.userId;
  const [loading, setLoading] = useState(true);
  const [writer, setWriter] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingFeedback, setPendingFeedback] = useState<Feedback[]>([]);
  const [approvedFeedback, setApprovedFeedback] = useState<Feedback[]>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [characters, setCharacters] = useState<Array<{ 
    id: string; 
    name: string; 
    summary: string | null;
    description: string | null;
    portrait_url: string | null;
    sex: string;
    age: number | null;
    style: string | null;
  }>>([]);
  const [likesCount, setLikesCount] = useState(0);

  const isOwnProfile = currentUserId === userId;

  useEffect(() => {
    async function load() {
      if (!userId) return;

      // Get current user
      const { data: userRes } = await supabase.auth.getUser();
      if (userRes.user) {
        setCurrentUserId(userRes.user.id);
      }
      
      // Load writer profile
      const { data, error } = await supabase
        .from("writers")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error) {
        console.error("Error loading profile:", error);
        // If profile doesn't exist, set writer to null
        if (error.code === 'PGRST116') {
          setWriter(null);
        }
      } else {
        setWriter(data);
      }

      // Load writer's characters
      const { data: charactersData } = await supabase
        .from("characters")
        .select("id, name, summary, description, portrait_url, sex, age, style")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (charactersData) {
        setCharacters(charactersData);
      }

      // Load likes count
      if (data) {
        const { count } = await supabase
          .from("writer_likes")
          .select("id", { count: "exact", head: true })
          .eq("writer_id", data.id);
        setLikesCount(count || 0);
      }

      // Load feedback received by this writer
      // Get all sessions where this user participated
      const { data: sessions } = await supabase
        .from("rp_sessions")
        .select("id")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`);

      if (sessions && sessions.length > 0) {
        const sessionIds = sessions.map((s) => s.id);

        // Load all feedback for these sessions (excluding feedback from the writer themselves)
        const { data: allFeedback } = await supabase
          .from("rp_session_feedback")
          .select("id, feedback, tags, is_approved, created_at, session_id, user_id")
          .in("session_id", sessionIds)
          .neq("user_id", userId);

        if (allFeedback) {
          // Get reviewer info for each feedback
          const feedbackWithReviewers = await Promise.all(
            allFeedback.map(async (fb) => {
              const { data: reviewer } = await supabase
                .from("writers")
                .select("name, portrait_url")
                .eq("user_id", fb.user_id)
                .maybeSingle();

              return {
                ...fb,
                reviewer_name: reviewer?.name || `User ${fb.user_id.slice(0, 8)}`,
                reviewer_portrait: reviewer?.portrait_url || null,
              } as Feedback;
            })
          );

          const pending = feedbackWithReviewers.filter((fb) => !fb.is_approved);
          const approved = feedbackWithReviewers.filter((fb) => fb.is_approved);

          setPendingFeedback(pending);
          setApprovedFeedback(approved);

          // Calculate tag counts from approved feedback
          const counts: Record<string, number> = {};
          approved.forEach((fb) => {
            fb.tags?.forEach((tagId) => {
              counts[tagId] = (counts[tagId] || 0) + 1;
            });
          });
          setTagCounts(counts);
        }
      }

      setLoading(false);
    }
    load();
  }, [userId]);

  async function approveFeedback(feedbackId: string) {
    const { error } = await supabase
      .from("rp_session_feedback")
      .update({ is_approved: true, approved_at: new Date().toISOString() })
      .eq("id", feedbackId);

    if (!error) {
      // Move from pending to approved
      const feedback = pendingFeedback.find((fb) => fb.id === feedbackId);
      if (feedback) {
        setPendingFeedback(pendingFeedback.filter((fb) => fb.id !== feedbackId));
        setApprovedFeedback([...approvedFeedback, { ...feedback, is_approved: true }]);

        // Update tag counts
        const counts = { ...tagCounts };
        feedback.tags?.forEach((tagId) => {
          counts[tagId] = (counts[tagId] || 0) + 1;
        });
        setTagCounts(counts);
      }
    }
  }

  async function rejectFeedback(feedbackId: string) {
    const { error } = await supabase
      .from("rp_session_feedback")
      .delete()
      .eq("id", feedbackId);

    if (!error) {
      setPendingFeedback(pendingFeedback.filter((fb) => fb.id !== feedbackId));
    }
  }

  if (loading) return (
    <div className="min-h-screen" style={{ background: "var(--bg0)", color: "var(--text)" }}>
      <div className="p-6">Loading...</div>
    </div>
  );
  
  if (!writer) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg0)", color: "var(--text)" }}>
        <div className="max-w-4xl mx-auto p-6">
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold">Profile Not Found</h1>
            {isOwnProfile ? (
              <div className="panel p-6" style={{ background: "var(--bg2)", border: "1px solid var(--borderSoft)" }}>
                <p className="mb-4">You haven't created your writer profile yet.</p>
                <Link
                  href="/profile/create"
                  className="inline-block button-primary"
                >
                  Create Profile
                </Link>
              </div>
            ) : (
              <p className="text-secondary">This profile doesn't exist.</p>
            )}
            <Link href="/dashboard" className="text-sm underline">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg0)", color: "var(--text)" }}>
      {/* Header */}
      <div style={{ background: "var(--bg1)", borderBottom: "1px solid var(--borderSoft)" }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm underline">
            ← Back to Dashboard
          </Link>
          {isOwnProfile && (
            <Link
              href="/profile/edit"
              className="text-sm button-primary"
            >
              Edit Profile
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* LEFT: Characters list (same style as dashboard sessions) */}
          <div className="space-y-4">
            {/* Writer Info Panel */}
            <div className="panel p-4" style={{ background: "var(--bg2)", border: "1px solid var(--borderSoft)" }}>
              <div className="flex items-center gap-3 mb-3">
                {writer.portrait_url ? (
                  <img
                    src={writer.portrait_url}
                    alt={writer.name}
                    className="w-12 h-12 rounded-full object-cover border border-gray-200"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-lg text-gray-600 border border-gray-200">
                    {writer.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-primary font-medium truncate">{writer.name || "Unknown Writer"}</div>
                  <div className="text-secondary text-xs">
                    ❤️ {likesCount} likes
                  </div>
                </div>
              </div>
              {writer.description && (
                <p className="text-secondary text-sm mt-2">{writer.description}</p>
              )}
            </div>

            {/* Characters list - bigger with larger portraits */}
            <div className="panel p-4" style={{ background: "var(--bg2)", border: "1px solid var(--borderSoft)" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-secondary">Characters</div>
                {isOwnProfile && (
                  <Link
                    href="/characters/new"
                    className="text-xs button-primary px-2 py-1"
                  >
                    + New
                  </Link>
                )}
              </div>
              {characters.length === 0 ? (
                <p className="text-secondary text-sm">No characters yet.</p>
              ) : (
                <ul className="space-y-3">
                  {characters.map((char) => (
                    <li key={char.id}>
                      <Link
                        href={`/characters/${char.id}`}
                        className="card p-4 flex flex-col gap-3 hover:opacity-90 transition-opacity"
                      >
                        {/* Character Portrait - Larger */}
                        <div className="w-full aspect-square bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                          {char.portrait_url ? (
                            <img
                              src={char.portrait_url}
                              alt={char.name}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300">
                              <div className="text-4xl font-bold text-gray-400">
                                {char.name.charAt(0).toUpperCase()}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-primary font-medium truncate text-lg">
                            {char.name}
                          </div>
                          {char.summary && (
                            <div className="text-secondary mt-1 line-clamp-2 text-sm">
                              {char.summary}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-2 text-xs text-secondary">
                            <span>{char.sex}</span>
                            {char.age && <span>• {char.age}</span>}
                            {char.style && (
                              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                                {char.style}
                              </span>
                            )}
                          </div>
                          {isOwnProfile && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                router.push(`/characters/${char.id}/edit`);
                              }}
                              className="text-xs underline mt-2 inline-block text-primary cursor-pointer bg-transparent border-none p-0"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* RIGHT: Feedback and other info (3/4 width) */}
          <div className="lg:col-span-3 space-y-4">

            {/* Pending Feedback Approval (only for own profile) */}
            {isOwnProfile && pendingFeedback.length > 0 && (
              <div className="panel p-4" style={{ background: "var(--bg2)", border: "1px solid var(--borderSoft)" }}>
                <h2 className="text-lg font-semibold mb-3">Pending Feedback ({pendingFeedback.length})</h2>
            <div className="space-y-3">
              {pendingFeedback.map((fb) => (
                <div key={fb.id} className="bg-white border rounded p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {fb.reviewer_portrait ? (
                          <img
                            src={fb.reviewer_portrait}
                            alt={fb.reviewer_name}
                            className="w-6 h-6 rounded-full"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-xs">
                            {fb.reviewer_name.charAt(0)}
                          </div>
                        )}
                        <span className="text-sm font-medium">{fb.reviewer_name}</span>
                      </div>
                      {fb.tags && fb.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {fb.tags.map((tagId) => {
                            const tag = feedbackTags.find((t) => t.id === tagId);
                            if (!tag) return null;
                            return (
                              <span
                                key={tagId}
                                className={`text-xs px-2 py-0.5 rounded ${
                                  tag.positive
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {tag.emoji} {tag.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {fb.feedback && (
                        <p className="text-sm text-gray-700">{fb.feedback}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => approveFeedback(fb.id)}
                        className="text-xs bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => rejectFeedback(fb.id)}
                        className="text-xs bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </div>
            )}

            {/* Tag Counts */}
            {Object.keys(tagCounts).length > 0 && (
              <div className="panel p-4" style={{ background: "var(--bg2)", border: "1px solid var(--borderSoft)" }}>
                <h2 className="text-lg font-semibold mb-3">Feedback Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {feedbackTags.map((tag) => {
                const count = tagCounts[tag.id] || 0;
                if (count === 0) return null;
                return (
                  <div
                    key={tag.id}
                    className={`p-3 rounded border ${
                      tag.positive
                        ? "bg-green-50 border-green-200"
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="text-2xl mb-1">{tag.emoji}</div>
                    <div className="text-sm font-medium">{tag.label}</div>
                    <div className="text-xs text-gray-600 mt-1">{count} {count === 1 ? "time" : "times"}</div>
                  </div>
                );
              })}
              </div>
            </div>
            )}

            {/* Approved Feedback Comments */}
            {approvedFeedback.length > 0 && (
              <div className="panel p-4" style={{ background: "var(--bg2)", border: "1px solid var(--borderSoft)" }}>
                <h2 className="text-lg font-semibold mb-3">Comments ({approvedFeedback.length})</h2>
            <div className="space-y-4">
              {approvedFeedback
                .filter((fb) => fb.feedback) // Only show feedback with text comments
                .map((fb) => (
                  <div key={fb.id} className="border-b pb-3 last:border-b-0">
                    <div className="flex items-center gap-2 mb-2">
                      {fb.reviewer_portrait ? (
                        <img
                          src={fb.reviewer_portrait}
                          alt={fb.reviewer_name}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs">
                          {fb.reviewer_name.charAt(0)}
                        </div>
                      )}
                      <span className="text-sm font-medium">{fb.reviewer_name}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(fb.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {fb.tags && fb.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {fb.tags.map((tagId) => {
                          const tag = feedbackTags.find((t) => t.id === tagId);
                          if (!tag) return null;
                          return (
                            <span
                              key={tagId}
                              className={`text-xs px-2 py-0.5 rounded ${
                                tag.positive
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {tag.emoji} {tag.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-sm text-gray-700">{fb.feedback}</p>
                  </div>
                ))}
              </div>
            </div>
            )}

            {approvedFeedback.length === 0 && !isOwnProfile && (
              <div className="panel p-4 text-center" style={{ background: "var(--bg2)", border: "1px solid var(--borderSoft)" }}>
                <p className="text-secondary">No feedback yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
