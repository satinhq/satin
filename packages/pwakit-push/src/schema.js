function parameter(accepts) {
    return Object.freeze({
        accepts,
        optional: () => parameter((value) => value === undefined || accepts(value)),
    });
}
/**
 * Route parameter types: `string`, `int`, `number` (finite), `boolean` and `enum`, each with
 * `.optional()`. The same schema validates navigation, restoration and notification deep links.
 *
 * @example
 * const params = { id: param.string(), tab: param.enum(['notes', 'files']).optional() }
 */
export const param = Object.freeze({
    string: () => parameter((value) => typeof value === 'string'),
    int: () => parameter((value) => typeof value === 'number' && Number.isSafeInteger(value)),
    number: () => parameter((value) => typeof value === 'number' && Number.isFinite(value)),
    boolean: () => parameter((value) => typeof value === 'boolean'),
    enum: (values) => parameter((value) => typeof value === 'string' && values.includes(value)),
});
/** Shared by app declarations and the server relay; contains no UI imports. */
export function validateParameters(schema, value) {
    if (value === undefined)
        value = {};
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return (Object.keys(descriptors).every(key => Object.hasOwn(schema, key) && 'value' in descriptors[key]) && Object.entries(schema).every(([key, field]) => field.accepts(descriptors[key]?.value)));
}
export function notificationRoutes(definitions, tabs) {
    return Object.fromEntries(Object.entries(definitions).map(([id, options]) => [
        id,
        {
            params: Object.keys(options.params ?? {}),
            version: 1,
            schemaOwned: true,
            ...(tabs ? { tabs } : {}),
            validate: (value) => validateParameters(options.params ?? {}, value),
        },
    ]));
}
