# Exercise reset email retries without booting Rails or contacting an email service.
require 'active_support'
require 'active_support/core_ext/numeric/time'
require 'active_support/security_utils'
require 'minitest/autorun'
require 'minitest/mock'
require 'ostruct'
module Rails
  def self.application = OpenStruct.new(secret_key_base: 'test-secret')
end
class ApplicationRecord
  attr_accessor :delivered_at, :operation, :user_id, :result
  def with_lock = yield
  def update!(attributes) = self.delivered_at = attributes[:delivered_at]
end
class User
  def self.active = self
  def self.find_by(**) = nil
end
class PasswordResetMailer
  def self.reset_password(*) = raise('Use a fake mailer in these tests')
end
require_relative '../../app/models/node_account_event'

class NodeAccountEventTest < Minitest::Test
  def record(token: 'original-token')
    event = NodeAccountEvent.new
    event.operation = 'reset-request'
    event.user_id = 42
    event.result = { 'status'=>'queued', 'token_fingerprint'=>OpenSSL::HMAC.hexdigest('SHA256','test-secret',"reset:#{token}") }
    event
  end
  def user(token: 'original-token', at: Time.current)
    OpenStruct.new(password_reset_token: token, password_reset_sent_at: at)
  end
  def test_delivers_the_issued_token_and_records_a_receipt_for_retries
    event = record
    calls = []
    delivery = Object.new
    delivery.define_singleton_method(:deliver_now) { calls << :sent }
    User.stub(:find_by,user) do
      PasswordResetMailer.stub(:reset_password,->(target, token:) { assert_equal 'original-token', token; delivery }) do
        2.times { event.deliver! }
      end
    end
    assert_equal [:sent], calls
    assert event.delivered_at
  end
  def test_failed_email_delivery_stays_pending
    event = record
    delivery = Object.new
    delivery.define_singleton_method(:deliver_now) { raise IOError, 'SMTP unavailable' }
    User.stub(:find_by,user) do
      PasswordResetMailer.stub(:reset_password,delivery) { assert_raises(IOError) { event.deliver! } }
    end
    assert_nil event.delivered_at
  end
  def test_rotated_expired_consumed_or_deleted_tokens_do_not_send_stale_email
    [user(token:'replaced-token'), user(at:2.hours.ago), user(token:nil), nil].each do |target|
      event = record
      User.stub(:find_by,target) { event.deliver! }
      assert event.delivered_at
    end
  end
end
