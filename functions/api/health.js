// Cloudflare Pages Function for health check

export async function onRequest(context) {
  const { request, env } = context;

  return new Response(
    JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: env.ENVIRONMENT || 'development',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
