import { File, Paths } from 'expo-file-system';

import type { MatchResult } from '../../core/match/types';
import type { MatchHistoryRepository } from '../types';

const FILE_NAME = 'history.json';
/** Oldest results are dropped beyond this many. */
const MAX_RESULTS = 2000;

/** Match history saved as JSON on the device, so stats survive app restarts. */
export class FileHistoryRepository implements MatchHistoryRepository {
  private results: MatchResult[] | null = null;
  private readonly file = new File(Paths.document, FILE_NAME);

  private load(): MatchResult[] {
    if (this.results) return this.results;
    try {
      this.results = this.file.exists ? (JSON.parse(this.file.textSync()) as MatchResult[]) : [];
    } catch {
      this.results = [];
    }
    return this.results;
  }

  async save(result: MatchResult): Promise<void> {
    const results = this.load().filter((r) => r.matchId !== result.matchId);
    results.unshift(result);
    results.sort((a, b) => b.finishedAtMs - a.finishedAtMs);
    this.results = results.slice(0, MAX_RESULTS);
    this.file.write(JSON.stringify(this.results));
  }

  async get(matchId: string): Promise<MatchResult | undefined> {
    return this.load().find((r) => r.matchId === matchId);
  }

  async list(): Promise<MatchResult[]> {
    return [...this.load()];
  }
}
