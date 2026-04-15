const LEVELS = {
  error: 0,
  info: 1,
  debug: 2,
};

const environment = process.env.NODE_ENV || 'development';
const configuredLevel = process.env.LOG_LEVEL || (environment === 'production' ? 'info' : 'debug');
const activeLevel = LEVELS[configuredLevel] ?? LEVELS.info;

function shouldLog(level) {
  return LEVELS[level] <= activeLevel;
}

function formatMeta(meta = {}) {
  const keys = Object.keys(meta);

  if (keys.length === 0) {
    return '';
  }

  try {
    return ` ${JSON.stringify(meta)}`;
  } catch (error) {
    return ' {"meta":"unserializable"}';
  }
}

function write(level, message, meta = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${formatMeta(meta)}`;

  if (level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
}

module.exports = {
  error(message, meta) {
    write('error', message, meta);
  },
  info(message, meta) {
    write('info', message, meta);
  },
  debug(message, meta) {
    write('debug', message, meta);
  },
};
