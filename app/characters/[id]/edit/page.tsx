"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Sex = "male" | "female" | "non_binary";

export default function EditCharacterPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = useMemo(() => params?.id, [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [sex, setSex] = useState<Sex>("male");
  const [age, setAge] = useState<number | "">("");
  const [roleTags, setRoleTags] = useState("");
  const [portraitUrl, setPortraitUrl] = useState("");
  const [style, setStyle] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    let mounted = true;

    async function load() {
      setError(null);
      setLoading(true);

      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("characters")
        .select("id,name,summary,description,sex,age,role_tags,portrait_url,style")
        .eq("id", id)
        .single();

      if (!mounted) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setName(data.name ?? "");
      setSummary(data.summary ?? "");
      setDescription(data.description ?? "");
      setSex((data.sex ?? "male") as Sex);
      setAge(data.age ?? "");
      setRoleTags((data.role_tags ?? []).join(", "));
      setPortraitUrl(data.portrait_url ?? "");
      setStyle(data.style ?? "");

      setLoading(false);
    }

    if (id) load();
    return () => {
      mounted = false;
    };
  }, [id]);

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
      const filePath = `character-portraits/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('character-portraits')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        // Try alternative bucket name
        const { error: altError } = await supabase.storage
          .from('portraits')
          .upload(`characters/${filePath}`, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (altError) {
          console.error("Upload error:", altError);
          setError("Failed to upload image. You can use a URL instead.");
          setUploading(false);
          return null;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('portraits')
          .getPublicUrl(`characters/${filePath}`);

        setUploading(false);
        return publicUrl;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('character-portraits')
        .getPublicUrl(filePath);

      setUploading(false);
      return publicUrl;
    } catch (err) {
      setUploading(false);
      setError("Failed to upload image");
      return null;
    }
  }

  async function save() {
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);

    const tagsArray =
      roleTags.trim() === ""
        ? []
        : roleTags.split(",").map((t) => t.trim()).filter(Boolean);

    let finalPortraitUrl = portraitUrl.trim() || null;

    // If file is selected, upload it
    const fileInput = fileInputRef.current;
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const uploadedUrl = await handleFileUpload(fileInput.files[0]);
      if (uploadedUrl) {
        finalPortraitUrl = uploadedUrl;
      }
    }

    const { error } = await supabase
      .from("characters")
      .update({
        name,
        summary,
        description,
        sex,
        age: age === "" ? null : age,
        role_tags: tagsArray,
        portrait_url: finalPortraitUrl,
        style: style || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Redirect to user's profile page
    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user) {
      router.push(`/profile/${userRes.user.id}`);
    } else {
      router.push("/dashboard");
    }
  }

  async function remove() {
    const ok = confirm("Delete this character?");
    if (!ok) return;

    setError(null);
    setSaving(true);

    const { error } = await supabase.from("characters").delete().eq("id", id);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Redirect to user's profile page
    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user) {
      router.push(`/profile/${userRes.user.id}`);
    } else {
      router.push("/dashboard");
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-600">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit character</h1>
        <button className="text-sm text-red-600 underline" onClick={remove} disabled={saving || uploading}>
          Delete
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          className="w-full border p-2 rounded"
          placeholder="Character name"
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
                className="w-32 h-32 object-contain border rounded"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Short Summary / Hook</label>
        <input
          className="w-full border p-2 rounded"
          placeholder="A brief summary or hook for this character"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          disabled={saving || uploading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description / Bio</label>
        <textarea
          className="w-full border p-2 rounded"
          placeholder="Full character description, backstory, personality, etc."
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={saving || uploading}
        />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Sex</label>
          <select
            className="w-full border p-2 rounded"
            value={sex}
            onChange={(e) => setSex(e.target.value as Sex)}
            disabled={saving || uploading}
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="non_binary">Non-binary</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Age</label>
          <input
            className="border p-2 rounded w-32"
            type="number"
            placeholder="Age"
            value={age}
            onChange={(e) => setAge(e.target.value === "" ? "" : Number(e.target.value))}
            disabled={saving || uploading}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Style (optional)</label>
        <div className="grid grid-cols-4 gap-2">
          {availableStyles.map((s) => (
            <label
              key={s.value}
              className={`flex flex-col items-center p-3 border rounded cursor-pointer transition-all ${
                style === s.value
                  ? "bg-black text-white border-black"
                  : "bg-white border-gray-300 hover:border-gray-400"
              }`}
            >
              <input
                type="radio"
                name="style"
                value={s.value}
                checked={style === s.value}
                onChange={(e) => setStyle(e.target.value)}
                className="hidden"
                disabled={saving || uploading}
              />
              <span className="text-2xl mb-1">{s.emoji}</span>
              <span className="text-xs">{s.label}</span>
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setStyle("")}
          className="text-xs text-gray-500 underline mt-2"
          disabled={saving || uploading}
        >
          Clear selection
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Role Tags</label>
        <input
          className="w-full border p-2 rounded"
          placeholder="Comma separated tags (e.g., dom, sub, switch, top, bottom)"
          value={roleTags}
          onChange={(e) => setRoleTags(e.target.value)}
          disabled={saving || uploading}
        />
        <p className="text-xs text-gray-500 mt-1">Separate multiple tags with commas</p>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex gap-2">
        <button
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
          onClick={save}
          disabled={saving || uploading}
        >
          {saving ? "Saving…" : uploading ? "Uploading..." : "Save changes"}
        </button>
        <button
          onClick={async () => {
            const { data: userRes } = await supabase.auth.getUser();
            if (userRes?.user) {
              router.push(`/profile/${userRes.user.id}`);
            } else {
              router.push("/dashboard");
            }
          }}
          className="border px-4 py-2 rounded hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
