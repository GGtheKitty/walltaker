require 'active_support'
require 'active_support/core_ext/numeric/time'
require 'minitest/autorun'
require 'minitest/mock'
class ApplicationRecord
  attr_accessor :delivered_at, :effects
  def with_lock = yield
  def update!(attributes) = self.delivered_at = attributes[:delivered_at]
end
class User
  def self.active = self
  def self.exists?(id:) = id != 99
end
class Notification
  def self.where(user_id:) = self
  def self.order(**) = self
  def self.limit(*) = []
end
module Turbo
  class StreamsChannel
    def self.broadcast_replace_to(*) = raise('Use a fake broadcaster')
  end
end
require_relative '../../app/models/node_tracker_event'
class NodeTrackerEventTest < Minitest::Test
  def event
    NodeTrackerEvent.new.tap { |e| e.effects = { 'notifications'=>[42,42,99] } }
  end
  def test_successful_delivery_records_receipt_and_skips_repeated_and_deleted_recipients
    record = event; calls = []
    Turbo::StreamsChannel.stub(:broadcast_replace_to, ->(*args, **options) { calls << [args,options] }) do
      2.times { record.deliver! }
    end
    assert_equal 1, calls.length
    assert_equal ['header_notifications_42'], calls.first.first
    assert_equal 'application/notifications', calls.first.last[:partial]
    assert record.delivered_at
  end
  def test_failed_broadcast_stays_pending_for_retry
    record = event
    Turbo::StreamsChannel.stub(:broadcast_replace_to, ->(*) { raise IOError }) do
      assert_raises(IOError) { record.deliver! }
    end
    assert_nil record.delivered_at
  end
  def test_an_event_without_credit_notification_can_be_acknowledged
    record = event; record.effects = { 'notifications'=>[] }; record.deliver!
    assert record.delivered_at
  end
end
