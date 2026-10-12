import type { MatchResult } from '../../core/match/types';
import type { MatchHistoryRepository } from '../types';
import { readText, writeText } from './textStore';

const FILE_NAME = 'history.json';
/** Oldest results are dropped beyond this many. */
const MAX_RESULTS = 2000;

/** Match history saved as JSON on the device, so stats survive app restarts. */
export class FileHistoryRepository implements MatchHistoryRepository {
  private results: MatchResult[] | null = null;

  private load(): MatchResult[] {
    if (this.results) return this.results;
    try {
      const text = readText(FILE_NAME);
      this.results = text ? (JSON.parse(text) as MatchResult[]) : [];
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
    writeText(FILE_NAME, JSON.stringify(this.results));
  }

  async get(matchId: string): Promise<MatchResult | undefined> {
    return this.load().find((r) => r.matchId === matchId);
  }

  async list(): Promise<MatchResult[]> {
    return [...this.load()];
  }
}
