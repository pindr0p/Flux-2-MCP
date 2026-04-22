export class SessionRegistry<T> {
  private readonly sessions = new Map<
    string,
    {
      value: T;
      lastActivityAt: number;
    }
  >();

  set(sessionId: string, value: T, lastActivityAt = Date.now()): void {
    this.sessions.set(sessionId, { value, lastActivityAt });
  }

  get(sessionId: string): T | undefined {
    return this.sessions.get(sessionId)?.value;
  }

  touch(sessionId: string, lastActivityAt = Date.now()): T | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    session.lastActivityAt = lastActivityAt;
    return session.value;
  }

  delete(sessionId: string): T | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    this.sessions.delete(sessionId);
    return session.value;
  }

  entries(): Array<[string, T]> {
    return Array.from(this.sessions.entries(), ([sessionId, entry]) => [
      sessionId,
      entry.value
    ]);
  }

  reapIdle(idleTimeoutMs: number, now = Date.now()): Array<[string, T]> {
    const expiredSessions: Array<[string, T]> = [];

    for (const [sessionId, entry] of this.sessions.entries()) {
      if (now - entry.lastActivityAt < idleTimeoutMs) {
        continue;
      }

      this.sessions.delete(sessionId);
      expiredSessions.push([sessionId, entry.value]);
    }

    return expiredSessions;
  }
}