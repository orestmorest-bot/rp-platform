"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function EditProfilePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [portraitUrl, setPortraitUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        router.push("/login");
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("writers")
        .select("*")
        .eq("user_id", userRes.user.id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          router.push("/profile/create");
          return;
        }
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      if (data) {
        setName(data.name || "");
        setDescription(data.description || "");
        setPortraitUrl(data.portrait_url || "");
      }

      setLoading(false);
    }

    load();
  }, [router]);

  async function handleFileUpload(file: File): Promise<string | null> {
    if (!file) return null;

    setUploading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        setError("Not authenticated");
        setUploading(false);
        return null;
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${userRes.user.id}-${Date.now()}.${fileExt}`;
      const filePath = `portraits/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('portraits')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        setError("Failed to upload image. You can use a URL instead.");
        setUploading(false);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('portraits')
        .getPublicUrl(filePath);

      setUploading(false);
      return publicUrl;
    } catch (err) {
      setUploading(false);
      setError("Failed to upload image");
      return null;
    }
  }

  async function submit() {
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      setError("Not authenticated");
      setSaving(false);
      return;
    }

    let finalPortraitUrl = portraitUrl.trim() || null;

    // If file is selected, upload it
    const fileInput = fileInputRef.current;
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const uploadedUrl = await handleFileUpload(fileInput.files[0]);
      if (uploadedUrl) {
        finalPortraitUrl = uploadedUrl;
      }
    }

    const { error: updateError } = await supabase
      .from("writers")
      .update({
        name: name.trim(),
        description: description.trim() || null,
        portrait_url: finalPortraitUrl,
      })
      .eq("user_id", userRes.user.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push(`/profile/${userRes.user.id}`);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-sm text-gray-600">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit Writer Profile</h1>
        <Link href="/dashboard" className="text-sm underline">
          ← Back to Dashboard
        </Link>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          className="w-full border p-2 rounded"
          placeholder="Your writer name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving || uploading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Portrait (optional)</label>
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Upload Image</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="w-full border p-2 rounded text-sm"
              disabled={saving || uploading}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  const file = e.target.files[0];
                  if (file.size > 5 * 1024 * 1024) {
                    setError("Image size must be less than 5MB");
                    return;
                  }
                  // Preview uploaded file
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    setPortraitUrl(event.target?.result as string);
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
            {uploading && <p className="text-xs text-gray-500 mt-1">Uploading...</p>}
          </div>
          <div className="text-xs text-gray-500">OR</div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Image URL</label>
            <input
              className="w-full border p-2 rounded"
              placeholder="https://example.com/portrait.jpg"
              value={portraitUrl}
              onChange={(e) => setPortraitUrl(e.target.value)}
              disabled={saving || uploading}
            />
          </div>
          {portraitUrl && (
            <div className="mt-2">
              <img
                src={portraitUrl}
                alt="Preview"
                className="w-20 h-20 rounded-full object-cover border"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description (optional)</label>
        <textarea
          className="w-full border p-2 rounded"
          placeholder="Tell others about yourself as a writer..."
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={saving || uploading}
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex gap-2">
        <button
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
          disabled={saving || uploading}
          onClick={submit}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <Link
          href="/dashboard"
          className="border px-4 py-2 rounded hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
