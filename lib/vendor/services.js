


export function getService(ctx, name, options = {}) {
  if (!ctx || typeof ctx.get !== 'function') {
    if (options.required) {
      throw new Error(`web-focus: ctx.get is unavailable, so service "${name}" cannot be resolved (host contract mismatch)`)
    }
    return null
  }
  let value
  try {
    value = ctx.get(name)
  } catch (err) {

    note(options.logger, `web-focus: ctx.get("${name}") threw — ${String(err?.message ?? err)}`)
    return null
  }
  if (value === undefined || value === null) {
    if (options.required) {
      throw new Error(
        `web-focus: the service "${name}" required by the host does not exist. ` +
          `Check that the plugin providing it is enabled (see the host logs for registration warnings).`,
      )
    }
    return null
  }
  return value
}


export function getServiceWith(ctx, name, method, options = {}) {
  const service = getService(ctx, name, options)
  if (!service) return null
  if (typeof service[method] !== 'function') {
    note(
      options.logger,
      `web-focus: service "${name}" exists but has no method "${method}" (the host version may differ) — degraded`,
    )
    return null
  }
  return service
}


export function note(logger, message) {
  try {
    logger?.warn?.(message)
  } catch {

  }
}
