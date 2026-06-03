import { useEffect, useState } from "react"
import * as api from "../api.ts"
import { Badge, Icon, icons, timeAgo } from "../ui.tsx"

const NewProject = ({
  onCreated,
  onCancel,
}: {
  onCreated: (id: number) => void
  onCancel: () => void
}) => {
  const [name, setName] = useState("")
  const [repoUrl, setRepoUrl] = useState("")
  const [branch, setBranch] = useState("main")
  const [buildType, setBuildType] = useState("auto")
  const [internalPort, setInternalPort] = useState("3000")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError("")
    setBusy(true)
    try {
      const p = await api.createProject({
        name,
        repoUrl: repoUrl || null,
        branch,
        buildType,
        internalPort: Number(internalPort) || 3000,
      })
      onCreated(p.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h2 style={{ fontSize: 17, marginBottom: 16 }}>New project</h2>
      {error && <div className="err">{error}</div>}
      <div className="field">
        <label>Name</label>
        <input
          className="input"
          value={name}
          autoFocus
          placeholder="my-app"
          onChange={(e) => setName(e.target.value)}
        />
        <span className="hint">
          Lowercase slug. Deploys to{" "}
          <b>{(name || "my-app").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.krillin.local</b>
        </span>
      </div>
      <div className="field">
        <label>Git repository</label>
        <input
          className="input"
          value={repoUrl}
          placeholder="https://github.com/you/app.git"
          onChange={(e) => setRepoUrl(e.target.value)}
        />
        <span className="hint">A public/SSH git URL or local path. Add it later if you like.</span>
      </div>
      <div className="row">
        <div className="field">
          <label>Branch</label>
          <input className="input" value={branch} onChange={(e) => setBranch(e.target.value)} />
        </div>
        <div className="field">
          <label>Build</label>
          <select
            className="select"
            value={buildType}
            onChange={(e) => setBuildType(e.target.value)}
          >
            <option value="auto">Auto-detect</option>
            <option value="dockerfile">Dockerfile</option>
            <option value="bun">Bun</option>
            <option value="node">Node</option>
            <option value="static">Static</option>
          </select>
        </div>
        <div className="field">
          <label>App port</label>
          <input
            className="input"
            value={internalPort}
            onChange={(e) => setInternalPort(e.target.value)}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn primary" onClick={submit} disabled={busy || !name}>
          {busy ? "Creating…" : "Create project"}
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export const Projects = ({ go }: { go: (path: string) => void }) => {
  const [projects, setProjects] = useState<api.Project[] | null>(null)
  const [sys, setSys] = useState<api.SystemInfo | null>(null)
  const [creating, setCreating] = useState(false)

  const load = async () => {
    setProjects(await api.listProjects())
    setSys(await api.system().catch(() => null))
  }
  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="main">
      <div className="topbar">
        <div>
          <h1>Projects</h1>
          <div className="sub">Apps deployed on {sys?.appDomain ?? "krillin"}</div>
        </div>
        {!creating && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Icon d={icons.plus} /> New project
          </button>
        )}
      </div>

      {sys && (
        <div className="grid cols4" style={{ marginBottom: 22 }}>
          <div className="stat">
            <div className="label">Projects</div>
            <div className="value">{sys.projects}</div>
          </div>
          <div className="stat">
            <div className="label">Live</div>
            <div className="value" style={{ color: "var(--green)" }}>
              {sys.live}
            </div>
          </div>
          <div className="stat">
            <div className="label">Routes</div>
            <div className="value">{sys.routes.length}</div>
          </div>
          <div className="stat">
            <div className="label">Docker</div>
            <div className="value" style={{ color: sys.docker ? "var(--green)" : "var(--red)" }}>
              {sys.docker ? "ready" : "down"}
            </div>
          </div>
        </div>
      )}

      {creating && (
        <div style={{ marginBottom: 22 }}>
          <NewProject
            onCancel={() => setCreating(false)}
            onCreated={(id) => go(`/projects/${id}`)}
          />
        </div>
      )}

      {projects === null ? (
        <div className="empty-state">Loading…</div>
      ) : projects.length === 0 && !creating ? (
        <div className="card empty-state">
          <div className="big">No projects yet</div>
          <div>Create your first project to deploy an app.</div>
          <button
            className="btn primary"
            style={{ marginTop: 16 }}
            onClick={() => setCreating(true)}
          >
            <Icon d={icons.plus} /> New project
          </button>
        </div>
      ) : (
        <div className="plist">
          {projects.map((p) => (
            <div
              className="prow"
              key={p.id}
              style={{ cursor: "pointer" }}
              onClick={() => go(`/projects/${p.id}`)}
            >
              <div style={{ minWidth: 0 }}>
                <div className="pname">{p.name}</div>
                <div className="pmeta">
                  <span>
                    <Icon d={icons.git} size={12} /> {p.repoUrl ? shortRepo(p.repoUrl) : "no repo"}
                  </span>
                  <span>·</span>
                  <span>{p.latest ? timeAgo(p.latest.createdAt) : "never deployed"}</span>
                </div>
              </div>
              <div className="spacer" />
              {p.latest && <Badge status={p.latest.status} />}
              <Icon d={icons.chevron} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const shortRepo = (url: string): string =>
  url
    .replace(/^https?:\/\//, "")
    .replace(/\.git$/, "")
    .replace(/^git@/, "")
