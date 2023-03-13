import {readFile, writeFile} from 'fs/promises';
import {load, dump} from 'js-yaml';

export class Config {
  public sourceDirectories: string[] = [];
  public destinationDirectories: string[] = [];
  public claimablePlotPattern: string[] = [];
  public awaitWriteFinish: boolean = false
  public maxActiveArchivals?: number

  public constructor(private readonly path: string) {}

  public async load() {
    const yaml = await readFile(this.path, 'utf-8');
    const config = load(yaml);
    this.sourceDirectories = config.sourceDirectories;
    this.destinationDirectories = config.destinationDirectories;
    this.claimablePlotPattern = config.claimablePlotPattern
    this.awaitWriteFinish = config.awaitWriteFinish
    this.maxActiveArchivals = config.maxActiveArchivals
  }

  public async save() {
    const yaml = dump({
      sourceDirectories: this.sourceDirectories,
      destinationDirectories: this.destinationDirectories,
      claimablePlotPattern: this.claimablePlotPattern,
      awaitWriteFinish: this.awaitWriteFinish,
      maxActiveArchivals: this.maxActiveArchivals,
    });
    await writeFile(this.path, yaml, 'utf-8');
  }
}
