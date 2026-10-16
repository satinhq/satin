/** One route parameter's validator, made by `param`. */
export interface Parameter<T> {
    readonly accepts: (value: unknown) => value is T;
    optional(): Parameter<T | undefined>;
}
/**
 * Route parameter types: `string`, `int`, `number` (finite), `boolean` and `enum`, each with
 * `.optional()`. The same schema validates navigation, restoration and notification deep links.
 *
 * @example
 * const params = { id: param.string(), tab: param.enum(['notes', 'files']).optional() }
 */
export declare const param: Readonly<{
    string: () => Parameter<string>;
    int: () => Parameter<number>;
    number: () => Parameter<number>;
    boolean: () => Parameter<boolean>;
    enum: <const T extends readonly string[]>(values: T) => Parameter<T[number]>;
}>;
/** A route's parameters by name. */
export type ParameterSchema = Readonly<Record<string, Parameter<unknown>>>;
/** The value described by a route parameter declaration. */
export type RouteParameterValue<P> = P extends Parameter<infer T> ? T : never;
/** The props a route component receives for a parameter schema; optional params are optional. */
export type RouteParameters<S extends ParameterSchema> = {
    [K in keyof S as undefined extends RouteParameterValue<S[K]> ? never : K]: RouteParameterValue<S[K]>;
} & {
    [K in keyof S as undefined extends RouteParameterValue<S[K]> ? K : never]?: RouteParameterValue<S[K]>;
};
/** Shared by app declarations and the server relay; contains no UI imports. */
export declare function validateParameters(schema: ParameterSchema, value: unknown): boolean;
export declare function notificationRoutes(definitions: Readonly<Record<string, {
    params?: ParameterSchema;
}>>, tabs?: readonly string[]): {
    [k: string]: {
        params: string[];
        version: number;
        schemaOwned: boolean;
        tabs?: readonly string[] | undefined;
        validate: (value: unknown) => boolean;
    };
};
