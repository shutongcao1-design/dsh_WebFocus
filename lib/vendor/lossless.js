


export function pruneUndefined(value) {
  return pruneInner(value, new Set())
}


function isPlainObject(v) {
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function pruneInner(value, pathStack) {
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : pruneInner(item, pathStack)))
  }
  if (value !== null && typeof value === 'object') {


    if (!isPlainObject(value)) return value
    if (pathStack.has(value)) {
      throw new TypeError('pruneUndefined: input contains a circular reference (a tool return value must not be self-referential)')
    }
    pathStack.add(value)
    try {

      const out = {}
      for (const key of Object.keys(value)) {
        const v = value[key]
        if (v !== undefined) out[key] = pruneInner(v, pathStack)
      }
      return out
    } finally {
      pathStack.delete(value)
    }
  }
  return value
}
