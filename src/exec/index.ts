export type LineSink = (line: string, stream: "stdout" | "stderr") => void

export type ExecResult = { code: number; output: string }

const pump = async (
  stream: ReadableStream<Uint8Array> | undefined,
  which: "stdout" | "stderr",
  onLine: LineSink | undefined,
  collected: string[],
): Promise<void> => {
  if (!stream) return
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl = buffer.indexOf("\n")
    while (nl !== -1) {
      const line = buffer.slice(0, nl)
      collected.push(line)
      onLine?.(line, which)
      buffer = buffer.slice(nl + 1)
      nl = buffer.indexOf("\n")
    }
  }
  if (buffer.length > 0) {
    collected.push(buffer)
    onLine?.(buffer, which)
  }
}

// Run a command, streaming each output line to `onLine` and collecting the full output.
export const exec = async (
  cmd: string[],
  opts: { cwd?: string; env?: Record<string, string>; onLine?: LineSink } = {},
): Promise<ExecResult> => {
  const proc = Bun.spawn({
    cmd,
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    stdout: "pipe",
    stderr: "pipe",
  })

  const collected: string[] = []
  await Promise.all([
    pump(proc.stdout as ReadableStream<Uint8Array>, "stdout", opts.onLine, collected),
    pump(proc.stderr as ReadableStream<Uint8Array>, "stderr", opts.onLine, collected),
  ])
  const code = await proc.exited
  return { code, output: collected.join("\n") }
}

// Run a command and return trimmed stdout, throwing on non-zero exit.
export const execCapture = async (
  cmd: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): Promise<string> => {
  const result = await exec(cmd, opts)
  if (result.code !== 0) {
    throw new Error(`command failed (${result.code}): ${cmd.join(" ")}\n${result.output}`)
  }
  return result.output.trim()
}
