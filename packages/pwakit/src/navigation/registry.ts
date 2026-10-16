import type { ComponentType } from 'react'
import type { AnyScreenDefinition, ScreenDefinition } from './types.ts'

export interface ScreenRegistry<
  Definitions extends readonly AnyScreenDefinition[] = readonly AnyScreenDefinition[],
> {
  readonly definitions: Definitions
  has(id: string): boolean
  resolve(id: string): Definitions[number] | undefined
}

export function defineScreen<const Id extends string, Params = undefined>(
  id: Id,
  options: Readonly<{
    component: ComponentType
    restoration?: ScreenDefinition<Id, Params>['restoration']
    navigation?: ScreenDefinition<Id, Params>['navigation']
    splitSelection?: ScreenDefinition<Id, Params>['splitSelection']
  }>,
): ScreenDefinition<Id, Params> {
  if (id.trim().length === 0) {
    throw new Error('A Satin screen id must be a non-empty string.')
  }

  return Object.freeze({
    id,
    component: options.component,
    ...(options.restoration ? { restoration: options.restoration } : {}),
    ...(options.splitSelection !== undefined ? { splitSelection: options.splitSelection } : {}),
    ...(options.navigation ? { navigation: Object.freeze(options.navigation) } : {}),
  }) as ScreenDefinition<Id, Params>
}

export function createScreenRegistry<const Definitions extends readonly AnyScreenDefinition[]>(
  ...definitions: Definitions
): ScreenRegistry<Definitions> {
  Object.freeze(definitions)
  const screens = new Map<string, Definitions[number]>()

  for (const definition of definitions) {
    if (screens.has(definition.id)) {
      throw new Error(`Satin screen id "${definition.id}" is already registered.`)
    }
    screens.set(definition.id, definition)
  }

  return Object.freeze({
    definitions,
    has(id: string) {
      return screens.has(id)
    },
    resolve(id: string) {
      return screens.get(id)
    },
  })
}
