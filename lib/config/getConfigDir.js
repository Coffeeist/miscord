const path = require('path')
const os = require('os')
const isDocker = require('is-docker')

module.exports = () => {
  if (isDocker()) return '/config'
  switch (process.platform) {
    case 'win32':
      return 'config'
    // return path.join(process.env.APPDATA, 'Miscord')
    case 'linux':
      return 'config'
    // return path.join(os.homedir(), '.config', 'Miscord')
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Miscord')
    default:
      return path.join(os.homedir(), '.miscord')
  }
}
