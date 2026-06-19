import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { ProxyConfig } from '../../antiban/proxy.service';

export type FetchAgent = HttpsProxyAgent | SocksProxyAgent;

/**
 * Build a node HTTP agent to inject into the Baileys WebSocket factory
 * so all outbound connections from this session flow through the proxy.
 * Returns undefined when no proxy is assigned — Baileys then connects directly.
 */
export function buildFetchAgent(proxy: ProxyConfig | null): FetchAgent | undefined {
  if (!proxy) return undefined;

  const auth =
    proxy.username && proxy.password
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : '';
  const url = `${proxy.protocol}://${auth}${proxy.host}:${proxy.port}`;

  if (proxy.protocol === 'socks5' || proxy.protocol === 'socks4') {
    return new SocksProxyAgent(url);
  }
  return new HttpsProxyAgent(url);
}
