import * as vscode from 'vscode';

export type LogLevel = 'none' | 'info' | 'debug';

export class Logger {
  private channel: vscode.OutputChannel;
  private level: LogLevel;

  constructor(name: string) {
    this.channel = vscode.window.createOutputChannel(name);
    this.level = vscode.workspace
      .getConfiguration('xyzDecompressor')
      .get<LogLevel>('logLevel', 'info');
  }

  info(msg: string): void {
    if (this.level === 'none') return;
    const line = `[${this.ts()}] [INFO]  ${msg}`;
    this.channel.appendLine(line);
  }

  debug(msg: string): void {
    if (this.level !== 'debug') return;
    this.channel.appendLine(`[${this.ts()}] [DEBUG] ${msg}`);
  }

  error(msg: string): void {
    this.channel.appendLine(`[${this.ts()}] [ERROR] ${msg}`);
    this.channel.show(true);
  }

  private ts(): string {
    return new Date().toISOString();
  }
}
