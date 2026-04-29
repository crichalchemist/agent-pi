type ModelLike = {
    provider: string;
    id: string;
};
type RunOpts = {
    getAvailable?: () => ModelLike[] | Promise<ModelLike[]>;
    output?: (line: string) => void;
    exit?: (code: number) => void;
};
export declare const run: (opts?: RunOpts) => Promise<void>;
export {};
