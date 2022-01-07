import {check} from 'diskusage';

import {PlotArchival} from './plot-archival';
import {Plot} from './Plot';
import {ProgressAwareLogger} from '../logging/logger';

export class Destination {
  public static async make(path: string): Promise<Destination> {
    const destination = new Destination(path);
    await destination.updateFreeSpace();

    return destination;
  }

  public activeArchival: PlotArchival = null;
  public freeSpaceInGib: number = 0;
  private readonly logger = ProgressAwareLogger.make({ name: `Destination (${this.path})` });

  constructor(public readonly path: string) {}

  public canFit(plot: Plot): boolean {
    return plot.sizeInGib < this.freeSpaceInGib;
  }

  public async updateFreeSpace() {
    try {
      const { free } = await check(this.path);
      this.freeSpaceInGib = free / (1024 ** 3);
    } catch (err) {
      this.logger.error(`Failed to update free space: ${err.message}`);
    }
  }
}
