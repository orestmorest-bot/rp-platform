"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Writer = {
  id: string;
  user_id: string;
  name: string;
  portrait_url: string | null;
  description: string | null;
  created_at: string;
  likes_count?: number;
  is_online?: boolean;
};

export default function WritersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writers, setWriters] = useState<Writer[]>([]);
  const [filteredWriters, setFilteredWriters] = useState<Writer[]>([]);
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "most_liked" | "online">("newest");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Get current user for online status
        const { data: userRes } = await supabase.auth.getUser();
        const currentUserId = userRes.user?.id;

        // Load all writers
        const { data: writersData, error: writersError } = await supabase
          .from("writers")
          .select("id, user_id, name, portrait_url, description, created_at")
          .order("created_at", { ascending: false });

        if (writersError) {
          setError(writersError.message);
          setLoading(false);
          return;
        }

        if (!writersData) {
          setWriters([]);
          setLoading(false);
          return;
        }

        // Get like counts for each writer
        const writersWithLikes = await Promise.all(
          writersData.map(async (writer) => {
            const { count } = await supabase
              .from("writer_likes")
              .select("id", { count: "exact", head: true })
              .eq("writer_id", writer.id);

            return {
              ...writer,
              likes_count: count || 0,
            } as Writer;
          })
        );

        // Check online status (active in last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: onlineWriters } = await supabase
          .from("writers")
          .select("user_id, last_seen")
          .gte("last_seen", fiveMinutesAgo);

        const onlineUserIds = new Set(onlineWriters?.map((w) => w.user_id) || []);

        const writersWithStatus = writersWithLikes.map((writer) => ({
          ...writer,
          is_online: onlineUserIds.has(writer.user_id),
        }));

        setWriters(writersWithStatus);
        setFilteredWriters(writersWithStatus);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load writers");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Filter and sort writers
  useEffect(() => {
    let filtered = [...writers];

    // Filter by search text
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(
        (writer) =>
          writer.name.toLowerCase().includes(searchLower) ||
          writer.description?.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === "most_liked") {
        return (b.likes_count || 0) - (a.likes_count || 0);
      } else if (sortBy === "online") {
        if (a.is_online && !b.is_online) return -1;
        if (!a.is_online && b.is_online) return 1;
        return (b.likes_count || 0) - (a.likes_count || 0);
      } else {
        // newest
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
    });

    setFilteredWriters(filtered);
  }, [writers, searchText, sortBy]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <p className="text-sm text-gray-600">Loading writers...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/dashboard" className="text-sm underline mt-4 block">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Writers</h1>
        <Link href="/dashboard" className="text-sm underline">
          ← Back to Dashboard
        </Link>
      </div>

      {/* Search and Filter */}
      <div className="bg-white border rounded p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Search</label>
          <input
            type="text"
            className="w-full border p-2 rounded"
            placeholder="Search by name or description..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Sort By</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy("newest")}
              className={`px-3 py-1 text-sm rounded ${
                sortBy === "newest"
                  ? "bg-black text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Newest
            </button>
            <button
              onClick={() => setSortBy("most_liked")}
              className={`px-3 py-1 text-sm rounded ${
                sortBy === "most_liked"
                  ? "bg-black text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Most Liked
            </button>
            <button
              onClick={() => setSortBy("online")}
              className={`px-3 py-1 text-sm rounded ${
                sortBy === "online"
                  ? "bg-black text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Online First
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-600">
          Showing {filteredWriters.length} of {writers.length} writers
        </div>
      </div>

      {/* Writers List */}
      {filteredWriters.length === 0 ? (
        <div className="bg-white border rounded p-6 text-center">
          <p className="text-sm text-gray-600">
            {searchText ? "No writers match your search." : "No writers yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWriters.map((writer) => (
            <Link
              key={writer.id}
              href={`/profile/${writer.user_id}`}
              className="bg-white border rounded p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3">
                {writer.portrait_url ? (
                  <img
                    src={writer.portrait_url}
                    alt={writer.name}
                    className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-300 flex items-center justify-center text-xl font-semibold flex-shrink-0">
                    {writer.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{writer.name}</h3>
                    {writer.is_online && (
                      <span className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></span>
                    )}
                  </div>
                  {writer.description && (
                    <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                      {writer.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>❤️ {writer.likes_count || 0} likes</span>
                    {writer.is_online && (
                      <span className="text-green-600">● Online</span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}







