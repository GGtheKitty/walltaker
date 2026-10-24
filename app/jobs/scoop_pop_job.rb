class ScoopPopJob < ApplicationJob
  queue_as :default

  def perform(*args)
    return NodeAutomationBackend.request('scoop-round', request_key: "legacy-scoop:#{job_id}") if NodeAutomationBackend.enabled?
    if NodeSocialBackend.enabled?
      return if Rails.cache.read('v1/newsroom_mutex').present?
      NodeSocialBackend.request('scoop-claim', request_key: "scoop-job:#{job_id}")
      return
    end
    next_scoop = Scoop.joins(:user).where(was_shown: false).order(created_at: :asc).first
    mutex = Rails.cache.fetch('v1/newsroom_mutex')
    if next_scoop && !mutex.present?
      Turbo::StreamsChannel.broadcast_update_to :chyron, target: :chyron, partial: 'application/chyron', locals: { message: "Breaking news from #{next_scoop.user.username}: \"#{next_scoop.details.truncate_words(6)}...\"" }

      news_entry = NewsEntry.from_scoop(next_scoop)
      PushNewsJob.perform_later(news_entry.to_json)
      next_scoop.update(was_shown: true)
    end
  end
end
