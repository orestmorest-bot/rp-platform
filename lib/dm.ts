import { supabase } from "@/lib/supabaseClient";

/**
 * Create (or reuse) a DM thread between current user and otherUserId.
 * Returns thread id.
 */
export async function openDmWith(otherUserId: string): Promise<string> {
  const { data: meRes, error: meErr } = await supabase.auth.getUser();
  if (meErr) throw meErr;
  if (!meRes.user) throw new Error("Not authenticated");

  const me = meRes.user.id;

  // 1) Try to find an existing thread (handles duplicates by taking newest)
  const { data: existing, error: existingErr } = await supabase
    .from("dm_threads")
    .select("id, created_at")
    .or(`and(user_a.eq.${me},user_b.eq.${otherUserId}),and(user_a.eq.${otherUserId},user_b.eq.${me})`)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingErr) throw existingErr;
  if (existing && existing.length > 0) return existing[0].id;

  // 2) No thread -> create one
  const { data: inserted, error: insertErr } = await supabase
    .from("dm_threads")
    .insert({ user_a: me, user_b: otherUserId })
    .select("id")
    .limit(1);

  if (insertErr) throw insertErr;
  if (!inserted || inserted.length === 0) throw new Error("Failed to create DM thread");

  return inserted[0].id;
}
