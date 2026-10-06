// Public settings of L'Ardoise's Supabase project (Project Settings → API).
// The anon key is public by design: row-level security (schema.sql) is what protects the data.
// Use a DEDICATED project, not LazyPO's — see README.md.
window.ARDOISE_CONFIG = {
  supabaseUrl: '',      // https://<project-ref>.supabase.co
  supabaseAnonKey: '',  // the "anon public" key
};
