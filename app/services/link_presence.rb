require "set"

class LinkPresence
  TTL = 90.seconds

  class << self
    def join(link, connection_id)
      redis.sadd(key(link), connection_id)
      refresh(link)
    end

    def leave(link, connection_id)
      redis.srem(key(link), connection_id)
      offline?(link)
    end

    def refresh(link)
      redis.expire(key(link), TTL.to_i)
    end

    def online?(link)
      redis.scard(key(link)).positive?
    end

    def offline?(link)
      !online?(link)
    end

    private

    def key(link)
      "link:#{link.id}:ws_clients"
    end

    def redis
      return test_redis if Rails.env.test?

      $redis || Redis.new(url: ENV.fetch("REDIS_URL", "redis://localhost:6379/1"))
    end

    def test_redis
      @test_redis ||= Class.new do
        def initialize
          @sets = Hash.new { |sets, key| sets[key] = Set.new }
        end

        def sadd(key, value)
          !@sets[key].add?(value).nil?
        end

        def srem(key, value)
          @sets[key].delete(value)
        end

        def expire(_key, _ttl)
          true
        end

        def scard(key)
          @sets[key].size
        end
      end.new
    end
  end
end
