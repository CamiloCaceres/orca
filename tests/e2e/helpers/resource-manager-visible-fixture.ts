import type { ElectronApplication, Page } from '@stablyai/playwright-test'

/** Inject diagnostic eligibility without showing or activating the test window. */
export async function makeResourceManagerFixtureVisible(
  app: ElectronApplication,
  page: Page
): Promise<void> {
  await app.evaluate(({ BrowserWindow, ipcMain }) => {
    type InvokeHandler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The private registry is checked before wrapping these two diagnostic handlers for this isolated fixture.
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, InvokeHandler> })
      ._invokeHandlers
    for (const channel of ['pty:listSessions', 'memory:getSnapshot']) {
      const original = handlers.get(channel)
      if (!original) {
        throw new Error(`Missing ${channel}`)
      }
      ipcMain.removeHandler(channel)
      // The real native veto is covered separately; this fixture exercises rendering against operational reads.
      ipcMain.handle(channel, (event, scope) =>
        channel === 'pty:listSessions' ? original(event, scope) : original(event)
      )
    }
    ipcMain.removeHandler('memory:resourceWindowVisible')
    ipcMain.handle('memory:resourceWindowVisible', () => true)
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('memory:resourceWindowVisibility', true)
    }
  })
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}
