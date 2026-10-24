class PornSearchController < ApplicationController
  include NodeSocialActions
  before_action :authorize, only: %i[send_message_and_return]
  def index
    @link = (NodeBrowserBackend.enabled? ? browser_link(params[:link], purpose: 'search') : Link.find(params[:link])) if params[:link]
  end

  def search
    if current_visit&.banned_ip.present?
      return
    end

    @page_number = porn_search_params[:page_number].to_i
    @page_number = 1 if @page_number == 0

    @tags = porn_search_params[:tags]
    @after = porn_search_params[:after]
    @before = porn_search_params[:before]

    if porn_search_params[:link].present?
      @link = NodeBrowserBackend.enabled? ? browser_link(porn_search_params[:link], purpose: 'search') : Link.find(porn_search_params[:link])
      @posts = get_tag_results porn_search_params[:tags], porn_search_params[:after], porn_search_params[:before], @link
      @last_tags = porn_search_params[:tags]
      return render :index, status: :service_unavailable if @posts.nil?

      track :regular, :search_e621_on_link, search: porn_search_params[:tags]

      # I'm sorry lol
      if porn_search_params[:full_rerender].present?
        return render turbo_stream: [
          turbo_stream.replace('pornsearch_input', partial: 'porn_search/input'),
          turbo_stream.replace('pornsearch_results', template: 'porn_search/search')
        ]
      end

    elsif porn_search_params[:message_thread].present?
      @message_thread = NodeSocialBackend.enabled? ? social_thread(porn_search_params[:message_thread]) : current_user.message_threads.find(porn_search_params[:message_thread])
      @posts = get_tag_results porn_search_params[:tags], porn_search_params[:after], porn_search_params[:before], nil
      @last_tags = porn_search_params[:tags]
      return render :index, status: :service_unavailable if @posts.nil?
    else
      redirect_to :index
    end
  end

  def send_message_and_return
    if NodeSocialBackend.enabled?
      result = social('message-send', thread_id: porn_search_params[:message_thread], content: porn_search_params[:message])
      return redirect_to message_thread_path(result.fetch('thread_id'))
    end
    content = porn_search_params[:message]
    message_thread = current_user.message_threads.find(porn_search_params[:message_thread])
    new_message = message_thread.messages.new
    new_message.content = content
    new_message.from_user = current_user
    response = new_message.save
    redirect_to porn_search_params[:return_to_path]
  end

  private

  # Only allow a list of trusted parameters through.
  def porn_search_params
    params.permit(:tags, :after, :before, :page_number, :link, :message_thread, :message, :return_to_path, :full_rerender)
  end
end
