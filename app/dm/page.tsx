"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type ThreadWithLatest = {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  other_user: {
    id: string;
    email: string;
    name?: string;
    portrait_url?: string | null;
  };
  latest_message: {
    id: string;
    sender_id: string;
    body: string;
    created_at: string;
  } | null;
  unread_count: number;
};

export default function DmInboxPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadWithLatest[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        window.location.href = "/login";
        return;
      }

      if (!mounted) return;
      const me = userRes.user.id;
      setCurrentUserId(me);

      // Get all threads where user is either user_a or user_b
      const { data: threadsData, error: threadsError } = await supabase
        .from("dm_threads")
        .select("id, user_a, user_b, created_at")
        .or(`user_a.eq.${me},user_b.eq.${me}`)
        .order("created_at", { ascending: false });

      if (threadsError) {
        setError(threadsError.message);
        setLoading(false);
        return;
      }

      if (!threadsData || threadsData.length === 0) {
        setThreads([]);
        setLoading(false);
        return;
      }

      // For each thread, get the other user and latest message
      const threadsWithDetails = await Promise.all(
        threadsData.map(async (thread) => {
          const otherUserId =
            thread.user_a === me ? thread.user_b : thread.user_a;

          // Get other user's writer info
          const { data: otherWriter } = await supabase
            .from("writers")
            .select("name, portrait_url")
            .eq("user_id", otherUserId)
            .maybeSingle();
          
          const otherUserEmail = otherWriter?.name || `User ${otherUserId.slice(0, 8)}`;
          
          // Get latest message
          const { data: latestMsg } = await supabase
            .from("dm_messages")
            .select("id, sender_id, body, created_at")
            .eq("thread_id", thread.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          // Count unread messages: messages from other user that are newer than user's last message
          // Get user's last message timestamp
          const { data: myLastMessage } = await supabase
            .from("dm_messages")
            .select("created_at")
            .eq("thread_id", thread.id)
            .eq("sender_id", me)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          // Get last read timestamp from read tracking table
          const { data: readData } = await supabase
            .from("dm_thread_reads")
            .select("last_read_at, last_read_message_id")
            .eq("thread_id", thread.id)
            .eq("user_id", me)
            .maybeSingle();

          let unreadCount = 0;
          if (readData && readData.last_read_at) {
            // Count messages from other user that are newer than last_read_at
            const { count } = await supabase
              .from("dm_messages")
              .select("id", { count: "exact", head: true })
              .eq("thread_id", thread.id)
              .eq("sender_id", otherUserId)
              .gt("created_at", readData.last_read_at);
            unreadCount = count || 0;
          } else {
            // No read record - count all messages from other user
            const { count } = await supabase
              .from("dm_messages")
              .select("id", { count: "exact", head: true })
              .eq("thread_id", thread.id)
              .eq("sender_id", otherUserId);
            unreadCount = count || 0;
          }

          return {
            id: thread.id,
            user_a: thread.user_a,
            user_b: thread.user_b,
            created_at: thread.created_at,
            other_user: {
              id: otherUserId,
              email: otherUserEmail,
              name: otherWriter?.name,
              portrait_url: otherWriter?.portrait_url || null,
            },
            latest_message: latestMsg || null,
            unread_count: unreadCount,
          };
        })
      );

      if (!mounted) return;

      // Sort by latest message time (threads with no messages go to bottom)
      threadsWithDetails.sort((a, b) => {
        if (!a.latest_message && !b.latest_message) return 0;
        if (!a.latest_message) return 1;
        if (!b.latest_message) return -1;
        return (
          new Date(b.latest_message.created_at).getTime() -
          new Date(a.latest_message.created_at).getTime()
        );
      });

      setThreads(threadsWithDetails);
      setLoading(false);
    }

    load();

    // Subscribe to new messages to update the inbox in real-time
    const channel = supabase
      .channel("dm_inbox")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
        },
        () => {
          // Reload threads when new message arrives
          load();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <Link href="/dashboard" className="text-sm underline">
          Dashboard
        </Link>
      </div>

      {loading && <p className="text-sm text-gray-600">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && threads.length === 0 && (
        <p className="text-sm text-gray-600">
          No messages yet. Start a conversation from a feed post!
        </p>
      )}

      {!loading && !error && threads.length > 0 && (
        <ul className="space-y-2">
          {threads.map((thread) => {
            const isUnread = thread.unread_count > 0;
            return (
              <li key={thread.id}>
                <Link
                  href={`/dm/${thread.id}`}
                  className={`block border rounded p-4 hover:bg-gray-50 ${
                    isUnread ? "bg-blue-50 border-blue-200" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {thread.other_user.portrait_url && (
                          <img
                            src={thread.other_user.portrait_url}
                            alt={thread.other_user.name || thread.other_user.email}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        )}
                        <div className="font-medium">
                          {thread.other_user.name || thread.other_user.email}
                        </div>
                        {isUnread && (
                          <span className="bg-fuchsia-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                            {thread.unread_count}
                          </span>
                        )}
                      </div>
                      {thread.latest_message && (
                        <div className="text-sm text-gray-600 mt-1 truncate">
                          {thread.latest_message.sender_id === currentUserId
                            ? "You: "
                            : ""}
                          {thread.latest_message.body}
                        </div>
                      )}
                      {thread.latest_message && (
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(
                            thread.latest_message.created_at
                          ).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


















