


const FAKE_NAMES = '联网搜索|搜索查询|搜索结果|联网抓取|联网查询|tool_call|tool_calls|function_call'


const FAKE_BLOCK_RE = new RegExp(`<(${FAKE_NAMES})>[\\s\\S]*?(?:</\\1>|$)`, 'g')


const FAKE_TAG_RE = new RegExp(`</?(?:${FAKE_NAMES})\\s*/?>`, 'g')


const BAR_OPT = '(?:[｜|]+)?'


const DSML_BAR = '[\\uFF5C|]'

const DSML = `<\\s*${DSML_BAR}{1,2}\\s*DSML\\s*${DSML_BAR}{1,2}\\s*`


const DSML_BLOCK_RE = new RegExp(
  `${DSML}(tool_calls|tool_call|function_call|invoke)\\b[^>]*>[\\s\\S]*?` +
    `(?:</\\s*${DSML_BAR}{1,2}\\s*DSML\\s*${DSML_BAR}{1,2}\\s*\\1\\s*>|$)`,
  'gi',
)


const DSML_TAG_RE = new RegExp(
  `</?\\s*${DSML_BAR}{1,2}\\s*DSML\\s*${DSML_BAR}{1,2}\\s*[A-Za-z_][\\w-]*(?:\\s[^>]*)?/?>`,
  'gi',
)


const MARKED_TAG_RE = /<[｜|][^<>\n]*>/g


const TAG_OPEN = '<\\s*(?:[｜|]{1,2}\\s*)?(?:antml:)?'
const TAG_CLOSE = '</\\s*(?:[｜|]{1,2}\\s*)?(?:antml:)?'

const CALL_TAGS = '(?:invoke|tool_call|tool_calls|function_calls)'


const XML_BARE_BLOCK_RE = new RegExp(
  `${TAG_OPEN}${CALL_TAGS}\\b[^>]*>[\\s\\S]*?(?:${TAG_CLOSE}${CALL_TAGS}\\s*>|$)`,
  'gi',
)


const XML_BARE_TAG_RE = new RegExp(
  `</?\\s*(?:[｜|]{1,2}\\s*)?(?:antml:)?(?:invoke|parameter|tool_call|tool_calls|function_calls)\\b[^<>]*/?>`,
  'gi',
)


const SPECIAL_TOKEN_RE = /<[｜|][^\s\\/<>]*>|<\s*[^\s\\/<>]+?[｜|][^\s\\/<>]*>/g


const MARKUP_ANY_RE = new RegExp(
  `<(${FAKE_NAMES})(?![A-Za-z0-9])` +
    `|<${BAR_OPT}(?:invoke|tool_call|tool_calls|function_calls)(?=[\\s>])` +
    `|${DSML}[A-Za-z_]` +
    `|<\\s*(?:antml:)?(?:invoke|tool_call|tool_calls|function_calls)` +
    `(?![A-Za-z0-9])(?![^>]*<)[^>]*\\bname\\s*=`,
  'i',
)


const MARKUP_STRONG_RE =
  /<\s*(?:[｜|]{1,2}\s*)?(?:antml:)?(?:invoke|tool_call|tool_calls|function_calls)(?=[\s/>])/gi


export const MARKUP_MIN_REMAINING_CHARS = 40

export const MARKUP_MAX_REMAINING_CHARS = 500

export const MARKUP_REMOVED_RATIO = 0.6


export function stripToolMarkup(text) {
  let cleaned = String(text ?? '')

  cleaned = cleaned.replace(DSML_BLOCK_RE, '')
  cleaned = cleaned.replace(XML_BARE_BLOCK_RE, '')
  cleaned = cleaned.replace(FAKE_BLOCK_RE, '')

  cleaned = cleaned.replace(DSML_TAG_RE, '')
  cleaned = cleaned.replace(MARKED_TAG_RE, '')
  cleaned = cleaned.replace(XML_BARE_TAG_RE, '')
  cleaned = cleaned.replace(FAKE_TAG_RE, '')

  cleaned = cleaned.replace(SPECIAL_TOKEN_RE, '')
  return cleaned.replace(/\n{3,}/g, '\n\n')
}


export function sanitizeAnswer(text) {
  if (text === null || text === undefined || text === '') return ''
  const s = typeof text === 'string' ? text : String(text)
  return stripToolMarkup(s).trim()
}


export function looksLikeToolCallMarkup(text) {
  const s = typeof text === 'string' ? text : String(text ?? '')
  if (!s || !MARKUP_ANY_RE.test(s)) return false
  const cleaned = sanitizeAnswer(s)
  if (cleaned.length < MARKUP_MIN_REMAINING_CHARS) return true
  const strongHits = countStrongTags(s)
  if (strongHits < 2) return false
  const removed = s.length - cleaned.length
  if (removed <= 0) return false
  return (
    removed * 10 >= s.length * 6 &&
    cleaned.length <= MARKUP_MAX_REMAINING_CHARS
  )
}


export function countStrongTags(text) {
  MARKUP_STRONG_RE.lastIndex = 0
  const matches = String(text ?? '').match(MARKUP_STRONG_RE)
  MARKUP_STRONG_RE.lastIndex = 0
  return matches ? matches.length : 0
}


export function hasToolCallSignal(text) {
  return MARKUP_ANY_RE.test(String(text ?? ''))
}


export const MARKUP_FORMS = Object.freeze([
  {
    form: '旧式伪标签',
    sample: '<tool_calls><invoke name="run_bash"></invoke></tool_calls> 正文一句。',
    expect: '不是回答（净化后几无正文）',
  },
  {
    form: 'DeepSeek DSML',
    sample: '<｜DSML｜tool_calls>\n<｜DSML｜invoke name="web_fetch">\n</｜DSML｜invoke>\n</｜DSML｜tool_calls>',
    expect: '不是回答',
  },
  {
    form: '双竖线非 DSML',
    sample: '<｜｜tool_calls>\n<｜｜invoke name="run_bash">\n</｜｜invoke>\n</｜｜tool_calls>',
    expect: '不是回答（竖线之间没有 DSML 字样）',
  },
  {
    form: '裸 XML（带 name=）',
    sample: '<invoke name="read">\n<parameter name="path">a.txt</parameter>\n</invoke>',
    expect: '不是回答',
  },
  {
    form: '中文伪标签',
    sample: '<联网搜索>苹果公司财报</联网搜索>',
    expect: '不是回答',
  },
  {
    form: 'max_tokens 截断、无闭标签',
    sample: '<｜｜tool_calls>\n<｜｜invoke name="web_fetch">\n<｜｜parameter name="url">https://x.com',
    expect: '不是回答（无闭合也要删到文末）',
  },
])

  '裸标签（无 name=）也命中信号；其误判由 T16 的 40 字门槛兜住'
