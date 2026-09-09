/**
 * Cache em memória para a página de Ranking.
 * TTL padrão: 5 minutos.
 * Chave: `ranking_${start.toISOString()}_${end.toISOString()}`
 * Invalidação: chamada explícita a invalidateRankingCache()
 *              (deve ser feita após inserção de novo pacote)
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export interface RankingDriver {
  id: string;
  name: string;
  avatar: string;
  photo_url: string | null;
  total: number;
  entregues: number;
  devolvidas: number;
  amount: number;
  formattedAmount: string;
  pctEntregues: number;
  pctDevolvidas: number;
  pctDoTotal: number;
  barWidth: number;
}

export interface RankingCompany {
  id: string;
  name: string;
  logo_url: string | null;
  color: string;
  count: number;
  amount: number;
  formattedAmount: string;
  pctDoTotal: number;
  barWidth: number;
}

export interface RankingPayload {
  drivers: RankingDriver[];
  companies: RankingCompany[];
  totals: {
    total_entregas: number;
    total_mercadorias: number;
  };
  meta: {
    query_time_ms: number;
  };
}

interface CacheEntry {
  payload: RankingPayload;
  cachedAt: number;   // Date.now()
  expiresAt: number;  // Date.now() + TTL
}

const _cache = new Map<string, CacheEntry>();

/** Gera a chave de cache a partir do intervalo de datas. */
export function rankingCacheKey(start: Date, end: Date): string {
  return `ranking_${start.toISOString()}_${end.toISOString()}`;
}

/** Retorna os dados do cache se ainda válidos, ou null se expirado/ausente. */
export function getRankingCache(key: string): RankingPayload | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return null;
  }
  return entry.payload;
}

/** Armazena dados no cache com o TTL padrão. */
export function setRankingCache(key: string, payload: RankingPayload): void {
  _cache.set(key, {
    payload,
    cachedAt: Date.now(),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Invalida todas as entradas de ranking no cache.
 * Chame após inserir um novo pacote (nova entrega registrada).
 */
export function invalidateRankingCache(): void {
  for (const key of _cache.keys()) {
    if (key.startsWith('ranking_')) {
      _cache.delete(key);
    }
  }
}

/** Informações de debug sobre o estado atual do cache. */
export function getRankingCacheInfo(): {
  entries: number;
  oldest: Date | null;
  newest: Date | null;
} {
  if (_cache.size === 0) return { entries: 0, oldest: null, newest: null };
  const times = [..._cache.values()].map(e => e.cachedAt);
  return {
    entries: _cache.size,
    oldest: new Date(Math.min(...times)),
    newest: new Date(Math.max(...times)),
  };
}
