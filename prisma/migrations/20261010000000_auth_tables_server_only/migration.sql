-- Auth.js uses the trusted server's PostgreSQL connection, not Supabase Auth JWTs.
-- No browser/Data API policy should expose users, OAuth tokens or session tokens.
-- Table owners and BYPASSRLS server roles retain access; do not FORCE RLS here.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;

-- Supabase roles do not exist on every local PostgreSQL installation.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "User", "Account", "Session", "VerificationToken" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "User", "Account", "Session", "VerificationToken" FROM authenticated;
  END IF;
END
$$;
