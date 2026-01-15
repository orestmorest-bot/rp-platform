"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Msg = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
};

export default function DmThreadPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = params.threadId;

  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
      setMe(userRes.user.id);

      const { data, error } = await supabase
        .from("dm_messages")
        .select("id,sender_id,body,created_at,edited_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (!mounted) return;

      if (error) setError(error.message);
      else setMessages((data ?? []) as Msg[]);

      setLoading(false);
    }

    load();

    // optional realtime (nice later)
    const channel = supabase
      .channel(`dm:${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as Msg;
          setMessages((prev) => [...prev, row]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as Msg;
          setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  async function send() {
    if (!me) return;
    if (!text.trim()) return;

    const body = text;
    setText("");

    const { error } = await supabase.from("dm_messages").insert({
      thread_id: threadId,
      sender_id: me,
      body,
    });

    if (error) {
      setError(error.message);
      setText(body); // restore
    }
  }

  function startEdit(m: Msg) {
    setEditingId(m.id);
    setEditingText(m.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText("");
  }

  async function saveEdit() {
    if (!me || !editingId) return;
    const body = editingText.trim();
    if (!body) return;

    const editedAt = new Date().toISOString();
    const { error } = await supabase
      .from("dm_messages")
      .update({ body, edited_at: editedAt })
      .eq("id", editingId)
      .eq("sender_id", me);

    if (error) {
      setError(error.message);
      return;
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === editingId ? { ...m, body, edited_at: editedAt } : m))
    );
    cancelEdit();
  }

  return (
    <div className="max-w-3xl mx-auto p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm underline">
          ← Back to feed
        </Link>
      </div>

      {loading && <p className="text-sm text-gray-600">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="border rounded p-4 h-[60vh] overflow-y-auto space-y-2 bg-white">
        {messages.map((m) => {
          const mine = m.sender_id === me;
          const isEditing = editingId === m.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded px-3 py-2 text-sm whitespace-pre-line ${
                  mine ? "bg-black text-white" : "bg-gray-100"
                }`}
              >
                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      className="w-full rounded border p-2 text-sm text-black"
                      rows={3}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                    />
                    <div className="flex gap-2 justify-end text-xs">
                      <button className="px-2 py-1 rounded border" onClick={cancelEdit}>
                        Cancel
                      </button>
                      <button className="px-2 py-1 rounded bg-white text-black" onClick={saveEdit}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {m.body}
                    {m.edited_at && <span className="ml-2 text-[10px] text-gray-300">(edited)</span>}
                    {mine && (
                      <button
                        className="ml-2 text-[10px] text-gray-300 underline"
                        onClick={() => startEdit(m)}
                      >
                        Edit
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 border rounded p-2"
          placeholder="Write…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="bg-black text-white px-4 rounded" onClick={send}>
          Send
        </button>
      </div>

      <p className="text-xs text-gray-500">
        (Later we’ll add message types, seen, and session mode.)
      </p>
    </div>
  );
}
