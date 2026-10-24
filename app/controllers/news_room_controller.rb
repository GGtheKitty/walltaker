class NewsRoomController < ApplicationController
  layout 'full_width'

  def index
    if NodeAutomationBackend.enabled?
      result = NodeAutomationBackend.request('newsroom')
      @news_entry = NewsEntry.new(**result.fetch('entry').symbolize_keys)
      @news_entry.image_url ||= result['backdrop_url']
      response.set_header('X-Walltaker-Automation', 'node')
      return
    end
    mutex = Rails.cache.fetch('v1/newsroom_mutex')

    @past_link = PastLink.order(id: :desc).first
    if mutex.present?
      begin
        @news_entry = NewsEntry.new.from_json(mutex[:news_entry])
        @news_entry.image_url = PastLink.order(id: :desc).first.post_url unless @news_entry.image_url
      rescue
        @news_entry = NewsEntry.from_past_link(@past_link)
      end
    else
      @news_entry = NewsEntry.from_past_link(@past_link)
    end
  rescue NodeAutomationBackend::Unavailable
    render plain: 'Newsroom is temporarily unavailable.', status: :service_unavailable
  end
end
