const { slug } = require('./slug')
const { countWords } = require('./words')

function summarize(text) {
  return { slug: slug(text), wordCount: countWords(text) }
}

module.exports = { summarize }
