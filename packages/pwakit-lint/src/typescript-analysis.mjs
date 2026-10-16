import { syntax as ts, parseSourceFile } from './native-typescript.mjs'

import {
  analyzeCssTextFragment,
  analyzeInlineCssText,
  analyzeInlineStyleValue,
  isScrollingInlineValue,
  hasCustomLinearEasing,
} from './css-analysis.mjs'
import { rules } from './rules.mjs'

const REACT_MODULE = 'react'
const JSX_RUNTIME_MODULES = new Set(['react/jsx-runtime', 'react/jsx-dev-runtime'])
const CSS_TAG_MODULES = new Set([
  'styled-components',
  '@emotion/react',
  '@emotion/styled',
  '@linaria/core',
])
const INLINE_OVERFLOW_PROPERTIES = new Set(['overflow', 'overflowx', 'overflowy'])
const FUNCTION_LIKE_KINDS = new Set([
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
])

function isGlassPackage(moduleName) {
  if (moduleName.startsWith('.') || moduleName.startsWith('/') || moduleName.includes('://')) {
    return false
  }

  const segments = moduleName.toLowerCase().split('/')
  const packageSegments = moduleName.startsWith('@') ? segments.slice(0, 2) : segments.slice(0, 1)
  return packageSegments.some(
    segment =>
      segment.includes('liquid-glass') ||
      segment.includes('liquidglass') ||
      segment.includes('liquid-gl') ||
      segment.includes('openglass'),
  )
}

function unwrapExpression(node) {
  let current = node
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current))
  ) {
    current = current.expression
  }
  return current
}

function isFunctionLike(node) {
  return node !== undefined && FUNCTION_LIKE_KINDS.has(node.kind)
}

function containingScope(node) {
  let current = node.parent
  while (current) {
    if (ts.isBlock(current) || ts.isSourceFile(current) || isFunctionLike(current)) return current
    current = current.parent
  }
  return node.getSourceFile()
}

function functionScope(node) {
  let current = node.parent
  while (current) {
    if (isFunctionLike(current)) return current
    current = current.parent
  }
  return node.getSourceFile()
}

function staticModuleName(node) {
  if (ts.isStringLiteralLike(node)) return node.text
  return undefined
}

function propertyNameText(name, context, environment = new Map()) {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text
  if (ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text
  if (ts.isComputedPropertyName(name)) {
    return context.staticStrings(name.expression, environment)[0]?.value
  }
  return undefined
}

function literalContentOffset(node, sourceFile) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.getStart(sourceFile) + 1
  }
  return node.getStart(sourceFile)
}

class AstContext {
  constructor(fileName, source) {
    this.sourceFile = parseSourceFile(fileName, source).file
    this.evaluationWork = 0
    this.bindings = new Map()
    this.violations = []
    this.violationKeys = new Set()
    this.collectBindings(this.sourceFile)
  }

  consumeEvaluationBudget(node, amount = 1) {
    this.evaluationWork += amount
    if (this.evaluationWork <= 65536) return
    const location = this.sourceFile.getLineAndCharacterOfPosition(node.getStart(this.sourceFile))
    const error = new Error(
      `${this.sourceFile.fileName}:${location.line + 1}:${location.character + 1}: ` +
        'static-evaluation-budget-exceeded: analysis incomplete; simplify combinatorial expressions.',
    )
    error.code = 'static-evaluation-budget-exceeded'
    throw error
  }

  addBinding(name, binding) {
    const existing = this.bindings.get(name) ?? []
    existing.push(binding)
    this.bindings.set(name, existing)
  }

  collectBindingName(name, binding) {
    if (ts.isIdentifier(name)) {
      this.addBinding(name.text, binding)
      return
    }
    if (!ts.isObjectBindingPattern(name)) {
      for (const element of name.elements) {
        // Native TS 7 represents array elisions as nameless BindingElements.
        if (ts.isOmittedExpression(element) || !element.name) continue
        this.collectBindingName(element.name, { ...binding, value: undefined })
      }
      return
    }

    for (const element of name.elements) {
      if (!ts.isIdentifier(element.name)) continue
      this.addBinding(element.name.text, {
        ...binding,
        value: undefined,
        destructureSource: binding.value,
        destructureProperty:
          element.propertyName === undefined
            ? element.name.text
            : propertyNameText(element.propertyName, this),
      })
    }
  }

