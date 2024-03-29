import {queue, QueueObject} from 'async';
import {pipeline} from 'stream/promises';
import {join} from 'path';
import {Transform} from 'stream';
import {createReadStream, createWriteStream, existsSync} from 'fs';
import {rename, unlink} from 'fs/promises';

import {Plot} from './Plot';
import {Destination} from './destination';
import {PlotArchival} from './plot-archival';
import {sleep} from '../util/sleep';
import {ProgressAwareLogger} from '../logging/logger';
import {shared} from '../ui/progress-bar';
import {Config} from '../config/config'

const mibWrittenSlidingWindowInSeconds = 15;

export class Archiver {
  public static async make(config: Config): Promise<Archiver> {
    const destinations = await Promise.all(config.destinationDirectories.map(destinationDirectory => Destination.make(destinationDirectory, config)));

    return new Archiver(destinations, config);
  }

  private readonly logger = ProgressAwareLogger.make({ name: 'Archiver' });
  private readonly plotsQueue: QueueObject<PlotArchival>;
  private readonly freeSpaceRefreshInterval: NodeJS.Timer;

  private constructor(
    private readonly destinations: Destination[],
    private readonly config: Config,
  ) {
    this.plotsQueue = queue(this.archivePlot.bind(this), this.destinations.length || 1);
    this.freeSpaceRefreshInterval = setInterval(async () => {
      await Promise.all(this.destinations.map(destination => destination.updateFreeSpace()));
    }, 60 * 60 * 1000);
  }

  public async shutdown() {
    clearInterval(this.freeSpaceRefreshInterval);
    this.plotsQueue.pause();
    this.plotsQueue.kill();
  }

  public async enqueuePlot(plot: Plot) {
    await this.plotsQueue.push(new PlotArchival(plot));
  }

  private async archivePlot(plotArchival: PlotArchival) {
    const plot = plotArchival.plot;
    let destination = await this.getNextDestination(plot);
    if (destination === undefined) {
      await sleep(1000)
      this.plotsQueue.push(plotArchival)

      return
    }
    this.logger.info(`Archiving ${plot.name} to ${destination.path} ..`);
    shared.addArchival(plotArchival);
    plotArchival.bar.update(plotArchival.progress.percentage * 100, {
      speedInMibPerSecond: plotArchival.progress.speedInMibPerSecond.toFixed(2),
      plotDisplayName: plotArchival.plotDisplayName,
      destination: destination.path,
    });

    destination.activeArchival = plotArchival;
    const destinationFilePath = join(destination.path, plot.name);
    const destinationTempFilePath = `${destinationFilePath}.temp`;
    const readStream = createReadStream(plot.path, { highWaterMark: 64 * (1024 ** 2) });
    const writeStream = createWriteStream(destinationTempFilePath, { highWaterMark: 64 * (1024 ** 2) });

    let gibWrittenCollection = [];
    const progressCalcInterval = setInterval(() => {
      plotArchival.progress.percentage = plotArchival.progress.transferredGib / plot.sizeInGib;

      gibWrittenCollection.push(plotArchival.progress.transferredGib);
      if (gibWrittenCollection.length > mibWrittenSlidingWindowInSeconds) {
        gibWrittenCollection = gibWrittenCollection.slice(mibWrittenSlidingWindowInSeconds * -1);
      }
      const gibWrittenPerSeconds = gibWrittenCollection.reduce((acc, curr, idx) => {
        if (idx === 0) {
          return acc;
        }
        const lastMibWritten = gibWrittenCollection[idx - 1];
        acc.push(curr - lastMibWritten);

        return acc;
      }, []);
      if (gibWrittenPerSeconds.length === 0) {
        plotArchival.progress.speedInMibPerSecond = 0;
      } else {
        plotArchival.progress.speedInMibPerSecond = (gibWrittenPerSeconds.reduce((acc, curr) => acc + curr, 0) / gibWrittenPerSeconds.length) * 1024;
      }

      plotArchival.bar.update(plotArchival.progress.percentage * 100, {
        speedInMibPerSecond: plotArchival.progress.speedInMibPerSecond.toFixed(2),
        plotDisplayName: plotArchival.plotDisplayName,
        destination: destination.path,
      });
    }, 1000);

    plotArchival.progress.startTime = new Date();
    try {
      await pipeline(
        readStream,
        new Transform({
          transform: (chunk, encoding, callback) => {
            plotArchival.progress.transferredGib += (chunk.length / (1024 ** 3));
            callback(null, chunk);
          }
        }),
        writeStream
      );
      await rename(destinationTempFilePath, destinationFilePath);
      await unlink(plot.path);
      this.logger.info(`Finished archiving ${plot.name} to ${destination.path}`);
    } catch (err) {
      if (existsSync(destinationTempFilePath)) {
        await unlink(destinationTempFilePath);
      }

      this.logger.error(`Failed to archive ${plot.name} to ${destination.path}: ${err.message}`);
      setTimeout(() => {
        this.plotsQueue.push(new PlotArchival(plot));
      }, 1000);
    } finally {
      clearInterval(progressCalcInterval);
      shared.removeArchival(plotArchival);
      await destination.updateFreeSpace();
      destination.activeArchival = null;
    }
  }

  private async getNextDestination(plot: Plot): Promise<Destination> {
    const activeArchivals = this.destinations.map(destination => destination.activeArchival).filter(activeArchival => activeArchival !== null)
    if (this.config.maxActiveArchivals !== undefined && activeArchivals.length >= this.config.maxActiveArchivals) {
      return
    }
    const activeArchivalsFromSameSource = activeArchivals.filter(activeArchival => activeArchival.plot.sourceDirectory === plot.sourceDirectory)
    if (this.config.maxActiveArchivalsFromSameSource !== undefined && activeArchivalsFromSameSource.length >= this.config.maxActiveArchivalsFromSameSource) {
      return
    }
    const destinationsNotCurrentlyArchivingTo = this.destinations.filter(destination => destination.activeArchival === null)
    let destination = destinationsNotCurrentlyArchivingTo.find(destination => destination.canFit(plot))
    if (destination !== undefined) {
      return destination
    }
    destination = destinationsNotCurrentlyArchivingTo.find(destination => destination.canFitWithClaimablePlots(plot))
    if (destination !== undefined) {
      await destination.claimPlotsForPlot(plot)

      return destination
    }
  }
}
