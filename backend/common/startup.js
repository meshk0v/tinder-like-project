export async function waitFor(name, fn, attempts = 30, delayMs = 1000) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await fn();
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`Failed waiting for ${name}: ${lastErr?.message || lastErr}`);
}
