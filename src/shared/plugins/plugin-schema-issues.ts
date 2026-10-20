import type { z } from 'zod'

/** Enough to fix several mistakes per edit without flooding a one-line error surface. */
export const PLUGIN_SCHEMA_ISSUE_LIMIT = 8

/** `contributes.themes[0].path`; `(root)` for the document itself. */
export function formatPluginSchemaPath(path: readonly PropertyKey[]): string {
  let formatted = ''
  for (const segment of path) {
    formatted +=
      typeof segment === 'number' ? `[${segment}]` : `${formatted ? '.' : ''}${String(segment)}`
  }
  return formatted || '(root)'
}

function quoted(values: readonly unknown[]): string {
  return values.map((value) => JSON.stringify(value)).join(', ')
}

function article(type: string): string {
  return /^[aeiou]/.test(type) ? `an ${type}` : `a ${type}`
}

function units(origin: string, count: number | bigint): string {
  if (origin === 'array' || origin === 'set') {
    return count === 1 ? '1 item' : `${count} items`
  }
  if (origin === 'string') {
    return count === 1 ? '1 character' : `${count} characters`
  }
  return String(count)
}

// Why rewrite: zod's defaults ("Invalid input: expected string, received undefined") read as
// parser internals; authors need what to change. Messages the schemas set themselves pass through.
function issueMessage(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.message.endsWith('received undefined')
        ? 'is required'
        : `must be ${article(issue.expected)}`
    case 'unrecognized_keys':
      return `unknown ${issue.keys.length === 1 ? 'key' : 'keys'} ${quoted(issue.keys)}`
    case 'invalid_value':
      return issue.values.length === 1
        ? `must be ${quoted(issue.values)}`
        : `must be one of ${quoted(issue.values)}`
    case 'too_big':
      return `must be at most ${units(issue.origin, issue.maximum)}`
    case 'too_small':
      return issue.origin === 'string' && issue.minimum === 1
        ? 'must not be empty'
        : `must be at least ${units(issue.origin, issue.minimum)}`
    case 'invalid_format':
      return issue.message.startsWith('Invalid ') ? 'has an invalid format' : issue.message
    case 'invalid_union':
      return 'options' in issue && Array.isArray(issue.options)
        ? `must be one of ${quoted(issue.options)}`
        : 'does not match any allowed shape'
    case 'custom':
    case 'invalid_element':
    case 'invalid_key':
    case 'not_multiple_of':
      return issue.message
  }
}

/** Distinct `path: message` lines, at most `limit`, plus how many were left out. */
export function pluginSchemaIssueLines(
  issues: readonly z.core.$ZodIssue[],
  limit = PLUGIN_SCHEMA_ISSUE_LIMIT
): string[] {
  const lines = [
    ...new Set(
      issues.map((issue) => `${formatPluginSchemaPath(issue.path)}: ${issueMessage(issue)}`)
    )
  ]
  return lines.length > limit ? [...lines.slice(0, limit), `(${lines.length - limit} more)`] : lines
}

export function formatPluginSchemaIssues(
  issues: readonly z.core.$ZodIssue[],
  limit = PLUGIN_SCHEMA_ISSUE_LIMIT
): string {
  return pluginSchemaIssueLines(issues, limit).join('; ')
}
