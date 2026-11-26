import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/work/nova-os', '/work/hitmen'].map((p) => ({ url: SITE_URL + p, changeFrequency: 'monthly', priority: p ? 0.7 : 1 }));
}
