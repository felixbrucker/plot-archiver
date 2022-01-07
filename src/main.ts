import {Watcher} from './watcher/watcher';
import {Archiver} from './archiver/archiver';
import {defaultLogger} from './logging/logger';
import {version} from '../package.json'
import {Config} from './config/config';

process.on('unhandledRejection', (err: Error) => {
  defaultLogger.error(`Unhandled Rejection: ${err.message}\n${err.stack}`);
});
process.on('uncaughtException', (err: Error) => {
  defaultLogger.error(`Uncaught Exception: ${err.message}\n${err.stack}`);
});

(async () => {
  defaultLogger.info(`Plot-Archiver ${version}`);

  const config = new Config('config.yaml');
  try {
    await config.load();
  } catch (err) {
    await config.save();
  }

  const archiver = await Archiver.make(config.destinationDirectories);
  const watcher = new Watcher(config.sourceDirectories, archiver);

  process.on('SIGINT', async () => {
    await watcher.shutdown();
    await archiver.shutdown();
    process.exit();
  });
})();
