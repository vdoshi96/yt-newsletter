import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequiredEnv } from "@/lib/config";

let client: SupabaseClient | null = null;

export function getSupabaseAdminClient() {
  if (client) return client;

  client = createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  return client;
}

export async function uploadGeneratedAsset(input: {
  path: string;
  contentType: string;
  body: Blob | ArrayBuffer | Buffer;
}) {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "yt-newsletter-assets";
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage.from(bucket).upload(input.path, input.body, {
    contentType: input.contentType,
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(input.path);
  return data.publicUrl;
}
