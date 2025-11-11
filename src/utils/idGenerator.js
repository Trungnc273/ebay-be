const { v4: uuidv4 } = require("uuid");

function genId(prefix = "") {
  return prefix + uuidv4();
}

module.exports = { genId };
