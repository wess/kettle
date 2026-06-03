import type React from "react"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import * as api from "./api.ts"
import { Icon, icons } from "./ui.tsx"
import { Login } from "./views/login.tsx"
import { ProjectView } from "./views/project.tsx"
import { Projects } from "./views/projects.tsx"

const useHashRoute = (): [string, (p: string) => void] => {
  const [path, setPath] = useState(location.hash.slice(1) || "/projects")
  useEffect(() => {
    const onHash = () => setPath(location.hash.slice(1) || "/projects")
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  const go = (p: string) => {
    location.hash = p
  }
  return [path, go]
}

const Sidebar = ({
  path,
  go,
  onLogout,
}: {
  path: string
  go: (p: string) => void
  onLogout: () => void
}) => (
  <div className="sidebar">
    <div className="brand">
      <div className="logo">🫖</div>
      <b>Kettle</b>
    </div>
    <nav className="nav">
      <a className={path.startsWith("/projects") ? "active" : ""} onClick={() => go("/projects")}>
        <Icon d={icons.box} /> Projects
      </a>
      <a className={path === "/routes" ? "active" : ""} onClick={() => go("/routes")}>
        <Icon d={icons.globe} /> Routes
      </a>
    </nav>
    <div className="foot">
      <button onClick={onLogout}>Sign out</button>
    </div>
  </div>
)

const Routes = () => {
  const [sys, setSys] = useState<api.SystemInfo | null>(null)
  useEffect(() => {
    void api
      .system()
      .then(setSys)
      .catch(() => {})
  }, [])
  return (
    <div className="main">
      <div className="topbar">
        <div>
          <h1>Routes</h1>
          <div className="sub">Live host → container mappings served by the edge proxy</div>
        </div>
      </div>
      {!sys ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Host</th>
                <th>Project</th>
                <th>Upstream</th>
              </tr>
            </thead>
            <tbody>
              {sys.routes.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ color: "var(--muted)", padding: 24 }}>
                    No live routes. Deploy a project to populate this.
                  </td>
                </tr>
              ) : (
                sys.routes.map((r) => (
                  <tr key={r.host}>
                    <td className="mono">
                      <Icon d={icons.globe} size={13} /> {r.host}
                    </td>
                    <td>{r.project}</td>
                    <td className="mono">127.0.0.1:{r.port}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {sys && !sys.edgeEnabled && (
        <p className="sub" style={{ marginTop: 14 }}>
          Edge proxy is disabled. Set <span className="tag">EDGE_ENABLED=1</span> to route traffic
          on port {sys.edgeHttpPort}.
        </p>
      )}
    </div>
  )
}

const App = () => {
  const [authed, setAuthed] = useState(!!api.getToken())
  const [path, go] = useHashRoute()

  if (!authed)
    return (
      <Login
        onLogin={() => {
          setAuthed(true)
          go("/projects")
        }}
      />
    )

  const logout = () => {
    api.setToken(null)
    setAuthed(false)
  }

  let view: React.ReactNode
  const projectMatch = path.match(/^\/projects\/(\d+)$/)
  if (projectMatch) view = <ProjectView id={Number(projectMatch[1])} go={go} />
  else if (path === "/routes") view = <Routes />
  else view = <Projects go={go} />

  return (
    <div className="shell">
      <Sidebar path={path} go={go} onLogout={logout} />
      {view}
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
