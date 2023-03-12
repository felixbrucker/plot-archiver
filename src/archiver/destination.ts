import {check} from 'diskusage';

import {PlotArchival} from './plot-archival';
import {Plot} from './Plot';
import {ProgressAwareLogger} from '../logging/logger';
import fs from 'fs/promises'
import {join} from 'path'
import {Stats} from 'node:fs'
import {Config} from '../config/config'

const directoryBlacklist: Set<string> = new Set([
  'system volume information',
  '$recycle.bin',
])
const maxDepth: number = 3

export class Destination {
  public static async make(path: string, config: Config): Promise<Destination> {
    const destination = new Destination(path, config);
    await destination.updateFreeSpace();
    await destination.updateClaimablePlots()

    return destination;
  }

  public activeArchival: PlotArchival = null;
  public freeSpaceInGib: number = 0;
  private claimablePlots: Plot[] = []
  private readonly logger = ProgressAwareLogger.make({ name: `Destination (${this.path})` });

  constructor(
    public readonly path: string,
    private readonly config: Config,
  ) {}

  private get claimableSpaceInGib(): number {
    return this.claimablePlots.reduce((acc, curr) => acc + curr.sizeInGib, 0)
  }

  public canFit(plot: Plot): boolean {
    return plot.sizeInGib < this.freeSpaceInGib;
  }

  public canFitWithClaimablePlots(plot: Plot): Boolean {
    return plot.sizeInGib < this.freeSpaceInGib || plot.sizeInGib < (this.freeSpaceInGib + this.claimableSpaceInGib);
  }

  public async claimPlotsForPlot(plot: Plot) {
    while (!this.canFit(plot) && this.claimablePlots.length > 0) {
      const plotToClaim = this.claimablePlots.shift()
      this.logger.info(`Claiming plot ${plotToClaim.path} ..`)
      await fs.unlink(plotToClaim.path)
      await this.updateFreeSpace()
    }
  }

  public async updateFreeSpace() {
    try {
      const { free } = await check(this.path);
      this.freeSpaceInGib = free / (1024 ** 3);
    } catch (err) {
      this.logger.error(`Failed to update free space: ${err.message}`);
    }
  }

  private async updateClaimablePlots(): Promise<void> {
    const claimablePlots = await this.getClaimablePlots(this.path, 0)
    claimablePlots.sort((lhs: Plot, rhs: Plot) => {
      if (lhs.createdAt < rhs.createdAt) {
        return -1
      }
      if (rhs.createdAt < lhs.createdAt) {
        return 1
      }

      return 0
    })
    this.claimablePlots = claimablePlots
  }

  private async getClaimablePlots(directory: string, currentDepth: number): Promise<Plot[]> {
    let files: string[] = null
    try {
      files = await fs.readdir(directory)
    } catch(err) {
      return []
    }
    const allClaimablePlots = await Promise.all(files.map(async file => {
      let localDepth = currentDepth
      const filePath = join(directory, file)
      let stats: Stats
      try {
        stats = await fs.stat(filePath)
      } catch (err) {
        return []
      }
      if (stats.isDirectory()) {
        if (directoryBlacklist.has(file.toLowerCase())) {
          return []
        }
        if (localDepth < maxDepth) {
          return this.getClaimablePlots(filePath, localDepth + 1)
        }

        return []
      }
      const plot = new Plot(filePath, stats.size / (1024 ** 3), stats.birthtime, this.config)
      if (!plot.isClaimable) {
        return []
      }

      return [plot]
    }))

    return allClaimablePlots.flatMap(plots => plots)
  }
}
