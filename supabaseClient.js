import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// A long random ID acting as the "address" for this app's single data row.
// Not a real secret in the cryptographic sense, but long and random enough
// that nobody would stumble onto or guess it. Keep this value as-is; it just
// needs to match whatever is already saved in the database.
export const DATA_ROW_ID = "FN-10K9UvZJRCxbyM8Fa-JKMKkKYIZ794vhot1RV_Qo";

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Fetches the saved { blocks, customColors } payload from Supabase.
// Returns null if there's no saved data yet, or if Supabase isn't configured
// (e.g. running locally without the env vars set), or if a network error occurs.
export async function fetchCloudData() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("blockweek_data")
      .select("payload")
      .eq("id", DATA_ROW_ID)
      .maybeSingle();
    if (error) {
      console.error("Supabase fetch error:", error);
      return null;
    }
    return data ? data.payload : null;
  } catch (err) {
    console.error("Supabase fetch failed:", err);
    return null;
  }
}

// Saves the given payload to Supabase, creating or overwriting the single row.
export async function saveCloudData(payload) {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from("blockweek_data")
      .upsert({ id: DATA_ROW_ID, payload, updated_at: new Date().toISOString() });
    if (error) {
      console.error("Supabase save error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Supabase save failed:", err);
    return false;
  }
}
