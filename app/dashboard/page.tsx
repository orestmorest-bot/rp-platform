"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

type Character = {
  id: string;
  name: string;
  summary: string | null;
  sex: string;
  age: number | null;
  portrait_url: string | null;
  created_at: string;
  user_id?: string;
  role_tags?: string[];
};

type ThreadWithLatest = {
  id: string;
  type: "dm" | "session";
  user_a: string;
  user_b: string;
  created_at: string;
  status?: "active" | "paused" | "closed";
  last_message_at?: string | null;
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

type Writer = {
  id: string;
  user_id: string;
  name: string;
  portrait_url: string | null;
  description: string | null;
  created_at: string;
  last_seen?: string;
  likes_count?: number;
};

type ChatMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name: string;
  sender_portrait: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Feed state
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedPosts, setFeedPosts] = useState<FeedRow[]>([]);

  // Main page features state
  const [onlineWriters, setOnlineWriters] = useState<Writer[]>([]);
  const [topWriters, setTopWriters] = useState<Writer[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Current user's writer info for header
  const [currentWriter, setCurrentWriter] = useState<Writer | null>(null);

  // Messages state
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [threads, setThreads] = useState<ThreadWithLatest[]>([]);

  // Session invitations state
  const [pendingSessionInvitations, setPendingSessionInvitations] = useState<any[]>([]);
  
  // Friend requests state
  const [pendingFriendRequests, setPendingFriendRequests] = useState<any[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Sessions to Watch state
  const [watchSessions, setWatchSessions] = useState<Array<{
    id: string;
    name: string | null;
    is_active: boolean;
    last_message_at: string | null;
    user_a: string;
    user_b: string;
    user_a_name: string;
    user_b_name: string;
    user_a_portrait: string | null;
    user_b_portrait: string | null;
  }>>([]);
  const [watchSessionsLoading, setWatchSessionsLoading] = useState(true);

  // Character search state
  const [allCharacters, setAllCharacters] = useState<Character[]>([]);
  const [filteredCharacters, setFilteredCharacters] = useState<Character[]>([]);
  const [characterSearchName, setCharacterSearchName] = useState("");
  const [characterSearchTags, setCharacterSearchTags] = useState("");
  const [characterSearchSex, setCharacterSearchSex] = useState<"all" | "male" | "female" | "non_binary">("all");

  // Announcement search/filter state
  const [allAnnouncements, setAllAnnouncements] = useState<FeedRow[]>([]);
  const [filteredAnnouncements, setFilteredAnnouncements] = useState<FeedRow[]>([]);
  const [announcementSearchText, setAnnouncementSearchText] = useState("");
  const [announcementFilterOnline, setAnnouncementFilterOnline] = useState(false);
  const [announcementFilterTopWriters, setAnnouncementFilterTopWriters] = useState(false);
  const [announcementFilterNewest, setAnnouncementFilterNewest] = useState(true);
  const [announcementFilterERP, setAnnouncementFilterERP] = useState<"all" | "yes" | "no">("all");

  // Update last_seen when component mounts and periodically
  useEffect(() => {
    async function updateLastSeen() {
      const { data: userRes } = await supabase.auth.getUser();
      if (userRes.user) {
        await supabase
          .from("writers")
          .update({ last_seen: new Date().toISOString() })
          .eq("user_id", userRes.user.id);
      }
    }

    updateLastSeen();
    const interval = setInterval(updateLastSeen, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    let mounted = true;
    let chatChannel: any = null;

    async function init() {
      let userId: string | null = null;
      
      try {
        const { data: userRes, error: userError } = await supabase.auth.getUser();
        if (userError) {
          console.error("Error getting user:", userError);
          console.error("Error details:", JSON.stringify(userError, null, 2));
          if (userError.message && (userError.message.includes("Failed to fetch") || userError.message.includes("Network"))) {
            console.error("Network error detected. Please check:");
            console.error("1. NEXT_PUBLIC_SUPABASE_URL is correct in .env.local");
            console.error("2. NEXT_PUBLIC_SUPABASE_ANON_KEY is correct in .env.local");
            console.error("3. Dev server was restarted after adding env variables");
            console.error("4. Internet connection is working");
            console.error("5. Supabase project is accessible");
          }
          router.push("/login");
          return;
        }
        if (!userRes.user) {
          router.push("/login");
          return;
        }
        userId = userRes.user.id;
        setCurrentUserId(userId);
      } catch (err) {
        console.error("Exception in init:", err);
        console.error("This might be a network or configuration issue. Check browser console and Supabase configuration.");
        router.push("/login");
        return;
      }
      
      if (!userId) {
        console.error("No user ID available");
        router.push("/login");
        return;
      }
      
      loadFeed();
      loadMessages(userId);
      loadAllCharacters();
      loadSessionInvitations(userId);
      loadFriendRequests(userId);
      loadWatchSessions(userId);
      
      // Load current user's writer info for header
      const { data: writerData, error: writerError } = await supabase
        .from("writers")
        .select("id, name, portrait_url")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (writerError && writerError.code && writerError.message) {
        console.error("Error loading current writer:", writerError.code, writerError.message);
      }
      
      if (writerData && mounted) {
        setCurrentWriter(writerData as Writer);
        // Check if onboarding should be shown
        if (typeof window !== 'undefined') {
          const dismissed = localStorage.getItem('onboarding_dismissed');
          setShowOnboarding(!dismissed);
        }
      }
      
      // Load main features and set up chat subscription
      const cleanup = await loadMainFeatures();
      if (cleanup) {
        chatChannel = cleanup;
      }
      
      // Subscribe to session invitations
      const sessionChannel = supabase
        .channel("session_invitations")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "rp_sessions",
            filter: `pending_character_selection_user_id=eq.${userId}`,
          },
          () => {
            loadSessionInvitations(userId);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rp_sessions",
            filter: `pending_character_selection_user_id=eq.${userId}`,
          },
          () => {
            loadSessionInvitations(userId);
          }
        )
        .subscribe();
      
      // Subscribe to friend requests
      const friendRequestChannel = supabase
        .channel("friend_requests")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "friend_requests",
            filter: `receiver_id=eq.${userId}`,
          },
          () => {
            loadFriendRequests(userId);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "friend_requests",
            filter: `receiver_id=eq.${userId}`,
          },
          () => {
            loadFriendRequests(userId);
          }
        )
        .subscribe();
      
      // Subscribe to public sessions for watch list updates
      const watchSessionsChannel = supabase
        .channel("watch_sessions")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "rp_sessions",
            filter: `is_public=eq.true`,
          },
          () => {
            if (mounted && userId) {
              loadWatchSessions(userId);
            }
          }
        )
        .subscribe();
      
      return () => {
        mounted = false;
        if (chatChannel) {
          supabase.removeChannel(chatChannel);
        }
        supabase.removeChannel(sessionChannel);
        supabase.removeChannel(friendRequestChannel);
        supabase.removeChannel(watchSessionsChannel);
      };
    }
    
    init();

  }, [router]);
  
  async function loadFriendRequests(userId: string) {
    const { data: requests } = await supabase
      .from("friend_requests")
      .select("id, requester_id, receiver_id, status, created_at")
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    
    if (requests && requests.length > 0) {
      const formatted = await Promise.all(
        requests.map(async (req: any) => {
          // Load writer info for the requester
          const { data: requesterWriter } = await supabase
            .from("writers")
            .select("name, portrait_url")
            .eq("user_id", req.requester_id)
            .maybeSingle();
          
          return {
            id: req.id,
            requester_id: req.requester_id,
            requesterName: requesterWriter?.name || `User ${req.requester_id.slice(0, 8)}`,
            requesterPortrait: requesterWriter?.portrait_url || null,
            created_at: req.created_at,
          };
        })
      );
      setPendingFriendRequests(formatted);
    } else {
      setPendingFriendRequests([]);
    }
  }
  
  async function loadSessionInvitations(userId: string) {
    const { data: invitations } = await supabase
      .from("rp_sessions")
      .select("id, user_a, user_b, created_at")
      .eq("pending_character_selection_user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    
    if (invitations && invitations.length > 0) {
      const formatted = await Promise.all(
        invitations.map(async (inv: any) => {
          const otherUserId = inv.user_a === userId ? inv.user_b : inv.user_a;
          
          // Load writer info for the other user
          const { data: otherWriter } = await supabase
            .from("writers")
            .select("name, portrait_url")
            .eq("user_id", otherUserId)
            .maybeSingle();
          
          return {
            id: inv.id,
            otherUserId,
            otherWriterName: otherWriter?.name || `User ${otherUserId.slice(0, 8)}`,
            otherWriterPortrait: otherWriter?.portrait_url,
            created_at: inv.created_at,
          };
        })
      );
      setPendingSessionInvitations(formatted);
    } else {
      setPendingSessionInvitations([]);
    }
  }

  async function loadWatchSessions(currentUserId: string) {
    setWatchSessionsLoading(true);
    
    try {
      // First, test if we can query the table at all and check the column exists
      // Try a simple query first to see if is_public column exists
      const { data: testQuery, error: testError } = await supabase
        .from("rp_sessions")
        .select("id, is_public, status")
        .limit(5);
      
      if (testError) {
        if (testError.message.includes("column") && testError.message.includes("is_public")) {
          console.error("❌ ERROR: The 'is_public' column doesn't exist in the database!");
          console.error("Please run the SQL migration: add_session_metadata.sql");
        } else {
          console.error("❌ Error querying rp_sessions table:", testError);
        }
        setWatchSessions([]);
        setWatchSessionsLoading(false);
        return;
      }
      
      console.log("✅ Database connection OK. Sample sessions:", testQuery?.length || 0);
      if (testQuery && testQuery.length > 0) {
        console.log("Sample session data:", testQuery);
      }
      
      // Now load ALL public sessions (active and paused, but not closed)
      // A session can be paused (is_active=false) but still public and viewable
      // Try multiple approaches to query public sessions
      let publicSessions: any[] | null = null;
      let error: any = null;
      
      // First attempt: explicit boolean true
      const { data: publicSessionsData1, error: error1 } = await supabase
        .from("rp_sessions")
        .select("id, name, is_public, is_active, last_message_at, user_a, user_b, status")
        .eq("is_public", true);
      
      if (error1) {
        console.error("❌ Query with .eq('is_public', true) failed:", error1);
        
        // Second attempt: try without filter to see if query works at all
        const { data: allSessions, error: error2 } = await supabase
          .from("rp_sessions")
          .select("id, name, is_public, is_active, last_message_at, user_a, user_b, status")
          .limit(20);
        
        if (error2) {
          console.error("❌ Query without filter also failed:", error2);
          error = error2;
        } else {
          console.log("✅ Query without filter succeeded. Found sessions:", allSessions?.length || 0);
          if (allSessions && allSessions.length > 0) {
            console.log("All sessions sample:", allSessions.map((s: any) => ({
              id: s.id,
              is_public: s.is_public,
              is_public_type: typeof s.is_public,
              status: s.status
            })));
            
            // Filter client-side for is_public = true
            const publicOnes = allSessions.filter((s: any) => {
              // Handle both boolean true and string "true"
              return s.is_public === true || s.is_public === "true" || s.is_public === 1;
            });
            console.log(`📊 Found ${publicOnes.length} public sessions after client-side filter`);
            publicSessions = publicOnes;
          } else {
            publicSessions = [];
          }
        }
      } else {
        publicSessions = publicSessionsData1;
        console.log(`✅ Query with .eq('is_public', true) succeeded. Found ${publicSessions?.length || 0} sessions`);
        error = null; // Clear error since query succeeded
      }
      
      // If we still have an error, try additional debugging
      if (error) {
        console.error("❌ Error loading watch sessions:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        console.error("Error details:", JSON.stringify(error, null, 2));
        
        // Try a simpler query to debug
        console.log("🔍 Attempting simpler query to debug...");
        const { data: simpleTest, error: simpleError } = await supabase
          .from("rp_sessions")
          .select("id, is_public, status")
          .limit(10);
        
        if (simpleError) {
          console.error("❌ Simple query also failed:", simpleError);
          setWatchSessions([]);
          setWatchSessionsLoading(false);
          return;
        } else {
          console.log("✅ Simple query succeeded. Found sessions:", simpleTest?.length || 0);
          if (simpleTest && simpleTest.length > 0) {
            console.log("Sample sessions:", simpleTest);
            const publicOnes = simpleTest.filter((s: any) => s.is_public === true || s.is_public === "true" || s.is_public === 1);
            console.log("Public sessions in sample:", publicOnes.length);
          }
        }
        
        setWatchSessions([]);
        setWatchSessionsLoading(false);
        return;
      }
      
      // If no public sessions found, check if any sessions exist at all
      if (!publicSessions || publicSessions.length === 0) {
        console.log("⚠️ No public sessions found. Running comprehensive diagnostics...");
        
        // Try to query ALL sessions (without is_public filter) to check if RLS is blocking
        const { data: allSessionsCheck, error: allSessionsError } = await supabase
          .from("rp_sessions")
          .select("id, is_public, status, user_a, user_b")
          .limit(10);
        
        if (allSessionsError) {
          console.error("❌ ERROR: Cannot query sessions table at all!");
          console.error("This likely means RLS (Row Level Security) is blocking access.");
          console.error("Error details:", allSessionsError);
          console.error("\n🔧 SOLUTION: You need to create an RLS policy in Supabase:");
          console.error("Go to: Supabase Dashboard → Authentication → Policies → rp_sessions");
          console.error("Create policy: 'SELECT' using: (is_public = true)");
          console.error("\nOr run this SQL in Supabase SQL Editor:");
          console.error(`CREATE POLICY "Anyone can view public sessions"
ON rp_sessions
FOR SELECT
USING (is_public = true);`);
        } else if (allSessionsCheck && allSessionsCheck.length > 0) {
          console.log(`✅ Can query sessions table. Found ${allSessionsCheck.length} total sessions.`);
          const publicOnes = allSessionsCheck.filter((s: any) => {
            const isPublic = s.is_public === true || s.is_public === "true" || s.is_public === 1 || s.is_public === "t";
            return isPublic;
          });
          console.log(`📊 Public sessions in sample: ${publicOnes.length}`);
          
          if (publicOnes.length > 0) {
            console.log("🔍 Found public sessions but query filtered them out. Details:");
            publicOnes.forEach((s: any, i: number) => {
              const isParticipant = s.user_a === currentUserId || s.user_b === currentUserId;
              const isClosed = s.status === "closed";
              console.log(`  Session ${i + 1} (${s.id}):`);
              console.log(`    - is_public: ${s.is_public} (type: ${typeof s.is_public})`);
              console.log(`    - status: ${s.status || "null"}`);
              console.log(`    - You are participant: ${isParticipant}`);
              console.log(`    - Is closed: ${isClosed}`);
              if (isParticipant) console.log(`    ⚠️ FILTERED OUT: You are a participant (own session)`);
              if (isClosed) console.log(`    ⚠️ FILTERED OUT: Session is closed`);
            });
          } else {
            console.log("❌ No sessions have is_public = true in the sample.");
            console.log("💡 SOLUTION: Make a session public by clicking 'Make Public' button on a session page.");
            console.log("   Or update in database: UPDATE rp_sessions SET is_public = true WHERE id = 'your-session-id';");
          }
        } else {
          console.log("⚠️ No sessions exist in the database at all.");
        }
      }
      
      console.log("=== DEBUG: Public Sessions Query ===");
      console.log("Current User ID:", currentUserId);
      console.log("All public sessions found (before filtering):", publicSessions?.length || 0);
      
      if (publicSessions && publicSessions.length > 0) {
        console.log("Raw sessions data:", publicSessions);
        publicSessions.forEach((s: any, i: number) => {
          console.log(`Session ${i + 1}:`, {
            id: s.id,
            name: s.name,
            is_public: s.is_public,
            is_active: s.is_active,
            status: s.status || "null",
            user_a: s.user_a,
            user_b: s.user_b,
            isUserParticipant: s.user_a === currentUserId || s.user_b === currentUserId
          });
        });
      } else {
        console.log("⚠️ No public sessions found. Possible reasons:");
        console.log("1. No sessions have is_public = true");
        console.log("2. RLS policies might be blocking access");
        console.log("3. Database query issue");
        
        // Check if any sessions exist at all
        const { data: anySessions, error: anyError } = await supabase
          .from("rp_sessions")
          .select("id, is_public")
          .limit(5);
        
        if (anyError) {
          console.error("❌ Cannot even query sessions table:", anyError);
        } else {
          console.log(`📊 Total sessions in database: ${anySessions?.length || 0}`);
          if (anySessions && anySessions.length > 0) {
            const publicCount = anySessions.filter((s: any) => s.is_public === true).length;
            console.log(`📊 Public sessions in sample: ${publicCount}`);
          }
        }
      }
      
      // Filter out closed sessions and sessions where user is a participant (client-side for reliability)
      const filteredSessions = (publicSessions || []).filter(
        (session: any) => {
          // Exclude closed sessions
          if (session.status === "closed") {
            console.log(`Filtering out session ${session.id} - status is closed`);
            return false;
          }
          
          // Exclude sessions where user is a participant
          const isParticipant = session.user_a === currentUserId || session.user_b === currentUserId;
          if (isParticipant) {
            console.log(`Filtering out session ${session.id} - user is participant`);
            return false;
          }
          
          return true;
        }
      );
      
      console.log("Filtered sessions (excluding user's own):", filteredSessions.length);
      if (filteredSessions.length > 0) {
        console.log("Final sessions to display:", filteredSessions);
      }
      console.log("=== END DEBUG ===");
      
      if (filteredSessions && filteredSessions.length > 0) {
        const sessionsWithDetails = await Promise.all(
          filteredSessions.map(async (session: any) => {
            try {
              // Load writer info for both users
              const [userAWriterResult, userBWriterResult] = await Promise.all([
                supabase
                  .from("writers")
                  .select("name, portrait_url")
                  .eq("user_id", session.user_a)
                  .maybeSingle(),
                supabase
                  .from("writers")
                  .select("name, portrait_url")
                  .eq("user_id", session.user_b)
                  .maybeSingle(),
              ]);
              
              return {
                id: session.id,
                name: session.name,
                is_active: session.is_active,
                last_message_at: session.last_message_at,
                user_a: session.user_a,
                user_b: session.user_b,
                user_a_name: userAWriterResult.data?.name || `User ${session.user_a.slice(0, 8)}`,
                user_b_name: userBWriterResult.data?.name || `User ${session.user_b.slice(0, 8)}`,
                user_a_portrait: userAWriterResult.data?.portrait_url || null,
                user_b_portrait: userBWriterResult.data?.portrait_url || null,
              };
            } catch (err) {
              console.error("Error loading writer info for session:", session.id, err);
              // Return session with fallback names even if writer lookup fails
              return {
                id: session.id,
                name: session.name,
                is_active: session.is_active,
                last_message_at: session.last_message_at,
                user_a: session.user_a,
                user_b: session.user_b,
                user_a_name: `User ${session.user_a.slice(0, 8)}`,
                user_b_name: `User ${session.user_b.slice(0, 8)}`,
                user_a_portrait: null,
                user_b_portrait: null,
              };
            }
          })
        );
      
      // Sort: active sessions first, then by last_message_at (most recent first)
      sessionsWithDetails.sort((a, b) => {
        if (a.is_active && !b.is_active) return -1;
        if (!a.is_active && b.is_active) return 1;
        if (a.last_message_at && b.last_message_at) {
          return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
        }
        if (a.last_message_at) return -1;
        if (b.last_message_at) return 1;
        return 0;
      });
      
        setWatchSessions(sessionsWithDetails);
      } else {
        setWatchSessions([]);
      }
    } catch (err) {
      console.error("Exception in loadWatchSessions:", err);
      setWatchSessions([]);
    } finally {
      setWatchSessionsLoading(false);
    }
  }

  async function loadFeed() {
    setFeedLoading(true);
    
    // Get current user to exclude their announcements
    const { data: userRes } = await supabase.auth.getUser();
    const currentUserId = userRes.user?.id;
    
    let query = supabase
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
      `);
    
    // Exclude current user's announcements from main feed
    if (currentUserId) {
      query = query.neq("user_id", currentUserId);
    }
    
    const { data, error } = await query.order("created_at", { ascending: false });

    if (!error && data) {
      const transformed = (data ?? []).map((item: any) => ({
        ...item,
        character: Array.isArray(item.character)
          ? item.character[0]
          : item.character,
      })) as FeedRow[];
      setFeedPosts(transformed);
      setAllAnnouncements(transformed);
      setFilteredAnnouncements(transformed);
    }
    setFeedLoading(false);
  }

  async function loadMainFeatures() {
    // Update last_seen for current user
    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user) {
      await supabase
        .from("writers")
        .update({ last_seen: new Date().toISOString() })
        .eq("user_id", userRes.user.id);
    }

    // Load online writers (active in last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: onlineData } = await supabase
      .from("writers")
      .select(`
        id,
        user_id,
        name,
        portrait_url,
        last_seen
      `)
      .gte("last_seen", fiveMinutesAgo)
      .order("last_seen", { ascending: false })
      .limit(20);

    if (onlineData) {
      setOnlineWriters(onlineData as Writer[]);
    }

    // Load top writers by likes
    const { data: topWritersData } = await supabase
      .from("writers")
      .select(`
        id,
        user_id,
        name,
        portrait_url,
        description,
        created_at,
        last_seen
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (topWritersData) {
      // Get like counts for each writer
      const writersWithLikes = await Promise.all(
        topWritersData.map(async (writer) => {
      const { count } = await supabase
        .from("writer_likes")
        .select("id", { count: "exact", head: true })
            .eq("writer_id", writer.id);
          return {
            ...writer,
            likes_count: count || 0,
          };
        })
      );

      // Sort by likes and take top 10
      const sorted = writersWithLikes
        .sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0))
        .slice(0, 10);
      setTopWriters(sorted);
    }

    // Load general chat messages
    const { data: chatData } = await supabase
      .from("general_chat_messages")
      .select("id, sender_id, body, created_at")
      .order("created_at", { ascending: true })
      .limit(100);

    if (chatData) {
      // Get sender names and portraits
      const messagesWithSenders = await Promise.all(
        chatData.map(async (msg: any) => {
          const { data: writer } = await supabase
            .from("writers")
            .select("name, portrait_url")
            .eq("user_id", msg.sender_id)
            .maybeSingle();

          return {
            id: msg.id,
            sender_id: msg.sender_id,
            body: msg.body,
            created_at: msg.created_at,
            sender_name: writer?.name || `User ${msg.sender_id.slice(0, 8)}`,
            sender_portrait: writer?.portrait_url || null,
          };
        })
      );
      setChatMessages(messagesWithSenders);
    }

    // Subscribe to new chat messages
    const channel = supabase
      .channel("general_chat")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "general_chat_messages",
        },
        async (payload) => {
          const newMsg = payload.new as any;
          const { data: writer } = await supabase
            .from("writers")
            .select("name, portrait_url")
            .eq("user_id", newMsg.sender_id)
            .maybeSingle();

          const messageWithSender: ChatMessage = {
            id: newMsg.id,
            sender_id: newMsg.sender_id,
            body: newMsg.body,
            created_at: newMsg.created_at,
            sender_name: writer?.name || `User ${newMsg.sender_id.slice(0, 8)}`,
            sender_portrait: writer?.portrait_url || null,
          };

          setChatMessages((prev) => [...prev, messageWithSender]);
        }
      )
      .subscribe();

    return channel;
  }

  async function sendChatMessage() {
    if (!chatText.trim() || !currentUserId || sendingChat) return;

    setSendingChat(true);
    const { error } = await supabase.from("general_chat_messages").insert({
      sender_id: currentUserId,
      body: chatText.trim(),
    });

    if (error) {
      alert(error.message);
    } else {
      setChatText("");
    }
    setSendingChat(false);
  }

  async function loadAllCharacters() {
    const { data, error } = await supabase
      .from("characters")
      .select("id, name, summary, sex, age, portrait_url, created_at, role_tags, user_id")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setAllCharacters(data as Character[]);
      setFilteredCharacters(data as Character[]);
    }
  }

  // Filter characters based on search criteria
  useEffect(() => {
    let filtered = [...allCharacters];

    // Filter by name
    if (characterSearchName.trim()) {
      const searchLower = characterSearchName.toLowerCase();
      filtered = filtered.filter((char) =>
        char.name.toLowerCase().includes(searchLower)
      );
    }

    // Filter by sex
    if (characterSearchSex !== "all") {
      filtered = filtered.filter((char) => char.sex === characterSearchSex);
    }

    // Filter by tags
    if (characterSearchTags.trim()) {
      const searchTags = characterSearchTags
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);
      
      filtered = filtered.filter((char: any) => {
        if (!char.role_tags || !Array.isArray(char.role_tags)) return false;
        const charTags = char.role_tags.map((tag: string) => tag.toLowerCase());
        return searchTags.some((searchTag) =>
          charTags.some((charTag: string) => charTag.includes(searchTag))
        );
      });
    }

    setFilteredCharacters(filtered);
  }, [characterSearchName, characterSearchSex, characterSearchTags, allCharacters]);

  // Filter announcements based on search criteria
  useEffect(() => {
    let filtered = [...allAnnouncements];

    // Filter by search text (title, description, genres)
    if (announcementSearchText.trim()) {
      const searchLower = announcementSearchText.toLowerCase();
      filtered = filtered.filter((announcement) => {
        const titleMatch = announcement.title.toLowerCase().includes(searchLower);
        const descMatch = announcement.description.toLowerCase().includes(searchLower);
        const genresMatch = announcement.genres?.some((g) =>
          g.toLowerCase().includes(searchLower)
        );
        return titleMatch || descMatch || genresMatch;
      });
    }

    // Filter by ERP
    if (announcementFilterERP !== "all") {
      filtered = filtered.filter((announcement) => {
        if (announcementFilterERP === "yes") return announcement.erp_allowed === true;
        if (announcementFilterERP === "no") return announcement.erp_allowed === false;
        return true;
      });
    }

    // Filter by online writers
    if (announcementFilterOnline) {
      const onlineUserIds = new Set(onlineWriters.map((w) => w.user_id));
      filtered = filtered.filter((announcement) =>
        onlineUserIds.has(announcement.user_id)
      );
    }

    // Filter by top writers (writers with most likes)
    if (announcementFilterTopWriters) {
      const topWriterUserIds = new Set(
        topWriters.slice(0, 10).map((w) => w.user_id)
      );
      filtered = filtered.filter((announcement) =>
        topWriterUserIds.has(announcement.user_id)
      );
    }

    // Sort by newest (already sorted by created_at, but we can re-sort)
    if (announcementFilterNewest) {
      filtered.sort((a, b) => {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
    }

    setFilteredAnnouncements(filtered);
  }, [
    announcementSearchText,
    announcementFilterOnline,
    announcementFilterTopWriters,
    announcementFilterNewest,
    announcementFilterERP,
    allAnnouncements,
    onlineWriters,
    topWriters,
  ]);

  async function loadMessages(userId: string) {
    setMessagesLoading(true);

    const allChats: ThreadWithLatest[] = [];

    // Load DM threads
    const { data: threadsData } = await supabase
      .from("dm_threads")
      .select("id, user_a, user_b, created_at")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (threadsData && threadsData.length > 0) {
      const threadsWithDetails = await Promise.all(
        threadsData.map(async (thread) => {
          const otherUserId = thread.user_a === userId ? thread.user_b : thread.user_a;

          // Fetch writer profile for the other user
          const { data: otherWriter } = await supabase
            .from("writers")
            .select("name, portrait_url")
            .eq("user_id", otherUserId)
            .maybeSingle();

          const otherUserEmail = otherWriter?.name || `User ${otherUserId.slice(0, 8)}`;

          const { data: latestMsg } = await supabase
            .from("dm_messages")
            .select("id, sender_id, body, created_at")
            .eq("thread_id", thread.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          // Get last read timestamp from read tracking table
          const { data: readData } = await supabase
            .from("dm_thread_reads")
            .select("last_read_at, last_read_message_id")
            .eq("thread_id", thread.id)
            .eq("user_id", userId)
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
            type: "dm" as const,
            user_a: thread.user_a,
            user_b: thread.user_b,
            created_at: thread.created_at,
            other_user: {
              id: otherUserId,
              email: otherUserEmail,
              name: otherWriter?.name,
              portrait_url: otherWriter?.portrait_url,
            },
            latest_message: latestMsg || null,
            unread_count: unreadCount,
          };
        })
      );

      allChats.push(...threadsWithDetails);
    }

    // Load sessions - exclude closed sessions from dashboard
    const { data: sessionsData } = await supabase
      .from("rp_sessions")
      .select("id, user_a, user_b, status, created_at, last_message_at")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .neq("status", "closed")
      .order("created_at", { ascending: false });

    if (sessionsData && sessionsData.length > 0) {
      const sessionsWithDetails = await Promise.all(
        sessionsData.map(async (session) => {
          const otherUserId = session.user_a === userId ? session.user_b : session.user_a;

          // Fetch writer profile for the other user
          const { data: otherWriter } = await supabase
            .from("writers")
            .select("name, portrait_url")
            .eq("user_id", otherUserId)
            .maybeSingle();

          const otherUserEmail = otherWriter?.name || `User ${otherUserId.slice(0, 8)}`;

          const { data: latestMsg } = await supabase
            .from("rp_session_messages")
            .select("id, sender_id, body, created_at")
            .eq("session_id", session.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          // Get last read timestamp from read tracking table
          const { data: readData } = await supabase
            .from("rp_session_reads")
            .select("last_read_at, last_read_message_id")
            .eq("session_id", session.id)
            .eq("user_id", userId)
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
            type: "session" as const,
            user_a: session.user_a,
            user_b: session.user_b,
            status: session.status as "active" | "paused" | "closed",
            created_at: session.created_at,
            last_message_at: session.last_message_at || null,
            other_user: {
              id: otherUserId,
              email: otherUserEmail,
              name: otherWriter?.name,
              portrait_url: otherWriter?.portrait_url,
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

      allChats.push(...sessionsWithDetails);
    }

    // Sort all chats by latest message, with better sorting for sessions
    allChats.sort((a, b) => {
      // For sessions, prioritize active status, then sort by last_message_at or latest message
      if (a.type === "session" && b.type === "session") {
        // Active sessions first, then paused, then others
        const statusOrder = { active: 0, paused: 1, closed: 2 };
        const aStatusOrder = statusOrder[a.status || "closed"] ?? 2;
        const bStatusOrder = statusOrder[b.status || "closed"] ?? 2;
        if (aStatusOrder !== bStatusOrder) return aStatusOrder - bStatusOrder;
        
        // For same status, sort by last_message_at (preferred) or latest_message.created_at
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
      
      // For DMs, sort by latest message
      if (!a.latest_message && !b.latest_message) return 0;
      if (!a.latest_message) return 1;
      if (!b.latest_message) return -1;
      return (
        new Date(b.latest_message.created_at).getTime() -
        new Date(a.latest_message.created_at).getTime()
      );
    });

    setThreads(allChats);
    setMessagesLoading(false);
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg0)", color: "var(--text)" }}>

      {/* Onboarding Guidance */}
      {currentWriter && showOnboarding && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 max-w-7xl mx-auto">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-2">Welcome to RP Platform! 🎭</h3>
              <div className="text-sm text-blue-800 space-y-1">
                <p><strong>Getting Started:</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Create your writer profile (you're all set!)</li>
                  <li>Create characters to roleplay with</li>
                  <li>Post announcements in the feed to find partners</li>
                  <li>Start roleplay sessions and have fun!</li>
                </ol>
                <p className="mt-2">
                  <strong>Tip:</strong> Browse the feed to see what others are looking for, or create your own announcement to attract partners.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  localStorage.setItem('onboarding_dismissed', 'true');
                  setShowOnboarding(false);
                }
              }}
              className="text-blue-600 hover:text-blue-800 text-sm ml-4"
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Session Invitation Notifications */}
      {pendingSessionInvitations.length > 0 && (
        <div className="bg-purple-50 border-l-4 border-purple-500 p-4 max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-purple-900">New Session Invitation!</h3>
              <p className="text-sm text-purple-700">
                {pendingSessionInvitations[0].otherWriterName} wants to start a roleplay with you.
              </p>
            </div>
            <Link
              href={`/session/${pendingSessionInvitations[0].id}`}
              className="bg-purple-500 text-white px-4 py-2 rounded text-sm hover:bg-purple-600"
            >
              Accept & Select Characters
            </Link>
          </div>
        </div>
      )}

      {/* Friend Request Notifications */}
      {pendingFriendRequests.length > 0 && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {pendingFriendRequests[0].requesterPortrait ? (
                <img
                  src={pendingFriendRequests[0].requesterPortrait}
                  alt={pendingFriendRequests[0].requesterName}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-sm">
                  {pendingFriendRequests[0].requesterName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="font-semibold text-blue-900">New Friend Request!</h3>
                <p className="text-sm text-blue-700">
                  {pendingFriendRequests[0].requesterName} wants to be your friend.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
            <button
                onClick={async () => {
                  const { error } = await supabase
                    .from("friend_requests")
                    .update({ status: "accepted" })
                    .eq("id", pendingFriendRequests[0].id);
                  
                  if (!error) {
                    setPendingFriendRequests((prev) => prev.slice(1));
                  }
                }}
                className="bg-green-500 text-white px-4 py-2 rounded text-sm hover:bg-green-600"
              >
                Accept
            </button>
            <button
                onClick={async () => {
                  const { error } = await supabase
                    .from("friend_requests")
                    .update({ status: "rejected" })
                    .eq("id", pendingFriendRequests[0].id);
                  
                  if (!error) {
                    setPendingFriendRequests((prev) => prev.slice(1));
                  }
                }}
                className="bg-red-500 text-white px-4 py-2 rounded text-sm hover:bg-red-600"
              >
                Reject
            </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* LEFT: DM button + Sessions (Discord-like) */}
            <div className="space-y-4">
              {/* DM button - 1x2 horizontal */}
            <button
                onClick={() => {
                  // Navigate to DM list or create a DM page
                  router.push("/dm");
                }}
                className="w-full panel flex items-center justify-between px-4 py-3"
                style={{ background: "var(--bg2)", border: "1px solid var(--borderSoft)" }}
              >
                <span className="text-primary font-medium">Direct Messages</span>
                {threads.some((t) => t.type === "dm" && t.unread_count > 0) && (
                  <span className="bg-fuchsia-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                    {threads
                      .filter((t) => t.type === "dm")
                      .reduce((sum, t) => sum + t.unread_count, 0)}
                </span>
              )}
            </button>

              {/* Sessions list - vertical, like Discord servers */}
              <div className="panel p-4" style={{ background: "var(--bg2)", border: "1px solid var(--borderSoft)" }}>
                <Link 
                  href="/sessions"
                  className="flex items-center justify-between mb-3 hover:opacity-80 transition-opacity"
                >
                  <div className="text-secondary font-medium">My Sessions</div>
                  <span className="text-secondary text-xs">View all →</span>
                </Link>
                {messagesLoading ? (
                  <p className="text-secondary text-sm">Loading sessions…</p>
                ) : (
                  <ul className="space-y-2">
                    {threads.filter((t) => t.type === "session").length === 0 && (
                      <li className="text-secondary text-sm">No active sessions.</li>
                    )}
                    {threads
                      .filter((t) => t.type === "session")
                      .map((thread) => (
                        <li key={thread.id}>
                          <Link
                            href={`/session/${thread.id}`}
                            className="card p-3 flex items-center gap-3"
                          >
                            {/* Two overlapped circles: current user + other user */}
                            <div className="flex -space-x-2">
                              {currentWriter?.portrait_url ? (
                                <img
                                  src={currentWriter.portrait_url}
                                  alt={currentWriter.name || "You"}
                                  className="w-8 h-8 rounded-full object-cover border border-gray-200"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs text-gray-600 border border-gray-200">
                                  {currentWriter?.name?.charAt(0).toUpperCase() || "U"}
          </div>
                              )}
                              {thread.other_user.portrait_url ? (
                                <img
                                  src={thread.other_user.portrait_url}
                                  alt={thread.other_user.name || thread.other_user.email}
                                  className="w-8 h-8 rounded-full object-cover border border-gray-200"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs text-gray-600 border border-gray-200">
                                  {(thread.other_user.name || thread.other_user.email)
                                    .charAt(0)
                                    .toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-primary font-medium truncate">
                                  {thread.other_user.name || thread.other_user.email}
                                </div>
                                {thread.status && thread.status !== "active" && (
                                  <span className="badge text-xs" style={{ opacity: 0.7 }}>
                                    {thread.status === "paused" ? "Paused" : thread.status}
                                  </span>
                                )}
                              </div>
                              {thread.latest_message && (
                                <div className="text-secondary mt-1 truncate text-sm">
                                  {thread.latest_message.body}
                                </div>
                              )}
                            </div>
                          </Link>
                        </li>
                      ))}
                  </ul>
                )}
        </div>

              {/* Sessions to Watch list */}
              <div className="panel p-4" style={{ background: "var(--bg2)", border: "1px solid var(--borderSoft)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-secondary">Sessions to Watch</div>
                  <button
                    onClick={() => {
                      if (currentUserId) {
                        loadWatchSessions(currentUserId);
                      }
                    }}
                    className="text-xs text-secondary hover:text-primary px-2 py-1 rounded border border-transparent hover:border-borderSoft transition-colors"
                    disabled={watchSessionsLoading || !currentUserId}
                  >
                    {watchSessionsLoading ? "..." : "🔄"}
                  </button>
                </div>
                {watchSessionsLoading ? (
                  <p className="text-secondary text-sm">Loading…</p>
                ) : (
                  <ul className="space-y-2">
                    {watchSessions.length === 0 && (
                      <li className="text-secondary text-sm space-y-1">
                        <div>No public sessions available.</div>
                        <div className="text-xs opacity-75 mt-1 space-y-1">
                          <div>• Other users can make sessions public from the session page</div>
                          <div>• Your own public sessions won't appear here (they're in "My Sessions")</div>
                          <div>• Check browser console (F12) for debug info</div>
                        </div>
                      </li>
                    )}
                    {watchSessions.map((session) => (
                      <li key={session.id}>
                        <Link
                          href={`/session/${session.id}`}
                          className="card p-3 flex items-center gap-3 hover:bg-opacity-80 transition-colors"
                        >
                          {/* Two overlapped circles: user a + user b */}
                          <div className="flex -space-x-2 relative">
                            {session.user_a_portrait ? (
                              <img
                                src={session.user_a_portrait}
                                alt={session.user_a_name}
                                className="w-8 h-8 rounded-full object-cover border border-gray-200"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs text-gray-600 border border-gray-200">
                                {session.user_a_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            {session.user_b_portrait ? (
                              <img
                                src={session.user_b_portrait}
                                alt={session.user_b_name}
                                className="w-8 h-8 rounded-full object-cover border border-gray-200"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs text-gray-600 border border-gray-200">
                                {session.user_b_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            {/* Green dot indicator for live sessions */}
                            {session.is_active && (
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm"></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-primary font-medium truncate">
                                {session.name || `${session.user_a_name} & ${session.user_b_name}`}
                              </div>
                              {session.is_active && (
                                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                  Live
                                </span>
                              )}
                            </div>
                            <div className="text-secondary mt-1 truncate text-xs">
                              {session.user_a_name} & {session.user_b_name}
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
      </div>

            {/* MIDDLE: Feed + filters (2/4 width) */}
            <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Roleplay Feed</h2>
              <Link
                href="/feed/new"
                className="bg-fuchsia-500 text-white px-3 py-1 rounded text-sm font-semibold hover:bg-fuchsia-600 transition-colors"
              >
                + New announcement
              </Link>
            </div>

              {/* Announcement Search/Filter Section */}
              <div className="bg-white border rounded p-6">
                <h3 className="text-lg font-semibold mb-4">Filter Announcements</h3>
                
                {/* Search by Text */}
                <div className="mb-4">
                  <label className="text-sm font-medium mb-1 block">Search by Word</label>
                  <input
                    type="text"
                    className="w-full border p-2 rounded text-sm"
                    placeholder="Search in title, description, or genres..."
                    value={announcementSearchText}
                    onChange={(e) => setAnnouncementSearchText(e.target.value)}
                  />
                </div>

                {/* Filter by ERP */}
                <div className="mb-4">
                  <label className="text-sm font-medium mb-2 block">ERP Allowed</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setAnnouncementFilterERP("all")}
                      className={`px-3 py-1 rounded text-sm ${
                        announcementFilterERP === "all"
                          ? "bg-black text-white"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setAnnouncementFilterERP("yes")}
                      className={`px-3 py-1 rounded text-sm ${
                        announcementFilterERP === "yes"
                          ? "bg-black text-white"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setAnnouncementFilterERP("no")}
                      className={`px-3 py-1 rounded text-sm ${
                        announcementFilterERP === "no"
                          ? "bg-black text-white"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Filter Options */}
                <div className="mb-4 space-y-2">
                  <label className="text-sm font-medium block">Filter Options</label>
                  
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={announcementFilterOnline}
                      onChange={(e) => setAnnouncementFilterOnline(e.target.checked)}
                      className="rounded"
                    />
                    Only from online writers
                  </label>
                  
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={announcementFilterTopWriters}
                      onChange={(e) => setAnnouncementFilterTopWriters(e.target.checked)}
                      className="rounded"
                    />
                    Only from top writers (most liked)
                  </label>
                  
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={announcementFilterNewest}
                      onChange={(e) => setAnnouncementFilterNewest(e.target.checked)}
                      className="rounded"
                    />
                    Sort by newest
                  </label>
                </div>

                {/* Results count */}
                <div className="text-sm text-gray-600">
                  Showing {filteredAnnouncements.length} of {allAnnouncements.length} announcements
                </div>
              </div>

              <div className="bg-white border rounded p-6">
            {feedLoading && <p className="text-sm text-gray-600">Loading…</p>}

                {!feedLoading && filteredAnnouncements.length === 0 && (
                  <p className="text-sm text-gray-600">
                    {allAnnouncements.length === 0
                      ? "No announcements yet."
                      : "No announcements match your filters."}
                  </p>
                )}

                {!feedLoading && filteredAnnouncements.length > 0 && (
              <ul className="space-y-4">
                    {filteredAnnouncements.map((p) => (
                      <li key={p.id} className="border rounded p-4 space-y-2">
                    <div className="text-lg font-medium">{p.title}</div>
                    <div className="text-sm text-gray-700 whitespace-pre-line">
                      {p.description}
                    </div>
                    <div className="text-xs text-gray-500">
                      Playing as <strong>{p.character.name}</strong>
                      {p.character.age ? `, ${p.character.age}` : ""} · {p.character.sex}
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
                              router.push(`/dm/${threadId}`);
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

              {/* General Chat */}
              <div className="bg-white border rounded p-6">
                <h2 className="text-xl font-semibold mb-4">General Discussion</h2>
                <div className="border rounded p-4 h-96 overflow-y-auto mb-4 space-y-2">
                  {chatMessages.length === 0 ? (
                    <p className="text-sm text-gray-600">No messages yet. Start the conversation!</p>
                  ) : (
                    chatMessages.map((msg) => (
                      <div key={msg.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          {msg.sender_portrait ? (
                            <img
                              src={msg.sender_portrait}
                              alt={msg.sender_name}
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-xs">
                              {msg.sender_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium text-sm">{msg.sender_name}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(msg.created_at).toLocaleTimeString()}
                          </span>
                      </div>
                        <div className="text-sm text-gray-700 ml-8">{msg.body}</div>
                    </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 border p-2 rounded"
                    placeholder="Type a message..."
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChatMessage();
                      }
                    }}
                    disabled={sendingChat || !currentUserId}
                  />
                  <button
                    className="bg-black text-white px-4 py-2 rounded"
                    onClick={sendChatMessage}
                    disabled={sendingChat || !currentUserId || !chatText.trim()}
                  >
                    {sendingChat ? "Sending..." : "Send"}
                  </button>
                  </div>
                    </div>
                    </div>

            {/* RIGHT: Character Search + Writers */}
            <div className="space-y-6">
              {/* Character Search moved here */}
              <div className="bg-white border rounded p-6">
                <h2 className="text-xl font-semibold mb-4">Character Search</h2>
                
                {/* Search by Name */}
                <div className="mb-4">
                  <label className="text-sm font-medium mb-1 block">Search by Name</label>
                  <input
                    type="text"
                    className="w-full border p-2 rounded text-sm"
                    placeholder="Character name..."
                    value={characterSearchName}
                    onChange={(e) => setCharacterSearchName(e.target.value)}
                  />
                  </div>

                {/* Search by Tags */}
                <div className="mb-4">
                  <label className="text-sm font-medium mb-1 block">Search by Tags</label>
                  <input
                    type="text"
                    className="w-full border p-2 rounded text-sm"
                    placeholder="Comma-separated tags..."
                    value={characterSearchTags}
                    onChange={(e) => setCharacterSearchTags(e.target.value)}
                  />
                </div>

                {/* Filter by Sex */}
                <div className="mb-4">
                  <label className="text-sm font-medium mb-2 block">Filter by Sex</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setCharacterSearchSex("all")}
                      className={`px-3 py-1 rounded text-sm ${
                        characterSearchSex === "all"
                          ? "bg-black text-white"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setCharacterSearchSex("male")}
                      className={`px-3 py-1 rounded text-sm ${
                        characterSearchSex === "male"
                          ? "bg-black text-white"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      Male
                    </button>
                    <button
                      onClick={() => setCharacterSearchSex("female")}
                      className={`px-3 py-1 rounded text-sm ${
                        characterSearchSex === "female"
                          ? "bg-black text-white"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      Female
                    </button>
                    <button
                      onClick={() => setCharacterSearchSex("non_binary")}
                      className={`px-3 py-1 rounded text-sm ${
                        characterSearchSex === "non_binary"
                          ? "bg-black text-white"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      Non-Binary
                    </button>
                  </div>
                </div>

                {/* Character Results */}
                <div className="mt-4">
                  <div className="text-sm text-gray-600 mb-2">
                    {filteredCharacters.length} {filteredCharacters.length === 1 ? "character" : "characters"}
                  </div>
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {filteredCharacters.length === 0 ? (
                      <p className="text-sm text-gray-600">No characters found.</p>
                    ) : (
                      filteredCharacters.slice(0, 20).map((char) => (
                        <Link
                          key={char.id}
                          href={char.user_id ? `/profile/${char.user_id}` : "#"}
                          className="block border rounded p-3 hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-2">
                              {char.portrait_url ? (
                                <img
                                  src={char.portrait_url}
                                  alt={char.name}
                                className="w-10 h-10 rounded-full object-cover"
                                />
                              ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-sm">
                                  {char.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{char.name}</div>
                              <div className="text-xs text-gray-500">{char.sex}</div>
                                  </div>
                          </div>
                        </Link>
                      ))
                                )}
                                </div>
                              </div>
                            </div>

              {/* Online Writers */}
              <div className="bg-white border rounded p-6">
                <h2 className="text-xl font-semibold mb-4">Online Writers</h2>
                {onlineWriters.length === 0 ? (
                  <p className="text-sm text-gray-600">No writers online right now.</p>
                  ) : (
                    <ul className="space-y-3">
                    {onlineWriters.map((writer) => (
                      <li key={writer.id} className="flex items-center gap-3">
                            <Link
                          href={`/profile/${writer.user_id}`}
                          className="flex items-center gap-3 flex-1 min-w-0"
                        >
                          {writer.portrait_url ? (
                            <img
                              src={writer.portrait_url}
                              alt={writer.name}
                              className="w-10 h-10 rounded-full object-cover"
                                />
                              ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                              {writer.name.charAt(0).toUpperCase()}
                          </div>
                              )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm hover:underline truncate">
                                {writer.name}
                              </span>
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                </div>
                          </div>
                            </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

              {/* Top Writers by Likes */}
              <div className="bg-white border rounded p-6">
                <h2 className="text-xl font-semibold mb-4">Top Writers (All-Time)</h2>
                {topWriters.length === 0 ? (
                  <p className="text-sm text-gray-600">No writers yet.</p>
                  ) : (
                    <ul className="space-y-3">
                    {topWriters.map((writer, index) => (
                      <li key={writer.id} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold">
                          {index + 1}
                          </div>
                      <Link
                          href={`/profile/${writer.user_id}`}
                          className="flex items-center gap-3 flex-1 min-w-0"
                        >
                          {writer.portrait_url ? (
                            <img
                              src={writer.portrait_url}
                              alt={writer.name}
                              className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                              {writer.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm hover:underline block truncate">
                              {writer.name}
                                  </span>
                            <div className="text-xs text-gray-500">
                              ❤️ {writer.likes_count || 0} likes
                          </div>
                        </div>
                      </Link>
                    </li>
                      ))}
              </ul>
            )}
          </div>
            </div>
          </div>

      </div>
    </div>
  );
}
