export type LogLevel = 'none' | 'info' | 'debug';
export declare class Logger {
    private channel;
    private level;
    constructor(name: string);
    info(msg: string): void;
    debug(msg: string): void;
    error(msg: string): void;
    private ts;
}
