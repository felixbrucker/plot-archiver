import {FSWatcher, watch} from 'chokidar';
import {basename} from 'path';

import {Archiver} from '../archiver/archiver';
import {Plot} from '../archiver/plot';
import {ProgressAwareLogger} from '../logging/logger';
import {Config} from '../config/config'

const archivablePatterns = [
  /^plot-k[0-9]+.+\.plot$/,
  /^plot-mmx-k[0-9]+.+\.plot$/,
]

export class Watcher {
  private readonly logger = ProgressAwareLogger.make({ name: 'Watcher' });
  private readonly watcher: FSWatcher[]

  public constructor(
    private readonly config: Config,
    private readonly archiver: Archiver
  ) {
    const awaitWriteFinishConfig = {
      pollInterval: 1000,
      stabilityThreshold: 5 * 1000,
    }

    this.watcher = this.config.sourceDirectories.map(directory => {
      return watch(directory, {
        persistent: true,
        depth: 0,
        alwaysStat: true,
        awaitWriteFinish: this.config.awaitWriteFinish ? awaitWriteFinishConfig : false,
      });
    });
    this.watcher.forEach(watcher => watcher.on('add', this.onNewFile.bind(this)));
  }

  public async shutdown() {
    await Promise.all(this.watcher.map(watcher => watcher.close()));
  }

  private async onNewFile(path: string) {
    const fileName = basename(path);
    if (!archivablePatterns.some(pattern => pattern.test(fileName))) {
      return
    }

    this.logger.info(`Enqueueing new plot: ${path}`);
    const plot = await Plot.make(path, this.config);
    await this.archiver.enqueuePlot(plot);
  }
}
