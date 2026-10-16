import { copyFile } from 'node:fs/promises'
// One implementation, copied from the framework build into the server package.
// A server must not load the renderer when validating a notification URL.
for (const name of ['routes', 'schema'])
  for (const suffix of ['js', 'd.ts'])
    await copyFile(
      new URL(`../../pwakit/dist/push/${name}.${suffix}`, import.meta.url),
      new URL(`../src/${name}.${suffix}`, import.meta.url),
    )
