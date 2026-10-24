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
  def self.cache = Object.new
end
class EmojiLinkDecoration
  def self.clear_cache = nil
end
class NodeModerationBackend
  def self.scrub_page!(*) = raise('Use a fake scrub adapter')
end
require_relative '../../app/models/node_moderation_event'
class NodeModerationEventTest < Minitest::Test
  def record(effects = {})
    NodeModerationEvent.new.tap { |e| e.effects = effects }
  end
  def test_empty_audit_receipt_is_acknowledged_once
    event = record
    2.times { event.deliver! }
    assert event.delivered_at
  end
  def test_domain_scrub_stays_pending_until_every_page_has_completed
    event = record('scrub'=>true)
    NodeModerationBackend.stub(:scrub_page!,false) { event.deliver! }
    assert_nil event.delivered_at
    NodeModerationBackend.stub(:scrub_page!,true) { event.deliver! }
    assert event.delivered_at
  end
  def test_failed_cache_invalidation_keeps_a_retryable_receipt
    event = record('emoji'=>true)
    EmojiLinkDecoration.stub(:clear_cache,-> { raise IOError }) { assert_raises(IOError) { event.deliver! } }
    assert_nil event.delivered_at
  end
end
