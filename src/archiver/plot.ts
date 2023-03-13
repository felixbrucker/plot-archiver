import { stat } from 'fs/promises';
import {basename, dirname} from 'path'
import {Config} from '../config/config'

export class Plot {
  public static async make(path: string, config: Config): Promise<Plot> {
    const { size, birthtime } = await stat(path);
    const sizeInGib = size / (1024 ** 3);

    return new Plot(path, sizeInGib, birthtime, config);
  }

  public constructor(
    public readonly path: string,
    public readonly sizeInGib: number,
    public readonly createdAt: Date,
    private readonly config: Config,
  ) {}

  public get sourceDirectory(): string {
    return dirname(this.path)
  }

  public get name(): string {
    return basename(this.path);
  }

  public get displayName(): string {
    const parts = this.name.split('.');
    const fileExtension = parts.pop();
    const fileNameWithoutExtension = parts.join('.');
    const truncatedFileNameWithoutExtension = fileNameWithoutExtension.length > 37 ? `${fileNameWithoutExtension.slice(0, 34)}..${fileNameWithoutExtension.slice(-3)}` : fileNameWithoutExtension;

    return `${truncatedFileNameWithoutExtension}.${fileExtension}`;
  }

  public get isClaimable(): Boolean {
    return this.config.claimablePlotPattern.some(pattern => !!this.path.match(new RegExp(pattern)));
  }
}
