#!/usr/bin/env node
const cluster = require('cluster')
const chalk = require('chalk')
const sudoBlock = require('sudo-block')
const Logger = require('../lib/logger')
global.logger = new Logger(process.env.MISCORD_LOG_LEVEL || 'info')
const miscord = require('../')
const sendError = require('../lib/error')
const cfg = require('../lib/config')
const getConfig = cfg.getConfig
const getConfigDir = cfg.getConfigDir

const fork = d => cluster.fork({ DATA_PATH: d }).on('online', () => { lastRunTime = new Date() })

let lastRunTime

if (cluster.isMaster) {
  const printAndExit = m => process.exit(console.log(m) || 0)

  const outdated = 'Hey! Your version of Node.JS seems outdated. Minimum version required: v8.5.0, your version: ' + process.version
  if (!require('semver').gte(process.version, '8.5.0')) printAndExit(chalk.yellow(outdated))

  const args = require('../lib/arguments').getArgs()
  if (args.help) printAndExit(require('./help'))
  if (args.version) printAndExit(require('../package.json').version)
  if (args.getPath) printAndExit(getConfigDir())

  const configUnsupported = c => `The -c option is now deprecated.
Use --dataPath [-d] with your base folder (where your config is), probably ${require('path').parse(c).dir}.`
  if (args.config) printAndExit(chalk.yellow(configUnsupported(args.config)))

  const defaultMessage = chalk`
{red.bold You are not allowed to run Miscord with root permissions.}
If running without {bold sudo} doesn't work, you can either fix your permission problems or change where npm stores global packages by putting {bold ~/npm/bin} in your PATH and running:
{blue npm config set prefix ~/npm}
See: {underline https://github.com/sindresorhus/guides/blob/master/npm-global-without-sudo.md}
If you {underline really} need to run Miscord with {bold sudo}, add parameter {bold --runningWithSudoIsDangerous}.
`
  if (!args.runningWithSudoIsDangerous) sudoBlock(defaultMessage)

  fork(args.dataPath)

  let loginFailed = true

  cluster.on('message', (worker, message) => {
    if (message === 'login successful') loginFailed = false
    if (message === 'quit') {
      logger.success('Quit signal received, exiting...')
      process.exit(0)
    }
  })

  cluster.on('exit', (worker, code, signal) => {
    logger.error(`Worker process ${worker.process.pid} died (${code}, ${signal}).`)
    if ((Date.now() - lastRunTime.getTime()) < (2 * 1000)) {
      logger.fatal('Process crashed less than 2 seconds since the last launch, exiting.')
      process.exit(1)
    }
    if (loginFailed) {
      logger.fatal('Logging in failed, exiting.')
      process.exit(1)
    }
    loginFailed = true
    fork(args.dataPath)
  })
} else {
  logger.success(`Worker process ${process.pid} started.`)
  sendError.initSentry()
  const dataPath = process.env.DATA_PATH !== 'undefined' ? process.env.DATA_PATH : undefined

  logger.start('Gzipping old logs...')
  Logger.gzipOldLogs()
    .then(() => {
      logger.success('All old logs gzipped, starting Miscord')
      Logger.inject(dataPath)
    })
    .then(() => getConfig(dataPath))
    .then(miscord)
    .catch(err => sendError(err))

  const catchError = error => {
    if (!error) return
    sendError(error)
  }

  process.on('unhandledRejection', catchError)
  process.on('uncaughtException', catchError)
}
