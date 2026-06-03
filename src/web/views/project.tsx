import { useEffect, useState } from "react"
import * as api from "../api.ts"
import { Badge, Icon, icons, timeAgo, useToast } from "../ui.tsx"
import { LogConsole } from "./logs.tsx"

type Tab = "deployments" | "env" | "database" | "domains" | "settings"

export const ProjectView = ({ id, go }: { id: number; go: (p: string) => void }) => {
  const [project, setProject] = useState<api.ProjectDetail | null>(null)
  const [tab, setTab] = useState<Tab>("deployments")
  const [active, setActive] = useState<number | null>(null)
  const toast = useToast()

  const load = async () => {
    const p = await api.getProject(id)
    setProject(p)
    if (active === null && p.deployments[0]) setActive(p.deployments[0].id)
  }
  useEffect(() => {
    void load()
  }, [id])

  // Poll while any deployment is in flight.
  useEffect(() => {
    if (!project) return
    const inFlight = project.deployments.some((d) =>
      ["queued", "building", "running"].includes(d.status),
    )
    if (!inFlight) return
    const t = setInterval(load, 2500)
    return () => clearInterval(t)
  }, [project])

  if (!project)
    return (
      <div className="main">
        <div className="empty-state">Loading…</div>
      </div>
    )

  const live = project.deployments.find((d) => d.status === "live")
  const appUrl = `http://${project.name}.krillin.local`

  const deploy = async () => {
    try {
      const d = await api.deploy(id)
      toast.show("Deploy started")
      setActive(d.id)
      setTab("deployments")
      await load()
    } catch (e) {
      toast.show((e as Error).message, true)
    }
  }

  return (
    <div className="main">
      {toast.node}
      <div style={{ marginBottom: 6 }}>
        <span className="link" onClick={() => go("/projects")}>
          ← Projects
        </span>
      </div>
      <div className="topbar">
        <div>
          <h1>{project.name}</h1>
          <div className="sub">
            {live ? (
              <a className="link" href={appUrl} target="_blank" rel="noreferrer">
                {appUrl} <Icon d={icons.external} size={11} />
              </a>
            ) : (
              "not deployed"
            )}
          </div>
        </div>
        <div className="row" style={{ width: "auto", gap: 8 }}>
          {live && (
            <a className="btn" href={appUrl} target="_blank" rel="noreferrer">
              <Icon d={icons.external} /> Visit
            </a>
          )}
          <button className="btn primary" onClick={deploy} disabled={!project.repoUrl}>
            <Icon d={icons.rocket} /> Deploy
          </button>
        </div>
      </div>

      <div className="tabs">
        {(["deployments", "env", "database", "domains", "settings"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t[0]!.toUpperCase() + t.slice(1)}
            {t === "env" && project.env.length > 0 ? ` (${project.env.length})` : ""}
            {t === "domains" && project.domains.length > 0 ? ` (${project.domains.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "deployments" && (
        <Deployments
          project={project}
          active={active}
          setActive={setActive}
          reload={load}
          toast={toast}
        />
      )}
      {tab === "env" && <EnvEditor project={project} reload={load} toast={toast} />}
      {tab === "database" && <DatabasePanel project={project} toast={toast} />}
      {tab === "domains" && <Domains project={project} reload={load} toast={toast} />}
      {tab === "settings" && <Settings project={project} reload={load} go={go} toast={toast} />}
    </div>
  )
}

const Deployments = ({ project, active, setActive, reload, toast }: any) => {
  const deps = project.deployments as api.Deployment[]
  return (
    <div className="grid" style={{ gridTemplateColumns: "320px 1fr", alignItems: "start" }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {deps.length === 0 ? (
          <div className="empty-state" style={{ padding: 30 }}>
            No deployments yet.
          </div>
        ) : (
          deps.map((d) => (
            <div
              key={d.id}
              onClick={() => setActive(d.id)}
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                background: active === d.id ? "var(--panel2)" : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600 }}>#{d.id}</span>
                <span className="tag">{d.commitSha ?? "—"}</span>
                <div style={{ flex: 1 }} />
                <Badge status={d.status} />
              </div>
              <div className="pmeta" style={{ marginTop: 5 }}>
                {timeAgo(d.createdAt)} · {d.trigger}
              </div>
            </div>
          ))
        )}
      </div>
      <div>
        {active ? (
          <>
            <div
              className="row"
              style={{ marginBottom: 12, width: "auto", justifyContent: "flex-end" }}
            >
              <DeploymentActions
                deployment={deps.find((d) => d.id === active)!}
                reload={reload}
                toast={toast}
              />
            </div>
            <LogConsole deploymentId={active} onStatus={() => {}} />
          </>
        ) : (
          <div className="console">
            <span className="empty">Select a deployment to view logs.</span>
          </div>
        )}
      </div>
    </div>
  )
}

const DeploymentActions = ({
  deployment,
  reload,
  toast,
}: {
  deployment: api.Deployment
  reload: () => void
  toast: any
}) => {
  const stop = async () => {
    await api.stopDeployment(deployment.id)
    toast.show("Stopped")
    reload()
  }
  const redeploy = async () => {
    await api.redeploy(deployment.id)
    toast.show("Redeploying")
    reload()
  }
  return (
    <>
      {deployment.status === "live" && (
        <button className="btn sm danger" onClick={stop}>
          <Icon d={icons.stop} size={12} /> Stop
        </button>
      )}
      <button className="btn sm" onClick={redeploy}>
        <Icon d={icons.refresh} size={12} /> Redeploy
      </button>
    </>
  )
}

const EnvEditor = ({ project, reload, toast }: any) => {
  const [vars, setVars] = useState<Array<{ key: string; value: string }>>(
    project.env.map((e: api.EnvVar) => ({ key: e.key, value: e.value })),
  )
  const [busy, setBusy] = useState(false)
  const set = (i: number, field: "key" | "value", val: string) =>
    setVars((v) => v.map((row, j) => (j === i ? { ...row, [field]: val } : row)))
  const save = async () => {
    setBusy(true)
    try {
      await api.setEnv(
        project.id,
        vars.filter((v) => v.key.trim()),
      )
      toast.show("Environment saved — redeploy to apply")
      reload()
    } catch (e) {
      toast.show((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card" style={{ maxWidth: 680 }}>
      <p className="sub" style={{ marginBottom: 16 }}>
        Variables are injected into the container on the next deploy. <b>PORT</b> is set
        automatically.
      </p>
      {vars.map((v, i) => (
        <div className="kv" key={i}>
          <input
            className="input mono"
            placeholder="KEY"
            value={v.key}
            onChange={(e) => set(i, "key", e.target.value)}
          />
          <input
            className="input mono"
            placeholder="value"
            value={v.value}
            onChange={(e) => set(i, "value", e.target.value)}
          />
          <button
            className="btn sm danger"
            onClick={() => setVars((vs) => vs.filter((_, j) => j !== i))}
          >
            <Icon d={icons.trash} size={13} />
          </button>
        </div>
      ))}
      <div className="row" style={{ width: "auto", marginTop: 8 }}>
        <button className="btn sm" onClick={() => setVars((v) => [...v, { key: "", value: "" }])}>
          <Icon d={icons.plus} size={13} /> Add variable
        </button>
        <button className="btn primary sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  )
}

const DatabasePanel = ({ project, toast }: any) => {
  const [database, setDatabase] = useState<api.DatabaseInfo | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState(false)

  const load = async () => setDatabase(await api.getDatabase(project.id))
  useEffect(() => {
    void load()
  }, [])

  const attach = async () => {
    setBusy(true)
    try {
      setDatabase(await api.attachDatabase(project.id))
      toast.show("Database provisioned — redeploy to connect")
    } catch (e) {
      toast.show((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }
  const detach = async () => {
    if (!confirm("Drop this database and all its data? This cannot be undone.")) return
    setBusy(true)
    try {
      await api.detachDatabase(project.id)
      setDatabase(null)
      toast.show("Database removed")
    } catch (e) {
      toast.show((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  if (database === undefined) return <div className="card empty-state">Loading…</div>

  if (!database) {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <h2 style={{ fontSize: 15, marginBottom: 4 }}>
          <Icon d={icons.box} size={14} /> PostgreSQL
        </h2>
        <p className="sub" style={{ marginBottom: 16 }}>
          Provision a dedicated database on Kettle's shared Postgres. A private database, role, and{" "}
          <span className="tag">DATABASE_URL</span> are created and injected on the next deploy.
        </p>
        <button className="btn primary" onClick={attach} disabled={busy}>
          <Icon d={icons.plus} /> {busy ? "Provisioning…" : "Add PostgreSQL"}
        </button>
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <h2 style={{ fontSize: 15 }}>
          <Icon d={icons.box} size={14} /> PostgreSQL
        </h2>
        <span className="badge s-live">
          <span className="dot" /> attached
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn sm danger" onClick={detach} disabled={busy}>
          <Icon d={icons.trash} size={13} /> Remove
        </button>
      </div>
      <div className="field">
        <label>Database</label>
        <input className="input mono" readOnly value={database.dbName} />
      </div>
      <div className="field">
        <label>User</label>
        <input className="input mono" readOnly value={database.dbUser} />
      </div>
      <div className="field">
        <label>DATABASE_URL (injected automatically)</label>
        <div className="kv">
          <input
            className="input mono"
            readOnly
            value={reveal ? database.url : database.url.replace(/:\/\/[^@]+@/, "://••••••@")}
          />
          <button className="btn sm" onClick={() => setReveal((r) => !r)}>
            {reveal ? "Hide" : "Show"}
          </button>
          <button
            className="btn sm"
            onClick={() => {
              void navigator.clipboard?.writeText(database.url)
              toast.show("Connection string copied")
            }}
          >
            Copy
          </button>
        </div>
        <span className="hint">
          Apps reach it at <b>{project.name}</b> over the shared{" "}
          <span className="tag">kettle-data</span> network. Redeploy after attaching.
        </span>
      </div>
    </div>
  )
}

const Domains = ({ project, reload, toast }: any) => {
  const [host, setHost] = useState("")
  const add = async () => {
    try {
      await api.addDomain(project.id, host)
      setHost("")
      toast.show("Domain added")
      reload()
    } catch (e) {
      toast.show((e as Error).message, true)
    }
  }
  const remove = async (domainId: number) => {
    await api.removeDomain(domainId)
    toast.show("Domain removed")
    reload()
  }
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <p className="sub" style={{ marginBottom: 16 }}>
        Default domain: <b>{project.name}.krillin.local</b>. Add custom domains pointing to this
        server.
      </p>
      <div className="kv">
        <input
          className="input mono"
          placeholder="app.example.com"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn primary sm" onClick={add}>
          Add
        </button>
      </div>
      {(project.domains as api.Domain[]).map((d) => (
        <div className="kv" key={d.id}>
          <span className="mono" style={{ flex: 1 }}>
            <Icon d={icons.globe} size={13} /> {d.host}
          </span>
          <button className="btn sm danger" onClick={() => remove(d.id)}>
            <Icon d={icons.trash} size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

const Settings = ({ project, reload, go, toast }: any) => {
  const [form, setForm] = useState({
    repoUrl: project.repoUrl ?? "",
    branch: project.branch,
    buildType: project.buildType,
    rootDir: project.rootDir,
    buildCommand: project.buildCommand ?? "",
    startCommand: project.startCommand ?? "",
    internalPort: String(project.internalPort),
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const save = async () => {
    try {
      await api.updateProject(project.id, {
        repoUrl: form.repoUrl || null,
        branch: form.branch,
        buildType: form.buildType,
        rootDir: form.rootDir || ".",
        buildCommand: form.buildCommand || null,
        startCommand: form.startCommand || null,
        internalPort: Number(form.internalPort) || 3000,
      })
      toast.show("Saved")
      reload()
    } catch (e) {
      toast.show((e as Error).message, true)
    }
  }
  const destroy = async () => {
    if (!confirm(`Delete project "${project.name}"? This stops and removes all deployments.`))
      return
    await api.deleteProject(project.id)
    go("/projects")
  }
  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card">
        <div className="field">
          <label>Git repository</label>
          <input
            className="input"
            value={form.repoUrl}
            onChange={(e) => set("repoUrl", e.target.value)}
          />
        </div>
        <div className="row">
          <div className="field">
            <label>Branch</label>
            <input
              className="input"
              value={form.branch}
              onChange={(e) => set("branch", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Root dir</label>
            <input
              className="input"
              value={form.rootDir}
              onChange={(e) => set("rootDir", e.target.value)}
            />
          </div>
          <div className="field">
            <label>App port</label>
            <input
              className="input"
              value={form.internalPort}
              onChange={(e) => set("internalPort", e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>Build type</label>
          <select
            className="select"
            value={form.buildType}
            onChange={(e) => set("buildType", e.target.value)}
          >
            <option value="auto">Auto-detect</option>
            <option value="dockerfile">Dockerfile</option>
            <option value="bun">Bun</option>
            <option value="node">Node</option>
            <option value="static">Static</option>
          </select>
        </div>
        <div className="row">
          <div className="field">
            <label>Build command</label>
            <input
              className="input mono"
              placeholder="(auto)"
              value={form.buildCommand}
              onChange={(e) => set("buildCommand", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Start command</label>
            <input
              className="input mono"
              placeholder="(auto)"
              value={form.startCommand}
              onChange={(e) => set("startCommand", e.target.value)}
            />
          </div>
        </div>
        <button className="btn primary" onClick={save}>
          Save changes
        </button>
      </div>
      <DeployHook project={project} reload={reload} toast={toast} />
      <div className="card" style={{ marginTop: 16, borderColor: "#3a2226" }}>
        <h2 style={{ fontSize: 15, marginBottom: 4 }}>Danger zone</h2>
        <p className="sub" style={{ marginBottom: 14 }}>
          Permanently delete this project and all its deployments.
        </p>
        <button className="btn danger" onClick={destroy}>
          <Icon d={icons.trash} /> Delete project
        </button>
      </div>
    </div>
  )
}

// Push-to-deploy: wire this URL + secret into the repo's webhooks on Tangle (git.local).
const DeployHook = ({ project, reload, toast }: any) => {
  const [reveal, setReveal] = useState(false)
  const hookUrl = `${location.origin}/api/hooks/tangle`
  const secret: string | null = project.webhookSecret
  const auto = !!project.autoDeploy

  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text)
    toast.show(`${label} copied`)
  }
  const toggleAuto = async () => {
    await api.updateProject(project.id, { autoDeploy: auto ? 0 : 1 })
    toast.show(auto ? "Auto-deploy off" : "Auto-deploy on")
    reload()
  }
  const rotate = async () => {
    await api.rotateWebhook(project.id)
    toast.show("Secret rotated — update it in Tangle")
    setReveal(true)
    reload()
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 15 }}>
          <Icon d={icons.git} size={14} /> Deploy hook
        </h2>
        <div style={{ flex: 1 }} />
        <span className={`badge ${auto ? "s-live" : "s-stopped"}`}>
          <span className="dot" />
          {auto ? "auto-deploy on" : "auto-deploy off"}
        </span>
        <button className="btn sm" onClick={toggleAuto}>
          {auto ? "Disable" : "Enable"}
        </button>
      </div>
      <p className="sub" style={{ marginBottom: 14 }}>
        On Tangle (git.local) open the repo → <b>Settings → Webhooks → Add</b>. Paste the URL and
        secret below, content-type <span className="tag">application/json</span>, event{" "}
        <span className="tag">push</span>. Every push redeploys{" "}
        <b>
          {project.name}@{project.branch}
        </b>
        .
      </p>
      <div className="field">
        <label>Payload URL</label>
        <div className="kv">
          <input className="input mono" readOnly value={hookUrl} />
          <button className="btn sm" onClick={() => copy(hookUrl, "URL")}>
            Copy
          </button>
        </div>
      </div>
      <div className="field">
        <label>Secret</label>
        <div className="kv">
          <input
            className="input mono"
            readOnly
            value={
              secret ? (reveal ? secret : "•".repeat(32)) : "(none — pushes accepted unsigned)"
            }
          />
          {secret && (
            <button className="btn sm" onClick={() => setReveal((r) => !r)}>
              {reveal ? "Hide" : "Show"}
            </button>
          )}
          {secret && (
            <button className="btn sm" onClick={() => copy(secret, "Secret")}>
              Copy
            </button>
          )}
          <button className="btn sm" onClick={rotate}>
            <Icon d={icons.refresh} size={12} /> Rotate
          </button>
        </div>
      </div>
    </div>
  )
}
