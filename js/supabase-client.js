"use strict";

// Creates the one shared Supabase client for the whole portal.
// Load order in index.html: supabase-js (CDN) > supabase-config.js > this file.
(() => {
  const config = window.PortalSupabaseConfig;
  const placeholder = !config || !config.url || !config.anonKey
    || config.url.includes("YOUR-PROJECT-ID") || config.anonKey.includes("YOUR-ANON");

  if (!window.supabase || placeholder) {
    console.warn("Supabase is not configured yet. Edit js/supabase-config.js.");
    window.PortalSupabase = Object.freeze({ configured: false });
    return;
  }

  const client = window.supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  // Portal logins use an account number; Supabase Auth needs an email.
  // The database was built around "<account number>@rtu.edu.ph".
  const accountEmail = (accountNumber) =>
    `${String(accountNumber).trim().toLowerCase()}@rtu.edu.ph`;

  // Before sign-in an empty result is normal (the data is protected);
  // an error means the URL or key is wrong.
  async function testConnection() {
    const { error } = await client.from("document_types").select("name").limit(1);
    return error ? { ok: false, message: error.message } : { ok: true };
  }

  window.PortalSupabase = Object.freeze({ configured: true, client, accountEmail, testConnection });
})();