  collectBindings(node) {
    if (ts.isImportDeclaration(node) && node.importClause) {
      const moduleName = staticModuleName(node.moduleSpecifier)
      if (moduleName !== undefined && !node.importClause.isTypeOnly) {
        if (node.importClause.name) {
          this.addBinding(node.importClause.name.text, {
            node: node.importClause.name,
            scope: this.sourceFile,
            importInfo: { moduleName, imported: 'default' },
          })
        }
        const bindings = node.importClause.namedBindings
        if (bindings && ts.isNamespaceImport(bindings)) {
          this.addBinding(bindings.name.text, {
            node: bindings.name,
            scope: this.sourceFile,
            importInfo: { moduleName, imported: '*' },
          })
        }
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            if (element.isTypeOnly) continue
            this.addBinding(element.name.text, {
              node: element.name,
              scope: this.sourceFile,
              importInfo: {
                moduleName,
                imported: element.propertyName?.text ?? element.name.text,
              },
            })
          }
        }
      }
    }

    if (ts.isVariableDeclaration(node)) {
      this.collectBindingName(node.name, {
        node,
        scope: containingScope(node),
        value: node.initializer,
      })
    }

    if (ts.isParameter(node)) {
      this.collectBindingName(node.name, {
        node,
        scope: functionScope(node),
        value: node.initializer,
      })
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      this.addBinding(node.name.text, {
        node,
        scope: containingScope(node),
        value: node,
        hoisted: true,
      })
    }

    if (ts.isClassDeclaration(node) && node.name) {
      this.addBinding(node.name.text, {
        node,
        scope: containingScope(node),
      })
    }

    ts.forEachChild(node, child => this.collectBindings(child))
  }

  lookupBinding(name, usage) {
    const candidates = (this.bindings.get(name) ?? []).filter(binding => {
      const insideScope = usage.pos >= binding.scope.pos && usage.end <= binding.scope.end
      const declared = binding.hoisted || binding.importInfo || binding.node.pos <= usage.pos
      return insideScope && declared
    })
    candidates.sort((left, right) => {
      const leftSpan = left.scope.end - left.scope.pos
      const rightSpan = right.scope.end - right.scope.pos
      return leftSpan - rightSpan || right.node.pos - left.node.pos
    })
    return candidates[0]
  }

  addViolation(rule, nodeOrOffset) {
    const offset =
      typeof nodeOrOffset === 'number' ? nodeOrOffset : nodeOrOffset.getStart(this.sourceFile)
    const key = `${rule.id}:${offset}`
    if (this.violationKeys.has(key)) return
    this.violationKeys.add(key)
    this.violations.push({ ruleId: rule.id, message: rule.message, offset })
  }

  importInfo(expression) {
    const current = unwrapExpression(expression)
    if (!current) return undefined

    if (ts.isIdentifier(current)) {
      const binding = this.lookupBinding(current.text, current)
      if (binding?.importInfo) return binding.importInfo
      if (binding?.value && binding.value !== current) return this.importInfo(binding.value)
    }
    return undefined
  }

  resolveExpressions(expression, environment = new Map(), seen = new Set()) {
    const current = unwrapExpression(expression)
    if (!current || seen.has(current)) return []
    this.consumeEvaluationBudget(current)
    const nextSeen = new Set(seen).add(current)

    if (ts.isIdentifier(current)) {
      const environmentValue = environment.get(current.text)
      if (environmentValue && !Array.isArray(environmentValue)) {
        return this.resolveExpressions(environmentValue, environment, nextSeen)
      }

      const binding = this.lookupBinding(current.text, current)
      if (binding?.destructureSource && binding.destructureProperty) {
        const properties = this.objectProperties(binding.destructureSource, environment, nextSeen)
        return properties
          .filter(property => property.name === binding.destructureProperty)
          .flatMap(property =>
            property.value ? this.resolveExpressions(property.value, environment, nextSeen) : [],
          )
      }
      if (binding?.value && binding.value !== current && !isFunctionLike(binding.value)) {
        return this.resolveExpressions(binding.value, environment, nextSeen)
      }
      return [current]
    }

    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      const memberName = ts.isPropertyAccessExpression(current)
        ? current.name.text
        : current.argumentExpression
          ? this.staticStrings(current.argumentExpression, environment)[0]?.value
          : undefined
      if (memberName !== undefined) {
        const resolvedObjects = this.resolveExpressions(current.expression, environment, nextSeen)
        const resolvedMembers = resolvedObjects.flatMap(resolvedObject => {
          if (!ts.isObjectLiteralExpression(resolvedObject)) return []
          return this.objectProperties(resolvedObject, environment, nextSeen)
            .filter(property => property.name === memberName && property.value)
            .flatMap(property => this.resolveExpressions(property.value, environment, nextSeen))
        })
        if (resolvedMembers.length > 0) return resolvedMembers
      }
      return [current]
    }

    if (ts.isConditionalExpression(current)) {
      return [
        ...this.resolveExpressions(current.whenTrue, environment, nextSeen),
        ...this.resolveExpressions(current.whenFalse, environment, nextSeen),
      ]
    }

    if (
      ts.isBinaryExpression(current) &&
      (current.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      return [
        ...this.resolveExpressions(current.left, environment, nextSeen),
        ...this.resolveExpressions(current.right, environment, nextSeen),
      ]
    }

    return [current]
  }

  staticStrings(expression, environment = new Map(), seen = new Set()) {
    const current = unwrapExpression(expression)
    if (!current || seen.has(current)) return []
    this.consumeEvaluationBudget(current)
    const nextSeen = new Set(seen).add(current)

    if (ts.isStringLiteralLike(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
      return [{ value: current.text, node: current }]
    }
    if (ts.isNumericLiteral(current)) return [{ value: current.text, node: current }]

    if (ts.isIdentifier(current)) {
      const environmentValue = environment.get(current.text)
      if (environmentValue && !Array.isArray(environmentValue)) {
        return this.staticStrings(environmentValue, environment, nextSeen)
      }
      return this.resolveExpressions(current, environment, seen).flatMap(resolved =>
        resolved === current ? [] : this.staticStrings(resolved, environment, nextSeen),
      )
    }

    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      return this.resolveExpressions(current, environment, seen).flatMap(resolved =>
        resolved === current ? [] : this.staticStrings(resolved, environment, nextSeen),
      )
    }

    if (ts.isPrefixUnaryExpression(current) && ts.isNumericLiteral(current.operand)) {
      const prefix = current.operator === ts.SyntaxKind.MinusToken ? '-' : '+'
      return [{ value: `${prefix}${current.operand.text}`, node: current }]
    }

    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = this.staticStrings(current.left, environment, nextSeen)
      const right = this.staticStrings(current.right, environment, nextSeen)
      this.consumeEvaluationBudget(current, left.length * right.length)
      return left.flatMap(leftValue =>
        right.map(rightValue => ({
          value: leftValue.value + rightValue.value,
          node: current,
        })),
      )
    }

    if (ts.isConditionalExpression(current)) {
      return [
        ...this.staticStrings(current.whenTrue, environment, nextSeen),
        ...this.staticStrings(current.whenFalse, environment, nextSeen),
      ]
    }

    if (ts.isTemplateExpression(current)) {
      let values = [{ value: current.head.text, node: current }]
      for (const span of current.templateSpans) {
        const substitutions = this.staticStrings(span.expression, environment, nextSeen)
        if (substitutions.length === 0) return []
        this.consumeEvaluationBudget(current, values.length * substitutions.length)
        values = values.flatMap(value =>
          substitutions.map(substitution => ({
            value: value.value + substitution.value + span.literal.text,
            node: current,
          })),
        )
      }
      return values
    }

    return []
  }

  objectProperties(expression, environment = new Map(), seen = new Set()) {
    return this.objectPropertyBranches(expression, environment, seen).flat()
  }

  mergePropertyBranches(leftBranches, rightBranches, node) {
    this.consumeEvaluationBudget(node, leftBranches.length * rightBranches.length)
    return leftBranches.flatMap(left =>
      rightBranches.map(right => {
        const properties = new Map(left.map(property => [property.name, property]))
        for (const property of right) properties.set(property.name, property)
        return [...properties.values()]
      }),
    )
  }

  objectPropertyBranches(expression, environment = new Map(), seen = new Set()) {
    const current = unwrapExpression(expression)
    if (!current || seen.has(current)) return [[]]
    this.consumeEvaluationBudget(current)
    const nextSeen = new Set(seen).add(current)
    const resolved = this.resolveExpressions(current, environment, seen)

    // Unknown spreads contribute no known properties, but must retain the branch.
    if (resolved.length === 0) return [[]]

    if (resolved.length !== 1 || resolved[0] !== current) {
      return resolved.flatMap(value => this.objectPropertyBranches(value, environment, nextSeen))
    }

    if (ts.isConditionalExpression(current)) {
      return [
        ...this.objectPropertyBranches(current.whenTrue, environment, nextSeen),
        ...this.objectPropertyBranches(current.whenFalse, environment, nextSeen),
      ]
    }

    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      ts.isIdentifier(current.expression.expression) &&
      current.expression.expression.text === 'Object' &&
      current.expression.name.text === 'assign'
    ) {
      return current.arguments.reduce(
        (branches, argument) =>
          this.mergePropertyBranches(
            branches,
            this.objectPropertyBranches(argument, environment, nextSeen),
            current,
          ),
        [[]],
      )
    }

    if (!ts.isObjectLiteralExpression(current)) return [[]]

    let branches = [[]]
    for (const property of current.properties) {
      if (ts.isSpreadAssignment(property)) {
        branches = this.mergePropertyBranches(
          branches,
          this.objectPropertyBranches(property.expression, environment, nextSeen),
          current,
        )
        continue
      }

      if (
        ts.isPropertyAssignment(property) ||
        ts.isShorthandPropertyAssignment(property) ||
        ts.isMethodDeclaration(property) ||
        ts.isGetAccessorDeclaration(property) ||
        ts.isSetAccessorDeclaration(property)
      ) {
        const name = propertyNameText(property.name, this, environment)
        if (name === undefined) continue
        const entry = {
          name,
          nameNode: property.name,
          value: ts.isPropertyAssignment(property)
            ? property.initializer
            : ts.isShorthandPropertyAssignment(property)
              ? property.name
              : property,
        }
        branches = this.mergePropertyBranches(branches, [[entry]], current)
      }
    }
    return branches
  }

  callableOrigin(expression, seen = new Set()) {
    const current = unwrapExpression(expression)
    if (!current || seen.has(current)) return undefined
    const nextSeen = new Set(seen).add(current)

    if (ts.isIdentifier(current)) {
      const binding = this.lookupBinding(current.text, current)
      if (
        binding?.importInfo?.moduleName === REACT_MODULE &&
        binding.importInfo.imported === 'createElement'
      ) {
        return 'createElement'
      }
      if (
        JSX_RUNTIME_MODULES.has(binding?.importInfo?.moduleName) &&
        ['jsx', 'jsxs', 'jsxDEV'].includes(binding.importInfo.imported)
      ) {
        return binding.importInfo.imported
      }
      if (binding?.value && !isFunctionLike(binding.value)) {
        return this.callableOrigin(binding.value, nextSeen)
      }
      return undefined
    }

    if (ts.isPropertyAccessExpression(current)) {
      const namespace = this.importInfo(current.expression)
      const unboundReactNamespace =
        ts.isIdentifier(current.expression) &&
        current.expression.text === 'React' &&
        this.lookupBinding(current.expression.text, current.expression) === undefined
      if (
        current.name.text === 'createElement' &&
        ((namespace?.moduleName === REACT_MODULE &&
          (namespace.imported === '*' || namespace.imported === 'default')) ||
          unboundReactNamespace)
      ) {
        return 'createElement'
      }
      if (
        ['jsx', 'jsxs', 'jsxDEV'].includes(current.name.text) &&
        JSX_RUNTIME_MODULES.has(namespace?.moduleName) &&
        namespace.imported === '*'
      ) {
        return current.name.text
      }
    }

    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return this.callableOrigin(current.right, nextSeen)
    }

    return undefined
  }

  resolveFunction(expression) {
    const current = unwrapExpression(expression)
    if (!current) return undefined
    if (isFunctionLike(current)) return current
    if (!ts.isIdentifier(current)) return undefined
    const binding = this.lookupBinding(current.text, current)
    return isFunctionLike(binding?.value) ? binding.value : undefined
  }

  returnedCall(functionNode) {
    if (!functionNode.body) return undefined
    const expressionBody = unwrapExpression(functionNode.body)
    if (expressionBody && ts.isCallExpression(expressionBody)) return expressionBody
    if (!ts.isBlock(functionNode.body)) return undefined
    const returnStatement = functionNode.body.statements.find(ts.isReturnStatement)
    const returnedExpression = returnStatement?.expression
      ? unwrapExpression(returnStatement.expression)
      : undefined
    return returnedExpression && ts.isCallExpression(returnedExpression)
      ? returnedExpression
      : undefined
  }

  expandedArguments(argumentsList, environment) {
    const output = []
    for (const argument of argumentsList) {
      if (ts.isSpreadElement(argument) && ts.isIdentifier(argument.expression)) {
        const replacement = environment.get(argument.expression.text)
        if (Array.isArray(replacement)) {
          output.push(...replacement)
          continue
        }
      }
      output.push(argument)
    }
    return output
  }

  factoryInvocation(call, environment = new Map(), seen = new Set()) {
    if (seen.has(call)) return undefined
    const nextSeen = new Set(seen).add(call)
    const directOrigin = this.callableOrigin(call.expression)
    if (directOrigin) {
      return {
        kind: directOrigin,
        arguments: this.expandedArguments(call.arguments, environment),
        environment,
      }
    }

    if (
      ts.isPropertyAccessExpression(call.expression) &&
      (call.expression.name.text === 'call' || call.expression.name.text === 'apply')
    ) {
      const calledOrigin = this.callableOrigin(call.expression.expression)
      if (calledOrigin) {
        const forwardedArguments =
          call.expression.name.text === 'apply' && ts.isArrayLiteralExpression(call.arguments[1])
            ? call.arguments[1].elements
            : call.arguments.slice(1)
        return {
          kind: calledOrigin,
          arguments: this.expandedArguments(forwardedArguments, environment),
          environment,
        }
      }
    }

    const wrapper = this.resolveFunction(call.expression)
    const returnedCall = wrapper ? this.returnedCall(wrapper) : undefined
    if (!wrapper || !returnedCall) return undefined

    const wrapperEnvironment = new Map(environment)
    for (let index = 0; index < wrapper.parameters.length; index += 1) {
      const parameter = wrapper.parameters[index]
      if (!ts.isIdentifier(parameter.name)) continue
      if (parameter.dotDotDotToken) {
        wrapperEnvironment.set(parameter.name.text, call.arguments.slice(index))
        break
      }
      const argument = call.arguments[index] ?? parameter.initializer
      if (argument) wrapperEnvironment.set(parameter.name.text, argument)
    }
    return this.factoryInvocation(returnedCall, wrapperEnvironment, nextSeen)
  }

  inspectStyleProperty(name, value, nameNode, environment = new Map()) {
    if (
      /^--menu-(highlight-y|highlight-opacity|contact|finger-x|finger-y|trigger-contact)$/.test(
        name,
      )
    ) {
      this.addViolation(rules['no-menu-motion-properties'], nameNode)
    }
    const normalizedName = name.replaceAll('-', '').toLowerCase()
    const values = this.staticStrings(value, environment)
    if (
      ['backdropfilter', 'webkitbackdropfilter'].includes(normalizedName) &&
      (!values.length || values.some(item => item.value !== 'none'))
    )
      this.addViolation(rules['no-handrolled-glass'], nameNode)
    if (
      ['animation', 'animationtimingfunction', 'transition', 'transitiontimingfunction'].includes(
        normalizedName,
      ) &&
      values.some(item => hasCustomLinearEasing(item.value))
    )
      this.addViolation(rules['no-custom-linear-easing'], nameNode)
    for (const staticValue of values) {
      const baseOffset = literalContentOffset(staticValue.node, this.sourceFile)
      for (const found of analyzeInlineStyleValue(staticValue.value, baseOffset)) {
        if (found.ruleId !== 'no-private-css-variable')
          this.addViolation(rules[found.ruleId], found.offset)
      }
    }

    if (
      INLINE_OVERFLOW_PROPERTIES.has(normalizedName) &&
      values.some(staticValue => isScrollingInlineValue(staticValue.value))
    ) {
      this.addViolation(rules['no-raw-inline-overflow-scroll'], nameNode)
    }
    if (
      normalizedName === 'zoom' ||
      (normalizedName === 'touchaction' && values.some(value => /\bpinch-zoom\b/.test(value.value)))
    ) {
      this.addViolation(rules['no-page-zoom'], nameNode)
    }
    if (normalizedName === 'webkitoverflowscrolling') {
      this.addViolation(rules['no-webkit-overflow-scrolling-inline'], nameNode)
    }
  }

  inspectStyleExpression(expression, environment = new Map()) {
    for (const property of this.objectProperties(expression, environment)) {
      if (!property.value) continue
      this.inspectStyleProperty(property.name, property.value, property.nameNode, environment)
    }
  }

  inspectStyleTextExpression(expression, environment = new Map()) {
    for (const staticValue of this.staticStrings(expression, environment)) {
      const baseOffset = literalContentOffset(staticValue.node, this.sourceFile)
      for (const found of analyzeInlineCssText(staticValue.value, baseOffset)) {
        if (found.ruleId !== 'no-private-css-variable')
          this.addViolation(rules[found.ruleId], found.offset)
      }
    }
  }

  inspectPropsExpression(expression, environment = new Map()) {
    for (const property of this.objectProperties(expression, environment)) {
      if (property.name === 'onClick') {
        this.addViolation(rules['no-onclick-activation'], property.nameNode)
      }
      if (property.name === 'style' && property.value) {
        this.inspectStyleExpression(property.value, environment)
      }
    }
  }

  inspectJsxAttributes(attributes) {
    for (const property of attributes.properties) {
      if (ts.isJsxSpreadAttribute(property)) {
        this.inspectPropsExpression(property.expression)
        continue
      }
      if (
        ['href', 'src', 'url', 'destination'].includes(property.name.text) &&
        property.initializer
      ) {
        const value = ts.isJsxExpression(property.initializer)
          ? property.initializer.expression
          : property.initializer
        if (
          value &&
          this.staticStrings(value).some(item =>
            /^(?:javascript|vbscript|data|blob|x-safari[^:]*):/i.test(
              item.value.replace(/[\u0000-\u0020]/g, ''),
            ),
          )
        )
          this.addViolation(rules['no-executable-url'], property.name)
      }
      if (property.name.text === 'onClick') {
        this.addViolation(rules['no-onclick-activation'], property.name)
      }
      if (property.name.text !== 'style' || !property.initializer) continue

      if (ts.isStringLiteral(property.initializer)) {
        this.inspectStyleTextExpression(property.initializer)
      } else if (ts.isJsxExpression(property.initializer) && property.initializer.expression) {
        const styleExpression = property.initializer.expression
        if (this.staticStrings(styleExpression).length > 0) {
          this.inspectStyleTextExpression(styleExpression)
        } else {
          this.inspectStyleExpression(styleExpression)
        }
      }
    }
  }

  inspectFactoryCall(call) {
    const invocation = this.factoryInvocation(call)
    if (!invocation) return
    const tag = invocation.arguments[0]
    if (tag) {
      const image = this.staticStrings(tag, invocation.environment).find(
        value => value.value.toLowerCase() === 'img',
      )
      if (image) this.addViolation(rules['no-raw-image'], image.node)
      const rawButton = this.staticStrings(tag, invocation.environment).find(
        value => value.value.toLowerCase() === 'button',
      )
      if (rawButton) this.addViolation(rules['no-raw-button'], rawButton.node)
      const input = this.staticStrings(tag, invocation.environment).find(value =>
        ['input', 'textarea'].includes(value.value),
      )
      if (input) {
        const props = invocation.arguments[1]
        const escape =
          props &&
          this.objectProperties(props, invocation.environment).find(
            p => p.name === 'data-satin-native-input',
          )
        if (
          !escape?.value ||
          !this.staticStrings(escape.value, invocation.environment).some(v => v.value.trim())
        )
          this.addViolation(rules['no-raw-text-input'], input.node)
      }
    }
    const props = invocation.arguments[1]
    if (props && props.kind !== ts.SyntaxKind.NullKeyword) {
      this.inspectPropsExpression(props, invocation.environment)
    }
  }

  isCssTag(tag) {
    const current = unwrapExpression(tag)
    if (!current) return false
    if (ts.isIdentifier(current)) {
      const imported = this.importInfo(current)
      return imported !== undefined && CSS_TAG_MODULES.has(imported.moduleName)
    }
    if (ts.isPropertyAccessExpression(current)) {
      const root = current.expression
      const imported = this.importInfo(root)
      return imported !== undefined && CSS_TAG_MODULES.has(imported.moduleName)
    }
    if (ts.isCallExpression(current)) return this.isCssTag(current.expression)
    return false
  }

  inspectCssTemplate(node) {
    if (!this.isCssTag(node.tag)) return
    if (ts.isNoSubstitutionTemplateLiteral(node.template)) {
      const baseOffset = literalContentOffset(node.template, this.sourceFile)
      for (const found of analyzeCssTextFragment(node.template.text, baseOffset)) {
        if (found.ruleId !== 'no-private-css-variable')
          this.addViolation(rules[found.ruleId], found.offset)
      }
      return
    }

    const baseOffset = node.template.getStart(this.sourceFile) + 1
    const endOffset = node.template.end - 1
    let fragment = this.sourceFile.text.slice(baseOffset, endOffset)
    let precedingLiteral = node.template.head
    for (const span of node.template.templateSpans) {
      const start = precedingLiteral.end - 2 - baseOffset
      const end = span.literal.getStart(this.sourceFile) + 1 - baseOffset
      // Keep declarations and their source offsets intact around unresolved values.
      const placeholder = 'x' + fragment.slice(start + 1, end).replace(/[^\r\n]/g, ' ')
      fragment = fragment.slice(0, start) + placeholder + fragment.slice(end)
      precedingLiteral = span.literal
    }
    for (const found of analyzeCssTextFragment(fragment, baseOffset)) {
      this.addViolation(rules[found.ruleId], found.offset)
    }
  }

  inspectStyleMutation(node) {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
    ) {
      const left = node.left
      const propertyName = ts.isPropertyAccessExpression(left)
        ? left.name.text
        : left.argumentExpression
          ? this.staticStrings(left.argumentExpression)[0]?.value
          : undefined
      const receiver = left.expression
      if (propertyName === 'cssText' && this.isElementStyleExpression(receiver)) {
        this.inspectStyleTextExpression(node.right)
      } else if (propertyName && this.isElementStyleExpression(receiver)) {
        this.inspectStyleProperty(propertyName, node.right, left)
      }
    }

    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return
    const receiver = node.expression.expression
    const method = node.expression.name.text

    if (method === 'setAttribute' && node.arguments.length >= 2) {
      const attribute = this.staticStrings(node.arguments[0])[0]?.value
      if (attribute?.toLowerCase() === 'style') this.inspectStyleTextExpression(node.arguments[1])
    }

    if (method === 'setProperty' && this.isElementStyleExpression(receiver)) {
      const propertyName = node.arguments[0]
        ? this.staticStrings(node.arguments[0])[0]?.value
        : undefined
      if (propertyName && node.arguments[1]) {
        this.inspectStyleProperty(propertyName, node.arguments[1], node.arguments[0])
      }
    }

    if (
      ts.isIdentifier(receiver) &&
      receiver.text === 'Object' &&
      method === 'assign' &&
      node.arguments[0] &&
      this.isElementStyleExpression(node.arguments[0])
    ) {
      for (const source of node.arguments.slice(1)) this.inspectStyleExpression(source)
    }
  }

  isElementStyleExpression(expression) {
    const current = unwrapExpression(expression)
    if (!current) return false
    if (ts.isPropertyAccessExpression(current)) return current.name.text === 'style'
    if (ts.isElementAccessExpression(current) && current.argumentExpression) {
      return this.staticStrings(current.argumentExpression)[0]?.value === 'style'
    }
    return false
  }

  isRequireReference(expression) {
    return this.resolveExpressions(expression).some(
      value =>
        ts.isIdentifier(value) && value.text === 'require' && !this.lookupBinding('require', value),
    )
  }

  inspectModuleReference(node) {
    const reference =
      node.moduleSpecifier ??
      (ts.isImportTypeNode(node) ? node.argument?.literal : undefined) ??
      (ts.isImportEqualsDeclaration(node) ? node.moduleReference.expression : undefined) ??
      (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        this.isRequireReference(node.expression))
        ? node.arguments[0]
        : undefined)
    if (
      reference &&
      this.staticStrings(reference).some(
        item =>
          item.value === '@satinhq/kit/internal' || item.value.startsWith('@satinhq/kit/internal/'),
      )
    )
      this.addViolation(rules['no-internal-import'], reference)
    let specifier
    let moduleName
    let alternatives
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      const named = clause?.namedBindings
      if (
        clause?.isTypeOnly ||
        (!clause?.name &&
          named &&
          ts.isNamedImports(named) &&
          named.elements.length > 0 &&
          named.elements.every(element => element.isTypeOnly))
      )
        return
      specifier = node.moduleSpecifier
      moduleName = staticModuleName(specifier)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const named = node.exportClause
      if (
        node.isTypeOnly ||
        (named &&
          ts.isNamedExports(named) &&
          named.elements.length > 0 &&
          named.elements.every(element => element.isTypeOnly))
      )
        return
      specifier = node.moduleSpecifier
      moduleName = staticModuleName(specifier)
    } else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) {
      const reference = node.moduleReference
      if (!ts.isExternalModuleReference(reference) || !reference.expression) return
      specifier = reference.expression
      moduleName = staticModuleName(specifier)
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const require = this.isRequireReference(node.expression)
      if (!dynamic && !require) return
      specifier = node.arguments[0]
      alternatives = this.staticStrings(specifier).map(item => item.value)
    }
    for (const candidate of alternatives ?? [moduleName]) {
      if (candidate === 'react-dom/client') {
        this.addViolation(rules['no-direct-react-root'], specifier)
      } else if (candidate && isGlassPackage(candidate)) {
        this.addViolation(rules['no-direct-glass-import'], specifier)
      }
    }
  }

  // Resolve simple aliases and destructuring without matching an app object's
  // unrelated history/reload methods. Dynamic inter-module aliases need review.
  globalPath(expression, seen = new Set()) {
    const current = unwrapExpression(expression)
    if (!current || seen.has(current)) return undefined
    const next = new Set(seen).add(current)
    if (ts.isIdentifier(current)) {
      const binding = this.lookupBinding(current.text, current)
      if (binding?.destructureSource) {
        const parent = this.globalPath(binding.destructureSource, next)
        return parent && binding.destructureProperty
          ? [...parent, binding.destructureProperty]
          : undefined
      }
      if (binding?.value) return this.globalPath(binding.value, next)
      if (binding) return undefined
      return [
        'window',
        'self',
        'globalThis',
        'document',
        'navigator',
        'Notification',
        'history',
        'location',
        'addEventListener',
        'alert',
        'confirm',
        'prompt',
      ].includes(current.text)
        ? [current.text]
        : undefined
    }
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      const parent = this.globalPath(current.expression, next)
      const member = ts.isPropertyAccessExpression(current)
        ? current.name.text
        : this.staticStrings(current.argumentExpression)[0]?.value
      return parent && member ? [...parent, member] : undefined
    }
    return undefined
  }

  inspectAppOwnership(node) {
    if (!ts.isCallExpression(node)) return
    const callee = unwrapExpression(node.expression)
    const value = ts.isIdentifier(callee) ? this.lookupBinding(callee.text, callee)?.value : callee
    if (value && ts.isCallExpression(value)) {
      const hook = this.importInfo(value.expression)
      if (
        hook?.moduleName === '@satinhq/kit' &&
        hook.imported === 'useOpenURL' &&
        node.arguments[0] &&
        this.staticStrings(node.arguments[0]).some(item =>
          /^(?:javascript|vbscript|data|blob|x-safari[^:]*):/i.test(
            item.value.replace(/[\u0000-\u0020]/g, ''),
          ),
        )
      )
        this.addViolation(rules['no-executable-url'], node.arguments[0])
    }
    const path = this.globalPath(node.expression)
    if (!path) return
    if (['window', 'self', 'globalThis'].includes(path[0]) && path.length > 1) path.shift()
    if (
      path.length === 2 &&
      path[0] === 'history' &&
      ['pushState', 'replaceState', 'go', 'back', 'forward'].includes(path[1])
    ) {
      this.addViolation(rules['no-browser-history'], node.expression)
    }
    if (path.length === 1 && ['alert', 'confirm', 'prompt'].includes(path[0]))
      this.addViolation(rules['no-browser-dialog'], node.expression)
    if (path.join('.') === 'location.reload')
      this.addViolation(rules['no-app-reload'], node.expression)
    const globalListener =
      path.join('.') === 'document.addEventListener' || path.join('.') === 'addEventListener'
    if (
      globalListener &&
      node.arguments[0] &&
      this.staticStrings(node.arguments[0]).some(item =>
        /^touch(?:start|move|end|cancel)$/.test(item.value),
      )
    ) {
      this.addViolation(rules['no-global-touch-listener'], node.expression)
    }
  }

  inspectServiceWorkerRegistration(node) {
    if (!ts.isCallExpression(node)) return
    const path = this.globalPath(node.expression)
    if (!path) return
    if (['window', 'self', 'globalThis'].includes(path[0])) path.shift()
    const api = path.join('.')
    if (api === 'navigator.serviceWorker.register') {
      this.addViolation(rules['no-direct-sw-registration'], node.expression)
    } else if (
      [
        'Notification.requestPermission',
        'navigator.setAppBadge',
        'navigator.clearAppBadge',
      ].includes(api)
    ) {
      this.addViolation(rules['no-direct-push-api'], node.expression)
    }
  }

  inspectAnimationEasing(node) {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return
    const method = node.expression.name.text
    const options =
      method === 'animate'
        ? node.arguments[1]
        : method === 'updateTiming'
          ? node.arguments[0]
          : undefined
    if (!options) return
    for (const property of this.objectProperties(options)) {
      if (
        property.name === 'easing' &&
        this.staticStrings(property.value).some(item => hasCustomLinearEasing(item.value))
      ) {
        this.addViolation(rules['no-custom-linear-easing'], property.nameNode)
      }
    }
  }

  inspectGlassMorph(node) {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return
    const imports = new Map()
    for (const statement of this.sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== '@satinhq/kit')
        continue
      const bindings = statement.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings))
        for (const item of bindings.elements)
          imports.set(item.name.text, item.propertyName?.text ?? item.name.text)
    }
    if (imports.get(node.tagName.getText(this.sourceFile)) !== 'GlassEffect') return
    const applySpread = (expression, states, seen = new Set()) => {
      const resolved = this.resolveExpressions(expression)
      return resolved.flatMap(current => {
        this.consumeEvaluationBudget(current, states.length)
        if (seen.has(current)) return states.map(() => ({ properties: new Map(), unknown: true }))
        const nextSeen = new Set(seen).add(current)
        if (
          ts.isCallExpression(current) &&
          ts.isPropertyAccessExpression(current.expression) &&
          current.expression.expression.getText(this.sourceFile) === 'Object' &&
          current.expression.name.text === 'assign'
        ) {
          return current.arguments.reduce(
            (branches, argument) => applySpread(argument, branches, nextSeen),
            states,
          )
        }
        if (!ts.isObjectLiteralExpression(current))
          return states.map(() => ({ properties: new Map(), unknown: true }))
        let branches = states.map(state => ({ ...state, properties: new Map(state.properties) }))
        for (const property of current.properties) {
          if (ts.isSpreadAssignment(property)) {
            branches = applySpread(property.expression, branches, nextSeen)
            continue
          }
          const name = propertyNameText(property.name, this, new Map())
          if (name === undefined) {
            branches = branches.map(() => ({ properties: new Map(), unknown: true }))
            continue
          }
          const value = ts.isPropertyAssignment(property)
            ? property.initializer
            : ts.isShorthandPropertyAssignment(property)
              ? property.name
              : undefined
          for (const branch of branches) branch.properties.set(name, { value, node: property })
        }
        return branches
      })
    }
    let states = [{ properties: new Map(), unknown: false }]
    for (const property of node.attributes.properties) {
      if (ts.isJsxSpreadAttribute(property)) {
        states = applySpread(property.expression, states)
        continue
      }
      const value =
        property.initializer && ts.isJsxExpression(property.initializer)
          ? property.initializer.expression
          : property.initializer
      for (const state of states)
        state.properties.set(property.name.text, { value, node: property })
    }
    for (const { properties, unknown } of states) {
      const relation = properties.get('id') ?? properties.get('union')
      const namespace = properties.get('namespace')
      if (
        relation &&
        ((!namespace && !unknown) ||
          (namespace && this.staticStrings(namespace.value).some(item => item.value === '')))
      )
        this.addViolation(rules['valid-glass-morph'], relation.node)
      const transition = properties.get('transition')
      if (
        transition &&
        this.staticStrings(transition.value).some(
          item => !['matchedGeometry', 'materialize', 'identity'].includes(item.value),
        )
      )
        this.addViolation(rules['valid-glass-morph'], transition.node)
    }
  }

  inspectTabIdentities(node) {
    if (!ts.isJsxElement(node)) return
    const imports = new Map()
    for (const statement of this.sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== '@satinhq/kit')
        continue
      const bindings = statement.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings))
        for (const item of bindings.elements)
          imports.set(item.name.text, item.propertyName?.text ?? item.name.text)
    }
    if (imports.get(node.openingElement.tagName.getText(this.sourceFile)) !== 'TabView') return
    const ids = new Set()
    for (const child of node.children) {
      const opening = ts.isJsxElement(child)
        ? child.openingElement
        : ts.isJsxSelfClosingElement(child)
          ? child
          : undefined
      if (!opening || imports.get(opening.tagName.getText(this.sourceFile)) !== 'Tab') continue
      const id = opening.attributes.properties.find(
        property => ts.isJsxAttribute(property) && property.name.text === 'id',
      )
      const value = id?.initializer
      const literal =
        value && ts.isStringLiteral(value)
          ? value.text
          : value &&
              ts.isJsxExpression(value) &&
              value.expression &&
              ts.isStringLiteral(value.expression)
            ? value.expression.text
            : undefined
      if (literal === undefined) continue
      if (ids.has(literal)) this.addViolation(rules['no-duplicate-tab-id'], id)
      ids.add(literal)
    }
  }

  // Preserve JSX override order. Unknown spreads/names are a review case,
  // not proof that a control lacks an accessible name.
  accessibleJsxProps(opening) {
    const values = new Map()
    let unknown = false
    const object = (expression, seen = new Set()) => {
      const resolved = this.resolveExpressions(expression)
      if (
        resolved.length !== 1 ||
        !ts.isObjectLiteralExpression(resolved[0]) ||
        seen.has(resolved[0])
      ) {
        unknown = true
        return
      }
      const next = new Set(seen).add(resolved[0])
      for (const property of resolved[0].properties) {
        if (ts.isSpreadAssignment(property)) {
          object(property.expression, next)
          continue
        }
        const name = propertyNameText(property.name, this, new Map())
        if (name === undefined) {
          unknown = true
          continue
        }
        values.set(
          name,
          ts.isPropertyAssignment(property)
            ? property.initializer
            : ts.isShorthandPropertyAssignment(property)
              ? property.name
              : undefined,
        )
      }
    }
    for (const property of opening.attributes.properties) {
      if (ts.isJsxSpreadAttribute(property)) object(property.expression)
      else
        values.set(
          property.name.text,
          property.initializer && ts.isJsxExpression(property.initializer)
            ? property.initializer.expression
            : property.initializer,
        )
    }
    const state = names => {
      let uncertain = unknown
      for (const name of names) {
        if (!values.has(name)) continue
        const expression = values.get(name)
        if (!expression) continue
        const strings = this.staticStrings(expression)
        if (strings.some(item => item.value.trim())) return true
        if (
          !strings.length &&
          expression.kind !== ts.SyntaxKind.NullKeyword &&
          expression.kind !== ts.SyntaxKind.FalseKeyword
        )
          uncertain = true
      }
      return uncertain ? undefined : false
    }
    const hidden = values.get('aria-hidden')
    const isHidden =
      hidden?.kind === ts.SyntaxKind.TrueKeyword ||
      (hidden && this.staticStrings(hidden).some(item => item.value === 'true'))
    return { state, hidden: !!isHidden }
  }

  visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
      const source = this.sourceFile.text.slice(node.pos, node.end)
      if (/--satin-[\w-]+/.test(source)) {
        this.addViolation(rules['no-private-css-variable'], node)
      }
    }
    if (!this.sourceFile.text.includes('// satin-data-allow-raw-storage')) {
      const isDirectName =
        ts.isIdentifier(node) &&
        ['localStorage', 'indexedDB'].includes(node.text) &&
        (!ts.isPropertyAccessExpression(node.parent) || node.parent.expression === node) &&
        !ts.isPropertyAssignment(node.parent) &&
        !ts.isTypeReferenceNode(node.parent)
      const isGlobalProperty =
        ts.isPropertyAccessExpression(node) &&
        ['localStorage', 'indexedDB'].includes(node.name.text) &&
        ts.isIdentifier(node.expression) &&
        ['window', 'globalThis', 'self'].includes(node.expression.text)
      const isGlobalElement =
        ts.isElementAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ['window', 'globalThis', 'self'].includes(node.expression.text) &&
        node.argumentExpression &&
        this.staticStrings(node.argumentExpression).some(item =>
          ['localStorage', 'indexedDB'].includes(item.value),
        )
      if (isDirectName || isGlobalProperty || isGlobalElement)
        this.addViolation(rules['no-raw-persistent-storage'], node)
    }
    this.inspectAppOwnership(node)
    this.inspectTabIdentities(node)
    this.inspectGlassMorph(node)

    this.inspectAnimationEasing(node)
    this.inspectModuleReference(node)
    this.inspectStyleMutation(node)
    this.inspectServiceWorkerRegistration(node)

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const image = this.staticStrings(node.tagName).find(value => value.value === 'img')
      if ((ts.isIdentifier(node.tagName) && node.tagName.text === 'img') || image)
        this.addViolation(rules['no-raw-image'], image?.node ?? node)
      const rawButton =
        ts.isIdentifier(node.tagName) && node.tagName.text === 'button'
          ? { node }
          : this.staticStrings(node.tagName).find(value => value.value === 'button')
      if (rawButton) this.addViolation(rules['no-raw-button'], rawButton.node)
      const tag = ts.isIdentifier(node.tagName) ? node.tagName.text : ''
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute)
      if (['button', 'Row', 'NavigationRow', 'ButtonRow', 'ValueRow', 'Pressable'].includes(tag)) {
        const handler = attributes.find(attribute => attribute.name.text === 'onContextMenu')
        if (handler?.initializer)
          this.addViolation(rules['no-handrolled-context-menu'], handler.name)
      }
      const attributeText = name =>
        attributes
          .find(p => p.name.text === name)
          ?.initializer?.getText(this.sourceFile)
          .replace(/['"{}]/g, '')
          .trim()
      const heading = /^h[1-6]$/.test(tag) || attributeText('role') === 'heading'
      const hidden =
        attributes.some(
          p => p.name.text === 'hidden' && (!p.initializer || attributeText('hidden') === 'true'),
        ) ||
        attributeText('aria-hidden') === 'true' ||
        /(?:^|\s)(?:sr-only|visually-hidden)(?:\s|$)/.test(attributeText('className') ?? '')
      if (heading && hidden && attributes.some(p => p.name.text === 'tabIndex'))
        this.addViolation(rules['no-hidden-focus-heading'], node)
      const importedControl = [...this.sourceFile.statements].some(
        statement =>
          ts.isImportDeclaration(statement) &&
          statement.moduleSpecifier.text === '@satinhq/kit' &&
          statement.importClause?.namedBindings &&
          ts.isNamedImports(statement.importClause.namedBindings) &&
          statement.importClause.namedBindings.elements.some(
            specifier =>
              specifier.name.text === tag &&
              ['Pressable', 'GlassButton', 'Button'].includes(
                specifier.propertyName?.text ?? specifier.name.text,
              ),
          ),
      )
      if (importedControl || ['Pressable', 'GlassButton', 'Button'].includes(tag)) {
        const named = this.accessibleJsxProps(node).state(['aria-label', 'aria-labelledby'])
        const children = ts.isJsxOpeningElement(node) ? node.parent.children : []
        const meaningful = children.filter(child => !ts.isJsxText(child) || child.text.trim())
        const symbolOnly =
          meaningful.length === 0 && attributes.some(attribute => attribute.name.text === 'symbol')
        const unnamedIcons =
          meaningful.length > 0 &&
          meaningful.every(child => {
            if (!ts.isJsxElement(child) && !ts.isJsxSelfClosingElement(child)) return false
            const opening = ts.isJsxElement(child) ? child.openingElement : child
            const tag = opening.tagName.getText(this.sourceFile)
            const props = this.accessibleJsxProps(opening)
            if (props.hidden) return true
            const isSymbol =
              tag === 'Symbol' ||
              [...this.sourceFile.statements].some(
                statement =>
                  ts.isImportDeclaration(statement) &&
                  statement.moduleSpecifier.text === '@satinhq/kit' &&
                  statement.importClause?.namedBindings &&
                  ts.isNamedImports(statement.importClause.namedBindings) &&
                  statement.importClause.namedBindings.elements.some(
                    specifier =>
                      specifier.name.text === tag &&
                      (specifier.propertyName?.text ?? specifier.name.text) === 'Symbol',
                  ),
              )
            if (isSymbol) return props.state(['label', 'aria-label', 'aria-labelledby']) === false
            if (!['svg', 'img'].includes(tag)) return false
            if (
              props.state(['aria-label', 'aria-labelledby', ...(tag === 'img' ? ['alt'] : [])]) !==
              false
            )
              return false
            if (
              tag === 'svg' &&
              ts.isJsxElement(child) &&
              child.children.some(
                item =>
                  ts.isJsxElement(item) &&
                  item.openingElement.tagName.getText(this.sourceFile) === 'title' &&
                  item.children.some(text => !ts.isJsxText(text) || text.text.trim()),
              )
            )
              return false
            return true
          })
        if ((symbolOnly || unnamedIcons) && named === false)
          this.addViolation(rules['require-icon-label'], node)
      }

      if (['input', 'textarea'].includes(tag)) {
        const escape = node.attributes.properties.find(
          p => ts.isJsxAttribute(p) && p.name.text === 'data-satin-native-input',
        )
        if (
          !escape?.initializer ||
          !ts.isStringLiteral(escape.initializer) ||
          !escape.initializer.text.trim()
        )
          this.addViolation(rules['no-raw-text-input'], node)
      }
      if (['input', 'textarea', 'TextField', 'SecureField', 'TextEditor'].includes(tag)) {
        for (const prop of node.attributes.properties) {
          if (
            !ts.isJsxAttribute(prop) ||
            prop.name.text !== 'style' ||
            !prop.initializer ||
            !ts.isJsxExpression(prop.initializer) ||
            !prop.initializer.expression
          )
            continue
          for (const style of this.objectProperties(prop.initializer.expression)) {
            if (style.name !== 'fontSize' || !style.value) continue
            const raw = style.value.getText(this.sourceFile).replace(/^['"]|['"]$/g, '')
            if (/^\d+(?:\.\d+)?(?:px)?$/.test(raw) && parseFloat(raw) < 16)
              this.addViolation(rules['no-small-input-font'], style.nameNode)
          }
        }
      }
      this.inspectJsxAttributes(node.attributes)
    }

    if (ts.isCallExpression(node)) this.inspectFactoryCall(node)
    if (ts.isTaggedTemplateExpression(node)) this.inspectCssTemplate(node)

    ts.forEachChild(node, child => this.visit(child))
  }
}

export function analyzeTypeScript(fileName, source) {
  const context = new AstContext(fileName, source)
  context.visit(context.sourceFile)
  return context.violations
}
