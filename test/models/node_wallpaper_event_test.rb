require 'test_helper'
require 'minitest/mock'

class NodeWallpaperEventTest < ActiveSupport::TestCase
  self.fixture_table_names = [] if respond_to?(:fixture_table_names=)

  def event
    record = NodeWallpaperEvent.new(link_id: 123, past_link_id: 456)
    record.define_singleton_method(:with_lock) { |&block| block.call }
    record.define_singleton_method(:update!) { |attributes| assign_attributes(attributes) }
    record
  end

  def with_adapters(fail_pages: false, missing_link: false)
    calls = []
    owner = Object.new
    setter = Object.new
    link = Struct.new(:id, :user_id, :user).new(123, 1, owner)
    link.define_singleton_method(:broadcast_link_page_updates) do |raise_on_error:|
      raise IOError, 'Redis unavailable' if fail_pages
      calls << [:page, raise_on_error]
    end
    link.define_singleton_method(:broadcast_api_update) { calls << [:cable] }
    past = Struct.new(:set_by_id, :set_by).new(2, setter)
    past.define_singleton_method(:broadcast_updates) { calls << [:history] }
    Link.stub(:find_by, missing_link ? nil : link) do
      PastLink.stub(:find_by, past) do
        User.stub(:broadcast_api_update, ->(user) { calls << [:user, user] }) do
          ActionCable.server.stub(:broadcast, ->(*args) { calls << [:cable, *args] }) do
            yield calls
          end
        end
      end
    end
  end

  test 'delivers live updates once and records a receipt for retries' do
    record = event
    with_adapters do |calls|
      record.deliver!
      record.deliver!
      assert record.delivered_at
      assert_equal 1, calls.count { |call| call.first == :page }
      assert_equal 1, calls.count { |call| call.first == :history }
      assert_equal 1, calls.count { |call| call.first == :cable }
      assert_equal 2, calls.count { |call| call.first == :user }
    end
  end

  test 'failed broadcasts remain pending for retry' do
    record = event
    with_adapters(fail_pages: true) do
      assert_raises(IOError) { record.deliver! }
      assert_nil record.delivered_at
    end
  end

  test 'events for removed links finish without publishing stale wallpapers' do
    record = event
    with_adapters(missing_link: true) do |calls|
      record.deliver!
      assert record.delivered_at
      assert_empty calls
    end
  end
end
