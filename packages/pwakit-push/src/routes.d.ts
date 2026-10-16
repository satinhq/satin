/** Shared, validated route codec. No navigation or browser history side effects. */
export interface PushRoute<Params extends Record<string, string | number | boolean> = Record<string, string>> {
    screen: string;
    params?: Params;
    tab?: string;
    version?: number;
}
export type PushRouteRules = Record<string, {
    params: readonly string[];
    tabs?: readonly string[];
    version?: number;
    validate?: (params: unknown) => boolean;
    schemaOwned?: boolean;
}>;
export declare function validatePushRoute(route: PushRoute<Record<string, string | number | boolean>>, rules: PushRouteRules): PushRoute<Record<string, string | number | boolean>>;
export declare function encodePushRoute(base: string, route: PushRoute<Record<string, string | number | boolean>>, rules: PushRouteRules, deliveryId: string): string;
export declare function decodePushRoute(input: string, base: string, rules: PushRouteRules): {
    route: PushRoute<Record<string, string | number | boolean>>;
    id: string;
} | null;
