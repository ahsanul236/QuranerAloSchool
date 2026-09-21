export const config = { runtime: 'edge' };

export default function handler() {
  const env = process.env;
  return new Response(JSON.stringify({
    ok: true,
    service: 'quraneralo-school-drive-test',
    status: 'preview-ready',
    diagnostics: {
      vercelEnv: env.VERCEL_ENV || 'unknown',
      supabaseServerKey: Boolean(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY),
      supabaseClientKey: Boolean(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY),
      googleDriveCredentials: Boolean(env.GOOGLE_DRIVE_CREDENTIALS)
    }
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}
