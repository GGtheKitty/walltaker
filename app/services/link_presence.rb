require 'set'

class LinkPresence
  # Each connection has its own renewable lease. Native WebSocket pong replies
  # renew healthy connections every 30 seconds; disconnects remove them at once.
  # Five minutes also bounds stale presence after an RPC/server crash.
  TTL = 5.minutes

  class << self
    def join(link, connection_id) = join_id(link.id, connection_id)
    def leave(link, connection_id) = leave_id(link.id, connection_id)
    def refresh(link, connection_id) = refresh_id(link.id, connection_id)

    def join_id(link_id, connection_id)
      refresh_many(link_id.to_s => connection_id)
    end

    def refresh_id(link_id, connection_id)
      join_id(link_id, connection_id)
    end

    def refresh_many(connections)
      return if connections.empty?

      now = Time.current.to_f
      redis.multi do |transaction|
        connections.each do |link_id, connection_id|
          next if connection_id.blank?

          transaction.zremrangebyscore(key(link_id), '-inf', now - TTL.to_f)
          transaction.zadd(key(link_id), now, connection_id)
          transaction.expire(key(link_id), TTL.to_i)
        end
      end
    end

    def leave_id(link_id, connection_id)
      pruned, removed, remaining = redis.multi do |transaction|
        transaction.zremrangebyscore(key(link_id), '-inf', Time.current.to_f - TTL.to_f)
        transaction.zrem(key(link_id), connection_id)
        transaction.zcard(key(link_id))
      end
      (pruned.positive? || removed) && remaining.zero?
    end

    def online?(link)
      return link.instance_variable_get(:@node_browser_connected) if link.instance_variable_defined?(:@node_browser_connected)
      online_id?(link.id)
    end
    def offline?(link) = offline_id?(link.id)

    def online_id?(link_id)
      redis.multi do |transaction|
        transaction.zremrangebyscore(key(link_id), '-inf', Time.current.to_f - TTL.to_f)
        transaction.zcard(key(link_id))
      end.last.positive?
    end

    def offline_id?(link_id) = !online_id?(link_id)

    def online_link_ids
      ids = []
      redis.scan_each(match: 'link:*:ws_client_leases') do |redis_key|
        link_id = redis_key.match(/\Alink:(\d+):ws_client_leases\z/)&.[](1)
        ids << link_id.to_i if link_id && online_id?(link_id)
      end
      ids
    end

    def reset!
      @test_redis&.clear if Rails.env.test?
    end

    private

    # Separate namespace allows rolling forward from legacy seven-day Redis sets
    # without ever treating them as fresh leases or issuing WRONGTYPE commands.
    def key(link_id) = "link:#{link_id}:ws_client_leases"

    def redis
      return test_redis if Rails.env.test? && !ENV['PRESENCE_TEST_REDIS_URL']
      return @integration_redis ||= Redis.new(url: ENV.fetch('PRESENCE_TEST_REDIS_URL')) if Rails.env.test?

      $redis || Redis.new(url: ENV.fetch('REDIS_URL', 'redis://localhost:6379/1'))
    end

    # Generic sorted-set commands for ordinary Rails fixture tests. The focused
    # integration test also exercises these transactions against real Redis.
    def test_redis
      @test_redis ||= Class.new do
        def initialize
          @members = Hash.new { |hash, name| hash[name] = {} }
          @expires_at = {}
        end

        def multi
          results = []
          backend = self
          transaction = Object.new
          transaction.define_singleton_method(:method_missing) do |method, *args|
            results << backend.public_send(method, *args)
            results.last
          end
          yield transaction
          results
        end

        def zadd(name, score, member)
          purge_expired
          added = !@members[name].key?(member)
          @members[name][member] = score.to_f
          added ? 1 : 0
        end

        def zrem(name, member)
          purge_expired
          removed = @members[name].delete(member)
          delete_key(name) if @members[name].empty?
          !removed.nil?
        end

        def zremrangebyscore(name, _minimum, maximum)
          purge_expired
          count = @members[name].count { |_, score| score <= maximum.to_f }
          @members[name].delete_if { |_, score| score <= maximum.to_f }
          delete_key(name) if @members[name].empty?
          count
        end

        def zcard(name)
          purge_expired
          @members.fetch(name, {}).size
        end

        def expire(name, ttl)
          purge_expired
          return false unless @members.key?(name)
          @expires_at[name] = ttl.seconds.from_now
          true
        end

        def scan_each(match:)
          purge_expired
          pattern = /\A#{Regexp.escape(match).gsub('\*', '.*')}\z/
          @members.keys.grep(pattern).each { |name| yield name }
        end

        def clear
          @members.clear
          @expires_at.clear
        end

        private

        def purge_expired
          @expires_at.select { |_, expires_at| expires_at <= Time.current }.each_key { |name| delete_key(name) }
        end

        def delete_key(name)
          @members.delete(name)
          @expires_at.delete(name)
        end
      end.new
    end
  end
end
