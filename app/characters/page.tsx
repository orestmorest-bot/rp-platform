"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function CharactersPage() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      const { data: userRes } = await supabase.auth.getUser();
      if (userRes.user) {
        router.push(`/profile/${userRes.user.id}`);
      } else {
        router.push("/login");
      }
    }
    redirect();
  }, [router]);

  return (
    <div className="p-6">
      <p className="text-sm text-gray-600">Redirecting...</p>
    </div>
  );
}
