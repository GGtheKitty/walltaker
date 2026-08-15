class PastLink < ApplicationRecord
  belongs_to :link
  belongs_to :user
  belongs_to :set_by, foreign_key: :set_by_id, class_name: 'User', optional: true
  has_many :nut_pledges, dependent: :nullify
  visitable :ahoy_visit

  def self.log_link(link, tag_string)
    new({
          link:,
          user: link.user,
          e621_post_id: link.e621_post_id,
          post_url: link.post_url,
          post_thumbnail_url: link.post_thumbnail_url,
          set_by_id: link.set_by_id,
          tags: tag_string
    })
  end

  def preview_image_url
    return post_thumbnail_url.presence if post_url&.match?(/\.(?:mp4|webm)(?:\?|$)/i)

    post_url
  end

  def e621_page_url
    return "https://e621.net/posts/#{e621_post_id}" if e621_post_id.present?

    md5 = post_url&.match(%r{/([0-9a-f]{32})\.(?:png|jpe?g|bmp|webm|mp4|gif|webp)(?:\?|$)}i)&.[](1)
    "https://e621.net/posts?md5=#{md5}" if md5.present?
  end

  after_commit do
    broadcast_replace_to "link_details_#{link_id}", target: "link_details_#{link_id}", partial: 'links/details', locals: { link: self.link }
    broadcast_replace_to "dashboard_recent_posts", target: "recent_posts", partial: "dashboard/recent_posts", locals: {
      recent_posts: PastLink.order(id: :desc).take(6)
    }

    if post_url.ends_with?(".png", ".jpg", ".jpeg", ".gif", ".bmp")
      waiting = Rails.cache.fetch('v1/newsroom_mutex').present?

      unless waiting
        Rails.cache.fetch('v1/pushnewsjob', expires_in: (7..9).to_a.sample.seconds) do
          PushNewsJob.perform_later(NewsEntry.from_past_link(self).to_json)
        end
      end
    end
  end
end
