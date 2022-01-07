import * as cliProgress from 'cli-progress';

import {PlotArchival} from '../archiver/plot-archival';

export class ProgressBar {
  private multiBar: cliProgress.MultiBar = new cliProgress.MultiBar({
    clearOnComplete: true,
    hideCursor: true,
    fps: 1,
    format: '{plotDisplayName} -> {destination} | {bar} {percentage}% | ETA: {eta}s | {speedInMibPerSecond} MiB/s'
  }, cliProgress.Presets.shades_grey);

  public addArchival(plotArchival: PlotArchival) {
    plotArchival.bar = this.multiBar.create(100);
  }

  public removeArchival(plotArchival: PlotArchival) {
    this.multiBar.remove(plotArchival.bar);
  }

  public clearScreen() {
    this.multiBar.terminal.cursorRelativeReset();
    this.multiBar.terminal.clearBottom();
  }

  public update() {
    this.multiBar.update();
  }
}

export const shared = new ProgressBar();
