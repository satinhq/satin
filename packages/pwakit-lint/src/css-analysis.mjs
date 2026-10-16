import { rules } from './rules.mjs'

const VIEWPORT_HEIGHT_UNITS = new Set(['vh', 'dvh', 'svh', 'lvh'])
const SAFE_AREA_INSETS = new Set([
  'safe-area-inset-top',
  'safe-area-inset-right',
  'safe-area-inset-bottom',
  'safe-area-inset-left',
])
const SCROLLING_VALUES = new Set(['auto', 'scroll'])
const CSS_OVERFLOW_PROPERTIES = new Set(['overflow', 'overflow-x', 'overflow-y'])
const INLINE_OVERFLOW_PROPERTIES = new Set(['overflow', 'overflowx', 'overflowy'])

function isWhitespace(character) {
  return (
    character === ' ' ||
    character === '\n' ||
    character === '\r' ||
    character === '\t' ||
    character === '\f'
  )
}

function isDigit(character) {
  return character !== undefined && character >= '0' && character <= '9'
}

function isNameStart(character) {
  if (character === undefined) return false
  const code = character.codePointAt(0) ?? 0
  return (
    character === '-' ||
    character === '_' ||
    (character >= 'a' && character <= 'z') ||
    (character >= 'A' && character <= 'Z') ||
    code >= 0x80
  )
}

function isNameCharacter(character) {
  return isNameStart(character) || isDigit(character)
}

function isNumberStart(source, index) {
  const character = source[index]
  const next = source[index + 1]
  return isDigit(character) || (character === '.' && isDigit(next))
}

function scanNumber(source, start) {
  let index = start
  while (isDigit(source[index])) index += 1

  if (source[index] === '.' && isDigit(source[index + 1])) {
    index += 1
    while (isDigit(source[index])) index += 1
  }

  if (source[index] === 'e' || source[index] === 'E') {
    let exponent = index + 1
    if (source[exponent] === '+' || source[exponent] === '-') exponent += 1
    if (isDigit(source[exponent])) {
      index = exponent + 1
      while (isDigit(source[index])) index += 1
    }
  }

  return index
}

function scanName(source, start) {
  let index = start
  while (isNameCharacter(source[index])) index += 1
  return index
}

function token(kind, source, start, end, extra = {}) {
  return {
    kind,
    start,
    end,
    text: source.slice(start, end),
    lower: source.slice(start, end).toLowerCase(),
    ...extra,
  }
}

export function tokenizeCss(source) {
  const tokens = []
  let index = 0

  while (index < source.length) {
    const character = source[index]
    const next = source[index + 1]

    if (isWhitespace(character)) {
      index += 1
      continue
    }

    if (character === '/' && next === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1
      }
      index = Math.min(source.length, index + 2)
      continue
    }

    if (character === '"' || character === "'") {
      const start = index
      const quote = character
      index += 1
      while (index < source.length) {
        if (source[index] === '\\') {
          index += Math.min(2, source.length - index)
          continue
        }
        const current = source[index]
        index += 1
        if (current === quote) break
      }
      tokens.push(token('string', source, start, index))
      continue
    }

    if (isNumberStart(source, index)) {
      const start = index
      const numberEnd = scanNumber(source, index)
      index = numberEnd
      if (isNameStart(source[index])) {
        index = scanName(source, index)
        tokens.push(
          token('dimension', source, start, index, {
            unit: source.slice(numberEnd, index).toLowerCase(),
          }),
        )
      } else {
        tokens.push(token('number', source, start, index))
      }
      continue
    }

    if (isNameStart(character)) {
      const start = index
      index = scanName(source, index)
      tokens.push(token('identifier', source, start, index))
      continue
    }

    tokens.push(token('symbol', source, index, index + 1))
    index += 1
  }

  return tokens
}

