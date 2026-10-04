import test from 'node:test'
import assert from 'node:assert/strict'
import { validateBuildConfig } from './validate-build-config.mjs'

const base = {
  MERCHANT_BUILD_ENV: 'staging',
  MERCHANT_EXPECTED_API_URL: 'https://api.tembus.id/api/v1',
  VITE_API_URL: 'https://api.tembus.id/api/v1',
}

test('accepts the explicit staging API origin', () => {
  assert.deepEqual(validateBuildConfig(base), {
    environment: 'staging',
    apiUrl: 'https://api.tembus.id/api/v1',
  })
})

test('rejects localhost for a release build', () => {
  assert.throws(
    () => validateBuildConfig({ ...base, VITE_API_URL: 'http://localhost:8080/api/v1' }),
    /HTTPS|localhost|loopback/,
  )
})

test('rejects a release URL that does not match the environment contract', () => {
  assert.throws(
    () => validateBuildConfig({ ...base, VITE_API_URL: 'https://api.bawain.my.id/api/v1' }),
    /does not match/,
  )
})

test('requires an explicit API URL even for local builds', () => {
  assert.throws(
    () => validateBuildConfig({ MERCHANT_BUILD_ENV: 'local' }),
    /VITE_API_URL is required/,
  )
})

test('allows an explicitly configured local API URL for local development', () => {
  assert.deepEqual(validateBuildConfig({
    MERCHANT_BUILD_ENV: 'local',
    VITE_API_URL: 'http://localhost:8080/api/v1',
  }), {
    environment: 'local',
    apiUrl: 'http://localhost:8080/api/v1',
  })
})
