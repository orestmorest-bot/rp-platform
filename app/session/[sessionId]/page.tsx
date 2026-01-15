"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { feedbackTags } from "@/lib/feedbackTags";

type SessionMessage = {
  id: string;
  sender_id: string;
  body: string;
  message_type: "ooc" | "narration";
  character_id: string | null;
  created_at: string;
  character_portrait?: string | null;
  character_name?: string | null;
  sender_portrait?: string | null;
  sender_name?: string | null;
};

type Session = {
  id: string;
  user_a: string;
  user_b: string;
  status: "active" | "closed";
  is_active: boolean;
  last_message_at: string | null;
  reminder_sent_at: string | null;
  name: string | null;
  style: string | null;
  is_public: boolean;
  max_viewers?: number;
};

type Viewer = {
  user_id: string;
  name: string;
  portrait_url: string | null;
  joined_at: string;
};

export default function SessionPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [otherUser, setOtherUser] = useState<{ name: string; portrait_url: string | null } | null>(null);
  const [participantA, setParticipantA] = useState<{ name: string; portrait_url: string | null } | null>(null);
  const [participantB, setParticipantB] = useState<{ name: string; portrait_url: string | null } | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [text, setText] = useState("");
  const [messageType, setMessageType] = useState<"ooc" | "narration">("ooc");
  const [characters, setCharacters] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [inactivityReminder, setInactivityReminder] = useState<string | null>(null);
  const [lastActivityCheck, setLastActivityCheck] = useState<Date>(new Date());
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [closing, setClosing] = useState(false);
  const [myFeedback, setMyFeedback] = useState<{ feedback: string | null; tags: string[] } | null>(null);
  const [isPublicView, setIsPublicView] = useState(false);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [maxViewers, setMaxViewers] = useState<number>(0);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reminderTimerRef = useRef<NodeJS.Timeout | null>(null);
  const viewerHeartbeatRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Check for inactivity and send reminders
  useEffect(() => {
    if (!session || !me || !session.is_active) return;

    const checkInactivity = () => {
      if (!session.last_message_at) return;

      const lastMessageTime = new Date(session.last_message_at);
      const now = new Date();
      const minutesSinceLastMessage = (now.getTime() - lastMessageTime.getTime()) / (1000 * 60);

      // If 5 minutes have passed since last message and no reminder sent
      if (minutesSinceLastMessage >= 5 && !inactivityReminder) {
        // Check if reminder was already sent (within last hour)
        const shouldSendReminder = !session.reminder_sent_at || 
          (new Date().getTime() - new Date(session.reminder_sent_at).getTime()) > 60 * 60 * 1000;

        if (shouldSendReminder) {
          sendInactivityReminder();
        }
      }
    };

    // Check every minute
    inactivityTimerRef.current = setInterval(checkInactivity, 60000);
    checkInactivity(); // Initial check

    return () => {
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
      }
    };
  }, [session, me, inactivityReminder]);

  async function sendInactivityReminder() {
    if (!session || !me) return;

    const otherUserId = session.user_a === me ? session.user_b : session.user_a;
    
    // Send reminder message
    const reminderText = "⏸️ This session has been inactive for 5 minutes. Consider pausing the session if you'll be away, or let your partner know you'll be back soon!";
    
    const { error } = await supabase.from("rp_session_messages").insert({
      session_id: sessionId,
      sender_id: me,
      message_type: "ooc",
      body: reminderText,
      character_id: null,
    });

    if (!error) {
      // Mark reminder as sent
      await supabase
        .from("rp_sessions")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", sessionId);
      
      setInactivityReminder(reminderText);
      
      // Clear reminder after 10 minutes
      reminderTimerRef.current = setTimeout(() => {
        setInactivityReminder(null);
      }, 10 * 60 * 1000);
    }
  }

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
          setError(userError.message || "Failed to authenticate. Please check your connection and try again.");
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
        setError(err instanceof Error ? err.message : "Failed to load session. Please try again.");
        setLoading(false);
        if (!mounted) return;
        window.location.href = "/login";
        return;
      }

      // Load session (including max_viewers)
      const { data: sessionData, error: sessionError } = await supabase
        .from("rp_sessions")
        .select("id, user_a, user_b, status, is_active, last_message_at, reminder_sent_at, name, style, is_public, max_viewers")
        .eq("id", sessionId)
        .single();

      if (sessionError || !sessionData) {
        setError("Session not found");
        setLoading(false);
        return;
      }

      // Check if this is a public view (user is not a participant)
      if (sessionData && userId) {
        const isParticipant = sessionData.user_a === userId || sessionData.user_b === userId;
        if (!isParticipant) {
          if (sessionData.is_public) {
            setIsPublicView(true);
          } else {
            setError("You don't have access to this session");
            setLoading(false);
            return;
          }
        }
      } else if (!userId && sessionData) {
        // No user logged in, but session exists - check if it's public
        if (sessionData.is_public) {
          setIsPublicView(true);
        } else {
          setError("You need to be logged in to view this session");
          setLoading(false);
          if (!mounted) return;
          window.location.href = "/login";
          return;
        }
      }

      if (!mounted) return;
      setSession(sessionData as Session);
      setMaxViewers(sessionData.max_viewers || 0);

      // Determine participant status (reuse the check from above)
      // Note: userId might be null if viewing as public user
      const isParticipant = userId && (sessionData.user_a === userId || sessionData.user_b === userId);
      
      if (isPublicView) {
        // For public viewers, load both participants' info
        const [userAWriterResult, userBWriterResult] = await Promise.all([
          supabase
            .from("writers")
            .select("name, portrait_url")
            .eq("user_id", sessionData.user_a)
            .maybeSingle(),
          supabase
            .from("writers")
            .select("name, portrait_url")
            .eq("user_id", sessionData.user_b)
            .maybeSingle(),
        ]);

        if (mounted) {
          setParticipantA({
            name: userAWriterResult.data?.name || `User ${sessionData.user_a.slice(0, 8)}`,
            portrait_url: userAWriterResult.data?.portrait_url || null,
          });
          setParticipantB({
            name: userBWriterResult.data?.name || `User ${sessionData.user_b.slice(0, 8)}`,
            portrait_url: userBWriterResult.data?.portrait_url || null,
          });
        }
      } else if (userId) {
        // For participants, load other user info as before
        const otherUserId = sessionData.user_a === userId ? sessionData.user_b : sessionData.user_a;
        const { data: otherWriter } = await supabase
          .from("writers")
          .select("name, portrait_url")
          .eq("user_id", otherUserId)
          .maybeSingle();

        if (otherWriter && mounted) {
          setOtherUser({
            name: otherWriter.name || `User ${otherUserId.slice(0, 8)}`,
            portrait_url: otherWriter.portrait_url,
          });
        }
      }

      // Load messages
      const { data: messagesData, error: messagesError } = await supabase
        .from("rp_session_messages")
        .select("id, sender_id, body, message_type, character_id, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (!mounted) return;

      if (messagesError) {
        setError(messagesError.message);
      } else if (messagesData) {
        // Load character and writer info for each message
        const messagesWithPortraits = await Promise.all(
          messagesData.map(async (msg: any) => {
            const message: SessionMessage = { ...msg };
            
            // Load sender writer info
            const { data: senderWriter } = await supabase
              .from("writers")
              .select("name, portrait_url")
              .eq("user_id", msg.sender_id)
              .maybeSingle();
            
            message.sender_name = senderWriter?.name || `User ${msg.sender_id.slice(0, 8)}`;
            message.sender_portrait = senderWriter?.portrait_url || null;
            
            // Load character info if it's a narration message
            if (msg.message_type === "narration" && msg.character_id) {
              const { data: character } = await supabase
                .from("characters")
                .select("name, portrait_url")
                .eq("id", msg.character_id)
                .maybeSingle(); // Use maybeSingle to handle missing characters gracefully
              
              message.character_name = character?.name || null;
              message.character_portrait = character?.portrait_url || null;
            }
            
            return message;
          })
        );
        setMessages(messagesWithPortraits);
        
        // Mark all messages as read when viewing the session
        if (userId && messagesData && messagesData.length > 0) {
          const latestMessage = messagesData[messagesData.length - 1]; // Last message (most recent)
          await supabase
            .from("rp_session_reads")
            .upsert({
              session_id: sessionId,
              user_id: userId,
              last_read_at: new Date().toISOString(),
              last_read_message_id: latestMessage.id,
            }, {
              onConflict: "session_id,user_id"
            });
        }
      }

      // Load my feedback if session is closed (only for participants)
      if (sessionData.status === "closed" && userId) {
        const { data: feedbackData } = await supabase
          .from("rp_session_feedback")
          .select("feedback, tags")
          .eq("session_id", sessionId)
          .eq("user_id", userId)
          .maybeSingle();

        if (feedbackData && mounted) {
          setMyFeedback({
            feedback: feedbackData.feedback,
            tags: feedbackData.tags || [],
          });
        }
      }

      // Load user's characters for narration - get character from session (only for participants)
      if (userId) {
        const { data: sessionCharacters } = await supabase
          .from("rp_session_characters")
          .select("character_id")
          .eq("session_id", sessionId);

        if (sessionCharacters && sessionCharacters.length > 0) {
          // Get the character that belongs to current user
          const { data: charactersData } = await supabase
            .from("characters")
            .select("id, name")
            .eq("user_id", userId)
            .in("id", sessionCharacters.map(sc => sc.character_id));

          if (charactersData && charactersData.length > 0 && mounted) {
            setCharacters(charactersData);
            setSelectedCharacterId(charactersData[0].id);
          }
        } else {
          // Fallback: load all user's characters
          const { data: charactersData } = await supabase
            .from("characters")
            .select("id, name")
            .eq("user_id", userId);

          if (charactersData && mounted) {
            setCharacters(charactersData);
            if (charactersData.length > 0) {
              setSelectedCharacterId(charactersData[0].id);
            }
          }
        }
      }

      setLoading(false);
    }

    load();


    // Subscribe to session updates (including max_viewers)
    const sessionChannel = supabase
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rp_sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          const updatedSession = payload.new as Session;
          setSession(updatedSession);
          if (updatedSession.max_viewers !== undefined) {
            setMaxViewers(updatedSession.max_viewers);
          }
        }
      )
      .subscribe();

    // Subscribe to new messages
    const messagesChannel = supabase
      .channel(`session_messages:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rp_session_messages", filter: `session_id=eq.${sessionId}` },
        async (payload) => {
          const newMsg = payload.new as any;
          
          // Load sender writer info
          const { data: senderWriter } = await supabase
            .from("writers")
            .select("name, portrait_url")
            .eq("user_id", newMsg.sender_id)
            .maybeSingle();
          
          const message: SessionMessage = {
            ...newMsg,
            sender_name: senderWriter?.name || `User ${newMsg.sender_id.slice(0, 8)}`,
            sender_portrait: senderWriter?.portrait_url || null,
          };
          
          // Load character info if it's a narration message
          if (newMsg.message_type === "narration" && newMsg.character_id) {
            const { data: character } = await supabase
              .from("characters")
              .select("name, portrait_url")
              .eq("id", newMsg.character_id)
              .maybeSingle(); // Use maybeSingle to handle missing characters gracefully
            
            message.character_name = character?.name || null;
            message.character_portrait = character?.portrait_url || null;
          }
          
          setMessages((prev) => [...prev, message]);
          
          // Mark new message as read if user is viewing the session
          // If it's from the current user, mark it as read immediately
          // If it's from the other user, mark it as read since user is viewing
          if (me) {
            await supabase
              .from("rp_session_reads")
              .upsert({
                session_id: sessionId,
                user_id: me,
                last_read_at: new Date().toISOString(),
                last_read_message_id: newMsg.id,
              }, {
                onConflict: "session_id,user_id"
              });
          }
          
          // Reset inactivity reminder when ANY new message arrives
          // Any message means the session is active, so clear the warning
          setInactivityReminder(null);
          
          // Clear reminder_sent_at in database when any message arrives
          // This ensures the inactivity check resets properly
          await supabase
            .from("rp_sessions")
            .update({ reminder_sent_at: null })
            .eq("id", sessionId);
          
          // Update session state to clear reminder_sent_at and update last_message_at
          // This ensures the inactivity timer resets properly
          setSession((prevSession) => {
            if (!prevSession) return prevSession;
            return {
              ...prevSession,
              reminder_sent_at: null,
              last_message_at: newMsg.created_at
            };
          });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(messagesChannel);
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
      }
      if (reminderTimerRef.current) {
        clearTimeout(reminderTimerRef.current);
      }
    };
  }, [sessionId, me]);

  // Separate useEffect for viewer tracking (runs after session is loaded)
  useEffect(() => {
    if (!session || !session.is_public) return; // Only track viewers for public sessions
    
    let mounted = true;
    let viewersChannel: any = null;

    // Load current viewers (shared function for both authenticated and unauthenticated)
    async function loadViewers() {
      try {
        // Get active viewers (seen in last 2 minutes)
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        const { data: viewersData, error: viewersError } = await supabase
          .from("rp_session_viewers")
          .select("user_id, joined_at, last_seen")
          .eq("session_id", sessionId)
          .gte("last_seen", twoMinutesAgo)
          .order("joined_at", { ascending: false })
          .limit(20);

        if (viewersError) {
          console.error("Error loading viewers:", viewersError);
          return;
        }

        if (!viewersData || viewersData.length === 0) {
          if (mounted) setViewers([]);
          return;
        }

        // Load writer info for each viewer
        const viewersWithDetails = await Promise.all(
          viewersData.map(async (viewer: any) => {
            const { data: writer } = await supabase
              .from("writers")
              .select("name, portrait_url")
              .eq("user_id", viewer.user_id)
              .maybeSingle();

            return {
              user_id: viewer.user_id,
              name: writer?.name || `User ${viewer.user_id.slice(0, 8)}`,
              portrait_url: writer?.portrait_url || null,
              joined_at: viewer.joined_at,
            };
          })
        );

        // Filter out participants (only show viewers, not participants)
        const nonParticipantViewers = viewersWithDetails.filter((viewer) => {
          return viewer.user_id !== session.user_a && viewer.user_id !== session.user_b;
        });

        // Sort by joined_at (most recent first) and limit to 10 for display
        nonParticipantViewers.sort((a, b) => 
          new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()
        );
        
        if (mounted) {
          setViewers(nonParticipantViewers.slice(0, 10));
        }
      } catch (err) {
        console.error("Error in loadViewers:", err);
      }
    }

    // Track viewer join (only for authenticated users)
    async function trackViewer() {
      if (!me) return;

      try {
        const { error: viewerError } = await supabase
          .from("rp_session_viewers")
          .upsert({
            session_id: sessionId,
            user_id: me,
            last_seen: new Date().toISOString(),
          }, {
            onConflict: "session_id,user_id"
          });

        if (viewerError) {
          console.error("Error tracking viewer:", viewerError);
        } else {
          // Load viewers after joining
          await loadViewers();
        }

        // Update heartbeat every 30 seconds to keep viewer status active
        viewerHeartbeatRef.current = setInterval(async () => {
          if (me && mounted) {
            await supabase
              .from("rp_session_viewers")
              .update({ last_seen: new Date().toISOString() })
              .eq("session_id", sessionId)
              .eq("user_id", me);
          }
        }, 30000);
      } catch (err) {
        console.error("Error in trackViewer:", err);
      }
    }

    // Load initial viewers (for all users)
    loadViewers();

    // For authenticated users, also track as viewer
    if (me) {
      trackViewer();
    }

    // Subscribe to viewer updates (for all users)
    viewersChannel = supabase
      .channel(`session_viewers:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rp_session_viewers", filter: `session_id=eq.${sessionId}` },
        () => {
          if (mounted) {
            loadViewers(); // Reload viewers when someone joins/leaves
          }
        }
      )
      .subscribe();

    // Cleanup: Remove viewer when component unmounts or session changes
    return () => {
      mounted = false;

      // Stop heartbeat
      if (viewerHeartbeatRef.current) {
        clearInterval(viewerHeartbeatRef.current);
        viewerHeartbeatRef.current = null;
      }

      // Remove viewer from session (only for authenticated users who were tracked)
      if (me) {
        // Fire and forget - cleanup doesn't need to wait for this
        supabase
          .from("rp_session_viewers")
          .delete()
          .eq("session_id", sessionId)
          .eq("user_id", me)
          .then(() => {
            // Successfully removed
          })
          .catch((err) => {
            console.error("Error removing viewer on cleanup:", err);
          });
      }

      // Unsubscribe from viewer channel
      if (viewersChannel) {
        supabase.removeChannel(viewersChannel);
      }
    };
  }, [sessionId, session, me]); // Re-run when session or me changes

  async function toggleSessionActive() {
    if (!session || !me) return;

    const newIsActive = !session.is_active;
    const { error } = await supabase
      .from("rp_sessions")
      .update({ is_active: newIsActive })
      .eq("id", sessionId);

    if (error) {
      setError(error.message);
    } else {
      setSession({ ...session, is_active: newIsActive });
    }
  }

  async function send() {
    if (!me || !session) return;
    if (!text.trim()) return;

    // Don't allow messages if session is closed
    if (session.status === "closed") {
      setError("Your session is closed. You cannot send messages.");
      return;
    }

    // Don't allow narration if session is paused
    if (messageType === "narration" && !session.is_active) {
      setError("Cannot send narration messages when your session is paused. Please resume first.");
      return;
    }

    const body = text;
    setText("");

    const { data: insertedMessage, error } = await supabase
      .from("rp_session_messages")
      .insert({
        session_id: sessionId,
        sender_id: me,
        message_type: messageType,
        body,
        character_id: messageType === "narration" ? selectedCharacterId : null,
      })
      .select("id")
      .single();

    if (error) {
      setError(error.message);
      setText(body); // restore
    } else if (insertedMessage) {
      // Mark the message as read immediately when user sends it
      await supabase
        .from("rp_session_reads")
        .upsert({
          session_id: sessionId,
          user_id: me,
          last_read_at: new Date().toISOString(),
          last_read_message_id: insertedMessage.id,
        }, {
          onConflict: "session_id,user_id"
        });
      
      // Clear inactivity reminder when user sends a message (they're actively roleplaying)
      setInactivityReminder(null);
      
      // Clear reminder_sent_at in database and update last_message_at
      await supabase
        .from("rp_sessions")
        .update({ 
          last_message_at: new Date().toISOString(),
          reminder_sent_at: null 
        })
        .eq("id", sessionId);
      
      // Update local session state to reflect the cleared reminder
      setSession({ ...session, reminder_sent_at: null, last_message_at: new Date().toISOString() });
    }
  }

  async function closeSession() {
    if (!me || !session || closing) return;

    setClosing(true);
    setError(null);

    try {
      // Close the session
      const { error: closeError } = await supabase
        .from("rp_sessions")
        .update({
          status: "closed",
          closed_by: me,
          closed_at: new Date().toISOString(),
          is_active: false,
        })
        .eq("id", sessionId);

      if (closeError) {
        setError(closeError.message);
        setClosing(false);
        return;
      }

      // Save feedback if provided
      if (feedback.trim() || selectedTags.length > 0) {
        const { error: feedbackError } = await supabase
          .from("rp_session_feedback")
          .insert({
            session_id: sessionId,
            user_id: me,
            feedback: feedback.trim() || null,
            tags: selectedTags.length > 0 ? selectedTags : null,
          });

        if (feedbackError) {
          // Don't fail the close operation if feedback fails
          // Error is logged but session still closes
        } else {
          setMyFeedback({ feedback: feedback.trim() || null, tags: selectedTags });
        }
      }

      // Update local session state
      setSession({
        ...session,
        status: "closed",
        is_active: false,
      });

      setShowCloseModal(false);
      setFeedback("");
      setSelectedTags([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close session");
    } finally {
      setClosing(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-sm text-gray-600">Loading…</p>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/dashboard" className="text-sm underline mt-4 block">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  if (!session) return null;

  // Style theming (same as character pages)
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

  const frameInfo = session.style ? styleFrames[session.style] : null;

  return (
    <div 
      className={`max-w-3xl mx-auto p-6 flex flex-col gap-4 min-h-screen ${
        frameInfo ? frameInfo.shell : "bg-white"
      } ${frameInfo ? frameInfo.chrome : ""} relative`}
      style={frameInfo ? { color: "var(--text)" } : {}}
    >
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-sm underline">
          ← Back to dashboard
        </Link>
        <div className="flex items-center gap-2">
          {session.status === "closed" ? (
            <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Closed</span>
          ) : session.is_active ? (
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Active</span>
          ) : (
            <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">Paused</span>
          )}
          {session.is_public && !isPublicView && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Public</span>
          )}
          {session.status !== "closed" && !isPublicView && (
            <>
              <button
                onClick={async () => {
                  if (!session || !me) return;
                  const newIsPublic = !session.is_public;
                  setError(null); // Clear previous errors
                  const { error } = await supabase
                    .from("rp_sessions")
                    .update({ is_public: newIsPublic })
                    .eq("id", sessionId);
                  if (error) {
                    console.error("Error updating session public status:", error);
                    setError(error.message);
                  } else {
                    console.log(`✅ Session ${newIsPublic ? 'made public' : 'made private'} successfully`);
                    setSession({ ...session, is_public: newIsPublic });
                    // Show a temporary success message
                    if (newIsPublic) {
                      const successMsg = "Session is now public! Others can view it in 'Sessions to Watch'.";
                      setError(null);
                      setTimeout(() => {
                        // You can add a toast notification here if needed
                        console.log(successMsg);
                      }, 100);
                    }
                  }
                }}
                className={`text-sm border px-3 py-1 rounded hover:bg-gray-50 ${
                  session.is_public ? "bg-blue-50 border-blue-300 text-blue-700" : ""
                }`}
              >
                {session.is_public ? "Make Private" : "Make Public"}
              </button>
              <button
                onClick={toggleSessionActive}
                className="text-sm border px-3 py-1 rounded hover:bg-gray-50"
              >
                {session.is_active ? "Pause" : "Resume"}
              </button>
              <button
                onClick={() => setShowCloseModal(true)}
                className="text-sm border border-red-300 text-red-600 px-3 py-1 rounded hover:bg-red-50"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>

      {/* Viewer Counter - Show for public sessions */}
      {session.is_public && (
        <div className={`flex items-center gap-3 p-3 border rounded ${frameInfo ? "bg-white/10 backdrop-blur-sm border-white/20" : "bg-white/50 backdrop-blur-sm"}`}>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-sm font-semibold ${frameInfo ? "text-white" : "text-gray-700"}`}>
              👁️ {viewers.length} {viewers.length === 1 ? 'viewer' : 'viewers'}
            </span>
            {maxViewers > 0 && maxViewers > viewers.length && (
              <span className={`text-xs ${frameInfo ? "text-white/70" : "text-gray-500"}`}>
                (Peak: {maxViewers})
              </span>
            )}
          </div>
          {viewers.length > 0 && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className={`text-xs ${frameInfo ? "text-white/80" : "text-gray-600"} whitespace-nowrap`}>
                Most recent:
              </span>
              <div className="flex -space-x-2 flex-1 min-w-0 overflow-hidden">
                {viewers.slice(0, 8).map((viewer) => (
                  <div key={viewer.user_id} className="relative group flex-shrink-0">
                    {viewer.portrait_url ? (
                      <img
                        src={viewer.portrait_url}
                        alt={viewer.name}
                        className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm hover:scale-110 transition-transform cursor-pointer"
                        title={`${viewer.name} (joined ${new Date(viewer.joined_at).toLocaleTimeString()})`}
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold border-2 border-white shadow-sm hover:scale-110 transition-transform cursor-pointer"
                        title={`${viewer.name} (joined ${new Date(viewer.joined_at).toLocaleTimeString()})`}
                      >
                        {viewer.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
                {viewers.length > 8 && (
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 border-white shadow-sm flex-shrink-0 ${
                      frameInfo ? "bg-white/20 text-white" : "bg-gray-300 text-gray-600"
                    }`}
                    title={`+${viewers.length - 8} more viewers`}
                  >
                    +{viewers.length - 8}
                  </div>
                )}
              </div>
            </div>
          )}
          {viewers.length === 0 && (
            <span className={`text-xs ${frameInfo ? "text-white/70" : "text-gray-500"} italic`}>
              No viewers currently
            </span>
          )}
        </div>
      )}

      {(otherUser || (isPublicView && participantA && participantB)) && (
        <div className={`flex items-center gap-3 p-3 border rounded ${frameInfo ? frameInfo.portrait : "bg-gray-50"}`}>
          {isPublicView && participantA && participantB ? (
            <>
              {/* Show both participants for public view */}
              <div className="flex -space-x-3">
                {participantA.portrait_url ? (
                  <img
                    src={participantA.portrait_url}
                    alt={participantA.name}
                    className="w-10 h-10 rounded-full object-cover border-2 border-white"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center border-2 border-white">
                    {participantA.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {participantB.portrait_url ? (
                  <img
                    src={participantB.portrait_url}
                    alt={participantB.name}
                    className="w-10 h-10 rounded-full object-cover border-2 border-white"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center border-2 border-white">
                    {participantB.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <div className={`font-medium ${frameInfo ? frameInfo.headerAccent.split(' ')[0] : ""}`}>
                  {session.name || "Roleplay Session"}
                </div>
                <div className={`text-xs ${frameInfo ? "opacity-70" : "text-gray-500"}`}>
                  {participantA.name} & {participantB.name}
                </div>
              </div>
            </>
          ) : otherUser ? (
            <>
              {otherUser.portrait_url ? (
                <img
                  src={otherUser.portrait_url}
                  alt={otherUser.name}
                  className="w-10 h-10 rounded-full object-cover border-2"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center border-2">
                  {otherUser.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className={`font-medium ${frameInfo ? frameInfo.headerAccent.split(' ')[0] : ""}`}>
                  {session.name || "Roleplay Session"}
                </div>
                <div className={`text-xs ${frameInfo ? "opacity-70" : "text-gray-500"}`}>
                  {otherUser.name}
                </div>
              </div>
            </>
          ) : null}
          {isPublicView && (
            <div className="ml-auto text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
              Public View
            </div>
          )}
          {isPublicView && session.is_active && (
            <div className="ml-auto flex items-center gap-1 text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-medium">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Live
            </div>
          )}
        </div>
      )}

      {inactivityReminder && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
          <p className="text-sm text-yellow-800">{inactivityReminder}</p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {session.status === "closed" && myFeedback && (
        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <h3 className="font-semibold text-blue-900 mb-2">Your Feedback</h3>
          {myFeedback.tags && myFeedback.tags.length > 0 && (
            <div className="mb-3">
              <div className="flex flex-wrap gap-2">
                {myFeedback.tags.map((tagId) => {
                  const tag = feedbackTags.find((t) => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <span
                      key={tagId}
                      className={`text-xs px-2 py-1 rounded ${
                        tag.positive
                          ? "bg-green-100 text-green-800 border border-green-300"
                          : "bg-red-100 text-red-800 border border-red-300"
                      }`}
                    >
                      {tag.emoji} {tag.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {myFeedback.feedback && (
            <p className="text-sm text-blue-800 whitespace-pre-line">{myFeedback.feedback}</p>
          )}
        </div>
      )}

      <div className="border rounded p-4 h-[60vh] overflow-y-auto space-y-3 bg-white">
        {(isPublicView 
          ? messages.filter(m => m.message_type === "narration")
          : messages
        ).map((m) => {
          const mine = m.sender_id === me;
          const isNarration = m.message_type === "narration";
          const portraitUrl = isNarration ? m.character_portrait : m.sender_portrait;
          const displayName = isNarration ? m.character_name : m.sender_name;
          
          return (
            <div key={m.id} className={`flex items-start gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}>
              <div className="flex-shrink-0">
                {portraitUrl ? (
                  <img
                    src={portraitUrl}
                    alt={displayName || "Avatar"}
                    className="w-10 h-10 rounded-full object-cover border-2"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center border-2">
                    {(displayName || "U").charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className={`flex flex-col ${mine ? "items-end" : "items-start"} max-w-[75%]`}>
                {/* Always show character name for narration messages - prominently displayed */}
                {isNarration ? (
                  <div className="text-sm text-purple-700 mb-1 font-semibold">
                    {displayName || "Unknown Character"}
                  </div>
                ) : displayName ? (
                  <div className="text-xs text-gray-500 mb-1">{displayName}</div>
                ) : null}
                <div
                  className={`rounded px-3 py-2 text-sm whitespace-pre-line ${
                    isNarration
                      ? "bg-purple-100 text-purple-900 italic"
                      : mine
                      ? "bg-black text-white"
                      : "bg-gray-100"
                  }`}
                >
                  {m.body}
                </div>
                <div className={`text-xs text-gray-400 mt-1 ${mine ? "text-right" : "text-left"}`}>
                  {new Date(m.created_at).toLocaleTimeString()}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {session.status !== "closed" && !isPublicView && (
        <div className="space-y-2">
          {session.is_active && (
            <div className="flex gap-2">
              <button
                onClick={() => setMessageType("ooc")}
                className={`px-3 py-1 text-sm border rounded ${
                  messageType === "ooc" ? "bg-black text-white" : "bg-white"
                }`}
              >
                OOC
              </button>
              <button
                onClick={() => setMessageType("narration")}
                className={`px-3 py-1 text-sm border rounded ${
                  messageType === "narration" ? "bg-purple-600 text-white" : "bg-white"
                }`}
              >
                Narration
              </button>
            </div>
          )}


          {!session.is_active && (
            <p className="text-xs text-gray-500">
              My session is paused. Narration is disabled. Only OOC messages are allowed.
            </p>
          )}

          <div className="flex gap-2">
            <input
              className="flex-1 border rounded p-2"
              placeholder={session.is_active ? "Write…" : "My session paused - OOC only"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              disabled={!session.is_active && messageType === "narration"}
            />
            <button
              className="bg-black text-white px-4 rounded disabled:opacity-50"
              onClick={send}
              disabled={!session.is_active && messageType === "narration"}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {session.status === "closed" && !isPublicView && (
        <div className="bg-gray-50 border rounded p-4 text-center">
          <p className="text-sm text-gray-600">Your session is closed. No new messages can be sent.</p>
        </div>
      )}
      {isPublicView && (
        <div className="bg-blue-50 border border-blue-200 rounded p-4 text-center">
          <p className="text-sm text-blue-800">Public viewing mode: Only narration messages are visible.</p>
        </div>
      )}

      {/* Close Session Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Close My Session</h2>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to close your session? You can optionally provide feedback below.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Tags (optional)</label>
                <p className="text-xs text-gray-500 mb-3">Select tags that describe this roleplay</p>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-green-700 mb-2">Positive</p>
                    <div className="flex flex-wrap gap-2">
                      {feedbackTags
                        .filter((tag) => tag.positive)
                        .map((tag) => (
                          <label
                            key={tag.id}
                            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded cursor-pointer border transition-colors ${
                              selectedTags.includes(tag.id)
                                ? "bg-green-100 text-green-800 border-green-300"
                                : "bg-white text-gray-700 border-gray-300 hover:bg-green-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedTags.includes(tag.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTags([...selectedTags, tag.id]);
                                } else {
                                  setSelectedTags(selectedTags.filter((t) => t !== tag.id));
                                }
                              }}
                              className="sr-only"
                            />
                            <span>{tag.emoji}</span>
                            {tag.label}
                          </label>
                        ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-red-700 mb-2">Areas for Improvement</p>
                    <div className="flex flex-wrap gap-2">
                      {feedbackTags
                        .filter((tag) => !tag.positive)
                        .map((tag) => (
                          <label
                            key={tag.id}
                            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded cursor-pointer border transition-colors ${
                              selectedTags.includes(tag.id)
                                ? "bg-red-100 text-red-800 border-red-300"
                                : "bg-white text-gray-700 border-gray-300 hover:bg-red-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedTags.includes(tag.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTags([...selectedTags, tag.id]);
                                } else {
                                  setSelectedTags(selectedTags.filter((t) => t !== tag.id));
                                }
                              }}
                              className="sr-only"
                            />
                            <span>{tag.emoji}</span>
                            {tag.label}
                          </label>
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Additional Feedback (optional)</label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Share your thoughts about your session..."
                  className="w-full border rounded p-2 text-sm min-h-[100px]"
                  rows={4}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCloseModal(false);
                  setFeedback("");
                  setSelectedTags([]);
                }}
                className="flex-1 border px-4 py-2 rounded hover:bg-gray-50"
                disabled={closing}
              >
                Cancel
              </button>
              <button
                onClick={closeSession}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
                disabled={closing}
              >
                {closing ? "Closing..." : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
