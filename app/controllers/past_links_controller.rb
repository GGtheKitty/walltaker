class PastLinksController < ApplicationController
  rescue_from NodeWallpaperBackend::Unavailable do
    render plain: 'Wallpaper history is temporarily unavailable. Please try again.', status: :service_unavailable
  end
  before_action :past_links_params
  before_action :set_user, only: %i[index]
  after_action :track_visit, only: %i[index]

  def index
    # I'm so sorry, this is going to be HORRIBLE for performance. Capping at 50 to avoid loading up Enumerable#group_by too much
    @past_links_by_user = NodeWallpaperBackend.history(user: @user).group_by(&:set_by_id).map do |set_by_id, past_links|
      {
        past_links:,
        set_by: set_by_id.nil? ? nil : past_links.first.set_by
      }
    end
  end

  private

  def set_user
    @user = (NodeBrowserBackend.enabled? ? browser_user(past_links_params[:username]) : User.active.find_by(username: past_links_params[:username]))
    raise ActionController::RoutingError, 'User not found.' unless @user
  end

  def past_links_params
    params.permit(:username)
  end
end
