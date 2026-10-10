import { Injectable } from '@nestjs/common';

const ONLINE_WINDOW_MS = 60_000;

/**
 * Staff heartbeats: an agent counts as available for a minute after their last ping.
 * ponytail: lives in this process's memory, which is right for one server instance;
 * keep it in the database or Redis if the backend ever runs as several instances.
 */
@Injectable()
export class PresenceService {
  private readonly lastSeen = new Map<number, number>();

  ping(agentId: number): void {
    this.lastSeen.set(agentId, Date.now());
  }

  anyoneOnline(): boolean {
    const cutoff = Date.now() - ONLINE_WINDOW_MS;
    return [...this.lastSeen.values()].some((t) => t >= cutoff);
  }
}
