require 'digest'

class SetLinkJob < ApplicationJob
  queue_as :urgent
  retry_on NodeE621::Unavailable, wait: 30.seconds, attempts: 5

  def perform(e621_post:, link:, set_by: nil, request_key: nil)
    if NodeAutomationBackend.enabled?
      return NodeAutomationBackend.request('set-wallpaper', link_id: link.id, post_id: e621_post.fetch('id'),
        set_by_id: set_by&.id, request_key: request_key || "job:#{job_id}")
    end
    e621_service = E621.new

    if NodeE621.enabled?
      e621_post = NodeE621.request('select', post_id: e621_post['id'], policy: NodeE621.policy(link))
      return unless e621_post && e621_post.dig('file', 'url')
    end

    if NodeWallpaperBackend.enabled?
      saved = NodeWallpaperBackend.apply(link:, post: e621_post, set_by:, request_key: request_key || "job:#{job_id}")
      raise NodeWallpaperBackend::Unavailable, link.errors.full_messages.join(', ') unless saved
    else
      link.update(
        {
          e621_post_id: e621_post['id'],
          post_url: e621_post['file']['url'],
          post_thumbnail_url: e621_post['sample']['url'] || e621_post['preview']['url'],
          post_description: e621_post['description'],
          set_by_id: set_by.nil? ? nil : set_by.id,
          response_type: nil,
          response_text: nil
        }
      )
    end
    link.forks.each do |fork|
      result = e621_service.get_post e621_post['id'], fork
      child_key = "fork:#{Digest::SHA256.hexdigest("#{request_key || job_id}:#{fork.id}")}"
      SetLinkJob.set(wait: 1.second, priority: 10).perform_later(e621_post: result, link: fork, set_by:, request_key: child_key) if result
    end
    return if NodeWallpaperBackend.enabled?
    if set_by.present? && (link.user.id != set_by.id)
      set_by.set_count = set_by.set_count.to_i + 1
      set_by.save
    end
    tag_string = "#{e621_post['tags']['general'].join(' ')} #{e621_post['tags']['character'].join(' ')} #{e621_post['tags']['species'].join(' ')} #{e621_post['tags']['lore'].join(' ')} #{e621_post['tags']['copyright'].join(' ')} #{e621_post['tags']['meta'].join(' ')} rating:#{e621_post['rating']}"
    past_link = PastLink.log_link(link, tag_string)
    past_link.save
  end
end
