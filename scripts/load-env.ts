import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

if (
  (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}") &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}
