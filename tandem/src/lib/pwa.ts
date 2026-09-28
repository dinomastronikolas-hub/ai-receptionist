/** Remove cached page HTML (e.g. on sign-out on a shared device). */
export async function clearPageCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.includes("-pages")).map((k) => caches.delete(k)));
}
