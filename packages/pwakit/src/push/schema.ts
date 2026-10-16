/** One route parameter's validator, made by `param`. */
export interface Parameter<T> {
  readonly accepts: (value: unknown) => value is T
  optional(): Parameter<T | undefined>
}
function parameter<T>(accepts: Parameter<T>['accepts']): Parameter<T> {
  return Object.freeze({
    accepts,
    optional: () =>
      parameter((value): value is T | undefined => value === undefined || accepts(value)),
  })
}
/**
 * Route parameter types: `string`, `int`, `number` (finite), `boolean` and `enum`, each with
 * `.optional()`. The same schema validates navigation, restoration and notification deep links.
 *
 * @example
 * const params = { id: param.string(), tab: param.enum(['notes', 'files']).optional() }
 */
export const param = Object.freeze({
  string: () => parameter((value): value is string => typeof value === 'string'),
  int: () =>
    parameter((value): value is number => typeof value === 'number' && Number.isSafeInteger(value)),
  number: () =>
    parameter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
  boolean: () => parameter((value): value is boolean => typeof value === 'boolean'),
  enum: <const T extends readonly string[]>(values: T) =>
    parameter((value): value is T[number] => typeof value === 'string' && values.includes(value)),
})
/** A route's parameters by name. */
export type ParameterSchema = Readonly<Record<string, Parameter<unknown>>>
/** The value described by a route parameter declaration. */
export type RouteParameterValue<P> = P extends Parameter<infer T> ? T : never
/** The props a route component receives for a parameter schema; optional params are optional. */
export type RouteParameters<S extends ParameterSchema> = {
  [K in keyof S as undefined extends RouteParameterValue<S[K]> ? never : K]: RouteParameterValue<
    S[K]
  >
} & {
  [K in keyof S as undefined extends RouteParameterValue<S[K]> ? K : never]?: RouteParameterValue<
    S[K]
  >
}

/** Shared by app declarations and the server relay; contains no UI imports. */
export function validateParameters(schema: ParameterSchema, value: unknown): boolean {
  if (value === undefined) value = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return (
    Object.keys(descriptors).every(
      key => Object.hasOwn(schema, key) && 'value' in descriptors[key]!,
    ) && Object.entries(schema).every(([key, field]) => field.accepts(descriptors[key]?.value))
  )
}
export function notificationRoutes(
  definitions: Readonly<Record<string, { params?: ParameterSchema }>>,
  tabs?: readonly string[],
) {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, options]) => [
      id,
      {
        params: Object.keys(options.params ?? {}),
        version: 1,
        schemaOwned: true,
        ...(tabs ? { tabs } : {}),
        validate: (value: unknown) => validateParameters(options.params ?? {}, value),
      },
    ]),
  )
}
