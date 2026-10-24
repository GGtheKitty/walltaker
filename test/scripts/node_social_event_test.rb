require 'active_support'
require 'active_support/core_ext/object/blank'
require 'active_support/core_ext/time'
require 'minitest/autorun'
require 'minitest/mock'
require 'ostruct'
class ApplicationRecord
  attr_accessor :delivered_at, :effects
  def with_lock = yield
  def update!(attributes) = self.delivered_at = attributes[:delivered_at]
end
module Rails
  def self.cache = OpenStruct.new
end
class User
  def self.active = self
  def self.exists?(**) = true
  def self.find_by(**) = nil
end
class Notification
  def self.where(**) = self
  def self.order(**) = self
  def self.limit(*) = []
end
class Message
  def self.find_by(**) = nil
end
class Surrender
  attr_accessor :id
  def self.find_by(**) = nil
  def initialize(*) = nil
end
class Comment
  def self.find_by(**) = nil
end
module Turbo
  class StreamsChannel
    def self.broadcast_replace_to(*) = nil
    def self.broadcast_prepend_to(*) = nil
  end
end
require_relative '../../app/models/node_social_event'
class NodeSocialEventTest < Minitest::Test
  def record(effects)
    NodeSocialEvent.new.tap { |e| e.effects = effects }
  end
  def test_replaces_empty_notification_headers_once_and_records_receipt
    event = record('notifications'=>['7'])
    calls = []
    Turbo::StreamsChannel.stub(:broadcast_replace_to, ->(*args, **kwargs) { calls << [args, kwargs] }) do
      2.times { event.deliver! }
    end
    assert_equal 1, calls.length
    assert_equal ['header_notifications_7'], calls.first.first
    assert_equal [], calls.first.last.fetch(:locals).fetch(:notifications)
    assert event.delivered_at
  end
  def test_failed_broadcast_leaves_event_pending
    event = record('notifications'=>['7'])
    Turbo::StreamsChannel.stub(:broadcast_replace_to, ->(*) { raise IOError }) do
      assert_raises(IOError) { event.deliver! }
    end
    assert_nil event.delivered_at
  end
  def test_messages_are_sent_to_current_membership_streams
    participants = Object.new
    participants.define_singleton_method(:joins) { |*| self }
    participants.define_singleton_method(:where) { |**| self }
    participants.define_singleton_method(:find_each) { |&block| [OpenStruct.new(id: 9, user_id: 7)].each(&block) }
    thread = OpenStruct.new(participants:)
    event = record('message_id'=>42)
    calls = []
    Message.stub(:find_by, OpenStruct.new(message_thread: thread)) do
      Turbo::StreamsChannel.stub(:broadcast_prepend_to, ->(*args, **kwargs) { calls << [args, kwargs] }) { event.deliver! }
    end
    assert_equal ['social_thread_member_9_7'], calls.first.first
    assert_equal thread, calls.first.last.fetch(:target)
  end
  def test_deleted_surrender_renders_as_revoked_without_revalidating_missing_relationships
    event = record('surrenders'=>[{ 'id'=>42, 'user_id'=>7, 'controller_user_id'=>8 }])
    calls = []
    Turbo::StreamsChannel.stub(:broadcast_replace_to, ->(*args, **kwargs) { calls << kwargs }) { event.deliver! }
    assert_equal true, calls.first.fetch(:locals).fetch(:revoked)
    assert_equal 42, calls.first.fetch(:locals).fetch(:surrender).id
    assert event.delivered_at
  end

end
