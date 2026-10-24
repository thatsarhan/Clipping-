import type { IncomingMessage, ServerResponse } from 'http';

interface ExtendedRequest extends IncomingMessage {
  query?: Record<string, string | string[]>;
}

interface ExtendedResponse extends ServerResponse {
  status?: (code: number) => ExtendedResponse;
  json?: (data: unknown) => void;
}

export default async function handler(req: ExtendedRequest, res: ExtendedResponse) {
  const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const videoUrl = urlObj.searchParams.get('url') || '';
  const start = urlObj.searchParams.get('start') || '0';
  const end = urlObj.searchParams.get('end') || '30';
  const title = urlObj.searchParams.get('title') || 'Part_Clip';

  res.setHeader('Content-Type', 'application/json');

  if (!videoUrl) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'URL is required' }));
    return;
  }

  res.statusCode = 200;
  res.end(
    JSON.stringify({
      status: 'redirect_client_render',
      message: 'On static/serverless Vercel, in-browser video renderer processes the clip directly.',
      url: videoUrl,
      start,
      end,
      title,
    })
  );
}
