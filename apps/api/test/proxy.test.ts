import { afterEach, describe, expect, it, vi } from 'vitest';
import proxy from '../../../netlify/edge-functions/api-proxy.js';

describe('proxy da Netlify', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('substitui cabeçalhos forjados e encaminha a sessão ao servidor configurado', async () => {
    const secret = 'um-segredo-de-teste-com-mais-de-32-caracteres';
    vi.stubGlobal('Netlify', { env: { get: (key: string) => key === 'RENDER_API_URL' ? 'https://api.example.test' : secret } });
    let forwarded: Request | undefined;
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      forwarded = request;
      return new Response('{"ok":true}', { headers: { 'Set-Cookie': 'session=test; HttpOnly; Secure; SameSite=Lax' } });
    }));
    const request = new Request('https://portfolio.example.test/api/rides?q=1', { method: 'POST', headers: {
      Origin: 'https://portfolio.example.test', Cookie: 'session=test', 'Content-Type': 'application/json',
      'X-CSRF-Token': 'token', 'X-VDB-Client-IP': 'forjado', 'X-VDB-Proxy-Secret': 'forjado',
    }, body: '{}' });
    const response = await proxy(request, { ip: '198.51.100.2' });
    expect(forwarded?.url).toBe('https://api.example.test/api/rides?q=1');
    expect(forwarded?.headers.get('x-vdb-client-ip')).toBe('198.51.100.2');
    expect(forwarded?.headers.get('x-vdb-proxy-secret')).toBe(secret);
    expect(forwarded?.headers.get('cookie')).toBe('session=test');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('x-vdb-proxy-secret')).toBeNull();
  });
  it('falha sem encaminhar requisição quando não há configuração', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => undefined } });
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const response = await proxy(new Request('https://portfolio.example.test/api/health'), { ip: '198.51.100.2' });
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
