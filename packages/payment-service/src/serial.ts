/** Run async calls one at a time, in call order. Arkiv receipt writes share one key, so overlapping writes collide on the nonce. */
export function serial<A, R>(fn: (a: A) => Promise<R>): (a: A) => Promise<R> {
  let tail: Promise<unknown> = Promise.resolve();
  return (a) => {
    const run = tail.then(() => fn(a));
    tail = run.catch(() => undefined); // one failed write must not block the next
    return run;
  };
}
