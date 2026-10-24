require "set"

class LinkPresence
  TTL = 90.seconds

  class << self
    def join(link, connection_id)
      join_id(link.id, connection_id)
    end

    def leave(link, connection_id)
      leave_id(link.id, connection_id)
    end

    def refresh(link)
      refresh_id(link.id)
    end

    def join_id(link_id, connection_id)
      redis.sadd(key(link_id), connection_id)
      refresh_id(link_id)
    end

    def leave_id(link_id, connection_id)
      redis.srem(key(link_id), connection_id)
      offline_id?(link_id)
    end

    def refresh_id(link_id)
      redis.expire(key(link_id), TTL.to_i)
    end

    def online?(link)
      online_id?(link.id)
    end

    def offline?(link)
      offline_id?(link.id)
    end

    def online_id?(link_id)
      redis.scard(key(link_id)).positive?
    end

    def offline_id?(link_id)
      !online_id?(link_id)
    end

    def online_link_ids
      ids = []

      redis.scan_each(match: "link:*:ws_clients") do |redis_key|
        next unless redis.scard(redis_key).positive?

        link_id = redis_key.match(/\Alink:(\d+):ws_clients\z/)&.[](1)
        ids << link_id.to_i if link_id
      end

      ids
    end

    def reset!
      return unless Rails.env.test? && @test_redis

      @test_redis.clear
    end

    private

    def key(link_id)
      "link:#{link_id}:ws_clients"
    end

    def redis
      return test_redis if Rails.env.test?

      $redis || Redis.new(url: ENV.fetch("REDIS_URL", "redis://localhost:6379/1"))
    end

    def test_redis
      @test_redis ||= Class.new do
        def initialize
          @sets = Hash.new { |sets, key| sets[key] = Set.new }
          @expires_at = {}
        end

        def sadd(key, value)
          purge_expired

          !@sets[key].add?(value).nil?
        end

        def srem(key, value)
          purge_expired

          deleted = @sets[key].delete(value)
          delete_key(key) if @sets[key].empty?
          deleted
        end

        def expire(key, ttl)
          purge_expired
          return false unless @sets.key?(key)

          @expires_at[key] = ttl.seconds.from_now
          true
        end

        def scard(key)
          purge_expired

          @sets[key].size
        end

        def scan_each(match:)
          purge_expired

          pattern = /\A#{Regexp.escape(match).gsub('\*', '.*')}\z/
          @sets.each_key.select { |key| key.match?(pattern) }.each { |key| yield key }
        end

        def clear
          @sets.clear
          @expires_at.clear
        end

        private

        def purge_expired
          @expires_at.select { |_key, expires_at| expires_at <= Time.current }.each_key { |key| delete_key(key) }
        end

        def delete_key(key)
          @sets.delete(key)
          @expires_at.delete(key)
        end
      end.new
    end
  end
end
