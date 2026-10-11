import { Injectable, type MessageEvent } from '@nestjs/common';
import { Subject, filter, interval, map, merge, type Observable } from 'rxjs';

export interface LiveEvent {
  userId: number;
  type: 'order';
  data: Record<string, unknown>;
}

/**
 * Pushes events to one user's open pages over server-sent events.
 * ponytail: one in-memory Subject, so only users connected to this process hear an event;
 * relay through Postgres LISTEN/NOTIFY once the server runs as several instances.
 */
@Injectable()
export class LiveService {
  private readonly events = new Subject<LiveEvent>();

  emit(event: LiveEvent): void {
    this.events.next(event);
  }

  stream(userId: number, heartbeatMs = 25_000): Observable<MessageEvent> {
    return merge(
      this.events.pipe(
        filter((e) => e.userId === userId),
        map((e): MessageEvent => ({ type: e.type, data: e.data })),
      ),
      // proxies close a connection that stays silent too long
      interval(heartbeatMs).pipe(map((): MessageEvent => ({ type: 'ping', data: '' }))),
    );
  }
}
