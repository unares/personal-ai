'use strict';

function createLogger(entity) {
  const prefix = entity.toUpperCase();

  function format(level, mod, msg) {
    const ts = new Date().toISOString();
    return `[${ts}] [${prefix}] [${level}] [${mod}] ${msg}`;
  }

  return {
    info(mod, msg) { console.log(format('INFO', mod, msg)); },
    warn(mod, msg) { console.warn(format('WARN', mod, msg)); },
    error(mod, msg, err) {
      console.error(format('ERROR', mod, msg));
      if (err) console.error(err);
    }
  };
}

module.exports = { createLogger };