function rawValueSignals(tokens) {
  const viewportHeight = []
  const safeAreaEnv = []
  const privateVariables = []

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index]
    if (
      current.kind === 'identifier' &&
      current.lower.startsWith('--satin-') &&
      tokens[index - 1]?.text === '(' &&
      tokens[index - 2]?.lower === 'var'
    ) {
      privateVariables.push(current.start)
    }
    if (current.kind === 'dimension' && VIEWPORT_HEIGHT_UNITS.has(current.unit)) {
      viewportHeight.push(current.start)
    }

    if (
      current.kind === 'identifier' &&
      current.lower === 'env' &&
      tokens[index + 1]?.text === '(' &&
      tokens[index + 2]?.kind === 'identifier' &&
      SAFE_AREA_INSETS.has(tokens[index + 2].lower)
    ) {
      safeAreaEnv.push(current.start)
    }
  }

  return { viewportHeight, safeAreaEnv, privateVariables }
}

function declarationsFromTokens(tokens, { allowRoot = false } = {}) {
  const declarations = []
  const blockStack = []

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index]

    if (current.text === '{') {
      blockStack.push(current.start)
      continue
    }
    if (current.text === '}') {
      blockStack.pop()
      continue
    }
    if (current.kind !== 'identifier' || tokens[index + 1]?.text !== ':') continue
    if (blockStack.length === 0 && !allowRoot) continue

    const previous = tokens[index - 1]
    const atDeclarationStart =
      previous === undefined || previous.text === '{' || previous.text === ';'
    if (!atDeclarationStart) continue

    const valueTokens = []
    let parentheses = 0
    let brackets = 0
    let valid = true

    for (let cursor = index + 2; cursor < tokens.length; cursor += 1) {
      const valueToken = tokens[cursor]
      if (valueToken.text === '(') parentheses += 1
      if (valueToken.text === ')') parentheses = Math.max(0, parentheses - 1)
      if (valueToken.text === '[') brackets += 1
      if (valueToken.text === ']') brackets = Math.max(0, brackets - 1)

      if (parentheses === 0 && brackets === 0) {
        if (valueToken.text === '{') {
          valid = false
          break
        }
        if (valueToken.text === ';' || valueToken.text === '}') break
      }
      valueTokens.push(valueToken)
    }

    if (!valid) continue
    declarations.push({
      property: current.lower,
      propertyOffset: current.start,
      valueTokens,
      block: blockStack.at(-1) ?? -1,
    })
  }

  return declarations
}

export function hasCustomLinearEasing(source) {
  const tokens = tokenizeCss(source)
  return tokens.some(
    (token, index) =>
      token.kind === 'identifier' && token.lower === 'linear' && tokens[index + 1]?.text === '(',
  )
}

function customEasingDeclaration(declaration) {
  return (
    ['animation', 'animation-timing-function', 'transition', 'transition-timing-function'].includes(
      declaration.property,
    ) &&
    declaration.valueTokens.some(
      (token, index) =>
        token.kind === 'identifier' &&
        token.lower === 'linear' &&
        declaration.valueTokens[index + 1]?.text === '(',
    )
  )
}

function firstIdentifier(declaration) {
  return declaration.valueTokens.find(valueToken => valueToken.kind === 'identifier')?.lower
}

function hasScrollingValue(declaration) {
  return declaration.valueTokens.some(
    valueToken => valueToken.kind === 'identifier' && SCROLLING_VALUES.has(valueToken.lower),
  )
}

function usesBottomInset(declaration) {
  return declaration.valueTokens.some(
    valueToken => valueToken.kind === 'identifier' && valueToken.lower === '--satin-inset-bottom',
  )
}

function paddingPriority(valueTokens) {
  const important =
    valueTokens.at(-2)?.text === '!' &&
    valueTokens.at(-1)?.kind === 'identifier' &&
    valueTokens.at(-1)?.lower === 'important'
  return {
    important,
    valueTokens: important ? valueTokens.slice(0, -2) : valueTokens,
  }
}

