const assert = require('node:assert/strict')
const test = require('node:test')
const { slug } = require('./src/slug')
const { countWords } = require('./src/words')
const { summarize } = require('./src/summary')

test('slug normalizes a label and strips edge separators', () => {
  assert.equal(slug('  Hello... WORLD_42! '), 'hello-world-42')
  assert.equal(slug('***'), '')
})

test('word count treats each letter or digit run as one token', () => {
  assert.equal(countWords('  cat-cat, V2!  '), 3)
  assert.equal(countWords(' _ '), 0)
})

test('summary exposes both normalized values', () => {
  assert.deepEqual(summarize('First_test 2'), { slug: 'first-test-2', wordCount: 3 })
  assert.deepEqual(summarize(''), { slug: '', wordCount: 0 })
})
