require 'active_support'
require 'active_support/core_ext'
require 'active_support/key_generator'
require 'active_support/message_verifier'
require 'active_support/message_encryptor'
require 'openssl'
require 'base64'
require 'json'
secret = 'browser-cookie-fixture-secret-only-not-a-production-key'
serializer = Module.new do
  def self.dump(value) = value
  def self.load(value) = value
end
keys = ActiveSupport::KeyGenerator.new(secret, iterations: 1000, hash_digest_class: OpenSSL::Digest::SHA256)
signed = ActiveSupport::MessageVerifier.new(keys.generate_key('signed cookie'), digest: 'SHA1', serializer:)
encrypted = ActiveSupport::MessageEncryptor.new(keys.generate_key('authenticated encrypted cookie', 32), cipher: 'aes-256-gcm', serializer:)
raw = (0...32).to_a.pack('C*')
pad = (32...64).to_a.pack('C*')
mask = ->(token) { Base64.urlsafe_encode64(pad + pad.bytes.zip(token.bytes).map { |a,b| a ^ b }.pack('C*'), padding: false) }
session = { 'session_id'=>'0123456789abcdef0123456789abcdef', 'user_id'=>42, '_csrf_token'=>Base64.urlsafe_encode64(raw, padding: false) }
data = {
  secret:,
  permanent: signed.generate(JSON.generate(42), purpose: 'cookie.permanent_session_id', expires_at: Time.utc(2036,1,1)),
  no_surrender: signed.generate(JSON.generate(nil), purpose: 'cookie.surrender_id'),
  surrender: signed.generate(JSON.generate(99), purpose: 'cookie.surrender_id'),
  expired: signed.generate(JSON.generate(42), purpose: 'cookie.permanent_session_id', expires_at: Time.utc(2010,1,1)),
  wrong_purpose: signed.generate(JSON.generate(42), purpose: 'cookie.other'),
  encrypted: encrypted.encrypt_and_sign(JSON.generate(session), purpose: 'cookie._walltaker_session'),
  wrong_encrypted_purpose: encrypted.encrypt_and_sign(JSON.generate(session), purpose: 'cookie.other'),
  raw_csrf: Base64.urlsafe_encode64(raw, padding: false),
  masked_real: mask.call(raw),
  masked_global: mask.call(OpenSSL::HMAC.digest('SHA256',raw,'!real_csrf_token')),
  masked_form: mask.call(OpenSSL::HMAC.digest('SHA256',raw,'/settings#post'))
}
puts JSON.pretty_generate(data)
