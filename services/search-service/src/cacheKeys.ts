import type Redis from 'ioredis';

const FACETS_KEY = 'search:facets';
const FILTER_PREFIX = 'search:filter:';

/** Collect keys matching `pattern` via SCAN (safe for large keyspaces). */
export async function redisKeysByPattern(client: Redis, pattern: string): Promise<string[]> {
  const out: string[] = [];
  return new Promise((resolve, reject) => {
    const stream = client.scanStream({ match: pattern, count: 400 });
    stream.on('data', (keys: string[]) => {
      if (keys.length) out.push(...keys);
    });
    stream.on('end', () => resolve(out));
    stream.on('error', reject);
  });
}

export async function invalidateSearchRedisCache(client: Redis): Promise<{
  filterKeysDeleted: number;
  facetsDeleted: boolean;
}> {
  const filterKeys = await redisKeysByPattern(client, `${FILTER_PREFIX}*`);
  let filterKeysDeleted = 0;
  const chunk = 500;
  for (let i = 0; i < filterKeys.length; i += chunk) {
    const batch = filterKeys.slice(i, i + chunk);
    if (batch.length) {
      await client.del(...batch);
      filterKeysDeleted += batch.length;
    }
  }
  const facetsDeleted = (await client.del(FACETS_KEY)) > 0;
  return { filterKeysDeleted, facetsDeleted };
}

export { FACETS_KEY, FILTER_PREFIX };
