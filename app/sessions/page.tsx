"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Session = {
  id: string;
  user_a: string;
  user_b: string;
  status: "active" | "paused" | "closed";
  created_at: string;
  last_message_at: string | null;
  name: string | null;
  other_user: {
    id: string;
    name: string;
    email: string;
    portrait_url: string | null;
  };
  latest_message: {
    id: string;
    sender_id: string;
    body: string;
    created_at: string;
  } | null;
  unread_count: number;
};

export default function SessionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentWriter, setCurrentWriter] = useState<{ name: string; portrait_url: string | null } | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "paused" | "closed">("all");

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        // Get current user
        const { data: userRes, error: userError } = await supabase.auth.getUser();
        if (userError || !userRes.user) {
          if (mounted) router.push("/login");
          return;
        }

        if (!mounted) return;
        const userId = userRes.user.id;
        setCurrentUserId(userId);

        // Load current user's writer info
        const { data: writerData } = await supabase
          .from("writers")
          .select("name, portrait_url")
          .eq("user_id", userId)
          .maybeSingle();

        if (writerData && mounted) {
          setCurrentWriter(writerData);
        }

        // Load all sessions (including closed)
        const { data: sessionsData, error: sessionsError } = await supabase
          .from("rp_sessions")
          .select("id, user_a, user_b, status, created_at, last_message_at, name")
          .or(`user_a.eq.${userId},user_b.eq.${userId}`)
          .order("created_at", { ascending: false });

        if (sessionsError) {
          console.error("Error loading sessions:", sessionsError);
          setLoading(false);
          return;
        }

        if (!sessionsData || sessionsData.length === 0) {
          if (mounted) {
            setSessions([]);
            setLoading(false);
          }
          return;
        }

        // Load session details with writer info and latest messages
        const sessionsWithDetails = await Promise.all(
          sessionsData.map(async (session) => {
            const otherUserId = session.user_a === userId ? session.user_b : session.user_a;

            // Fetch writer profile for the other user
            const { data: otherWriter } = await supabase
              .from("writers")
              .select("name, portrait_url")
              .eq("user_id", otherUserId)
              .maybeSingle();

            const otherUserName = otherWriter?.name || `User ${otherUserId.slice(0, 8)}`;

            // Get latest message
            const { data: latestMsg } = await supabase
              .from("rp_session_messages")
              .select("id, sender_id, body, created_at")
              .eq("session_id", session.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            // Get unread count
            const { data: myLastMessage } = await supabase
              .from("rp_session_messages")
              .select("created_at")
              .eq("session_id", session.id)
              .eq("sender_id", userId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            // Get last read timestamp from read tracking table
            const { data: readData } = await supabase
              .from("rp_session_reads")
              .select("last_read_at, last_read_message_id")
              .eq("session_id", session.id)
              .eq("user_id", userRes.user.id)
              .maybeSingle();

            let unreadCount = 0;
            if (readData && readData.last_read_at) {
              // Count messages from other user that are newer than last_read_at
              const { count } = await supabase
                .from("rp_session_messages")
                .select("id", { count: "exact", head: true })
                .eq("session_id", session.id)
                .eq("sender_id", otherUserId)
                .gt("created_at", readData.last_read_at);
              unreadCount = count || 0;
            } else {
              // No read record - count all messages from other user
              const { count } = await supabase
                .from("rp_session_messages")
                .select("id", { count: "exact", head: true })
                .eq("session_id", session.id)
                .eq("sender_id", otherUserId);
              unreadCount = count || 0;
            }

            return {
              id: session.id,
              user_a: session.user_a,
              user_b: session.user_b,
              status: session.status as "active" | "paused" | "closed",
              created_at: session.created_at,
              last_message_at: session.last_message_at,
              name: session.name,
              other_user: {
                id: otherUserId,
                name: otherUserName,
                email: otherUserName,
                portrait_url: otherWriter?.portrait_url || null,
              },
              latest_message: latestMsg ? {
                id: latestMsg.id,
                sender_id: latestMsg.sender_id,
                body: latestMsg.body,
                created_at: latestMsg.created_at,
              } : null,
              unread_count: unreadCount,
            };
          })
        );

        // Sort sessions: active by last_message_at, closed by created_at
        sessionsWithDetails.sort((a, b) => {
          // Active and paused sessions first, sorted by last_message_at (most recent first)
          if ((a.status === "active" || a.status === "paused") && b.status === "closed") return -1;
          if (a.status === "closed" && (b.status === "active" || b.status === "paused")) return 1;

          // Within active/paused: sort by last_message_at or latest_message
          if (a.status === "active" || a.status === "paused") {
            if (b.status === "active" || b.status === "paused") {
              // Prefer last_message_at, fallback to latest_message.created_at, then created_at
              const aTime = a.last_message_at 
                ? new Date(a.last_message_at).getTime()
                : a.latest_message?.created_at
                ? new Date(a.latest_message.created_at).getTime()
                : new Date(a.created_at).getTime();
              
              const bTime = b.last_message_at
                ? new Date(b.last_message_at).getTime()
                : b.latest_message?.created_at
                ? new Date(b.latest_message.created_at).getTime()
                : new Date(b.created_at).getTime();
              
              return bTime - aTime; // Most recent first
            }
          }

          // Closed sessions: sort by created_at (most recent first)
          if (a.status === "closed" && b.status === "closed") {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          }

          return 0;
        });

        if (mounted) {
          setSessions(sessionsWithDetails);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading sessions:", err);
        if (mounted) setLoading(false);
      }
    }

    load();

    // Subscribe to session updates
    const channel = supabase
      .channel("sessions_page_updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rp_sessions",
        },
        () => {
          load();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rp_session_messages",
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [router]);

  const filteredSessions = sessions.filter((session) => {
    if (filter === "all") return true;
    return session.status === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">Active</span>;
      case "paused":
        return <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">Paused</span>;
      case "closed":
        return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">Closed</span>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg0)", color: "var(--text)" }}>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">My Sessions</h1>
            <p className="text-secondary mt-1">View all your roleplay sessions, including closed ones</p>
          </div>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Filter buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-fuchsia-500 text-white"
                : "bg-white border border-gray-300 hover:bg-gray-50"
            }`}
          >
            All ({sessions.length})
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              filter === "active"
                ? "bg-fuchsia-500 text-white"
                : "bg-white border border-gray-300 hover:bg-gray-50"
            }`}
          >
            Active ({sessions.filter((s) => s.status === "active").length})
          </button>
          <button
            onClick={() => setFilter("paused")}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              filter === "paused"
                ? "bg-fuchsia-500 text-white"
                : "bg-white border border-gray-300 hover:bg-gray-50"
            }`}
          >
            Paused ({sessions.filter((s) => s.status === "paused").length})
          </button>
          <button
            onClick={() => setFilter("closed")}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              filter === "closed"
                ? "bg-fuchsia-500 text-white"
                : "bg-white border border-gray-300 hover:bg-gray-50"
            }`}
          >
            Closed ({sessions.filter((s) => s.status === "closed").length})
          </button>
        </div>

        {/* Sessions list */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-secondary">Loading sessions...</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-12 bg-white border rounded p-6">
            <p className="text-secondary">
              {filter === "all" 
                ? "No sessions yet. Start a roleplay session from the feed!"
                : `No ${filter} sessions.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session) => (
              <Link
                key={session.id}
                href={`/session/${session.id}`}
                className="block bg-white border rounded p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Avatars */}
                  <div className="flex -space-x-2">
                    {currentWriter?.portrait_url ? (
                      <img
                        src={currentWriter.portrait_url}
                        alt={currentWriter.name || "You"}
                        className="w-10 h-10 rounded-full object-cover border-2 border-white"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-sm text-gray-600 border-2 border-white">
                        {currentWriter?.name?.charAt(0).toUpperCase() || "U"}
                      </div>
                    )}
                    {session.other_user.portrait_url ? (
                      <img
                        src={session.other_user.portrait_url}
                        alt={session.other_user.name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-white"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-sm text-gray-600 border-2 border-white">
                        {session.other_user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Session info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-semibold text-lg truncate">
                        {session.name || `${session.other_user.name}`}
                      </div>
                      {getStatusBadge(session.status)}
                      {session.unread_count > 0 && (
                        <span className="bg-fuchsia-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                          {session.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      With {session.other_user.name}
                    </div>
                    {session.latest_message && (
                      <div className="text-sm text-gray-700 truncate mb-2">
                        {session.latest_message.body}
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>
                        Created: {new Date(session.created_at).toLocaleDateString()}
                      </span>
                      {session.last_message_at && (
                        <span>
                          Last activity: {new Date(session.last_message_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

