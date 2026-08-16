require 'benchmark'
require 'etc'
require 'open3'

class SystemMetrics
  SAMPLE_INTERVAL = 0.1

  def self.snapshot
    new.snapshot
  end

  def snapshot
    {
      captured_at: Time.current,
      machine: machine_metrics,
      database: database_metrics,
      redis: redis_metrics,
      queue: queue_metrics
    }
  end

  private

  def machine_metrics
    load_averages = File.read('/proc/loadavg').split.first(3).map(&:to_f)
    memory = proc_memory
    disk = disk_usage

    {
      cpu_count: Etc.nprocessors,
      cpu_percent: cpu_percent,
      load_averages:,
      memory_total: memory.fetch('MemTotal', 0),
      memory_used: memory.fetch('MemTotal', 0) - memory.fetch('MemAvailable', 0),
      memory_percent: percentage(memory.fetch('MemTotal', 0) - memory.fetch('MemAvailable', 0), memory.fetch('MemTotal', 0)),
      swap_total: memory.fetch('SwapTotal', 0),
      swap_used: memory.fetch('SwapTotal', 0) - memory.fetch('SwapFree', 0),
      uptime_seconds: File.read('/proc/uptime').split.first.to_f,
      disk:
    }
  rescue StandardError
    { unavailable: true }
  end

  def cpu_percent
    first = cpu_times
    sleep SAMPLE_INTERVAL
    second = cpu_times
    total_delta = second.sum - first.sum
    idle_delta = (second[3] + second[4]) - (first[3] + first[4])
    return 0.0 if total_delta.zero?

    ((total_delta - idle_delta) * 100.0 / total_delta).round(1)
  end

  def cpu_times
    File.foreach('/proc/stat').first.split.drop(1).map(&:to_i)
  end

  def proc_memory
    File.readlines('/proc/meminfo').to_h do |line|
      key, value = line.split(':', 2)
      [key, value.to_i * 1024]
    end
  end

  def disk_usage
    output, status = Open3.capture2('df', '-B1', '--output=size,used,avail,pcent', '/ror')
    raise 'disk usage unavailable' unless status.success?

    size, used, available, percent = output.lines.last.split
    { total: size.to_i, used: used.to_i, available: available.to_i, percent: percent.to_i }
  end

  def database_metrics
    connection = ActiveRecord::Base.connection
    elapsed = Benchmark.realtime { connection.select_value('SELECT 1') }
    {
      healthy: true,
      response_ms: (elapsed * 1000).round(1),
      size: connection.select_value('SELECT pg_database_size(current_database())').to_i,
      pool: ActiveRecord::Base.connection_pool.stat
    }
  rescue StandardError
    { healthy: false }
  end

  def redis_metrics
    elapsed = Benchmark.realtime { $redis.ping }
    info = $redis.info('memory')
    {
      healthy: true,
      response_ms: (elapsed * 1000).round(1),
      used_memory: info.fetch('used_memory', 0).to_i,
      peak_memory: info.fetch('used_memory_peak', 0).to_i
    }
  rescue StandardError
    { healthy: false }
  end

  def queue_metrics
    {
      ready: SolidQueue::ReadyExecution.count,
      claimed: SolidQueue::ClaimedExecution.count,
      scheduled: SolidQueue::ScheduledExecution.count,
      failed: SolidQueue::FailedExecution.count
    }
  rescue StandardError
    { unavailable: true }
  end

  def percentage(used, total)
    return 0.0 if total.zero?

    (used * 100.0 / total).round(1)
  end
end
