export const config = { runtime: 'edge' };

export default function handler() {
  return new Response(JSON.stringify({
    ok: true,
    service: 'quraneralo-school-drive-test',
    status: 'preview-ready'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}
