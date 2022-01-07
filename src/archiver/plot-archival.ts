import {Plot} from './Plot';

export class PlotArchival {
  public progress: {
    percentage: number,
    speedInMibPerSecond: number,
    transferredGib: number,
    startTime: Date,
  } = {
    percentage: 0,
    speedInMibPerSecond: 0,
    transferredGib: 0,
    startTime: null,
  };
  public bar: any
  public plotDisplayName: string

  public constructor(public readonly plot: Plot) {
    this.plotDisplayName = plot.displayName;
  }
}
