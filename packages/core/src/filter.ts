import { FIELD_TYPES, type FieldType, type WalletFields } from './fields.js';

/**
 * Policy filters. Creators write them as short strings:
 *
 *   spark_tier >= 1 AND (dump_score < 0.25 OR shipped_substance)
 *   guild_ids HAS 'alpha' AND NOT created_rug
 *
 * They compile to a small JSON AST, which is also accepted directly. It is
 * data, not a programming language: fields, comparisons, AND/OR/NOT.
 */
export type CompareOp = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'has';

export type FilterExpr =
  | { and: FilterExpr[] }
  | { or: FilterExpr[] }
  | { not: FilterExpr }
  | { field: keyof WalletFields; op: CompareOp; value: number | boolean | string };

export class FilterError extends Error {}

type Token =
  | { t: 'ident'; v: string }
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'op'; v: CompareOp }
  | { t: 'kw'; v: 'AND' | 'OR' | 'NOT' }
  | { t: 'lp' }
  | { t: 'rp' };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (c === '(') {
      out.push({ t: 'lp' });
      i++;
    } else if (c === ')') {
      out.push({ t: 'rp' });
      i++;
    } else if (/[<>=!]/.test(c)) {
      const two = src.slice(i, i + 2);
      if (two === '>=' || two === '<=' || two === '==' || two === '!=') {
        out.push({ t: 'op', v: two });
        i += 2;
      } else if (c === '>' || c === '<') {
        out.push({ t: 'op', v: c });
        i++;
      } else if (c === '=') {
        out.push({ t: 'op', v: '==' });
        i++;
      } else {
        throw new FilterError(`Unexpected '${c}' at ${i}`);
      }
    } else if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new FilterError(`Unterminated string at ${i}`);
      out.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
    } else if (/[0-9.-]/.test(c)) {
      const m = /^-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/i.exec(src.slice(i));
      if (!m) throw new FilterError(`Bad number at ${i}`);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      const word = m[0];
      const upper = word.toUpperCase();
      if (upper === 'AND' || upper === 'OR' || upper === 'NOT') out.push({ t: 'kw', v: upper });
      else if (upper === 'HAS') out.push({ t: 'op', v: 'has' });
      else if (upper === 'TRUE' || upper === 'FALSE') out.push({ t: 'bool', v: upper === 'TRUE' });
      else out.push({ t: 'ident', v: word });
      i += word.length;
    } else {
      throw new FilterError(`Unexpected '${c}' at ${i}`);
    }
  }
  return out;
}

export function parseFilter(src: string): FilterExpr {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isKw = (v: string) => {
    const t = peek();
    return t?.t === 'kw' && t.v === v;
  };

  const parseOr = (): FilterExpr => {
    const parts = [parseAnd()];
    while (isKw('OR')) {
      pos++;
      parts.push(parseAnd());
    }
    return parts.length === 1 ? parts[0]! : { or: parts };
  };

  const parseAnd = (): FilterExpr => {
    const parts = [parseUnary()];
    while (isKw('AND')) {
      pos++;
      parts.push(parseUnary());
    }
    return parts.length === 1 ? parts[0]! : { and: parts };
  };

  const parseUnary = (): FilterExpr => {
    const t = peek();
    if (!t) throw new FilterError('Unexpected end of filter');
    if (t.t === 'kw' && t.v === 'NOT') {
      pos++;
      return { not: parseUnary() };
    }
    if (t.t === 'lp') {
      pos++;
      const inner = parseOr();
      if (peek()?.t !== 'rp') throw new FilterError('Missing )');
      pos++;
      return inner;
    }
    if (t.t !== 'ident') throw new FilterError(`Expected a field name, got ${JSON.stringify(t)}`);
    pos++;
    const field = t.v as keyof WalletFields;
    const opTok = peek();
    if (opTok?.t !== 'op') {
      // Bare field: `shipped_substance` means `shipped_substance == true`.
      return checkComparison({ field, op: '==', value: true });
    }
    pos++;
    const lit = peek();
    if (!lit || (lit.t !== 'num' && lit.t !== 'str' && lit.t !== 'bool')) {
      throw new FilterError(`Expected a value after ${opTok.v}`);
    }
    pos++;
    return checkComparison({ field, op: opTok.v, value: lit.v });
  };

  if (!tokens.length) throw new FilterError('Empty filter');
  const expr = parseOr();
  if (pos !== tokens.length) throw new FilterError(`Unexpected trailing input in filter: ${src}`);
  return expr;
}

const ALLOWED_OPS: Record<FieldType, readonly CompareOp[]> = {
  number: ['==', '!=', '>', '>=', '<', '<='],
  boolean: ['==', '!='],
  'string[]': ['has'],
};

function checkComparison(
  e: Extract<FilterExpr, { field: keyof WalletFields }>,
): Extract<FilterExpr, { field: keyof WalletFields }> {
  const type = FIELD_TYPES[e.field];
  if (!type) throw new FilterError(`Unknown field '${e.field}'`);
  if (!ALLOWED_OPS[type].includes(e.op)) {
    throw new FilterError(`Operator '${e.op}' is not valid for ${type} field '${e.field}'`);
  }
  const want = type === 'string[]' ? 'string' : type;
  if (typeof e.value !== want) {
    throw new FilterError(`Field '${e.field}' compares against a ${want}, got ${JSON.stringify(e.value)}`);
  }
  return e;
}

/** Validates a JSON AST (from an API body) the same way the parser does. */
export function validateFilter(expr: FilterExpr): FilterExpr {
  if ('and' in expr) return { and: expr.and.map(validateFilter) };
  if ('or' in expr) return { or: expr.or.map(validateFilter) };
  if ('not' in expr) return { not: validateFilter(expr.not) };
  return checkComparison(expr);
}

export function compileFilter(input: string | FilterExpr): FilterExpr {
  return typeof input === 'string' ? parseFilter(input) : validateFilter(input);
}

export function evaluateFilter(expr: FilterExpr, fields: WalletFields): boolean {
  if ('and' in expr) return expr.and.every((e) => evaluateFilter(e, fields));
  if ('or' in expr) return expr.or.some((e) => evaluateFilter(e, fields));
  if ('not' in expr) return !evaluateFilter(expr.not, fields);
  const actual = fields[expr.field];
  switch (expr.op) {
    case 'has':
      return Array.isArray(actual) && actual.includes(expr.value as string);
    case '==':
      return actual === expr.value;
    case '!=':
      return actual !== expr.value;
    case '>':
      return (actual as number) > (expr.value as number);
    case '>=':
      return (actual as number) >= (expr.value as number);
    case '<':
      return (actual as number) < (expr.value as number);
    case '<=':
      return (actual as number) <= (expr.value as number);
  }
}
