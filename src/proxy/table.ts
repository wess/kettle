export type Target = { port: number; projectId: number; project: string }

// Host -> upstream target. Rebuilt from the DB whenever deployments change.
let table: Map<string, Target> = new Map()

export const setRoutes = (routes: Map<string, Target>): void => {
  table = routes
}

export const lookup = (host: string): Target | undefined => table.get(host.toLowerCase())

export const allRoutes = (): Array<{ host: string } & Target> =>
  [...table.entries()].map(([host, t]) => ({ host, ...t }))
