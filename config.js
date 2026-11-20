// Fuse Maintenance Log – settings.
// The publishable key is meant to be public: what each login can do is
// controlled by the database rules in supabase/schema.sql.
window.FUSE_CONFIG = {
  supabaseUrl: "https://zbipuxeqxfkdlopcnnva.supabase.co",
  supabaseKey: "sb_publishable_iEvKeqNRVkkfuy1Z4Xuscg_fpI9zxHu",

  // Shop time zone. Must match 'America/New_York' in supabase/schema.sql.
  timeZone: "America/New_York",

  // A shared tablet goes back to the "Who's doing the maintenance?"
  // screen after this many minutes without a tap.
  idleMinutes: 10
};
