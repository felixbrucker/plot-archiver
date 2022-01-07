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

const mibWrittenSlidingWindowInSeconds = 15;

export class Archiver {
  public static async make(destinationDirectories: string[]): Promise<Archiver> {
    const destinations = await Promise.all(destinationDirectories.map(destinationDirectory => Destination.make(destinationDirectory)));

    return new Archiver(destinations);
  }

  private readonly logger = ProgressAwareLogger.make({ name: 'Archiver' });
  private readonly plotsQueue: QueueObject<PlotArchival>;
  private readonly freeSpaceRefreshInterval: NodeJS.Timer;

  private constructor(private readonly destinations: Destination[]) {
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
    while (!destination) {
      await sleep(5 * 1000);
      destination = await this.getNextDestination(plot);
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
    const readStream = createReadStream(plot.path, { highWaterMark: 200 * (1024 ** 2) });
    const writeStream = createWriteStream(destinationTempFilePath, { highWaterMark: 200 * (1024 ** 2) });

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
    const destination = this.destinations.find(destination => destination.activeArchival === null && destination.canFit(plot));
    if (!destination) {
      return null;
    }
    await destination.updateFreeSpace();
    if (!destination.canFit(plot)) {
      return null;
    }

    return destination;
  }
}
