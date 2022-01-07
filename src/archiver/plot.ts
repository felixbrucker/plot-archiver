import { stat } from 'fs/promises';
import { basename } from 'path';

export class Plot {
  public static async make(path: string): Promise<Plot> {
    const { size } = await stat(path);
    const sizeInGib = size / (1024 ** 3);

    return new Plot(path, sizeInGib);
  }

  public get name(): string {
    return basename(this.path);
  }

  get displayName(): string {
    const parts = this.name.split('.');
    const fileExtension = parts.pop();
    const fileNameWithoutExtension = parts.join('.');
    const truncatedFileNameWithoutExtension = fileNameWithoutExtension.length > 37 ? `${fileNameWithoutExtension.slice(0, 34)}..${fileNameWithoutExtension.slice(-3)}` : fileNameWithoutExtension;

    return `${truncatedFileNameWithoutExtension}.${fileExtension}`;
  }

  private constructor(
    public readonly path: string,
    public readonly sizeInGib: number,
  ) {}
}
