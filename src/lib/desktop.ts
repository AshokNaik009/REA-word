type NativeClient = typeof import('@neutralinojs/lib')
let client: NativeClient | undefined

export function isDesktop(): boolean {
  return typeof (window as Window & { NL_OS?: string }).NL_OS === 'string'
}

export async function initializeDesktop(): Promise<void> {
  if (!isDesktop()) return
  client = await import('@neutralinojs/lib')
  const ready = new Promise<void>(resolve => {
    void client!.events.on('ready', () => resolve())
  })
  client.init()
  await ready
}

export function native(): NativeClient {
  if (!client) throw new Error('The native desktop connection is not ready. Please restart the app.')
  return client
}

export async function printDocument(): Promise<void> {
  if (isDesktop()) await native().window.print()
  else window.print()
}
