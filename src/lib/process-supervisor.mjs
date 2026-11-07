/**
 * Wait for every supplied promise, or return false when the grace period ends.
 * The timeout is always cleared after the race so it cannot keep Node alive
 * after child processes have already exited.
 */
export async function waitForPromisesOrTimeout(promises, timeoutMs) {
  if (!Array.isArray(promises)) throw new TypeError('promises harus berupa array.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new TypeError('timeoutMs harus integer >= 0.');
  if (promises.length === 0) return true;

  let timer;
  try {
    return await Promise.race([
      Promise.all(promises).then(() => true),
      new Promise(resolve => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
