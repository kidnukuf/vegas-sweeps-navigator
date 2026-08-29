export async function refreshCoordinatorWorkspace(refreshers: Array<() => Promise<unknown>>) {
  await Promise.all(refreshers.map((refresh) => refresh()));
}
