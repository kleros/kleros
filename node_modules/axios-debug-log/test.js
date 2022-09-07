import test from 'ava'

const proxyquire = require('proxyquire')
const sinon = require('sinon')

const spy = sinon.spy()
proxyquire('.', { debug: name => ({ axios: spy }[name]) })

const axios = require('axios')

test('Logging request', t => axios({
  method: 'FOO',
  url: 'http://example.com/',
  adapter: config => Promise.resolve({
    status: 200,
    statusText: 'BAR',
    config
  })
}).then(() => {
  t.is(spy.callCount, 2)
  const requestLogging = spy.firstCall
  t.is(requestLogging.args[0], 'FOO http://example.com/')
  const responseLogging = spy.secondCall
  t.is(responseLogging.args[0], '200 BAR')
  t.is(responseLogging.args[1], '(FOO http://example.com/)')
}))
