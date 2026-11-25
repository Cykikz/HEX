function countWords(text) {
  return (text.match(/[a-zA-Z0-9]+/g) || []).length
}

module.exports = { countWords }
