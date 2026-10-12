import { Injectable, type MessageEvent } from '@nestjs/common';
import { Subject, filter, interval, map, merge, type Observable } from 'rxjs';

/** Everyone with an open page in the group hears its events (support staff share one inbox). */
export type LiveGroup = 'support-staff';

export interface LiveEvent {
  /** one user, or a whole group */
  userId?: number;
  group?: LiveGroup;
  type: 'order' | 'product' | 'support';
  data: Record<string, unknown>;
}

/**
 * Pushes events to one user's open pages, or to every page of a group, over server-sent events.
 * ponytail: one in-memory Subject, so only users connected to this process hear an event;
 * relay through Postgres LISTEN/NOTIFY once the server runs as several instances.
 */
@Injectable()
export class LiveService {
  private readonly events = new Subject<LiveEvent>();

  emit(event: LiveEvent): void {
    this.events.next(event);
  }

  stream(userId: number, heartbeatMs = 25_000, groups: LiveGroup[] = []): Observable<MessageEvent> {
    return merge(
      this.events.pipe(
        filter((e) => e.userId === userId || (e.group !== undefined && groups.includes(e.group))),
        map((e): MessageEvent => ({ type: e.type, data: e.data })),
      ),
      // proxies close a connection that stays silent too long
      interval(heartbeatMs).pipe(map((): MessageEvent => ({ type: 'ping', data: '' }))),
    );
  }
}