function shorthandBottomPadding(valueTokens) {
  const components = []
  let depth = 0
  let previousToken

  for (const valueToken of valueTokens) {
    // Whitespace is omitted by the tokenizer. Source gaps separate top-level values;
    // tokens inside functions stay together, including calc() operators and spaces.
    if (!previousToken || (depth === 0 && valueToken.start > previousToken.end)) {
      components.push([])
    }
    components.at(-1).push(valueToken)
    if (valueToken.text === '(' || valueToken.text === '[') depth += 1
    if (valueToken.text === ')' || valueToken.text === ']') depth -= 1
    previousToken = valueToken
  }

  if (depth !== 0 || components.length === 0 || components.length > 4) return []
  return components.length < 3 ? components[0] : components[2]
}

function winningBottomPadding(declarations) {
  let winner

  for (const declaration of declarations) {
    if (declaration.property !== 'padding' && declaration.property !== 'padding-bottom') continue
    const candidate = paddingPriority(declaration.valueTokens)
    if (winner?.important && !candidate.important) continue
    winner = {
      important: candidate.important,
      valueTokens:
        declaration.property === 'padding'
          ? shorthandBottomPadding(candidate.valueTokens)
          : candidate.valueTokens,
    }
  }

  return winner
}

function violation(rule, offset) {
  return { ruleId: rule.id, message: rule.message, offset }
}

function rawValueViolations(source, baseOffset = 0) {
  const signals = rawValueSignals(tokenizeCss(source))
  return [
    ...signals.privateVariables.map(offset =>
      violation(rules['no-private-css-variable'], baseOffset + offset),
    ),
    ...signals.viewportHeight.map(offset =>
      violation(rules['no-raw-viewport-height'], baseOffset + offset),
    ),
    ...signals.safeAreaEnv.map(offset =>
      violation(rules['no-raw-safe-area-env'], baseOffset + offset),
    ),
  ]
}

