import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { searchTerms } from './text.js';

export interface PolicyHit {
  slug: string;
  title: string;
  body: string;
}

/**
 * Retrieval over the support policies using Postgres full-text search.
 * ponytail: ~10 short documents, so keyword search is enough. Move to embeddings (pgvector) if the
 * knowledge base grows to hundreds of pages or questions stop sharing words with the answers.
 */
@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async search(question: string, limit = 3): Promise<PolicyHit[]> {
    const terms = searchTerms(question);
    if (!terms.length) return [];

    // Any word may match (OR), longer words as prefixes so "returns" finds "return".
    // Terms are [a-z0-9] only (see searchTerms), so this string is a valid tsquery by construction.
    const query = terms.map((t) => (t.length > 4 ? `${t.replace(/(es|s)$/, '')}:*` : t)).join(' | ');

    return this.prisma.$queryRaw<PolicyHit[]>`
      SELECT "slug", "title", "body"
      FROM "PolicyChunk"
      WHERE "search" @@ to_tsquery('simple', ${query})
      ORDER BY ts_rank("search", to_tsquery('simple', ${query})) DESC, "id"
      LIMIT ${limit}`;
  }
}
