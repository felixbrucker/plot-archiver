import {Logger, ISettingsParam} from 'tslog';
import {ILogObject} from 'tslog/src/interfaces';

import {shared} from '../ui/progress-bar';

export class ProgressAwareLogger extends Logger {
  public static make(options: ISettingsParam = {}): ProgressAwareLogger {
    return new ProgressAwareLogger({
      ...options,
      displayFunctionName: false,
      displayFilePath: 'hidden',
    });
  }

  private constructor(options: ISettingsParam = {}) {
    super(options);
  }

  public silly(...args: unknown[]): ILogObject {
    shared.clearScreen();
    return super.silly(...args);
  }

  public trace(...args: unknown[]): ILogObject {
    shared.clearScreen();
    return super.trace(...args);
  }

  public debug(...args: unknown[]): ILogObject {
    shared.clearScreen();
    return super.debug(...args);
  }

  public info(...args: unknown[]): ILogObject {
    shared.clearScreen();
    return super.info(...args);
  }

  public warn(...args: unknown[]): ILogObject {
    shared.clearScreen();
    return super.warn(...args);
  }

  public error(...args: unknown[]): ILogObject {
    shared.clearScreen();
    return super.error(...args);
  }

  public fatal(...args: unknown[]): ILogObject {
    shared.clearScreen();
    return super.fatal(...args);
  }
}

export const defaultLogger = ProgressAwareLogger.make();