function activeMenuSelectors(tokens) {
  const scopes = [],
    violations = []
  let prelude = []
  for (const current of tokens) {
    if (current.text === '{') {
      const selector = prelude.map(t => t.lower).join('')
      const menu =
        scopes.at(-1) ||
        /\[role=(["']?)(?:menu|menuitem|menuitemcheckbox|menuitemradio)\1\]/.test(selector)
      const active = prelude.find(
        (t, i) => t.kind === 'identifier' && t.lower === 'active' && prelude[i - 1]?.text === ':',
      )
      if (menu && active) violations.push(violation(rules['no-native-menu-active'], active.start))
      scopes.push(menu)
      prelude = []
    } else if (current.text === '}') {
      scopes.pop()
      prelude = []
    } else if (current.text === ';') prelude = []
    else prelude.push(current)
  }
  return violations
}

export function analyzeCss(source) {
  const tokens = tokenizeCss(source)
  const declarations = declarationsFromTokens(tokens)
  const signals = rawValueSignals(tokens)
  const violations = [
    ...tokens
      .filter(token => token.kind !== 'string' && token.lower === 'prefers-color-scheme')
      .map(token => violation(rules['no-raw-appearance-query'], token.start)),
    ...activeMenuSelectors(tokens),
    ...signals.privateVariables.map(offset => violation(rules['no-private-css-variable'], offset)),
    ...signals.viewportHeight.map(offset => violation(rules['no-raw-viewport-height'], offset)),
    ...signals.safeAreaEnv.map(offset => violation(rules['no-raw-safe-area-env'], offset)),
  ]

  for (const declaration of declarations) {
    if (
      ['backdrop-filter', '-webkit-backdrop-filter'].includes(declaration.property) &&
      !declaration.valueTokens.every(token => token.lower === 'none' || token.kind === 'whitespace')
    )
      violations.push(violation(rules['no-handrolled-glass'], declaration.propertyOffset))
    const selector = source.slice(
      Math.max(
        source.lastIndexOf('}', declaration.block),
        source.lastIndexOf('{', declaration.block - 1),
      ) + 1,
      declaration.block,
    )
    const documentRoot = String.raw`(?:html|body|:root|#root)(?:[.#][\w-]+|\[[^\]]*\]|:[\w-]+)*`
    const globalElement = `(?:${documentRoot}|\\*(?::[\\w-]+)*)`
    const globalPattern = new RegExp(`^${globalElement}(?:\\s+${globalElement})*$`, 'i')
    const globalSelector = selector
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .some(part => globalPattern.test(part.trim()))
    if (globalSelector && ['user-select', '-webkit-user-select'].includes(declaration.property))
      violations.push(violation(rules['no-global-selection-reset'], declaration.propertyOffset))
    if (
      globalSelector &&
      ['outline', 'outline-style', 'outline-width'].includes(declaration.property) &&
      (firstIdentifier(declaration) === 'none' ||
        (['number', 'dimension'].includes(declaration.valueTokens[0]?.kind) &&
          parseFloat(declaration.valueTokens[0].text) === 0))
    )
      violations.push(violation(rules['no-global-focus-reset'], declaration.propertyOffset))
    if (
      globalSelector &&
      declaration.property === 'position' &&
      firstIdentifier(declaration) === 'fixed'
    )
      violations.push(violation(rules['no-fixed-document'], declaration.propertyOffset))
    const selectorTokens = tokenizeCss(selector)
    const targetsInput =
      selectorTokens.some(
        (t, i) =>
          ['input', 'textarea'].includes(t.lower) &&
          !['.', '#', ':'].includes(selectorTokens[i - 1]?.text),
      ) || /\[data-satin-text-(field|editor)/.test(selector)
    if (
      targetsInput &&
      declaration.property === 'font-size' &&
      declaration.valueTokens.some(
        t => t.kind === 'dimension' && t.unit === 'px' && parseFloat(t.text) < 16,
      )
    )
      violations.push(violation(rules['no-small-input-font'], declaration.propertyOffset))

    if (customEasingDeclaration(declaration))
      violations.push(violation(rules['no-custom-linear-easing'], declaration.propertyOffset))
    if (
      declaration.property === 'zoom' ||
      (declaration.property === 'touch-action' &&
        declaration.valueTokens.some(token => token.lower === 'pinch-zoom'))
    )
      violations.push(violation(rules['no-page-zoom'], declaration.propertyOffset))
    if (CSS_OVERFLOW_PROPERTIES.has(declaration.property) && hasScrollingValue(declaration)) {
      violations.push(violation(rules['no-raw-css-overflow-scroll'], declaration.propertyOffset))
    }
    if (declaration.property === '-webkit-overflow-scrolling') {
      violations.push(
        violation(rules['no-webkit-overflow-scrolling-css'], declaration.propertyOffset),
      )
    }
  }

  const declarationsByBlock = new Map()
  for (const declaration of declarations) {
    const blockDeclarations = declarationsByBlock.get(declaration.block) ?? []
    blockDeclarations.push(declaration)
    declarationsByBlock.set(declaration.block, blockDeclarations)
  }
  for (const blockDeclarations of declarationsByBlock.values()) {
    const position = blockDeclarations.find(
      declaration =>
        declaration.property === 'position' &&
        (firstIdentifier(declaration) === 'absolute' || firstIdentifier(declaration) === 'fixed'),
    )
    if (!position) continue

    const hasLeft = blockDeclarations.some(
      declaration =>
        declaration.property === 'left' || declaration.property === 'inset-inline-start',
    )
    const hasRight = blockDeclarations.some(
      declaration =>
        declaration.property === 'right' || declaration.property === 'inset-inline-end',
    )
    if (!hasLeft || !hasRight) continue

    const bottomDeclarations = blockDeclarations.filter(
      declaration => declaration.property === 'bottom',
    )
    const bottomPadding = winningBottomPadding(blockDeclarations)
    if (
      bottomDeclarations.length > 0 &&
      !bottomDeclarations.some(declaration => usesBottomInset(declaration)) &&
      !(bottomPadding && usesBottomInset(bottomPadding))
    ) {
      violations.push(
        violation(rules['require-bottom-safe-area-inset'], bottomDeclarations[0].propertyOffset),
      )
    }
  }

  return violations
}

export function analyzeInlineCssText(source, baseOffset = 0) {
  const tokens = tokenizeCss(source)
  const declarations = declarationsFromTokens(tokens, { allowRoot: true })
  const violations = rawValueViolations(source, baseOffset)

  for (const declaration of declarations) {
    if (
      ['backdrop-filter', '-webkit-backdrop-filter'].includes(declaration.property) &&
      !declaration.valueTokens.every(token => token.lower === 'none' || token.kind === 'whitespace')
    )
      violations.push(violation(rules['no-handrolled-glass'], declaration.propertyOffset))
    if (customEasingDeclaration(declaration))
      violations.push(
        violation(rules['no-custom-linear-easing'], baseOffset + declaration.propertyOffset),
      )
    if (
      declaration.property === 'zoom' ||
      (declaration.property === 'touch-action' &&
        declaration.valueTokens.some(token => token.lower === 'pinch-zoom'))
    )
      violations.push(violation(rules['no-page-zoom'], declaration.propertyOffset))
    const property = declaration.property.replaceAll('-', '')
    if (INLINE_OVERFLOW_PROPERTIES.has(property) && hasScrollingValue(declaration)) {
      violations.push(
        violation(rules['no-raw-inline-overflow-scroll'], baseOffset + declaration.propertyOffset),
      )
    }
    if (property === 'webkitoverflowscrolling') {
      violations.push(
        violation(
          rules['no-webkit-overflow-scrolling-inline'],
          baseOffset + declaration.propertyOffset,
        ),
      )
    }
  }

  return violations
}

export function analyzeCssTextFragment(source, baseOffset = 0) {
  const tokens = tokenizeCss(source)
  const declarations = declarationsFromTokens(tokens, { allowRoot: true })
  const violations = rawValueViolations(source, baseOffset)
  violations.push(
    ...activeMenuSelectors(tokens).map(item => ({ ...item, offset: item.offset + baseOffset })),
  )

  for (const declaration of declarations) {
    if (
      ['backdrop-filter', '-webkit-backdrop-filter'].includes(declaration.property) &&
      !declaration.valueTokens.every(token => token.lower === 'none' || token.kind === 'whitespace')
    )
      violations.push(violation(rules['no-handrolled-glass'], declaration.propertyOffset))
    if (customEasingDeclaration(declaration))
      violations.push(
        violation(rules['no-custom-linear-easing'], baseOffset + declaration.propertyOffset),
      )
    if (
      declaration.property === 'zoom' ||
      (declaration.property === 'touch-action' &&
        declaration.valueTokens.some(token => token.lower === 'pinch-zoom'))
    )
      violations.push(violation(rules['no-page-zoom'], declaration.propertyOffset))
    if (CSS_OVERFLOW_PROPERTIES.has(declaration.property) && hasScrollingValue(declaration)) {
      violations.push(
        violation(rules['no-raw-css-overflow-scroll'], baseOffset + declaration.propertyOffset),
      )
    }
    if (declaration.property === '-webkit-overflow-scrolling') {
      violations.push(
        violation(
          rules['no-webkit-overflow-scrolling-css'],
          baseOffset + declaration.propertyOffset,
        ),
      )
    }
  }

  return violations
}

export function analyzeInlineStyleValue(source, baseOffset = 0) {
  return rawValueViolations(source, baseOffset)
}

export function isScrollingInlineValue(source) {
  return SCROLLING_VALUES.has(source.trim().toLowerCase())
}
