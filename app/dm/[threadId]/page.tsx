"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Msg = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_portrait: string | null;
  sender_name: string;
};

type Writer = {
  id: string;
  name: string;
  portrait_url: string | null;
};

export default function DmThreadPage() {
  const params = useParams<{ threadId: string }>();
  const router = useRouter();
  const threadId = params.threadId;

  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [otherUser, setOtherUser] = useState<Writer | null>(null);
  const [currentUser, setCurrentUser] = useState<Writer | null>(null);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [showStartSessionModal, setShowStartSessionModal] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      let userId: string | null = null;

      try {
        const { data: userRes, error: userError } = await supabase.auth.getUser();
        if (userError) {
          console.error("Error getting user:", userError);
          setError(userError.message || "Failed to authenticate. Please try again.");
          setLoading(false);
          if (!mounted) return;
          window.location.href = "/login";
          return;
        }
        if (!userRes.user) {
          if (!mounted) return;
          window.location.href = "/login";
          return;
        }
        if (!mounted) return;
        userId = userRes.user.id;
        setMe(userId);
      } catch (err) {
        console.error("Exception in load:", err);
        setError(err instanceof Error ? err.message : "Failed to load. Please try again.");
        setLoading(false);
        if (!mounted) return;
        window.location.href = "/login";
        return;
      }

      if (!userId) {
        console.error("No user ID available");
        setError("Failed to authenticate. Please try again.");
        setLoading(false);
        if (!mounted) return;
        window.location.href = "/login";
        return;
      }

      // Load thread info to get other user
      const { data: threadData } = await supabase
        .from("dm_threads")
        .select("user_a, user_b")
        .eq("id", threadId)
        .single();

      if (threadData && mounted) {
        const otherUserIdValue = threadData.user_a === userId ? threadData.user_b : threadData.user_a;
        setOtherUserId(otherUserIdValue);
        
        // Load other user's writer info
        const { data: otherWriter } = await supabase
          .from("writers")
          .select("id, name, portrait_url")
          .eq("user_id", otherUserIdValue)
          .maybeSingle();

        if (otherWriter && mounted) {
          setOtherUser(otherWriter as Writer);
        }

        // Load current user's writer info
        const { data: currentWriter } = await supabase
          .from("writers")
          .select("id, name, portrait_url")
          .eq("user_id", userId)
          .maybeSingle();

        if (currentWriter && mounted) {
          setCurrentUser(currentWriter as Writer);
        }
      }

      // Load messages with sender info
      const { data: messagesData, error } = await supabase
        .from("dm_messages")
        .select("id,sender_id,body,created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (!mounted) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      // Load writer info for each message
      if (messagesData) {
        const messagesWithSenders = await Promise.all(
          messagesData.map(async (msg: any) => {
            const { data: writer } = await supabase
              .from("writers")
              .select("name, portrait_url")
              .eq("user_id", msg.sender_id)
              .maybeSingle();

            return {
              ...msg,
              sender_name: writer?.name || `User ${msg.sender_id.slice(0, 8)}`,
              sender_portrait: writer?.portrait_url || null,
            };
          })
        );
        setMessages(messagesWithSenders as Msg[]);
      }

      // Mark all messages as read when viewing the thread
      if (userId && messagesData && messagesData.length > 0) {
        const latestMessage = messagesData[messagesData.length - 1]; // Last message (most recent)
        await supabase
          .from("dm_thread_reads")
          .upsert({
            thread_id: threadId,
            user_id: userId,
            last_read_at: new Date().toISOString(),
            last_read_message_id: latestMessage.id,
          }, {
            onConflict: "thread_id,user_id"
          });
      }

      setLoading(false);
    }

    load();

    // Realtime updates
    const channel = supabase
      .channel(`dm:${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` },
        async (payload) => {
          const newMsg = payload.new as any;
          const { data: writer } = await supabase
            .from("writers")
            .select("name, portrait_url")
            .eq("user_id", newMsg.sender_id)
            .maybeSingle();

          const msgWithSender: Msg = {
            ...newMsg,
            sender_name: writer?.name || `User ${newMsg.sender_id.slice(0, 8)}`,
            sender_portrait: writer?.portrait_url || null,
          };
          setMessages((prev) => [...prev, msgWithSender]);
          
          // Mark new message as read if user is viewing the thread
          // This ensures messages are marked as read when they arrive in real-time
          if (userId) {
            await supabase
              .from("dm_thread_reads")
              .upsert({
                thread_id: threadId,
                user_id: userId,
                last_read_at: new Date().toISOString(),
                last_read_message_id: newMsg.id,
              }, {
                onConflict: "thread_id,user_id"
              });
          }
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

    const { data: insertedMessage, error } = await supabase
      .from("dm_messages")
      .insert({
        thread_id: threadId,
        sender_id: me,
        body,
      })
      .select("id")
      .single();

    if (error) {
      setError(error.message);
      setText(body); // restore
    } else if (insertedMessage && me) {
      // Mark the message as read immediately when user sends it
      await supabase
        .from("dm_thread_reads")
        .upsert({
          thread_id: threadId,
          user_id: me,
          last_read_at: new Date().toISOString(),
          last_read_message_id: insertedMessage.id,
        }, {
          onConflict: "thread_id,user_id"
        });
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link href="/dm" className="text-sm underline">
          ← Back to messages
        </Link>
        <button
          onClick={() => setShowStartSessionModal(true)}
          className="bg-fuchsia-500 text-white px-4 py-2 rounded hover:bg-fuchsia-600 transition-colors"
        >
          Start Session
        </button>
      </div>

      {/* Header with portraits */}
      {otherUser && currentUser && (
        <div className="flex items-center justify-between p-4 border rounded bg-gray-50">
          <div className="flex items-center gap-3">
            {otherUser.portrait_url ? (
              <img
                src={otherUser.portrait_url}
                alt={otherUser.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-gray-300"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-lg font-semibold border-2 border-gray-300">
                {otherUser.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-medium">{otherUser.name}</div>
              <div className="text-xs text-gray-500">Conversation partner</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-medium">{currentUser.name}</div>
              <div className="text-xs text-gray-500">You</div>
            </div>
            {currentUser.portrait_url ? (
              <img
                src={currentUser.portrait_url}
                alt={currentUser.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-gray-300"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-lg font-semibold border-2 border-gray-300">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-gray-600">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="border rounded p-4 h-[60vh] overflow-y-auto space-y-3 bg-white">
        {messages.map((m) => {
          const mine = m.sender_id === me;
          return (
            <div key={m.id} className={`flex items-start gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}>
              {!mine && (
                <div className="flex-shrink-0">
                  {m.sender_portrait ? (
                    <img
                      src={m.sender_portrait}
                      alt={m.sender_name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs">
                      {m.sender_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              )}
              <div className={`flex flex-col ${mine ? "items-end" : "items-start"} max-w-[75%]`}>
                {!mine && (
                  <div className="text-xs text-gray-500 mb-1">{m.sender_name}</div>
                )}
                <div
                  className={`rounded px-3 py-2 text-sm whitespace-pre-line ${
                    mine ? "bg-black text-white" : "bg-gray-100"
                  }`}
                >
                  {m.body}
                </div>
                <div className={`text-xs text-gray-400 mt-1 ${mine ? "text-right" : "text-left"}`}>
                  {new Date(m.created_at).toLocaleTimeString()}
                </div>
              </div>
              {mine && (
                <div className="flex-shrink-0">
                  {currentUser?.portrait_url ? (
                    <img
                      src={currentUser.portrait_url}
                      alt={currentUser.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs">
                      {currentUser?.name.charAt(0).toUpperCase() || "U"}
                    </div>
                  )}
                </div>
              )}
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

      {/* Start Session Modal */}
      {showStartSessionModal && otherUserId && (
        <StartSessionModal
          threadId={threadId}
          otherUserId={otherUserId}
          onClose={() => setShowStartSessionModal(false)}
          onSuccess={(sessionId) => {
            router.push(`/session/${sessionId}`);
          }}
        />
      )}
    </div>
  );
}

// Start Session Modal Component
function StartSessionModal({
  threadId,
  otherUserId,
  onClose,
  onSuccess,
}: {
  threadId: string;
  otherUserId: string | null;
  onClose: () => void;
  onSuccess: (sessionId: string) => void;
}) {
  const [sessionName, setSessionName] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("fantasy");
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("");
  const [isPublic, setIsPublic] = useState(false);
  const [characters, setCharacters] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableStyles = [
    { value: "fantasy", label: "Fantasy", emoji: "🧙" },
    { value: "sci-fi", label: "Sci-Fi", emoji: "🚀" },
    { value: "gothic", label: "Gothic", emoji: "🦇" },
    { value: "egypt", label: "Egypt", emoji: "🏺" },
    { value: "modern", label: "Modern", emoji: "🏙️" },
    { value: "medieval", label: "Medieval", emoji: "⚔️" },
    { value: "steampunk", label: "Steampunk", emoji: "⚙️" },
    { value: "cyberpunk", label: "Cyberpunk", emoji: "🤖" },
  ];

  useEffect(() => {
    async function loadCharacters() {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;

      const { data } = await supabase
        .from("characters")
        .select("id, name")
        .eq("user_id", userRes.user.id)
        .order("created_at", { ascending: false });

      if (data) {
        setCharacters(data);
        if (data.length > 0) {
          setSelectedCharacterId(data[0].id);
        }
      }
      setLoading(false);
    }
    loadCharacters();
  }, []);

  async function handleCreate() {
    if (!sessionName.trim()) {
      setError("Session name is required");
      return;
    }
    if (!selectedCharacterId) {
      setError("Please select a character");
      return;
    }
    if (!otherUserId) {
      setError("Unable to identify conversation partner");
      return;
    }

    setCreating(true);
    setError(null);

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      setError("Not authenticated");
      setCreating(false);
      return;
    }

    try {
      // Create session
      const { data: sessionData, error: sessionError } = await supabase
        .from("rp_sessions")
        .insert({
          user_a: userRes.user.id,
          user_b: otherUserId,
          status: "active",
          is_active: true,
        })
        .select("id")
        .single();

      if (sessionError) throw sessionError;

      // Add character to session
      const { error: charError } = await supabase
        .from("rp_session_characters")
        .insert({
          session_id: sessionData.id,
          character_id: selectedCharacterId,
        });

      if (charError) throw charError;

      // Update session with name, style, and is_public
      const { error: updateError } = await supabase
        .from("rp_sessions")
        .update({
          name: sessionName.trim() || null,
          style: selectedStyle || null,
          is_public: isPublic,
        })
        .eq("id", sessionData.id);

      if (updateError) throw updateError;

      onSuccess(sessionData.id);
    } catch (err: any) {
      setError(err.message || "Failed to create session");
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">Start Roleplay Session</h2>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Session Name</label>
            <input
              type="text"
              className="w-full border rounded p-2"
              placeholder="Enter session name..."
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Select Character</label>
            <select
              className="w-full border rounded p-2"
              value={selectedCharacterId}
              onChange={(e) => setSelectedCharacterId(e.target.value)}
            >
              {characters.map((char) => (
                <option key={char.id} value={char.id}>
                  {char.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Style</label>
            <div className="grid grid-cols-4 gap-2">
              {availableStyles.map((style) => (
                <button
                  key={style.value}
                  onClick={() => setSelectedStyle(style.value)}
                  className={`p-3 border rounded text-center ${
                    selectedStyle === style.value
                      ? "bg-black text-white border-black"
                      : "bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="text-2xl mb-1">{style.emoji}</div>
                  <div className="text-xs">{style.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Allow public viewing (narration only)</span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Public viewers will only see character narration, not OOC messages
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 border px-4 py-2 rounded hover:bg-gray-50"
            disabled={creating}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="flex-1 bg-fuchsia-500 text-white px-4 py-2 rounded hover:bg-fuchsia-600 disabled:opacity-50"
            disabled={creating}
          >
            {creating ? "Creating..." : "Start Session"}
          </button>
        </div>
      </div>
    </div>
  );
}
